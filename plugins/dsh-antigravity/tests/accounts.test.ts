import assert from 'node:assert/strict'
import test from 'node:test'
import type { AssistantMessage, AssistantMessageEvent } from '@earendil-works/pi-ai'
import { AntigravityAdapter } from '../src/adapter.js'
import { accountCandidates, type AntigravityAccountMeta } from '../src/auth.js'

function message(text = 'ok'): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    api: 'antigravity-api',
    provider: 'antigravity',
    model: 'm',
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'stop',
    timestamp: 0,
  }
}

async function* okEvents(text = 'ok'): AsyncGenerator<AssistantMessageEvent> {
  const done = message(text)
  yield { type: 'start', partial: { ...done, content: [] } }
  yield { type: 'text_start', contentIndex: 0, partial: done }
  yield { type: 'text_delta', contentIndex: 0, delta: text, partial: done }
  yield { type: 'text_end', contentIndex: 0, content: text, partial: done }
  yield { type: 'done', reason: 'stop', message: done }
}

function options(): any {
  return { provider: 'antigravity', model: 'm', messages: [] }
}

function provider(streamSimple: (...args: any[]) => AsyncIterable<AssistantMessageEvent>): any {
  return {
    name: 'Antigravity',
    api: 'antigravity-api',
    baseUrl: 'https://example.invalid',
    models: [{ id: 'm', name: 'M', input: ['text'], contextWindow: 1000, cost: {}, reasoning: false }],
    streamSimple,
  }
}

function auth(accounts: AntigravityAccountMeta[]): any {
  const exhausted: string[] = []
  return {
    exhausted,
    candidates: async () => accountCandidates(accounts),
    apiKeyFor: async (account: AntigravityAccountMeta) => account.id,
    markExhausted: async (account: AntigravityAccountMeta) => { exhausted.push(account.id) },
  }
}

test('账号候选按启用、冷却和高优先级排序', () => {
  const now = 1000
  assert.deepEqual(accountCandidates([
    { id: 'low', credentialRef: 'A', enabled: true, priority: 1 },
    { id: 'off', credentialRef: 'B', enabled: false, priority: 99 },
    { id: 'cool', credentialRef: 'C', exhaustedUntil: now + 1, priority: 99 },
    { id: 'high', credentialRef: 'D', priority: 5 },
  ], now).map(account => account.id), ['high', 'low'])
})

test('首个可见 chunk 前遇到 quota 会切到下一个账号', async () => {
  const fakeAuth = auth([
    { id: 'first', credentialRef: 'A', priority: 2 },
    { id: 'second', credentialRef: 'B', priority: 1 },
  ])
  const used: string[] = []
  const adapter = new AntigravityAdapter(provider((model, context, init) => {
    used.push(init.apiKey)
    if (init.apiKey === 'first') throw Object.assign(new Error('Quota reached'), { status: 429 })
    return okEvents('second')
  }), fakeAuth)
  const chunks = []
  for await (const chunk of adapter.stream(options())) chunks.push(chunk)
  assert.deepEqual(used, ['first', 'second'])
  assert.deepEqual(fakeAuth.exhausted, ['first'])
  assert.equal(chunks.some(chunk => chunk.type === 'text-delta' && chunk.text === 'second'), true)
})

test('所有账号限额耗尽时标记最后账号并返回统一错误', async () => {
  const fakeAuth = auth([{ id: 'only', credentialRef: 'A' }])
  const adapter = new AntigravityAdapter(provider(() => {
    throw Object.assign(new Error('Quota reached'), { status: 429 })
  }), fakeAuth)
  await assert.rejects(async () => {
    for await (const _chunk of adapter.stream(options())) {
      // 消费流直到账号池耗尽。
    }
  }, /All Antigravity accounts are rate-limited or exhausted/)
  assert.deepEqual(fakeAuth.exhausted, ['only'])
})

test('已有部分输出后遇到 quota 不切换账号', async () => {
  const fakeAuth = auth([
    { id: 'first', credentialRef: 'A', priority: 2 },
    { id: 'second', credentialRef: 'B', priority: 1 },
  ])
  const used: string[] = []
  async function* partial(): AsyncGenerator<AssistantMessageEvent> {
    const started = message('partial')
    yield { type: 'start', partial: { ...started, content: [] } }
    yield { type: 'text_start', contentIndex: 0, partial: started }
    yield { type: 'text_delta', contentIndex: 0, delta: 'partial', partial: started }
    throw Object.assign(new Error('Rate limited'), { status: 429 })
  }
  const adapter = new AntigravityAdapter(provider((model, context, init) => {
    used.push(init.apiKey)
    return partial()
  }), fakeAuth)
  await assert.rejects(async () => {
    for await (const _chunk of adapter.stream(options())) {
      // 消费流直到上游抛错。
    }
  }, /Rate limited/)
  assert.deepEqual(used, ['first'])
  assert.deepEqual(fakeAuth.exhausted, [])
})

test('settings 账号元数据不包含 token 字段', () => {
  const account: AntigravityAccountMeta = {
    id: 'a',
    email: 'a@example.com',
    credentialRef: 'ANTIGRAVITY_OAUTH_A',
    enabled: true,
    priority: 0,
  }
  assert.equal(JSON.stringify(account).includes('access'), false)
  assert.equal(JSON.stringify(account).includes('refresh'), false)
})
