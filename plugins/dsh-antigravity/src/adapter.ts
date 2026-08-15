import {
  attributionHeaders,
  LlmAdapter,
  LlmError,
  ReasoningEffortId,
} from '@deepseek-ai/dsh-llm'
import type {
  GenerateOptions,
  LlmModelInfo,
  LlmResolvedModelInfo,
  StreamChunk,
} from '@deepseek-ai/dsh-llm'
import { getSupportedThinkingLevels } from '@earendil-works/pi-ai'
import type { Api, Model, ModelThinkingLevel } from '@earendil-works/pi-ai'
import type { AntigravityAuth } from './auth.js'
import { toPiContext } from './context.js'
import { toStreamChunks } from './stream.js'
import type { AntigravityProvider } from './upstream.js'

/** 把 pi-antigravity provider 接入 Harness LLM seam。 */
export class AntigravityAdapter extends LlmAdapter {
  constructor(
    private readonly provider: AntigravityProvider,
    private readonly auth: AntigravityAuth,
  ) {
    super()
  }

  override providerInfo(provider: string) {
    return { id: provider, name: this.provider.name ?? 'Antigravity' }
  }

  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    this.assertProvider(provider)
    return Promise.resolve(this.provider.models.map(model => ({
      provider,
      id: model.id,
      name: model.name,
      inputModalities: [...model.input],
    })))
  }

  override resolveModel(provider: string, modelId: string): Promise<LlmResolvedModelInfo> {
    this.assertProvider(provider)
    const model = this.model(modelId)
    const levels = getSupportedThinkingLevels(model)
    return Promise.resolve({
      provider,
      id: model.id,
      name: model.name,
      inputModalities: [...model.input],
      context: { contextWindow: model.contextWindow },
      ...(model.reasoning ? {
        reasoning: {
          efforts: levels.map(level => ({
            id: ReasoningEffortId(level),
            name: level.charAt(0).toUpperCase() + level.slice(1),
          })),
        },
      } : {}),
    })
  }

  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.assertProvider(options.provider)
    if (options.stop !== undefined) {
      throw new LlmError('Antigravity does not support GenerateOptions.stop', 'UNSUPPORTED_OPTION')
    }
    const streamSimple = this.provider.streamSimple
    if (streamSimple === undefined) {
      throw new LlmError('pi-antigravity registered no streamSimple implementation', 'NO_ADAPTER')
    }
    const model = this.model(options.model)
    const apiKey = await this.auth.apiKey()
    const reasoning = this.reasoning(model, options.reasoningEffort)
    const events = streamSimple(model, toPiContext(options), {
      apiKey,
      ...(reasoning === undefined || reasoning === 'off' ? {} : { reasoning }),
      ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
      ...(options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens }),
      ...(options.sessionId === undefined ? {} : { sessionId: String(options.sessionId) }),
      signal: options.signal,
      headers: attributionHeaders(),
      maxRetries: 0,
    })
    yield* toStreamChunks(events)
  }

  private assertProvider(provider: string): void {
    if (provider !== 'antigravity') {
      throw new LlmError(`Antigravity adapter does not own provider "${provider}"`, 'NO_ADAPTER')
    }
  }

  private model(id: string): Model<Api> {
    const config = this.provider.models.find(model => model.id === id)
    if (config === undefined) {
      throw new LlmError(`Antigravity has no model "${id}"`, 'UNKNOWN_MODEL')
    }
    return {
      ...config,
      provider: 'antigravity',
      api: this.provider.api,
      baseUrl: this.provider.baseUrl,
    } as Model<Api>
  }

  private reasoning(model: Model<Api>, effort: string | undefined): ModelThinkingLevel | undefined {
    if (effort === undefined) return undefined
    const supported = getSupportedThinkingLevels(model)
    if (supported.some(level => level === effort)) return effort as ModelThinkingLevel
    throw new LlmError(
      `Antigravity model "${model.id}" does not support reasoning effort "${effort}"`,
      'UNSUPPORTED_REASONING_EFFORT',
    )
  }
}
