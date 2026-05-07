# Parallel Orchestration Guide

Use `parallel:init` to bootstrap the parallel context files used by `@orchestrator`.

## Command

```bash
aioson parallel:init [path] [--workers=2..6] [--force] [--dry-run] [--json]
```

Aliases:
- `aioson orchestrator:init`
- `aioson parallel-init`

## Behavior
- Requires parseable `.aioson/context/project.context.md`.
- Only allows `classification=MEDIUM` by default.
- Use `--force` to initialize for other classifications.
- Generates:
  - `.aioson/context/parallel/shared-decisions.md`
  - `.aioson/context/parallel/agent-N.status.md`

## Prerequisite checks
The command reports whether these files are present:
- `.aioson/context/discovery.md`
- `.aioson/context/architecture.md`
- `.aioson/context/prd.md`

Missing prerequisites are reported but do not block file generation.

## Scope assignment

```bash
aioson parallel:assign
aioson parallel:assign --source=architecture --workers=3
aioson parallel:assign --source=prd
aioson parallel:assign --dry-run
```

Aliases:
- `aioson orchestrator:assign`
- `aioson parallel-assign`

Behavior:
- Reads scope candidates from `prd`, `architecture`, or `discovery` context docs.
- Distributes scope items across lane files in round-robin mode.
- Updates `## Scope` section and `updated_at` in each lane file.
- Appends a decision-log entry to `shared-decisions.md` when present.

## Status overview

```bash
aioson parallel:status
aioson parallel:status --json
```

Aliases:
- `aioson orchestrator:status`
- `aioson parallel-status`

Behavior:
- Reads all `agent-N.status.md` lane files under `.aioson/context/parallel`.
- Aggregates lane status counts, scope counts, blocker counts, and deliverable progress.
- Includes shared decision log entry count from `shared-decisions.md` when present.
- Returns a structured machine-readable report with `--json`.

## Diagnose and repair

```bash
aioson parallel:doctor
aioson parallel:doctor --workers=3
aioson parallel:doctor --fix
aioson parallel:doctor --fix --dry-run
```

Aliases:
- `aioson orchestrator:doctor`
- `aioson parallel-doctor`

Notes:
- `--fix` can recreate missing `shared-decisions.md` and missing lane files.
- For non-`MEDIUM` projects, `--fix` requires `--force`.
