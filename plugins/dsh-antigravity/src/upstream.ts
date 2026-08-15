import type {
  Api,
  AssistantMessageEventStream,
  Context as PiContext,
  Model,
  OAuthCredentials,
  OAuthLoginCallbacks,
  SimpleStreamOptions,
} from '@earendil-works/pi-ai'
import registerAntigravity from './upstream-runtime.js'

/** pi-antigravity 注册的静态模型字段。 */
export interface AntigravityModelConfig {
  id: string
  name: string
  reasoning: boolean
  input: Array<'text' | 'image'>
  contextWindow: number
  maxTokens: number
  thinkingLevelMap?: Model<Api>['thinkingLevelMap']
  cost: Model<Api>['cost']
}

/** 适配层实际使用的上游 provider 字段。 */
export interface AntigravityProvider {
  name?: string
  baseUrl?: string
  api: Api
  models: AntigravityModelConfig[]
  oauth?: {
    login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials>
    refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials>
    getApiKey(credentials: OAuthCredentials): string
  }
  streamSimple?: (
    model: Model<Api>,
    context: PiContext,
    options?: SimpleStreamOptions,
  ) => AssistantMessageEventStream
}

/** 捕获上游 provider，而不启动 Pi Coding Agent 扩展宿主。 */
export function loadUpstreamProvider(): AntigravityProvider {
  let provider: AntigravityProvider | undefined
  registerAntigravity({
    registerProvider(id: string, value: AntigravityProvider): void {
      if (id === 'antigravity') provider = value
    },
    registerCommand(): void {},
  })
  if (provider === undefined) throw new Error('pi-antigravity did not register the antigravity provider')
  return provider
}
