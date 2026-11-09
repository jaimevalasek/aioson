---
description: "Dev continuity recovery — session start order, resumption rules, resume and plan-drift events, brownfield guardrails, SDD bridge, and Git fallback."
agents: [dev]
task_types: [continuity, recovery]
triggers: [continuity recovery, recent work, stale state, plan drift, code map drift, resumed checkpoint]
---

# Dev Continuity Recovery

Load this module only when the task is continuity recovery, recent-work reconstruction, stale-state diagnosis, or resuming an existing slice.

## Session start order

Build context in this order:

1. If `aioson` is available, run `aioson memory:summary . --last=5` as the fast continuity bootstrap.
2. Read `.aioson/context/project.context.md`
3. Run `aioson context:select . --agent=dev --mode=planning --task="<task>" --paths="<known paths>"`.
4. Load only the selected PLANNING files. Do not load full `.aioson/rules/`, `.aioson/docs/`, `.aioson/design-docs/`, `discovery.md`, or `architecture.md` from this step alone.
5. If a feature slug is known, load its dossier/spec only when `context:select`, `.aioson/context/dev-state.md`, or `.aioson/context/project-pulse.md` points to that slug; use `.aioson/context/spec-current.md` for active spec and `.aioson/context/spec-history.md` only for history.
6. If code inspection/editing is about to start, run `aioson context:select . --agent=dev --mode=executing --task="<task>" --paths="<files to touch>"` and load only the selected EXECUTING files.
7. When the task matches procedural tags, run `aioson brain:query . --tags=<tags> --min-quality=4`.
8. Inspect recent runtime state in `.aioson/runtime/aios.sqlite` when memory summary is insufficient.
9. Use Git only as a fallback after memory + runtime + selected rules/docs.

If the user asks what happened recently, answer from memory and runtime first. Go to Git only if those sources are insufficient.

When the work resumes inside a multi-phase plan, compile the phase capsule first: `aioson dev:resume-data . --feature={slug} --phase={n} --capsule` (see `phase-loop.md`).

## Resume and drift events

The kernel's Context drift check compares the plan's exact paths with the dossier `code_map_paths` from `aioson dev:resume-data . --json`. Record what it found: `dev_auto_resume` when a prior Dev checkpoint is reused, `dev_drift_detected` when the comparison finds `DRIFT:`.

```bash
aioson runtime:emit . --agent=dev --type=dev_auto_resume --summary="Resumed verified feature checkpoint" 2>/dev/null || true
aioson runtime:emit . --agent=dev --type=dev_drift_detected --summary="Plan/dossier path drift requires reconciliation" 2>/dev/null || true
```

Drift options stay the kernel's three: proceed with the verified current path, update the technical plan/dossier, or stop for a material product contradiction.

## SDD bridge

When continuation depends on spec or execution state:

1. Load `.aioson/skills/process/aioson-spec-driven/SKILL.md`
2. Then load only `references/dev.md`
3. Follow that router to `maintenance-and-state.md` and `approval-gates.md` as needed
4. Treat shared SDD references as read-only process sources used by multiple agents

Do not duplicate or rewrite the shared SDD references inside `@dev`.

## Brownfield guardrails

If `framework_installed=true` in `project.context.md` and the task depends on existing system behavior:

- prefer selected module memory, `memory-index.md`, dossier, or spec before opening broad `discovery.md` / `architecture.md`
- use `skeleton-system.md` or `memory-index.md` first for faster orientation
- a missing `discovery.md` is not a gate: use scan artifacts and inspect the nearest production behavior and tests; continue a bounded known-context slice
- if that evidence exposes unresolved product intent, return the concrete decision to `@product`
- if broad architecture decisions are required, stop and route the work as a tracked feature (`@product` → `@planner`)

## Git fallback

Git is a fallback, not your first source of truth.

Use Git only when:

- AIOSON memory does not explain recent work well enough
- runtime data is missing or too shallow
- the user explicitly asks for commit-level history
