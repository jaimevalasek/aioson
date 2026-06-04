---
feature: cost-context-optimization
status: approved
created_by: pm
created_at: 2026-06-01
classification: SMALL
gate: C
gate_status: approved
---

# Implementation Plan — AIOSON Cost/Context Optimization

## Gate C Summary

Gate C is approved for the current SMALL feature slice. Gate A is approved, requirements are explicit, the required architecture surface is existing command-pattern work, and @dev has already implemented the planned measurement/state slice without introducing a new shared architecture.

This plan exists to satisfy the workflow Gate C contract and give @qa a compact verification package.

## Required Context Package

1. `.aioson/context/prd-cost-context-optimization.md`
2. `.aioson/context/requirements-cost-context-optimization.md`
3. `.aioson/context/spec-cost-context-optimization.md`
4. `.aioson/context/features/cost-context-optimization/dossier.md`
5. `.aioson/context/architecture.md`

## Pre-Taken Decisions

- Keep `paused` as a visible, non-blocking feature status.
- Preserve `agent:audit .` backward compatibility by keeping the default inception-style scan.
- Keep `context:health` drift warnings advisory in this slice; they must not set `ok=false`.
- Add `skill:audit` as a standalone command instead of coupling it to `skill:list` or install flows.
- Use existing `Math.ceil(chars / 4)` token estimation for consistency with current audits.

## Execution Sequence

| Phase | Scope | Primary files | Done criteria |
|---|---|---|---|
| 1 | Paused lifecycle and stale workflow reset | `.aioson/context/features.md`, `.aioson/agents/product.md`, `template/.aioson/agents/product.md`, `src/commands/workflow-next.js`, `tests/workflow-next.test.js` | Paused feature no longer blocks new work; stale workflow state resets when mode/slug drift occurs. |
| 2 | Agent audit scope separation | `src/commands/agent-audit.js`, `src/parser.js`, `src/cli.js`, `tests/agent-audit.test.js` | Runtime/template/inception modes return correct roots and compatible JSON. |
| 3 | Skill audit parity | `src/commands/skill-audit.js`, `src/cli.js`, `src/i18n/messages/en.js`, `src/i18n/messages/pt-BR.js`, `tests/skill-audit.test.js` | `skill:audit` reports totals, categories, router/reference/support kinds, and no-files behavior. |
| 4 | Context drift visibility | `src/commands/context-health.js`, `tests/context-health.test.js` | Classification and active-state drift produce advisory `driftWarnings[]` while `ok` remains true. |
| 5 | QA handoff | `.aioson/context/spec-cost-context-optimization.md`, dossier, workflow status | @qa can verify AC-CCO-01..06 from disk artifacts and focused test outputs. |

## Checkpoints

- After implementation: update `spec-cost-context-optimization.md` with built behavior and test evidence.
- After dossier updates: keep Code Map aligned with command and test files.
- Before @qa: run `node --test tests/agent-audit.test.js tests/skill-audit.test.js tests/context-health.test.js tests/workflow-next.test.js tests/workflow-next-pentester.test.js`.
- At QA close: @qa records Gate D verdict in `spec-cost-context-optimization.md`.
