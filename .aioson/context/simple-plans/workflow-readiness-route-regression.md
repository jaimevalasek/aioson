---
slug: workflow-readiness-route-regression
status: done
owner: dev
created_at: 2026-06-03
updated_at: 2026-06-03
classification: MICRO
risk: medium
source: direct-user-request
---

# Simple Plan - Workflow Readiness Route Regression

## Scope
Fix the workflow/dev-start readiness regression where a completed MEDIUM feature with slugged artifacts can be incorrectly routed back to `@discovery-design-doc` because `readiness.md` is missing or stale.

## Done criteria
- A completed/approved feature with slugged PRD, requirements, spec, implementation plan, and Sheldon plan is not blocked only because project-level `readiness.md` is absent.
- Stale `dev-state.md` from another feature is ignored for the active slug.
- Regression tests cover the cold-start/new-chat scenario described by the user.

## Out of scope
- Archiving existing done features found by `feature:sweep`.
- Changing the full MEDIUM workflow sequence.
- Reworking the discovery-design-doc artifact model beyond the regression.

## Expected files
- `src/preflight-engine.js`
- `src/commands/workflow-next.js`
- `src/lib/dev-resume.js`
- `src/handoff-contract.js`
- `src/commands/workflow-status.js`
- `src/commands/artifact-validate.js`
- `src/commands/state-save.js`
- `.aioson/agents/discovery-design-doc.md`
- `template/.aioson/agents/discovery-design-doc.md`
- `tests/preflight-engine.test.js`
- `tests/workflow-next.test.js`
- `tests/dev-resume.test.js`
- `tests/artifact-validate.test.js`
- `tests/dev-state-producer.test.js`
- `tests/workflow-engine-hardening.test.js`
- `tests/workflow-status.test.js`

## Verification
- `node --check src/preflight-engine.js src/commands/workflow-next.js src/lib/dev-resume.js`
- `node --test tests/preflight-engine.test.js tests/preflight-command.test.js tests/artifact-validate.test.js tests/workflow-next.test.js tests/workflow-next-pending-guard.test.js tests/workflow-execute.test.js tests/dev-resume.test.js tests/dev-state-producer.test.js`
- `node --check src/handoff-contract.js src/commands/workflow-status.js src/commands/artifact-validate.js src/commands/state-save.js`
- `node --test tests/workflow-engine-hardening.test.js tests/workflow-status.test.js tests/agent-chain-continuity.regression.test.js tests/preflight-stale-devstate.test.js tests/agent-done-auto-emit.test.js tests/sdlc-process-upgrade-regression.test.js tests/state-save.test.js`

## Session state
Next step: done.

## Notes
- Project `design-doc.md` and `readiness.md` were loaded before implementation.
- `feature:sweep --dry-run` found done features pending archive; intentionally left untouched for this bugfix.
- Regression identified and fixed:
  - feature-mode selection preferred the first `in_progress` row instead of the latest/last-handoff feature.
  - dev activation used any `dev-state.md` context package even when `active_feature` belonged to another feature.
  - `dev:resume-data` used phase/next_step from stale `dev-state.md`.
  - preflight did not recognize slugged `design-doc-{slug}.md` / `readiness-{slug}.md`.
  - discovery-design-doc completion, handoff-contract, workflow-status, artifact validation, and state-save did not consistently honor feature-scoped readiness artifacts.
- Verification passed:
  - `node --check src/preflight-engine.js src/commands/workflow-next.js src/lib/dev-resume.js`
  - `node --test tests/preflight-engine.test.js tests/preflight-command.test.js tests/artifact-validate.test.js tests/workflow-next.test.js tests/workflow-next-pending-guard.test.js tests/workflow-execute.test.js tests/dev-resume.test.js tests/dev-state-producer.test.js` (196/196)
  - `node --check src/handoff-contract.js src/commands/workflow-status.js src/commands/artifact-validate.js src/commands/state-save.js`
  - `node --test tests/workflow-engine-hardening.test.js tests/agent-done-auto-emit.test.js tests/workflow-next.test.js tests/workflow-status.test.js tests/dev-resume.test.js tests/artifact-validate.test.js tests/dev-state-producer.test.js tests/preflight-engine.test.js` (188/188)
- Related suite note: `tests/agent-contracts.test.js` still has a pre-existing kernel-size failure for `template/.aioson/agents/product.md` (21,208 bytes > 20,000); no product prompt files were changed in this fix.
