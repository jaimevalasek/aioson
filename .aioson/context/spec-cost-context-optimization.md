---
feature: cost-context-optimization
status: in_progress
started: 2026-06-01
classification: SMALL
phase_gates:
  requirements: approved
  design: pending
  plan: pending
  execution: pending
last_checkpoint: "@dev implemented measurement correctness slice on 2026-06-01"
gate_requirements: approved
---

# Spec — AIOSON Cost/Context Optimization

## What was built

Seed slice already landed before this requirements pass:
- `gemini-phaseout` can be parked as `paused` in feature registry, dossier, requirements, and spec.
- `@product` workspace/template instructions now define `paused` as non-blocking.
- `workflow-next` discards stale state when project/feature mode or active feature slug changes.
- `cost-context-optimization` PRD and active dossier exist.

Implementation slice completed by @dev on 2026-06-01:
- `agent:audit` now supports `--runtime-only`, `--template-only`, and `--inception`; JSON output includes `mode`, `roots`, and per-file `category` while preserving `ok` and `files`.
- `skill:audit` reports skill markdown cost across `.aioson/skills`, `.aioson/installed-skills`, and `template/.aioson/skills`, separating `SKILL.md` routers from references/support files.
- `context:health` now returns advisory `driftWarnings` for project-vs-feature classification drift and feature registry vs project pulse active-state drift.
- Focused `node:test` coverage was added for the changed command surfaces.

## Entities added

No database entities.

Structured output concepts:
- Audit scope: mode + roots.
- Audit file result: file/category/chars/tokens/status.
- Drift warning: id/severity/message/suggested_command.

## Key decisions

- 2026-06-01 `paused` is a first-class feature status that preserves future work without blocking new feature creation.
- 2026-06-01 Only `features.md status: in_progress` defines active feature routing.
- 2026-06-01 `skill:audit` separates `SKILL.md` router cost from reference-file cost so lazy-loading decisions are visible.
- 2026-06-01 Drift warnings are advisory in this slice; they do not make `context:health` fail.
- 2026-06-01 A dedicated `feature:pause` command is out of scope for this slice.
- 2026-06-01 `agent:audit` default remains inception-style to avoid removing existing JSON `files` behavior.
- 2026-06-01 `skill:audit` uses the same simple token estimator as agent/context audits: `Math.ceil(chars / 4)`.

## Edge cases handled

- Paused features must not block `@product`.
- Paused dossiers must not enter active context packs.
- Stale feature workflow state must reset to project mode when no feature is active.
- Stale project workflow state must reset to feature mode when a new active feature appears.
- Missing pulse/workflow/skill directories should not crash health or audit commands.
- Multiple active features are detected as invalid/drift but not repaired automatically in this slice.
- Conflicting `agent:audit` scope flags return `ok=false` with `reason: conflicting_modes`.

## Dependencies

- Reads: `.aioson/context/features.md`, `.aioson/context/project-pulse.md`, `.aioson/context/workflow.state.json`, `.aioson/context/project.context.md`, `.aioson/agents`, `template/.aioson/agents`, `.aioson/skills`, `.aioson/installed-skills`, `template/.aioson/skills`.
- Writes: command output only for audit/health; no persistent writes except existing workflow state reconciliation and agent-managed context artifacts.

## Notes

- Source analysis: `.aioson/docs/aioson-cost-optimization-analysis.md`.
- Requirements: `.aioson/context/requirements-cost-context-optimization.md`.
- This is a SMALL feature; @dev can proceed after Gate A without a full architecture pass unless implementation introduces a new shared audit abstraction.

## Dev verification

2026-06-01 @dev ran:
- `node --check src/commands/agent-audit.js src/commands/skill-audit.js src/commands/context-health.js src/cli.js src/parser.js`
- `node --test tests/agent-audit.test.js`
- `node --test tests/skill-audit.test.js`
- `node --test tests/context-health.test.js`
- `node --test tests/workflow-next.test.js tests/workflow-next-pentester.test.js`
- CLI smoke checks: `agent:audit --runtime-only --json`, `agent:audit --template-only --json`, `skill:audit --json`, `context:health --json`

## Handoff status

`workflow:next --complete=dev` is currently blocked by the formal Gate C contract because `.aioson/context/implementation-plan-cost-context-optimization.md` does not exist. The feature spec classifies this slice as SMALL and allowed @dev after Gate A, but the CLI gate checker still enforces the MEDIUM-style implementation-plan artifact. Next action: @pm should produce/approve the missing plan or the gate policy should be adjusted for SMALL feature slices, then rerun @dev completion and route to @qa.
