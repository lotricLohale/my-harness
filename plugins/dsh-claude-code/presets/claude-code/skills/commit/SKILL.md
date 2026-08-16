---
name: commit
description: Create a git commit from the actual diff. Use when the user asks to commit.
---

# Commit

Only run this when the user asked to commit.

## Safety

- Never update git config
- Never `--no-verify` / `--no-gpg-sign` unless the user explicitly asked
- Never force-push to main/master
- Never `git add -A` or `git add .` — stage named files
- After a hook failure, make a NEW commit; do not `--amend`
- Do not commit `.env`, credentials, or secrets; warn if asked
- Do not push unless the user asked

## Steps (parallel where independent)

1. In parallel: `git status` (never `-uall`), `git diff`, `git log -8 --oneline`
2. Draft 1–2 sentences on why, matching this repo's log style
3. `git add` the named files, then:

```bash
git commit -m "$(cat <<'EOF'
Commit message here.
EOF
)"
```

4. `git status` to confirm
