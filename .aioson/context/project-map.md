---
agents: [product, analyst, architect, ux-ui, pm, orchestrator, sheldon, dev, deyvin, qa, tester, committer, discover]
---

# Canonical Project Map

> When the user mentions a directory, resolve it using this map before creating files.
> If ambiguous, confirm the exact path with the user.
> Also see `.aioson/rules/canonical-path-contract.md` for the three confusable directories.

## Root-level directories

| Intent | Canonical path | Notes |
|---|---|---|
| `docs/` (root) | `docs/` | Project documentation for humans. NOT `.aioson/docs/`. |
| `docs/pt/` | `docs/pt/` | **System documentation only.** Written after behavior is implemented. Never used as planning space. |
| `plans/` | `plans/` | **Pre-production research only. READ-ONLY for agents.** Exception: `plans/source-manifest.md`. |
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
| `plans/` (feature, phased) | `.aioson/plans/{slug}/` | Active Sheldon phased plans. **NOT root `plans/`.** |
| `runtime/` | `.aioson/runtime/` | SQLite telemetry and dashboard data. |
| `backups/` | `.aioson/backups/` | Auto-generated backups. |
| `skills/` | `.aioson/skills/` | Design, static and dynamic skills. |
| `installed-skills/` | `.aioson/installed-skills/` | Third-party installed skills. |

## Context files (must live in `.aioson/context/`)

| File | Canonical path |
|---|---|
| `project.context.md` | `.aioson/context/project.context.md` |
| `prd.md` | `.aioson/context/prd.md` |
| `prd-{slug}.md` | `.aioson/context/prd-{slug}.md` |
| `implementation-plan-{slug}.md` | `.aioson/context/implementation-plan-{slug}.md` |
| `spec.md` | `.aioson/context/spec.md` |
| `spec-{slug}.md` | `.aioson/context/spec-{slug}.md` |
| `last-handoff.json` | `.aioson/context/last-handoff.json` |
| `workflow.state.json` | `.aioson/context/workflow.state.json` |
| `project-pulse.md` | `.aioson/context/project-pulse.md` |
| `dev-state.md` | `.aioson/context/dev-state.md` |
| `commit-prep.json` | `.aioson/context/commit-prep.json` |
| `simple-plans/{slug}.md` | `.aioson/context/simple-plans/{slug}.md` |
| `retro/{slug}.md` | `.aioson/context/retro/{slug}.md` (harness:retro dossier; `window-last-{N}.md` for windows) |

## Path rules

1. **`docs/pt/` is system documentation — not planning space.** Never write operational plans, phased plans, or scratchpad content there.
2. **Root `plans/` is read-only.** Agents must never write operational plans to `plans/` root. Use `.aioson/plans/{slug}/` for phased plans and `.aioson/context/implementation-plan-{slug}.md` for execution plans.
3. **When the user says "plans", ask for disambiguation**: root `plans/` (pre-production) or `.aioson/plans/{slug}/` (Sheldon phased plan)?
4. **When the user says `/docs/`, they mean the project root `docs/` folder**, not `.aioson/docs/`.
5. **When the user specifies a target directory, confirm the exact path** before creating files.
6. **Never create bootstrap or template files in the project root** unless explicitly asked. Default to `.aioson/context/` for framework artifacts.
7. **Never overwrite `.gitignore`**, `README.md`, or existing config files unless explicitly asked. Append or modify the targeted item only.
8. **Simple implementation plans** belong in `.aioson/context/simple-plans/{slug}.md`; they are not PRDs, Sheldon plans, or MEDIUM implementation plans.
