---
slug: medium-feature-pm-stage-autopilot
status: done
owner: dev
created_at: 2026-06-09
classification: MICRO
risk: medium
source: direct-user-request
---

# Simple Plan — MEDIUM feature: @pm stage in sequence + autopilot coverage

## Scope

Close the structural hole found while auditing autopilot coverage: the MEDIUM **feature** sequence (`product → analyst → architect → discovery-design-doc → scope-check → dev → pentester → qa`) requires Gate C (`implementation-plan-{slug}.md`, owned by @pm per AC-SDLC-15/16) but never routes through @pm — so the autopilot chain stops at the @dev handoff and @dev preflight blocks on Gate C, forcing a manual detour to /pm. The sequence and the gate don't agree.

Fix: route MEDIUM features through @pm (mirroring the project-mode MEDIUM position: after @discovery-design-doc, before pre-dev @scope-check) and make @pm an autopilot participant so the MEDIUM pre-dev chain runs end-to-end.

## Changes

1. `src/commands/workflow-next.js`:
   - `DEFAULT_FEATURE_WORKFLOW_BY_CLASSIFICATION.MEDIUM`: insert `pm` after `discovery-design-doc` (before `scope-check`).
   - `AUTOPILOT_HANDOFF_STAGES`: add `pm`.
   - `validateStageArtifacts`: add `pm` branch — feature mode with slug requires `implementation-plan-{slug}.md`; otherwise true (project-mode pm has no single canonical artifact; handoff-contract already covers feature MEDIUM).
   - `isInferableStage`: add `pm` — without it, stale-state recovery can never infer `scope-check` (sits after pm) — same trap documented for discovery-design-doc.
2. `template/.aioson/agents/pm.md` + `.aioson/agents/pm.md` (identical):
   - Add "Autopilot handoff" section (same ≤10-line pattern as architect.md; stop when Gate C blocked, next agent is @dev, or context ≥ threshold).
   - Update "Workflow position reality": MEDIUM feature workflow now routes through @pm after @discovery-design-doc.
3. `template/.aioson/docs/autopilot-handoff.md` + `.aioson/docs/autopilot-handoff.md` (identical): add `@pm` to participating agents; add Gate C blocked to stop condition 3.
4. `template/.aioson/config.md` + `.aioson/config.md` (rsync-excluded — edit both): update the `auto_handoff` field description (chain covers @analyst through the @dev handoff, including @pm on MEDIUM features).
5. Tests:
   - `tests/workflow-next-pentester.test.js:34`: MEDIUM feature sequence deepEqual gains `pm`.
   - New assertions: MEDIUM feature sequence includes pm before scope-check; SMALL/MICRO do not include pm; pm stage artifact validation (feature mode requires implementation-plan).

## Out of scope

- Post-dev autopilot (dev → pentester/tester/qa cycles → final scope-check) — separate feature, route @product (already registered in workflow-classification-and-autopilot-fixes plan).
- Project-mode MEDIUM chain (ux-ui, pm, orchestrator auto-handoff) — feature-creation path only, same boundary as the original autopilot plan.
- Locale regeneration (`.aioson/locales/`) — canonical English only.

## Expected files

- src/commands/workflow-next.js
- template/.aioson/agents/pm.md, .aioson/agents/pm.md
- template/.aioson/docs/autopilot-handoff.md, .aioson/docs/autopilot-handoff.md
- template/.aioson/config.md, .aioson/config.md
- tests/workflow-next-pentester.test.js (+ new test block)

## Verification

- npm test, npm run lint
- `diff template/.aioson/agents/pm.md .aioson/agents/pm.md` → identical (same for the doc)
- Existing in-flight states are unaffected (sequence frozen in workflow.state.json; loop-guardrails is SMALL)

## Session state

Next step: none — implemented and verified (2026-06-09).

## Verification evidence (2026-06-09)

- `npm test`: 3005/3008 — only the 2 pre-existing AC-CTPK-06 CRLF failures. `npm run lint` clean.
- New tests: MEDIUM feature sequence deepEqual with `pm`; pm position (after discovery-design-doc, before scope-check/dev); SMALL/MICRO exclude pm; fresh-state inference completes pm from `implementation-plan-{slug}.md` and stops at pm when the plan is missing.
- `tests/agent-runtime-alignment.test.js` updated: it asserted the OLD contract sentence ("The default feature workflow does **not** route through `@pm`") — replaced with the new routing tokens + `## Autopilot handoff` section check.
- Template ↔ workspace parity verified for pm.md and autopilot-handoff.md (git diff --no-index clean).
- Backward compat: in-flight workflow states keep their frozen sequence (existing tests with explicit old sequences still pass untouched).
