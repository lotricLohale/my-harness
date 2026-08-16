import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { bundledPresetsRoot, dshHome } from '../index.mjs'
import { GUIDANCE, loadUserClaudeMemory, name as guidanceName, renderEnvContext } from '../presets/claude-code/guidance.mjs'
import { READ_ONLY_DENY, TOOL_BLURBS } from '../presets/claude-code/specialists.mjs'
import { syncOnePreset, syncPresetTrees } from '../sync.mjs'

test('dshHome uses DSH_HOME, else ~/.dsh', () => {
  assert.equal(dshHome({ DSH_HOME: '/tmp/dsh-home' }, '/Users/x'), '/tmp/dsh-home')
  assert.equal(dshHome({}, '/Users/x'), '/Users/x/.dsh')
})

test('sync is idempotent; content change recopies', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-claude-code-'))
  try {
    const sourceRoot = join(root, 'src')
    const targetRoot = join(root, 'dst')
    const preset = join(sourceRoot, 'claude-code')
    mkdirSync(preset, { recursive: true })
    writeFileSync(join(preset, 'agent.cordis.yml'), '- id: persona\n  name: @deepseek-ai/dsh-persona\n')

    const first = syncPresetTrees(sourceRoot, targetRoot)
    assert.deepEqual(first.synced, ['claude-code'])
    assert.deepEqual(first.current, [])

    const second = syncPresetTrees(sourceRoot, targetRoot)
    assert.deepEqual(second.synced, [])
    assert.deepEqual(second.current, ['claude-code'])

    writeFileSync(join(preset, 'agent.cordis.yml'), '- id: persona\n  name: @deepseek-ai/dsh-persona\n# changed\n')
    const third = syncOnePreset(preset, join(targetRoot, 'claude-code'))
    assert.equal(third, 'synced')
    assert.match(readFileSync(join(targetRoot, 'claude-code', 'agent.cordis.yml'), 'utf8'), /changed/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('preset is DSH-shaped, not a CC tool clone', () => {
  assert.ok(bundledPresetsRoot().endsWith('presets/'))
  assert.equal(guidanceName, 'claude-code-guidance')
  assert.match(GUIDANCE, /subagent_readonly/)
  assert.match(GUIDANCE, /create_goal/)
  assert.match(GUIDANCE, /ralph/)
  assert.match(GUIDANCE, /verify-work/)
  assert.doesNotMatch(GUIDANCE, /\{\{cwd\}\}/)
  assert.doesNotMatch(GUIDANCE, /\bexplore\b/)
  assert.ok(TOOL_BLURBS.subagent_readonly.includes('Read-only child'))
  assert.ok(TOOL_BLURBS.subagent.includes('Fresh child'))
  assert.ok(TOOL_BLURBS.subagent_fork.includes('directive'))
  assert.ok(TOOL_BLURBS.bash.includes('Do not use bash to read'))
  assert.ok(READ_ONLY_DENY.includes('write'))
  assert.ok(READ_ONLY_DENY.includes('subagent_readonly'))
  const composition = readFileSync(new URL('../presets/claude-code/agent.cordis.yml', import.meta.url), 'utf8')
  assert.match(composition, /toolName: subagent_readonly/)
  assert.doesNotMatch(composition, /toolName: explore/)
  assert.doesNotMatch(composition, /toolName: verify/)
  assert.doesNotMatch(composition, /toolName: plan_agent/)
  assert.doesNotMatch(composition, /toolName: implement/)
})

test('compat user instructions and env context', () => {
  assert.equal(loadUserClaudeMemory('/tmp/no-such-home'), '')
  const home = mkdtempSync(join(tmpdir(), 'dsh-claude-md-'))
  try {
    mkdirSync(join(home, '.claude'))
    writeFileSync(join(home, '.claude', 'CLAUDE.md'), '所有回答必须使用中文\n')
    assert.equal(loadUserClaudeMemory(home), '所有回答必须使用中文')
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
  assert.equal(renderEnvContext({}), '')
  const text = renderEnvContext({ agent: { session: { header: { cwd: '/tmp' } } } })
  assert.match(text, /Git repository:/)
  assert.doesNotMatch(text, /Working directory/)
})
