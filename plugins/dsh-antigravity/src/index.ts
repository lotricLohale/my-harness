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
import { AntigravityAuth } from './auth.js'
import { registerCommands } from './commands.js'
import { loadUpstreamProvider } from './upstream.js'

export const name = 'llm-antigravity'
export const inject = ['llm', 'credentials', 'commands']

/** 插件配置。 */
export interface Config {
  /** 保存完整 OAuth JSON 的 Harness credential reference。 */
  credentialRef?: string
}

/** Loader 运行时配置校验。 */
export const Config: z<Config> = z.object({
  credentialRef: z.string().default('ANTIGRAVITY_OAUTH'),
})

/** 注册 Antigravity adapter 和管理命令。 */
export function apply(ctx: Context, config: Config): void {
  const provider = loadUpstreamProvider()
  if (provider.oauth === undefined) {
    throw new Error('pi-antigravity registered no OAuth implementation')
  }
  const auth = new AntigravityAuth(ctx, config.credentialRef ?? 'ANTIGRAVITY_OAUTH', provider.oauth)
  ctx.llm.registerAdapter(['antigravity'], new AntigravityAdapter(provider, auth))
  registerCommands(ctx, auth)
}

export { AntigravityAdapter } from './adapter.js'
export { AntigravityAuth, parseCredentials } from './auth.js'
export { mapStopReason, mapUsage, toStreamChunks } from './stream.js'
