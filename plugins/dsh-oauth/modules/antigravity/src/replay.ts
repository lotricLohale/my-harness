import { LlmError } from '@deepseek-ai/dsh-llm'
import type { Message, ModelMessageSource } from '@deepseek-ai/dsh-llm'
import type { Api, AssistantMessage, Usage } from '@earendil-works/pi-ai'

type ReplayBlock =
  | { type: 'text'; textSignature?: string }
  | { type: 'reasoning'; thinkingSignature?: string; redacted?: boolean }
  | { type: 'tool-call'; thoughtSignature?: string }

/** 供后续请求恢复 provider 原生签名的最小持久化状态。 */
export interface AntigravityReplayState {
  kind: 'antigravity-pi-ai'
  version: 1
  api: Api
  provider: string
  model: string
  stopReason: AssistantMessage['stopReason']
  blocks: ReplayBlock[]
}

function emptyUsage(): Usage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  }
}

function parseArguments(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

/** 将完成的 pi-ai 消息投影成可写入 Harness session log 的 JSON。 */
export function toReplayState(message: AssistantMessage): AntigravityReplayState {
  return {
    kind: 'antigravity-pi-ai',
    version: 1,
    api: message.api,
    provider: message.provider,
    model: message.model,
    stopReason: message.stopReason,
    blocks: message.content.map((block): ReplayBlock => {
      switch (block.type) {
        case 'text': return { type: 'text', ...(block.textSignature === undefined ? {} : { textSignature: block.textSignature }) }
        case 'thinking': return {
          type: 'reasoning',
          ...(block.thinkingSignature === undefined ? {} : { thinkingSignature: block.thinkingSignature }),
          ...(block.redacted === undefined ? {} : { redacted: block.redacted }),
        }
        case 'toolCall': return {
          type: 'tool-call',
          ...(block.thoughtSignature === undefined ? {} : { thoughtSignature: block.thoughtSignature }),
        }
      }
    }),
  }
}

function foreignAssistant(message: Message): AssistantMessage {
  const source = message.source.kind === 'model' ? message.source : undefined
  const content: AssistantMessage['content'] = []
  for (const block of message.content) {
    switch (block.type) {
      case 'text': content.push({ type: 'text', text: block.text }); break
      case 'reasoning': content.push({ type: 'thinking', thinking: block.text }); break
      case 'tool-call': content.push({ type: 'toolCall', id: block.id, name: block.name, arguments: parseArguments(block.arguments) }); break
      case 'image': throw new LlmError('Antigravity assistant image history is unsupported', 'UNSUPPORTED_CONTENT')
      default: break
    }
  }
  return {
    role: 'assistant',
    content,
    api: 'dsh-foreign',
    provider: source?.provider ?? 'dsh-foreign',
    model: source?.model ?? 'dsh-foreign',
    usage: emptyUsage(),
    stopReason: content.some(block => block.type === 'toolCall') ? 'toolUse' : 'stop',
    timestamp: 0,
  }
}

function replayedAssistant(message: Message, source: ModelMessageSource, raw: unknown): AssistantMessage {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return foreignAssistant(message)
  const state = raw as Partial<AntigravityReplayState>
  if (state.kind !== 'antigravity-pi-ai' || state.version !== 1
    || state.provider !== source.provider || state.model !== source.model
    || !Array.isArray(state.blocks) || state.blocks.length !== message.content.length) {
    return foreignAssistant(message)
  }
  const content: AssistantMessage['content'] = message.content.map((block, index) => {
    const replay = state.blocks?.[index]
    switch (block.type) {
      case 'text': return {
        type: 'text', text: block.text,
        ...(replay?.type === 'text' && replay.textSignature !== undefined ? { textSignature: replay.textSignature } : {}),
      }
      case 'reasoning': return {
        type: 'thinking', thinking: block.text,
        ...(replay?.type === 'reasoning' && replay.thinkingSignature !== undefined ? { thinkingSignature: replay.thinkingSignature } : {}),
        ...(replay?.type === 'reasoning' && replay.redacted !== undefined ? { redacted: replay.redacted } : {}),
      }
      case 'tool-call': return {
        type: 'toolCall', id: block.id, name: block.name, arguments: parseArguments(block.arguments),
        ...(replay?.type === 'tool-call' && replay.thoughtSignature !== undefined ? { thoughtSignature: replay.thoughtSignature } : {}),
      }
      default: throw new LlmError(`Antigravity cannot replay assistant block "${block.type}"`, 'UNSUPPORTED_CONTENT')
    }
  })
  return {
    role: 'assistant',
    content,
    api: state.api as Api,
    provider: source.provider,
    model: source.model,
    usage: emptyUsage(),
    stopReason: state.stopReason ?? (content.some(block => block.type === 'toolCall') ? 'toolUse' : 'stop'),
    timestamp: 0,
  }
}

/** 将 durable Harness assistant message 恢复为 pi-ai 历史消息。 */
export function toPiAssistant(message: Message): AssistantMessage {
  const source = message.source
  return source.kind === 'model' && source.replayState !== undefined
    ? replayedAssistant(message, source, source.replayState)
    : foreignAssistant(message)
}
