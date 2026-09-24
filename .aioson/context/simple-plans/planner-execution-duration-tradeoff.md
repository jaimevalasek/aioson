---
slug: planner-execution-duration-tradeoff
status: done
owner: dev
created_at: 2026-09-17
updated_at: 2026-09-17
classification: MICRO
risk: low
source: direct-user-request
---

# Simple Plan - Planner execution duration trade-off

## Scope
Make the Planner's single-DEV versus orchestrated choice explain elapsed-time trade-offs and dashboard monitoring without inventing duration estimates.

## Context selected
- context:select: dev/planning over the Planner kernel, orchestrated-execution module, mirrors, and agent contract test.
- Existing pattern to follow: the measured `execution:offer` choice and the execution dashboard command already documented for DEV.
- Applicable rule/doc: `simple-plan-lane`, `source-code-language-convention`, and `output-brevity`.

## Implementation intelligence
- Framework leverage: reuse `plan.recommendation`, measured units/parallelism, and `aioson execution:dashboard . --feature={slug}`.
- Structure and data boundary: the Planner kernel owns the compact user choice; the routed orchestration module owns the detailed rationale.
- Reuse over custom code: no new CLI field or estimator; observed duration remains evidence, never a universal forecast.

## Done criteria
- The Planner says single DEV usually has less wall-clock and coordination overhead for coherent work.
- The Planner says orchestration optimizes isolation, role/model separation, and independent review, not guaranteed speed.
- The choice explains per-unit DEV→QA, recovery, and final integration overhead and avoids unsupported hour estimates.
- The orchestrated option names the execution dashboard command and what it shows.
- Workspace and template contracts remain synchronized and focused tests pass.

## Useful options considered
- Include now: compact choice wording, evidence boundary, dashboard command, mirror contract test.
- Defer: predictive duration modeling from historical run telemetry.
- Escalate: none.

## Out of scope
- Claiming that every single-DEV implementation takes two hours or every orchestrated run takes fourteen hours.
- Changing scheduling, retry policy, or dashboard UI.

## Expected files
- `.aioson/agents/planner.md` (behavior)
- `template/.aioson/agents/planner.md` (support mirror)
- `.aioson/docs/planner/orchestrated-execution.md` (behavior)
- `template/.aioson/docs/planner/orchestrated-execution.md` (support mirror)
- `tests/agent-contracts.test.js` (support)
- `.aioson/context/simple-plans/planner-execution-duration-tradeoff.md` (support)

## Verification
- `node --test tests/agent-contracts.test.js`

## Session state
Next step: completed; Planner now presents the duration trade-off and dashboard command.

## Notes
- Real evidence from `campanhas-email-marketing`: 14.93 elapsed hours while still running, 24 units, and 186 attempts. The proposed two-hour single-DEV duration is a reasonable operator estimate but not a controlled comparison.
- Implemented the compact kernel wording and the detailed routed explanation without introducing a duration estimator.
- Verification: `node --test tests/agent-contracts.test.js` — 18 passed, 0 failed; compact Planner budget remains green.
