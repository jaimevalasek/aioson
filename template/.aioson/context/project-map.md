---
agents: [dev, architect, ux-ui, qa, tester, committer]
---

# Canonical Project Map

> When the user mentions a directory, resolve it using this map before creating files.
> If ambiguous, confirm the exact path with the user.

## Root-level directories

| Intent | Canonical path | Notes |
|---|---|---|
| `docs/` (root) | `docs/` | Project documentation for humans. NOT `.aioson/docs/`. |
| `plans/` | `plans/` | Pre-production research and plans. |
| `prds/` | `prds/` | Product requirement drafts (not active PRDs). |
| `src/` | `src/` | Source code. |
| `tests/` | `tests/` | Test files. |
| `scripts/` | `scripts/` | Utility scripts. |
| `bin/` | `bin/` | CLI entry points. |
| `changelogs/` | `changelogs/` | Release notes and changelogs. |

## AIOSON-managed directories

| Intent | Canonical path | Notes |
|---|---|---|
| `.aioson/` | `.aioson/` | Framework context and runtime. |
| `agents/` | `.aioson/agents/` | Agent prompt files. |
| `context/` | `.aioson/context/` | Workflow state, handoffs, specs. |
| `docs/` (aioson) | `.aioson/docs/` | Private docs loaded on-demand by agents. |
| `rules/` | `.aioson/rules/` | Project-specific rules for agents. |
| `design-docs/` | `.aioson/design-docs/` | Code governance docs. |
| `plans/` (feature) | `.aioson/plans/{slug}/` | Feature plans and harness contracts. |
| `runtime/` | `.aioson/runtime/` | SQLite telemetry and dashboard data. |
| `backups/` | `.aioson/backups/` | Auto-generated backups. |
| `skills/` | `.aioson/skills/` | Design, static and dynamic skills. |
| `installed-skills/` | `.aioson/installed-skills/` | Third-party installed skills. |

## Context files (must live in `.aioson/context/`)

| File | Canonical path |
|---|---|
| `project.context.md` | `.aioson/context/project.context.md` |
| `prd.md` | `.aioson/context/prd.md` |
| `spec.md` | `.aioson/context/spec.md` |
| `last-handoff.json` | `.aioson/context/last-handoff.json` |
| `workflow.state.json` | `.aioson/context/workflow.state.json` |
| `project-pulse.md` | `.aioson/context/project-pulse.md` |
| `dev-state.md` | `.aioson/context/dev-state.md` |
| `commit-prep.json` | `.aioson/context/commit-prep.json` |
| `simple-plans/{slug}.md` | `.aioson/context/simple-plans/{slug}.md` |

## Path rules

1. **When the user says `/docs/`, they mean the project root `docs/` folder**, not `.aioson/docs/`.
2. **When the user specifies a target directory, confirm the exact path** before creating files.
3. **Never create bootstrap or template files in the project root** unless explicitly asked. Default to `.aioson/context/` for framework artifacts.
4. **Never overwrite `.gitignore`**, `README.md`, or existing config files unless explicitly asked. Append or modify the targeted item only.
5. **Simple implementation plans** belong in `.aioson/context/simple-plans/{slug}.md`; they are not PRDs, Sheldon plans, or MEDIUM implementation plans.
