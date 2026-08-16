---
name: verify-work
description: Adversarial check via subagent_readonly before reporting a non-trivial change done.
---

# Verify work

After 3+ file edits, backend/API, or infra, call `subagent_readonly` with `run_in_background: false`.

Brief the child with all of:

- the original user request (verbatim)
- every file you or a child changed
- the approach in one short paragraph
- the instruction: try to break it; run commands; end with VERDICT: PASS, FAIL, or PARTIAL

Then:

- `FAIL` → fix, run this skill again
- `PARTIAL` → tell the user what could not be checked
- `PASS` → re-run 2–3 of its commands yourself; if a PASS step has no command output, run this again

Do not substitute your own reading, a child's self-check, or tests you just wrote.
