/**
 * dsh-claude-code — host half only.
 * Syncs presets/claude-code into ~/.dsh/.agent-presets and announces the mode.
 */

import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { syncPresetTrees } from './sync.mjs'

/** Stable cordis plugin name. */
export const name = 'claude-code'

/** Prompt assembly must exist before the announcement section can register. */
export const inject = ['systemPrompt']

/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 151

/** Model-facing announcement: plugin presence and how to select it. */
export const CLAUDE_CODE_GUIDANCE = '本机已安装 dsh-claude-code 插件：新建会话可选「Claude Code」。这是 Claude Code 的工作思想用 DSH 原语实现（先读后写、专用工具、subagent_readonly 做探查/验收、plan mode、goal/ralph/workflow 做长任务），不是 CC 工具表的搬运。preset 在 ~/.dsh/.agent-presets，升级覆盖手改。'

function expandHome(path, home = homedir()) {
  if (path === '~') return home
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(home, path.slice(2))
  return path
}

/** Resolve DSH home: DSH_HOME wins, else ~/.dsh. */
export function dshHome(env = process.env, home = homedir()) {
  const raw = env.DSH_HOME
  if (raw !== undefined && raw.trim() !== '') {
    const expanded = expandHome(raw.trim(), home)
    return isAbsolute(expanded) ? expanded : join(process.cwd(), expanded)
  }
  return join(home, '.dsh')
}

/** Absolute path of the bundled preset tree inside this package. */
export function bundledPresetsRoot() {
  return fileURLToPath(new URL('./presets/', import.meta.url))
}

/**
 * Mount the plugin: sync bundled presets, then announce.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{ enabled?: boolean, announceToAgent?: boolean }} [config]
 */
export function apply(ctx, config = {}) {
  const enabled = config.enabled !== false
  // Default off: this is a host plugin, so a section here lands in EVERY
  // preset. The picker already lists Claude Code. Set announceToAgent: true
  // only if other agents must know the plugin exists.
  const announce = config.announceToAgent === true

  const sync = () => {
    const targetRoot = join(dshHome(), '.agent-presets')
    try {
      const result = syncPresetTrees(bundledPresetsRoot(), targetRoot)
      for (const { id, error } of result.failed) {
        ctx.logger?.warn?.(`dsh-claude-code: preset ${id} sync failed: ${error}`)
      }
      if (result.synced.length > 0) {
        ctx.logger?.info?.(`dsh-claude-code: presets synced into ${targetRoot}: ${result.synced.join(', ')}`)
      }
    } catch (error) {
      ctx.logger?.warn?.(`dsh-claude-code: preset sync failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  let disposeSection
  const refresh = () => {
    disposeSection?.()
    disposeSection = undefined
    if (!enabled) return
    sync()
    if (announce) {
      disposeSection = ctx.systemPrompt.section({
        name: 'plugin:dsh-claude-code',
        order: SECTION_ORDER,
        text: CLAUDE_CODE_GUIDANCE,
      })
    }
  }

  refresh()
  ctx.effect(() => () => {
    disposeSection?.()
    disposeSection = undefined
  }, 'dsh-claude-code: announcement')
}
