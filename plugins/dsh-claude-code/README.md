# dsh-claude-code

Claude Code **ideas** on DeepSeek Harness primitives. Not a CC tool-for-tool port.

New sessions can pick **Claude Code**.

## Ideas → DSH

| Idea | DSH |
|---|---|
| Explore first, dedicated tools | guidance + `read`/`edit`/`glob`/`grep` over bash |
| Don't flood the parent | `subagent` / `subagent_fork` |
| Read-only search / plan / verify | one extra tool: `subagent_readonly` (deny-list) |
| Session planning | existing plan mode |
| Finish and check | `verify-work` skill → `subagent_readonly` |
| Long / iterative / fan-out | `create_goal` / `ralph` / `workflow` |
| Git safety | `commit` / `pull-request` skills |
| User-global notes | project `AGENTS.md` plus optional `~/.claude/CLAUDE.md` |

## Use

New session → **Claude Code**. Restart `dsh web` after install.

Host announcement is off by default so other presets are not polluted. Set `announceToAgent: true` on the host row if you want every agent to see the plugin note.

## Layout

```
presets/claude-code/
  agent.cordis.yml     standard topology + subagent_readonly
  guidance.mjs         rules + tool blurbs + optional ~/.claude overlay
  specialists.mjs      deny-list + blurbs
  skills/
```
