/**
 * Shared blurbs / deny-list for the one extra DSH tool this preset adds:
 * `subagent_readonly`. Explore / plan / verify are jobs for that child, not
 * extra CC-named tools.
 */

/** Mutation and nesting tools a read-only child must not see. */
export const READ_ONLY_DENY = [
  'write',
  'edit',
  'todo_write',
  'subagent',
  'subagent_fork',
  'subagent_readonly',
  'workflow',
  'ralph',
  'create_goal',
  'update_goal',
  'exit_plan_mode',
]

/** Prepended onto tool descriptions at assemble time. */
export const TOOL_BLURBS = {
  subagent_readonly:
    'Read-only child (cannot edit). Use for broad codebase search, a second-opinion plan, or adversarial verification. Directed lookup of a known file/symbol stays on glob/grep/read. Session planning stays on plan mode. Implementation stays on subagent / subagent_fork.',
  subagent:
    'Fresh child with a full toolbox. Use for a scoped implementation chunk that would flood this context. Brief it with paths, line numbers, and the exact change. Research and verify go to subagent_readonly. 1–2 file edits stay here.',
  subagent_fork:
    'Child that already sees this conversation. Prompt is a directive (scope in/out), not a recap. Use when the child needs the thread so far. Do not read its transcript while it runs unless the user asks.',
  bash:
    'Do not use bash to read, edit, create, find, or grep files. Use read / edit / write / glob / grep. Reserve bash for git, installs, test runners, and other real shell work.',
}
