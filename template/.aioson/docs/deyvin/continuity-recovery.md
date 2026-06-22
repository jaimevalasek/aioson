---
description: "Deyvin continuity recovery — session start order, resumption rules, brownfield guardrails, SDD bridge, and Git fallback."
agents: [deyvin]
task_types: [continuity, recovery]
triggers: [continuity recovery, recent work, stale state]
---

# Deyvin Continuity Recovery

Load this module only when the task is continuity recovery, recent-work reconstruction, stale-state diagnosis, or resuming an existing slice.

## Session start order

Build context in this order:

1. If `aioson` is available, run `aioson memory:summary . --last=5` as the fast continuity bootstrap.
2. Read `.aioson/context/project.context.md`
3. Run `aioson context:select . --agent=deyvin --mode=planning --task="<task>" --paths="<known paths>"`.
4. Load only the selected PLANNING files. Do not load full `.aioson/rules/`, `.aioson/docs/`, `.aioson/design-docs/`, `discovery.md`, or `architecture.md` from this step alone.
5. If a feature slug is known, load its dossier/spec only when `context:select`, `.aioson/context/dev-state.md`, or `.aioson/context/project-pulse.md` points to that slug; use `.aioson/context/spec-current.md` for active spec and `.aioson/context/spec-history.md` only for history.
6. If code inspection/editing is about to start, run `aioson context:select . --agent=deyvin --mode=executing --task="<task>" --paths="<files to touch>"` and load only the selected EXECUTING files.
7. When the task matches procedural tags, run `aioson brain:query . --tags=<tags> --min-quality=4`.
8. Inspect recent runtime state in `.aioson/runtime/aios.sqlite` when memory summary is insufficient.
9. Use Git only as a fallback after memory + runtime + selected rules/docs.

If the user asks what happened recently, answer from memory and runtime first. Go to Git only if those sources are insufficient.

## SDD bridge

When continuation depends on spec or execution state:

1. Load `.aioson/skills/process/aioson-spec-driven/SKILL.md`
2. Then load only `references/deyvin.md`
3. Follow that router to `maintenance-and-state.md` and `approval-gates.md` as needed
4. Treat shared SDD references as read-only process sources used by multiple agents

Do not duplicate or rewrite the shared SDD references inside `@deyvin`.

## Brownfield guardrails

If `framework_installed=true` in `project.context.md` and the task depends on existing system behavior:

- prefer selected module memory, `memory-index.md`, dossier, or spec before opening broad `discovery.md` / `architecture.md`
- use `skeleton-system.md` or `memory-index.md` first for faster orientation
- if `discovery.md` is missing but scan artifacts exist, stop and hand off to `@analyst`
- if broad architecture decisions are required, hand off to `@architect`

## Git fallback

Git is a fallback, not your first source of truth.

Use Git only when:

- AIOSON memory does not explain recent work well enough
- runtime data is missing or too shallow
- the user explicitly asks for commit-level history
