# Lovalte — Claude Code Configuration

## Project Mandates (NON-NEGOTIABLE)

### Mandate 1 — DDD is the only architecture

Before any domain model, aggregate, bounded context, entity, value object, domain event, repository, or use-case work — invoke `v3-ddd-architecture` first (`Skill` tool, `skill: "v3-ddd-architecture"`). No anemic models; no domain logic in controllers/handlers; no infrastructure imports inside `domain/`.

Layer layout: `domain/` = pure; `application/` = handlers only; `infrastructure/` = all I/O; `presentation/` = React + REST. Hard rules: aggregates reference each other by ID only; one aggregate = one transaction; repositories return domain objects; contexts integrate via domain events.

### Mandate 2 — Frontend always uses the 4-skill pipeline

Before any frontend work (component, page, layout, CSS/Tailwind, styling, animation, design token) — invoke `frontend-pipeline` first (`Skill` tool, `skill: "frontend-pipeline"`). That skill specifies the PLAN → BUILD → REVIEW → GATE sequence, phase ownership, and conflict-resolution rules.

## Ultracode Mode (when `/effort ultracode` or `ultracode` in prompt)

1. **One orchestrator per task — the native Workflow.** Do NOT also drive through ruflo `swarm_init` / `hive-mind_spawn`.
2. **Workflow subagents: `sonnet` or `haiku` ONLY — never `opus`.**
3. **Workflow subagents are isolated** — no `SendMessage` between them; coordinate at the outer layer after the workflow completes.
4. **Chain workflows for big work:** understand → implement → verify, one workflow each.

## Model Policy

No opus for spawned agents — enforced by `settings.json` `modelPreferences.default = claude-sonnet-4-6` + SubagentStart hook. Any new `.claude/agents/*.md` file MUST pin `model: sonnet` or `model: haiku` in frontmatter. Tier: **Haiku** = mechanical/large fan-out; **Sonnet** = everything else.

## Rules

- Do what has been asked; nothing more, nothing less
- NEVER create files unless absolutely necessary — prefer editing existing files
- NEVER create documentation files unless explicitly requested
- NEVER save working files or tests to root — use `/src`, `/tests`, `/docs`, `/config`, `/scripts`
- ALWAYS read a file before editing it
- NEVER commit secrets, credentials, or .env files
- NEVER add a `Co-Authored-By` trailer to user commits unless `.claude/settings.json` has `attribution.commit` set (#2078)
- Keep files under 500 lines
- Validate input at system boundaries

## Agent Coordination

Name every agent (`name: "role"`). Spawn all agents in one message with `run_in_background: true`, then stop and wait for results. Coordinate via `SendMessage`, not polling. Swarm for: 3+ files, new features, cross-module refactoring, API/security changes. Skip for: single-file fixes, 1-2 line edits, docs, config.

## Build & Test

- ALWAYS run tests after code changes
- ALWAYS verify build succeeds before committing

```bash
npm run build && npm test
```

## MCP Tools

Use `ToolSearch("keyword")` to discover ruflo MCP tools (memory_store, memory_search, swarm_init, hooks_route, aidefence_scan, hive-mind_init). `ruflo init --wizard` regenerates full CLI quick-reference.

<!-- codeluma:skills:begin -->
## Project Skills (managed by CodeLuma)
<!-- Edited by CodeLuma's "Add to project". Manual edits inside this region are overwritten. -->

### v3-ddd-architecture
`v3-ddd-architecture` (`@.claude/skills/v3-ddd-architecture/SKILL.md`) - DDD architecture patterns — trigger on: domain model, bounded context, aggregate, entity, value object, domain event, repository pattern, CQRS, hexagonal/clean architecture. Enforces v3 DDD layer rules for new features, refactors, and design questions. <=300.
When when designing domain models, discussing bounded contexts, aggregates, or any DDD / clean / hexagonal architecture quest, invoke the Skill tool with skill:"v3-ddd-architecture" before doing anything else.
<!-- codeluma:skills:end -->
