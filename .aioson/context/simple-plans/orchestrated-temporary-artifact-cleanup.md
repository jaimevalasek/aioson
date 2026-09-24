---
slug: orchestrated-temporary-artifact-cleanup
status: done
owner: dev
created_at: 2026-09-17
updated_at: 2026-09-17
classification: MICRO
risk: low
source: direct-user-request
---

# Simple Plan - Orchestrated temporary artifact cleanup

## Scope
Give verification logs created by orchestrated workers a managed location and remove run-owned temporary artifacts after a successful run.

## Context selected
- context:select: dev/planning for execution notes, runner, focused tests, and this plan.
- Existing pattern to follow: run-scoped checkpoint/report paths plus best-effort terminal lifecycle cleanup.
- Applicable rule/doc: `simple-plan-lane`, `source-code-language-convention`, and `output-brevity`.

## Implementation intelligence
- Framework leverage: reuse the run ID, feature slug, unit ID, and terminal completion point already owned by `execution-run`.
- Structure and data boundary: artifact matching/cleanup belongs in a small agent-execution module; the prompt only advertises the managed path; the runner records the root baseline and owns cleanup.
- Reuse over custom code: use `node:fs/promises`, root-only directory enumeration, and the persisted run state rather than git status or broad recursive deletion.

## Done criteria
- Workers receive a run-scoped `.aioson/runtime/execution-temp/...` directory for complete verification output.
- Successful runs remove that managed directory and root `.tmp-*` entries created after the run began, while preserving pre-existing root entries.
- Paused/failed runs retain temporary evidence for recovery.
- Focused regression tests pass.

## Useful options considered
- Include now: persist the root `.tmp-*` baseline, best-effort cleanup, cleanup outcome in the run ledger, conservative root-only matching.
- Defer: a user-facing standalone hygiene command for unrelated historical files.
- Escalate: none.

## Out of scope
- Deleting arbitrary `*.log` files, build output, dependencies, or temporary files outside the project root.
- Cleaning evidence while a run is active or paused.

## Expected files
- `src/agent-execution/execution-temporary-artifacts.js` (behavior)
- `src/agent-execution/execution-notes.js` (behavior)
- `src/agent-execution/execution-run.js` (behavior)
- `tests/execution-run.test.js` (support)
- `.aioson/context/simple-plans/orchestrated-temporary-artifact-cleanup.md` (support)

## Verification
- `node --test tests/execution-run.test.js`

## Session state
Next step: completed; future successful runs clean their managed and root fallback temporary artifacts.

## Notes
- Consumer evidence: the active `campanhas-email-marketing` run left 780 root `.tmp-*` files (4,490,401 bytes) because the continuity prompt required temporary logs without assigning lifecycle ownership.
- Implemented a run-scoped managed directory, a persisted root baseline, conservative success-only cleanup, a cleanup ledger, and legacy-state protection.
- Verification: `node --test tests/execution-run.test.js` — 50 passed, 0 failed; `node scripts/check-js.js` — 639 files passed.
- The consumer run remained active during this correction, so its historical temporary evidence was intentionally not deleted mid-run.
