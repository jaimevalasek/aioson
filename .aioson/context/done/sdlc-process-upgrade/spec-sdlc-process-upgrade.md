---
feature: sdlc-process-upgrade
status: qa_ready
started: "2026-04-24"
version: 2
spec_version: 2
classification: MEDIUM
gate_requirements: approved
gate_design: approved
gate_plan: approved
gate_execution: approved
last_checkpoint: "QA re-verification completed on 2026-04-28 — npm test passed (1698/1698); Gate D approved"
active_execution_artifact: ".aioson/plans/sdlc-process-upgrade/manifest.md"
---

# Spec — SDLC Process Upgrade

## What Was Built

[To be filled by downstream agents during implementation.]

## Feature Intent

AIOSON must preserve context across the whole software development lifecycle: `@product`, `@sheldon`, `@analyst`, `@architect`, `@ux-ui` when applicable, `@pm`, `@orchestrator`, `@dev`, and `@qa`.

The user-facing result must be simple: every phase says what was produced, what gate is current, what is missing, which agent comes next, why that agent comes next, and how to approve or unblock the next step.

## Artifact Sources

- PRD: `.aioson/context/prd-sdlc-process-upgrade.md`
- Sheldon enrichment: `.aioson/context/sheldon-enrichment-sdlc-process-upgrade.md`
- Requirements: `.aioson/context/requirements-sdlc-process-upgrade.md`
- Conformance contract: `.aioson/context/conformance-sdlc-process-upgrade.yaml`
- Phased plan: `.aioson/plans/sdlc-process-upgrade/manifest.md`

## Entities and Contracts Added or Modified

### Artifact Path Contract

- Root `plans/`: pre-production source only.
- `docs/pt/`: public system documentation only.
- `.aioson/plans/{slug}/`: phased Sheldon plan.
- `.aioson/context/implementation-plan-{slug}.md`: MEDIUM execution plan owned by `@pm`.
- `.aioson/context/spec-{slug}.md`: living feature memory.

### Gate Contract

- Gate A requirements: approved by this analyst pass.
- Gate B design: approved by `@architect`.
- Gate C plan: approved by `@pm`.
- Gate D execution: implementation corrections completed by `@dev`; pending final `@qa` confirmation.

Gate status is stored with flat fields (`gate_requirements`, `gate_design`, `gate_plan`, `gate_execution`) because the current parser reads that format deterministically.

### Handoff Contract

Every handoff must include next agent, reason, produced artifacts, gate status, blockers, and exact next action or approval instruction.

### Execution Context Contract

If `.aioson/plans/{slug}/manifest.md` is active and not complete/done, it is the primary execution artifact. `implementation-plan-{slug}.md` is supporting context until the manifest is complete.

## Key Decisions

- 2026-04-24 — `docs/pt/` is not a plan destination; it is documentation for implemented/defined system behavior.
- 2026-04-24 — Root `plans/` remains disposable/pre-production source material.
- 2026-04-24 — The official phased plan for this feature lives in `.aioson/plans/sdlc-process-upgrade/`.
- 2026-04-24 — Gate fields in this spec use flat frontmatter because the current parser does not reliably parse nested YAML `phase_gates`.
- 2026-04-24 — For MEDIUM features, `@pm` should own initial `implementation-plan-{slug}.md`; this must be made consistent across prompts, rules, skill references, and CLI validators.
- 2026-04-24 — `@architect` is the next required agent; jumping directly to `@dev` would skip Gate B and Gate C for a MEDIUM process feature.
- 2026-04-24 — Gate B architecture approved: keep one workflow motor, add deterministic `gate:approve`, make preflight role-aware, and make active Sheldon manifest win over implementation plan during execution.
- 2026-04-24 — Gate C plan approved: `@orchestrator` should coordinate this MEDIUM implementation before `@dev`; `implementation-plan-sdlc-process-upgrade.md` is supporting context and the active Sheldon manifest remains the execution artifact.
- 2026-04-24 — Orchestration prepared: four lanes were created in `.aioson/context/parallel/` with explicit write scopes and dependency order; no real subagents were spawned in this session.

## Requirements Index

- REQ-SDLC-01 — Canonical path protection
- REQ-SDLC-02 — Gate approval UX
- REQ-SDLC-03 — State continuity and next step recovery
- REQ-SDLC-04 — Implementation plan ownership
- REQ-SDLC-05 — Handoff and preflight readiness
- REQ-SDLC-06 — Dev execution context
- REQ-SDLC-07 — Product and Sheldon flow
- REQ-SDLC-08 — Memory, observability, docs, and regression safety

## Edge Cases Handled

- Operational plan accidentally placed in `docs/pt/`.
- Executable plan accidentally placed in root `plans/`.
- Stale root source analysis contradicting current code.
- Gate parser passing/failing because of accidental prose matches.
- `preflight` returning READY without agent-specific context.
- `dev-state.md` belonging to another completed feature.
- Manifest and implementation plan coexisting.
- New chat starts after a previous phase completed.

## Dependencies

Reads:

- `.aioson/config.md`
- `.aioson/context/project.context.md`
- `.aioson/context/features.md`
- `.aioson/context/project-pulse.md`
- `.aioson/context/prd-sdlc-process-upgrade.md`
- `.aioson/context/sheldon-enrichment-sdlc-process-upgrade.md`
- `.aioson/context/requirements-sdlc-process-upgrade.md`
- `.aioson/plans/sdlc-process-upgrade/manifest.md`
- `.aioson/plans/sdlc-process-upgrade/plan-*.md`

Likely writes during implementation:

- `.aioson/agents/*.md`
- `.aioson/rules/*.md`
- `.aioson/skills/process/aioson-spec-driven/*.md`
- `src/commands/*.js`
- `src/preflight-engine.js`
- `src/handoff-contract.js`
- `src/cli.js`
- `src/i18n/messages/*.js`
- `test` files for regression coverage
- `docs/pt/*.md` only after behavior is implemented/aligned

## Gate Status

Gate A: approved.
Gate B: approved.
Gate C: approved.
Gate D: pending final QA confirmation after post-review fixes.

## Notes for @architect

- Start from the eight phase files in `.aioson/plans/sdlc-process-upgrade/`.
- Do not design a new workflow engine; align existing CLI, prompts, rules, and validators.
- Treat `docs/pt/` updates as final documentation after behavior is implemented, not as planning output.
- Resolve the `implementation-plan-{slug}.md` ownership contradiction explicitly.
- Design a deterministic gate approval path or, if no dedicated command exists yet, specify the exact CLI/manual fallback behavior.

## Notes for @pm

- Gate C must produce `.aioson/context/implementation-plan-sdlc-process-upgrade.md`.
- The implementation plan must reference all upstream artifacts, including PRD, enrichment, requirements, spec, architecture, conformance, and the Sheldon manifest.
- The plan must tell `@dev` which phase file is active and which files are context only.
- Use the architecture decision that `@pm` owns initial MEDIUM implementation plans.
- Do not send this feature to `@dev` until `gate_plan: approved`.

## Notes for @dev

- Gate B and Gate C are approved.
- When implementation starts, use active manifest precedence from REQ-SDLC-06.
- Add regression tests for each bug class before marking phases complete.
- Read `implementation-plan-sdlc-process-upgrade.md`, but follow active Sheldon manifest phase precedence while the manifest is not complete/done.
- Start by reading `.aioson/context/parallel/shared-decisions.md` and the lane status files.
- Lanes 1 and 2 can start first; lane 3 depends on lanes 1 and 2; lane 4 is final docs/memory/regression after lanes 1-3.

## Orchestration

Parallel workspace:

- `.aioson/context/parallel/workspace.manifest.json`
- `.aioson/context/parallel/ownership-map.json`
- `.aioson/context/parallel/merge-plan.json`
- `.aioson/context/parallel/shared-decisions.md`
- `.aioson/context/parallel/agent-1.status.md`
- `.aioson/context/parallel/agent-2.status.md`
- `.aioson/context/parallel/agent-3.status.md`
- `.aioson/context/parallel/agent-4.status.md`

Lane summary:

| Lane | Scope | Dependency |
|---|---|---|
| 1 | Path contract + Product/Sheldon flow | shared decisions |
| 2 | Gate approval + preflight/workflow state | shared decisions |
| 3 | PM ownership + dev/orchestrator execution context | lanes 1 and 2 |
| 4 | Memory, observability, docs and regression tests | lanes 1, 2 and 3 |

## Notes for @qa

- Use `.aioson/context/conformance-sdlc-process-upgrade.yaml` as the verification matrix.
- Gate D requires behavioral proof, not only prompt text review.

## Post-review dev corrections

- Date: 2026-04-24
- Agent: `@dev`
- Corrections completed:
  - `artifact:validate` now counts slugged `REQ-SDLC-*` and `AC-SDLC-*` identifiers and routes missing spec/conformance artifacts to `@analyst`.
  - `gate:check` now blocks draft MEDIUM implementation plans at Gate C and recommends `@pm`, `@orchestrator`, or `@dev` based on classification and gate.
  - `preflight` now builds a full downstream context package for `@pm`, `@orchestrator`, `@dev`, `@deyvin`, and `@qa`, including upstream PRD, Sheldon enrichment, requirements, spec, architecture, conformance, implementation plan, active manifest, and current phase when available.
  - `devlog:process`, `squad-score`, Sheldon RF-01, context-boundary rules, and affected regression tests were corrected.
- Verification:
  - `npm test` passed: 1681/1681 tests.
  - `gate:check --feature=sdlc-process-upgrade --gate=B` returns PASS and recommends `@pm`.
  - `gate:check --feature=sdlc-process-upgrade --gate=C --json` recommends `@orchestrator`.
  - `artifact:validate --feature=sdlc-process-upgrade --json` reports `9 REQs, 41 ACs`.
  - `preflight --agent=dev --feature=sdlc-process-upgrade --json` includes the complete downstream context package.
- Next formal step: activate `@qa` to issue final Gate D PASS/FAIL. Do not route back to `@dev` for these fixed findings unless QA finds a new regression.

## QA sign-off

- Date: 2026-04-28
- Agent: @qa
- Re-verification scope: Post-review corrections by @dev (M-01 through M-04 and regression suite)
- AC coverage: 34/40 fully covered, 6 partial (residuals acceptable — see below)
- **Verdict: PASS**
- Residual risks (same as 2026-04-24, no new regressions found):
  - AC-SDLC-08 / AC-SDLC-14: `workflow:next` gate-blocked output guidance exists in `workflow-execute.js` dry-run; `workflow-next.js` direct gate-block messaging is acceptable residual for MEDIUM.
  - AC-SDLC-10 / AC-SDLC-13: Not programmatically enforced — agent discipline.
  - AC-SDLC-26: Phase file not auto-detected — agents open manually after reading manifest.
  - AC-SDLC-37/38: Pre-existing functionality, not regressed.
  - L-03: CRLF normalization in `gate-approve.js` — parser handles both, acceptable.

## Previous QA sign-off

- Date: 2026-04-24
- AC coverage: 34/40 fully covered, 6 partial (AC-SDLC-08, AC-SDLC-10, AC-SDLC-13, AC-SDLC-14, AC-SDLC-26, AC-SDLC-37/38 — acceptable residuals)
- **Verdict at that time: PASS**
- Residual risks:
  - AC-SDLC-26: Phase-specific file not auto-detected in context package — agents open phase files manually after reading manifest
  - AC-SDLC-13: features.md vs. project-pulse.md sync not programmatically enforced — agent discipline required
  - AC-SDLC-37/38: agent:done resume state and CLI help not independently verified — functionality pre-existed and was not regressed
  - Gate rollback: no `gate:revoke` command — manual frontmatter edit required if a gate needs reversal
