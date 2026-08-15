import assert from 'node:assert/strict'
import test from 'node:test'
import type { AssistantMessage, AssistantMessageEvent } from '@earendil-works/pi-ai'
import { toStreamChunks } from '../src/stream.js'

function message(): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text: 'hello' }],
    api: 'antigravity-api',
    provider: 'antigravity',
    model: 'gemini-3.7-flash',
    usage: {
      input: 2,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 3,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'stop',
    timestamp: 0,
  }
}

test('生成 usage 后紧跟最终 finish', async () => {
  const completed = message()
  async function* events(): AsyncGenerator<AssistantMessageEvent> {
    yield { type: 'start', partial: { ...completed, content: [] } }
    yield { type: 'text_start', contentIndex: 0, partial: completed }
    yield { type: 'text_delta', contentIndex: 0, delta: 'hello', partial: completed }
    yield { type: 'text_end', contentIndex: 0, content: 'hello', partial: completed }
    yield { type: 'done', reason: 'stop', message: completed }
  }
  const chunks = []
  for await (const chunk of toStreamChunks(events())) chunks.push(chunk)
  assert.equal(chunks.at(-2)?.type, 'usage')
  assert.equal(chunks.at(-1)?.type, 'finish')
})
