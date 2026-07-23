---
name: canonical-path-contract
description: Mandatory distinction between root plans/, .aioson/plans/{slug}/, docs/pt/, and implementation-plan. Every artifact-writing agent must consult this contract before creating files.
priority: 10
version: 1.0.0
agents: []
modes: [planning, executing]
task_types: [artifact-write, file-creation, plan-write]
load_tier: trigger
guard: true
triggers: [writing plans, creating files, saving artifacts, choosing paths, artifact destination]
paths: [plans/**, .aioson/plans/**, .aioson/context/**, docs/**]
---

# Canonical Path Contract

Every agent that creates or writes files MUST resolve the target path using this contract before writing.

## The three confusable directories

| Directory | Purpose | Write rule |
|---|---|---|
| `plans/` (root) | Pre-production research and source material only | READ-ONLY for agents. Exception: `plans/source-manifest.md` may be updated when consuming a source plan. |
| `.aioson/plans/{slug}/` | Optional specialist/harness evidence for legacy or explicitly selected workflows | Never required by the canonical feature route. |
| `docs/pt/` | Public system documentation for implemented behavior | Written only after behavior is implemented. Never used as operational planning space or scratchpad. |

## Operational artifact destinations

| Artifact | Correct destination | Owner |
|---|---|---|
| Operational feature plan (phased) | `.aioson/context/implementation-plan-{slug}.md` | `@planner` |
| PRD | `.aioson/context/prd-{slug}.md` | `@product` |
| Legacy specialist requirements | `.aioson/context/requirements-{slug}.md` | `@analyst` (opt-in only) |
| Project architecture baseline | `.aioson/context/architecture.md` | `@architect` (opt-in only) |
| Legacy feature spec | `.aioson/context/spec-{slug}.md` | Compatibility only |
| Simple implementation plan | `.aioson/context/simple-plans/{slug}.md` | `@dev` / `@deyvin` |
| QA report | `.aioson/context/qa-report-{slug}.md` | `@qa` |

## Violation behaviors

- If an agent is about to write a plan to `docs/pt/`: stop, use `.aioson/plans/{slug}/` instead.
- If an agent is about to write an operational artifact to `plans/` root: stop, use the correct `.aioson/context/` or `.aioson/plans/{slug}/` path.
- If any agent creates a file outside its write scope: stop, identify the correct path, and confirm with the user before writing.
- Before creating any file, verify the path against `.aioson/context/project-map.md`.

## When the user refers to a directory ambiguously

| User says | Agent resolves to |
|---|---|
| "plans" or "plans folder" | Default to `.aioson/context/implementation-plan-{slug}.md`; ask only if the user explicitly means research or a specialist harness. |
| "docs" or "documentation" | Ask: `docs/` root (project docs) or `docs/pt/` (PT system docs) or `.aioson/docs/` (agent on-demand docs)? |
| "context" | `.aioson/context/` (framework artifacts) |
| "rules" | `.aioson/rules/` (agent rules) |

## Simple plan distinction

`simple-plans/{slug}.md` is not a PRD, not a Sheldon phased plan, and not a MEDIUM implementation plan. It is a lightweight implementation artifact for bounded technical work that `@dev` or `@deyvin` can execute directly under `.aioson/rules/simple-plan-lane.md`.
