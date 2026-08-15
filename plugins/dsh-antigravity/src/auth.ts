import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { credentialRef, type CredentialRef } from '@deepseek-ai/dsh-credentials'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type { OAuthCredentials, OAuthLoginCallbacks } from '@earendil-works/pi-ai'
import { fetchUpstreamUsage, type AntigravityProvider } from './upstream.js'
import { serializeQuotaGroups, type AntigravityAccountPayload } from './web-data.js'

const LEGACY_REF = 'ANTIGRAVITY_OAUTH'
const COOLDOWN_MS = 60_000

interface AuthPrompt {
  url: string
  instructions?: string
}

/** 设置中保存的账号元数据；这里不能出现 access/refresh。 */
export interface AntigravityAccountMeta {
  id: string
  email?: string
  credentialRef: string
  enabled?: boolean
  priority?: number
  exhaustedUntil?: number
}

/** OAuth 登录启动结果；completion 在浏览器回调完成后写入凭据。 */
export interface LoginAttempt extends AuthPrompt {
  completion: Promise<void>
}

export interface AntigravityAuthConfig {
  credentialRef?: string
  accounts?: AntigravityAccountMeta[]
}

/** 账号候选按启用、冷却和优先级排序。 */
export function accountCandidates(accounts: readonly AntigravityAccountMeta[], now = Date.now()): AntigravityAccountMeta[] {
  return accounts
    .filter(account => account.enabled !== false && (account.exhaustedUntil ?? 0) <= now)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.id.localeCompare(b.id))
}

/** 脱敏显示账号。 */
export function accountLabel(account: AntigravityAccountMeta): string {
  return account.email ?? account.id
}

function emailOf(credentials: OAuthCredentials): string | undefined {
  const email = (credentials as { email?: unknown }).email
  return typeof email === 'string' && email.length > 0 ? email : undefined
}

function safeId(seed: string): string {
  const slug = seed.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^([^a-z_])/, '_$1').slice(0, 32) || 'account'
  return `${slug}_${createHash('sha256').update(seed).digest('hex').slice(0, 8)}`
}

function uniqueRef(id: string): string {
  return `ANTIGRAVITY_OAUTH_${safeId(id).toUpperCase()}`
}

function withoutSecrets(accounts: readonly AntigravityAccountMeta[]): AntigravityAccountMeta[] {
  return accounts.map(account => ({
    id: account.id,
    ...(account.email === undefined ? {} : { email: account.email }),
    credentialRef: account.credentialRef,
    ...(account.enabled === undefined ? {} : { enabled: account.enabled }),
    ...(account.priority === undefined ? {} : { priority: account.priority }),
    ...(account.exhaustedUntil === undefined ? {} : { exhaustedUntil: account.exhaustedUntil }),
  }))
}

/** 解析、刷新并选择 Antigravity 多账号 OAuth 凭据。 */
export class AntigravityAuth {
  readonly legacyRef: CredentialRef
  private refreshTasks = new Map<string, Promise<OAuthCredentials>>()
  private loginTask: Promise<void> | undefined
  private fallbackAccounts: AntigravityAccountMeta[] = []
  private lastAccountId: string | undefined
  private writeConfig: ((patch: object) => Promise<void>) | undefined

  constructor(
    private readonly ctx: Context,
    private readonly config: () => AntigravityAuthConfig,
    private readonly oauth: NonNullable<AntigravityProvider['oauth']>,
  ) {
    this.legacyRef = credentialRef(config().credentialRef ?? LEGACY_REF)
  }

  /** 接入 settings 后允许登录和冷却回写非秘密账号元数据。 */
  setConfigWriter(writeConfig: (patch: object) => Promise<void>): void {
    this.writeConfig = writeConfig
  }

  /** 将旧版单账号凭据纳入账号池。 */
  async initialize(): Promise<void> {
    await this.includeLegacyCredential()
  }

  /** 返回设置页和 provider 目录显示用的账号摘要。 */
  displayName(): string {
    const accounts = this.currentAccounts()
    if (accounts.length === 0) return 'Antigravity（未授权）'
    if (accounts.length === 1) return `Antigravity（${accountLabel(accounts[0]!)}）`
    const current = accounts.find(account => account.id === this.lastAccountId) ?? accountCandidates(accounts)[0] ?? accounts[0]!
    return `Antigravity（${accounts.length} 个账号，当前 ${accountLabel(current)}）`
  }

  /** 返回一次请求可尝试的账号候选。 */
  async candidates(): Promise<AntigravityAccountMeta[]> {
    await this.includeLegacyCredential()
    return accountCandidates(this.currentAccounts())
  }

  /** 为指定账号解析可直接交给上游 provider 的 apiKey 字符串。 */
  async apiKeyFor(account: AntigravityAccountMeta): Promise<string> {
    const ref = credentialRef(account.credentialRef)
    const hit = await this.ctx.credentials.resolve(ref)
    if (hit === undefined) {
      throw new LlmError(`Antigravity account ${accountLabel(account)} has no credential (${ref})`, 'MISSING_CREDENTIAL')
    }
    const credentials = parseCredentials(hit.value)
    const current = credentials.expires > Date.now() ? credentials : await this.refresh(ref, credentials)
    this.lastAccountId = account.id
    return this.oauth.getApiKey(current)
  }

  /** 首 chunk 前撞到限额时短冷却该账号。 */
  async markExhausted(account: AntigravityAccountMeta, exhaustedUntil = Date.now() + COOLDOWN_MS): Promise<void> {
    const next = this.currentAccounts().map(item => item.id === account.id ? { ...item, exhaustedUntil } : item)
    await this.storeAccounts(next)
  }

  /** 启动一次登录并立即返回授权 URL；重复调用复用正在进行的登录。 */
  async beginLogin(): Promise<LoginAttempt> {
    if (this.loginTask !== undefined) {
      throw new Error('Antigravity login is already waiting for a browser callback')
    }
    const prompt = Promise.withResolvers<AuthPrompt>()
    const callbacks: OAuthLoginCallbacks = {
      onAuth: (value) => { prompt.resolve(value) },
      onDeviceCode: () => {},
      onPrompt: () => Promise.reject(new Error('Antigravity login requested unsupported interactive input')),
      onSelect: () => Promise.resolve(undefined),
    }
    const completion = this.oauth.login(callbacks).then(async (credentials) => {
      await this.saveLogin(credentials)
    }).finally(() => {
      this.loginTask = undefined
    })
    this.loginTask = completion
    void completion.catch((error: unknown) => {
      this.ctx.logger.error('antigravity login failed')
      this.ctx.logger.error(error)
    })
    const details = await prompt.promise
    return { ...details, completion }
  }

  /** OAuth 是否仍在等待浏览器回调。 */
  loginPending(): boolean {
    return this.loginTask !== undefined
  }

  /** 返回浏览器可见账号状态；这里和 settings 都不能包含 token。 */
  async accountPayloads(includeQuota = true): Promise<AntigravityAccountPayload[]> {
    await this.includeLegacyCredential()
    return Promise.all(this.currentAccounts().map(async (account) => {
      const ref = credentialRef(account.credentialRef)
      const info = await this.ctx.credentials.describe(ref)
      let expires: string | undefined
      let quota: AntigravityAccountPayload['quota']
      let quotaError: string | undefined
      if (info.configured) {
        const hit = await this.ctx.credentials.resolve(ref)
        if (hit !== undefined) {
          try {
            expires = new Date(parseCredentials(hit.value).expires).toISOString()
            if (includeQuota) quota = serializeQuotaGroups((await fetchUpstreamUsage(await this.apiKeyFor(account))).groups)
          } catch (error) {
            quotaError = error instanceof Error ? error.message : String(error)
          }
        }
      }
      return {
        id: account.id,
        ...(account.email === undefined ? {} : { email: account.email }),
        enabled: account.enabled !== false,
        priority: account.priority ?? 0,
        configured: info.configured,
        ...(expires === undefined ? {} : { expires }),
        ...(account.exhaustedUntil === undefined ? {} : { exhaustedUntil: new Date(account.exhaustedUntil).toISOString() }),
        ...(quota === undefined ? {} : { quota }),
        ...(quotaError === undefined ? {} : { quotaError }),
      }
    }))
  }

  /** 返回不含 secret 的账号状态。 */
  async status(): Promise<string> {
    await this.includeLegacyCredential()
    const lines = [`accounts=${this.currentAccounts().length}`]
    for (const account of this.currentAccounts()) {
      const ref = credentialRef(account.credentialRef)
      const info = await this.ctx.credentials.describe(ref)
      let expires = 'unknown'
      if (info.configured) {
        const hit = await this.ctx.credentials.resolve(ref)
        if (hit !== undefined) {
          try {
            expires = new Date(parseCredentials(hit.value).expires).toISOString()
          } catch {
            expires = 'invalid'
          }
        }
      }
      lines.push([
        `- id=${account.id}`,
        `email=${account.email ?? 'unknown'}`,
        `credential=${ref}`,
        `enabled=${String(account.enabled !== false)}`,
        `priority=${String(account.priority ?? 0)}`,
        `configured=${String(info.configured)}`,
        `source=${info.source ?? 'unknown'}`,
        `writable=${String(info.writable)}`,
        `expires=${expires}`,
        `exhaustedUntil=${account.exhaustedUntil === undefined ? 'none' : new Date(account.exhaustedUntil).toISOString()}`,
      ].join(' '))
    }
    return lines.join('\n')
  }

  private currentAccounts(): AntigravityAccountMeta[] {
    return withoutSecrets([...(this.config().accounts ?? []), ...this.fallbackAccounts])
  }

  private async saveLogin(credentials: OAuthCredentials): Promise<void> {
    const email = emailOf(credentials)
    const accounts = this.currentAccounts()
    const existing = email === undefined ? undefined : accounts.find(account => account.email === email)
    const id = existing?.id ?? safeId(email ?? `account_${Date.now()}`)
    const nextAccount: AntigravityAccountMeta = {
      id,
      ...(email === undefined ? {} : { email }),
      credentialRef: existing?.credentialRef ?? uniqueRef(id),
      enabled: existing?.enabled ?? true,
      priority: existing?.priority ?? 0,
    }
    await this.ctx.credentials.set(credentialRef(nextAccount.credentialRef), JSON.stringify(credentials))
    await this.storeAccounts([...accounts.filter(account => account.id !== id), nextAccount])
    this.lastAccountId = id
  }

  private async includeLegacyCredential(): Promise<void> {
    if (this.currentAccounts().some(account => account.credentialRef === this.legacyRef)) return
    const hit = await this.ctx.credentials.resolve(this.legacyRef)
    if (hit === undefined) return
    let email: string | undefined
    try {
      email = emailOf(parseCredentials(hit.value))
    } catch {
      email = undefined
    }
    const id = safeId(email ?? 'legacy')
    if (this.currentAccounts().some(account => account.id === id || (email !== undefined && account.email === email))) return
    await this.storeAccounts([...this.currentAccounts(), { id, ...(email === undefined ? {} : { email }), credentialRef: this.legacyRef, enabled: true, priority: 0 }])
  }

  private async storeAccounts(accounts: AntigravityAccountMeta[]): Promise<void> {
    const clean = withoutSecrets(accounts)
    if (this.writeConfig === undefined) {
      this.fallbackAccounts = clean
      return
    }
    await this.writeConfig({ accounts: clean })
  }

  private refresh(ref: CredentialRef, credentials: OAuthCredentials): Promise<OAuthCredentials> {
    const key = String(ref)
    const existing = this.refreshTasks.get(key)
    if (existing !== undefined) return existing
    const task = this.refreshAndStore(ref, credentials).finally(() => {
      this.refreshTasks.delete(key)
    })
    this.refreshTasks.set(key, task)
    return task
  }

  private async refreshAndStore(ref: CredentialRef, credentials: OAuthCredentials): Promise<OAuthCredentials> {
    const info = await this.ctx.credentials.describe(ref)
    if (!info.writable) {
      throw new LlmError(
        `Antigravity credentials from ${info.source ?? 'a read-only source'} cannot store a refreshed token; run /antigravity-login`,
        'CREDENTIAL_READ_ONLY',
      )
    }
    const refreshed = await this.oauth.refreshToken(credentials)
    await this.ctx.credentials.set(ref, JSON.stringify(refreshed))
    return refreshed
  }
}

/** 在持久化边界验证 OAuth JSON 的请求所需字段。 */
export function parseCredentials(value: string): OAuthCredentials {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch (error) {
    throw new LlmError('Antigravity credentials contain invalid JSON; run /antigravity-login', 'INVALID_CREDENTIAL', { cause: error })
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new LlmError('Antigravity credentials must be a JSON object; run /antigravity-login', 'INVALID_CREDENTIAL')
  }
  const record = parsed as Record<string, unknown>
  if (typeof record['access'] !== 'string' || record['access'].length === 0
    || typeof record['refresh'] !== 'string' || record['refresh'].length === 0
    || typeof record['expires'] !== 'number' || !Number.isFinite(record['expires'])) {
    throw new LlmError('Antigravity credentials are incomplete; run /antigravity-login', 'INVALID_CREDENTIAL')
  }
  return parsed as OAuthCredentials
}
