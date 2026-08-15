/**
 * pi-antigravity 到 DeepSeek Harness 的 Cordis 适配插件。
 * @module dsh-antigravity
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-llm'
import { AntigravityAdapter } from './adapter.js'
import { AntigravityAuth, type AntigravityAccountMeta } from './auth.js'
import { registerCommands } from './commands.js'
import { registerWebRoutes } from './server.js'
import { loadUpstreamProvider } from './upstream.js'

export const name = 'llm-antigravity'
export const inject = ['llm', 'credentials', 'commands', 'settings']

const NS = 'llm-antigravity' as never
const PROVIDER = 'antigravity'

/** 插件配置和 settings namespace 形状；accounts 只保存非秘密元数据。 */
export interface Config {
  /** 兼容旧版完整 OAuth JSON 的 Harness credential reference。 */
  credentialRef?: string
  /** 多账号池元数据；真实 OAuth token 保存在每个 credentialRef 指向的凭据中。 */
  accounts?: AntigravityAccountMeta[]
}

const AccountConfig: z<AntigravityAccountMeta> = z.object({
  id: z.string().required(),
  email: z.string(),
  credentialRef: z.string().required(),
  enabled: z.boolean().default(true),
  priority: z.number().default(0),
  exhaustedUntil: z.number(),
})

/** Loader 运行时配置校验。 */
export const Config: z<Config> = z.object({
  credentialRef: z.string().default('ANTIGRAVITY_OAUTH'),
  accounts: z.array(AccountConfig).default([]),
})

/** 注册 Antigravity adapter、settings namespace 和管理命令。 */
export function apply(ctx: Context, config: Config): void {
  const provider = loadUpstreamProvider()
  if (provider.oauth === undefined) {
    throw new Error('pi-antigravity registered no OAuth implementation')
  }
  let resolvedConfig = Config(config)
  const auth = new AntigravityAuth(ctx, () => resolvedConfig, provider.oauth)
  const directory = ctx.llm.registerConfigurableProviders([
    { provider: PROVIDER, displayName: auth.displayName(), settingsNs: NS, settingsPath: [] },
  ])
  const refreshDirectory = (): void => {
    directory.replace([{ provider: PROVIDER, displayName: auth.displayName(), settingsNs: NS, settingsPath: [] }])
  }
  const scope = (ctx as unknown as { settings: { register: (ns: never, schema: z<Config>, options: { base: Config }) => { get: () => Config; update: (patch: object) => Promise<void>; watch: (callback: (next: Config) => void) => () => void } } }).settings.register(NS, Config, { base: config })
  resolvedConfig = scope.get()
  auth.setConfigWriter(patch => scope.update(patch))
  ctx.effect(() => scope.watch((next) => {
    resolvedConfig = next
    refreshDirectory()
  }))
  refreshDirectory()
  void auth.initialize().then(refreshDirectory).catch((error: unknown) => {
    ctx.logger.warn('antigravity legacy credential migration failed')
    ctx.logger.warn(error)
  })
  ctx.llm.registerAdapter([PROVIDER], new AntigravityAdapter(provider, auth))
  registerCommands(ctx, auth)
  registerWebRoutes(ctx, auth)
}

export { AntigravityAdapter, isQuotaError } from './adapter.js'
export { AntigravityAuth, accountCandidates, parseCredentials } from './auth.js'
export { assertSameOriginJson, writeJson } from './server.js'
export { formatPercent, serializeQuotaGroups, shouldPollAfterLogin } from './web-data.js'
export { mapStopReason, mapUsage, toStreamChunks } from './stream.js'
