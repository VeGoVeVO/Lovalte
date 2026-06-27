---
name: handoff
description: "handoff, continue, next session, pick up, switch agents — Compact current conversation into a handoff doc saved to OS temp dir for a fresh agent to continue. References existing artifacts by path/URL; redacts secrets; includes suggested skills for the next session. Use when When ending a session, switching Claude instances, passing work to another agent, or summarizing session state for later pickup."
---

Write a handoff document summarising the current conversation so a fresh agent can continue the work.

## Steps

1. Identify OS temp dir: `$env:TEMP` (Windows), `$TMPDIR` (macOS/Linux), `/tmp` fallback.
2. Name the file `handoff-<project>-<YYYYMMDD>.md` (project = cwd basename; date from `currentDate` context or ISO today).
3. Write the document with these sections:
   - **Context** — what was being worked on and why
   - **Current state** — what's done, what's in progress, what's blocked
   - **Artifacts** — reference existing PRDs, plans, ADRs, issues, commits, diffs by path or URL; do NOT duplicate their content
   - **Next steps** — concrete actions for the next session
   - **Suggested skills** — skills the next agent should invoke (e.g. `systematic-debugging`, `writing-plans`, `test-driven-development`)
4. If the user passed arguments, treat them as the next session's focus; tailor **Next steps** and **Suggested skills** accordingly.
5. Redact all sensitive info: API keys, passwords, tokens, PII. Replace with `[REDACTED]`.
6. Save ONLY to OS temp dir — never the current workspace.
7. Report the full saved path to the user.
