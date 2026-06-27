---
name: impeccable
description: "Impeccable quality gate — lint, type-check, tests, security scan before any commit or PR. Trigger: 'impeccable', 'make it perfect', 'quality gate', 'zero issues', 'clean before push'. Use when Before committing, creating PRs, or shipping. When user demands zero warnings, clean slate, or production-ready code."
---

# Impeccable

Run the full quality suite. Block on any failure. Do not claim work is done until every check is green.

## Checklist (run in order)

1. **Format** — apply formatter (prettier/black/gofmt/rustfmt) on changed files
2. **Lint** — zero warnings, zero errors (eslint/ruff/clippy/golangci-lint)
3. **Types** — type-check passes (tsc/mypy/pyright/flow)
4. **Tests** — full suite green, no new skips or xfails added
5. **Security** — no new high/critical advisories (npm audit / cargo audit / pip-audit)

## Rules

- Fix root cause — never suppress with ignore comments unless suppression pre-existed
- If a checker is not configured for this project, note it and skip — do not invent commands
- Report each step pass/fail before moving to the next
- If any step fails: fix, re-run that step, then continue
- Do not commit or open a PR until all applicable steps are green
- Use `rtk` prefix on noisy commands (e.g. `rtk npm test`) to keep output compressed

## Final Report

After all checks pass, output exactly:
```
✓ format
✓ lint
✓ types
✓ tests
✓ security
Impeccable.
```

If any check was skipped (not configured), replace its line with `— <name> (not configured)`.
