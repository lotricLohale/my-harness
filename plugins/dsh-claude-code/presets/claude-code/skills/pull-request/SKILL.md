---
name: pull-request
description: Open a GitHub pull request with gh. Use when the user asks to create a PR.
---

# Pull request

Only run this when the user asked for a PR.

## Safety

- Do not force-push to main/master
- Do not skip hooks
- Do not use interactive git flags (`-i`)

## Steps

1. In parallel: `git status` (never `-uall`), `git diff`, `git rev-parse --abbrev-ref --symbolic-full-name @{u}` (ok if it fails), `git log` and `git diff main...HEAD` or `master...HEAD` (try origin/main if needed)
2. Draft a title under 70 characters and a body with Summary + Test plan. Cover every commit on the branch, not just the last one.
3. Create a branch if needed, push `-u` if needed, then:

```bash
gh pr create --title "the pr title" --body "$(cat <<'EOF'
## Summary
- 

## Test plan
- [ ]
EOF
)"
```

4. Return the PR URL.
