/**
 * Claude Code ideas, DSH primitives.
 * Dedicated tools, explore-first, finish-and-check, confirm blast radius —
 * expressed with subagent / fork / plan-mode / skill / goal / ralph / workflow.
 */

import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { TOOL_BLURBS } from './specialists.mjs'

/** Byte cap for optional ~/.claude/CLAUDE.md overlay. */
const USER_MEMORY_MAX_BYTES = 32_768

/** Cordis plugin name used by loader diagnostics. */
export const name = 'claude-code-guidance'

/** Prompt assembly and tool schemas must exist before this filter runs. */
export const inject = ['systemPrompt']

/** After persona (0), before tool-guidance (100–199). */
export const SECTION_ORDER = 10

/** Prefix-stable operating rules. */
export const GUIDANCE = `# How to work
- Do the change in the repo. Unclear instructions are still software-engineering work in the working directory.
- Read before you edit. Do not propose changes to code you have not opened.
- Prefer edit over create. Do not add files, comments, types, helpers, or error handling the task does not need.
- Do not leave it half-done: run the test or command that proves the change, or say you could not.
- Do not create *.md / README unless asked.
- If an approach fails, diagnose once. Do not retry the identical call. ask_user_question only after you have looked.
- Denied tool calls: change the approach, do not resubmit the same call.
- Never invent URLs. Never introduce injection / XSS / SQLi. Delete unused code instead of compatibility shims.

# Blast radius
Local edits and tests can proceed. Confirm first for shared, destructive, or hard-to-reverse work (force-push, reset --hard, rm -rf, dropping data, pushing, PR/issue comments, Slack/email, CI). One approval is not a standing approval. Do not --no-verify to dodge a hook.

# Tools
Use the dedicated tool, not bash:
- read / edit / write / glob / grep
bash is for git, installs, test runners, and real shell work.
Independent calls go in parallel. Dependent calls stay sequential.
todo_write: mark a task done when it is done, not in a batch at the end.

# Delegation (DSH)
- Known file or symbol: glob / grep / read yourself.
- Broad search, a read-only plan, or verification: subagent_readonly. Do not repeat its searches.
- Session planning: plan mode / exit_plan_mode.
- Implementation that would flood this context: subagent (fresh) or subagent_fork (inherits this thread). Fork prompts are directives — scope in/out, no recap. Do not read a running child's transcript unless the user asks.
- 1–2 file edits: do them yourself.
- Long objective across turns: create_goal.
- Fresh-agent iteration over a shared workspace: ralph.
- Fan-out with a script: workflow.
- Never delegate understanding. Child prompts need paths, line numbers, and the exact change.

# Check the work
After 3+ file edits, backend/API, or infra: load the verify-work skill and run it through subagent_readonly with run_in_background false. You own the gate.
FAIL → fix and check again. PARTIAL → tell the user what could not be run. PASS → re-run 2–3 of its commands. Your own reading and a test file you just wrote do not count.
Skip this for a one-file typo or a question with no edits.

# Git
Commit or push only when asked. Never change git config. Never skip hooks unless asked. Never force-push main/master. After a hook failure, a NEW commit — not --amend. Stage named files, not git add -A. Prefer the commit / pull-request skills.

# Tone
Short and direct. Lead with the action. No emojis unless asked. Cite code as file_path:line_number. No colon immediately before a tool call.`

/**
 * Optional Claude-compatible user-global instructions (~/.claude/CLAUDE.md).
 * Project AGENTS.md / CLAUDE.md still come from dsh-agent-instructions.
 * @param {string} [home]
 * @returns {string}
 */
export function loadUserClaudeMemory(home = homedir()) {
  const path = join(home, '.claude', 'CLAUDE.md')
  try {
    const text = readFileSync(path, 'utf8').trim()
    if (text.length === 0) return ''
    return text.length > USER_MEMORY_MAX_BYTES ? `${text.slice(0, USER_MEMORY_MAX_BYTES)}\n\n[truncated]` : text
  } catch {
    return ''
  }
}

/**
 * Session env snapshot. Appended only when the text changes.
 * @param {{ agent?: { session?: { header?: { cwd?: string } } } }} context
 * @returns {string}
 */
export function renderEnvContext(context) {
  const cwd = context.agent?.session?.header?.cwd
  if (typeof cwd !== 'string' || cwd.length === 0) return ''
  const git = existsSync(join(cwd, '.git')) ? 'yes' : 'no'
  return [
    `Git repository: ${git}`,
    `Platform: ${process.platform}`,
    `Date: ${new Date().toISOString().slice(0, 10)}`,
  ].join('\n')
}

/**
 * Register operating rules, optional user-global overlay, env snapshot, tool blurbs.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'preset:claude-code',
    order: SECTION_ORDER,
    text: GUIDANCE,
  }), 'claude-code-guidance.section()')

  ctx.effect(() => ctx.systemPrompt.section({
    name: 'preset:user-global-compat',
    order: 5,
    text: () => {
      const memory = loadUserClaudeMemory()
      return memory === '' ? '' : `User-global instructions from ~/.claude/CLAUDE.md:\n\n${memory}`
    },
  }), 'claude-code-guidance.user-global()')

  ctx.effect(() => ctx.systemPrompt.context({
    name: 'preset:claude-code-env',
    order: 20,
    text: renderEnvContext,
  }), 'claude-code-guidance.env()')

  ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
    const assembled = await next()
    if (!Array.isArray(assembled.tools)) return assembled
    return {
      ...assembled,
      tools: assembled.tools.map((tool) => {
        const blurb = TOOL_BLURBS[tool.name]
        if (blurb === undefined || typeof tool.description !== 'string') return tool
        if (tool.description.startsWith(blurb)) return tool
        return { ...tool, description: `${blurb}\n\n${tool.description}` }
      }),
    }
  }, { prepend: true })
}
