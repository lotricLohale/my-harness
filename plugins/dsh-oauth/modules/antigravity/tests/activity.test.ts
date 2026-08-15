import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import type { Context } from '@deepseek-ai/cordis'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import { registerModelActivity } from '../src/activity.js'

test('模型请求驱动运行、空闲和错误状态', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'mdsh-activity-'))
  const path = join(directory, 'status')
  const previous = process.env.MDSH_STATUS_FILE
  process.env.MDSH_STATUS_FILE = path
  let listener: ((options: unknown, next: () => AsyncIterable<StreamChunk>) => AsyncIterable<StreamChunk>) | undefined
  const context = {
    on: (_name: string, callback: typeof listener) => {
      listener = callback
      return () => undefined
    },
  }
  try {
    registerModelActivity(context as unknown as Context)
    assert.ok(listener)
    async function* success(): AsyncIterable<StreamChunk> {
      yield { type: 'finish', reason: { kind: 'stop' } } as unknown as StreamChunk
    }
    const stream = listener({}, success)
    await stream[Symbol.asyncIterator]().next()
    assert.equal(readFileSync(path, 'utf8'), 'running')
    for await (const _chunk of stream) {
      // 消费剩余流以触发结束状态。
    }
    assert.equal(readFileSync(path, 'utf8'), 'idle')

    async function* failure(): AsyncIterable<StreamChunk> {
      yield { type: 'finish', reason: { kind: 'error' } } as unknown as StreamChunk
    }
    for await (const _chunk of listener({}, failure)) {
      // 消费错误结束事件以触发错误状态。
    }
    assert.equal(readFileSync(path, 'utf8'), 'error')
  } finally {
    if (previous === undefined) delete process.env.MDSH_STATUS_FILE
    else process.env.MDSH_STATUS_FILE = previous
    rmSync(directory, { recursive: true, force: true })
  }
})
