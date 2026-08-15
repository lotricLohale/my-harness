import type { Context } from '@deepseek-ai/cordis'
import { credentialRef, type CredentialRef } from '@deepseek-ai/dsh-credentials'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type { OAuthCredentials, OAuthLoginCallbacks } from '@earendil-works/pi-ai'
import type { AntigravityProvider } from './upstream.js'

interface AuthPrompt {
  url: string
  instructions?: string
}

/** OAuth 登录启动结果；completion 在浏览器回调完成后写入凭据。 */
export interface LoginAttempt extends AuthPrompt {
  completion: Promise<void>
}

/** 解析并刷新存放在 Harness credentials 服务中的 Antigravity OAuth 凭据。 */
export class AntigravityAuth {
  readonly ref: CredentialRef
  private refreshTask: Promise<OAuthCredentials> | undefined
  private loginTask: Promise<void> | undefined

  constructor(
    private readonly ctx: Context,
    credentialName: string,
    private readonly oauth: NonNullable<AntigravityProvider['oauth']>,
  ) {
    this.ref = credentialRef(credentialName)
  }

  /** 为一次模型请求解析可直接交给上游 provider 的 apiKey 字符串。 */
  async apiKey(): Promise<string> {
    const hit = await this.ctx.credentials.resolve(this.ref)
    if (hit === undefined) {
      throw new LlmError(
        `Antigravity credentials are missing; run /antigravity-login first (${this.ref})`,
        'MISSING_CREDENTIAL',
      )
    }
    const credentials = parseCredentials(hit.value)
    const current = credentials.expires > Date.now() ? credentials : await this.refresh(credentials)
    return this.oauth.getApiKey(current)
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
      await this.ctx.credentials.set(this.ref, JSON.stringify(credentials))
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

  /** 返回不含 secret 的凭据状态。 */
  async status(): Promise<string> {
    const info = await this.ctx.credentials.describe(this.ref)
    if (!info.configured) return `credential=${this.ref}\nconfigured=false`
    const hit = await this.ctx.credentials.resolve(this.ref)
    let expires = 'unknown'
    if (hit !== undefined) {
      try {
        expires = new Date(parseCredentials(hit.value).expires).toISOString()
      } catch {
        expires = 'invalid'
      }
    }
    return [
      `credential=${this.ref}`,
      'configured=true',
      `source=${info.source ?? 'unknown'}`,
      `writable=${String(info.writable)}`,
      `expires=${expires}`,
    ].join('\n')
  }

  private refresh(credentials: OAuthCredentials): Promise<OAuthCredentials> {
    return this.refreshTask ??= this.refreshAndStore(credentials).finally(() => {
      this.refreshTask = undefined
    })
  }

  private async refreshAndStore(credentials: OAuthCredentials): Promise<OAuthCredentials> {
    const info = await this.ctx.credentials.describe(this.ref)
    if (!info.writable) {
      throw new LlmError(
        `Antigravity credentials from ${info.source ?? 'a read-only source'} cannot store a refreshed token; run /antigravity-login`,
        'CREDENTIAL_READ_ONLY',
      )
    }
    const refreshed = await this.oauth.refreshToken(credentials)
    await this.ctx.credentials.set(this.ref, JSON.stringify(refreshed))
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
