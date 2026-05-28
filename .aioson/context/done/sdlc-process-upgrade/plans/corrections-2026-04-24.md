---
phase: post-implementation
created: 2026-04-24
status: resolved
resolved_at: 2026-04-24
---

# Corrections Plan — sdlc-process-upgrade — 2026-04-24

## Context
QA ran on 2026-04-24 and found 0 Critical, 1 High (fixed inline), 4 Medium, 3 Low.
H-01 was fixed directly in this QA session (`handoff-contract.js` + regression test).
Remaining Medium findings require a @dev follow-up session before Gate D can close.

## Fixed in this session

### H-01 (FIXED) — handoff-contract.js @pm not MEDIUM-aware
File: `src/handoff-contract.js:54-63`
Fix applied: `@pm` contract now checks `state.classification === 'MEDIUM'` before requiring `implementation-plan-{slug}.md`.
Test added: `tests/sdlc-process-upgrade-regression.test.js` — "handoff-contract: pm artifacts require implementation-plan only for MEDIUM"

## Mandatory corrections (Medium — activate @dev)

### M-01 — orchestrator.md missing requirements-{slug}.md in required input
File: `.aioson/agents/orchestrator.md` (Required input section)
Problem: AC-SDLC-21 requires @orchestrator to read `requirements-{slug}.md` and the body of `spec-{slug}.md`. The prompt currently only lists `discovery.md`, `architecture.md`, `prd.md`, and `implementation-plan`.
Expected fix: Add `requirements-{slug}.md` and `spec-{slug}.md` to the Required input section. Also update `template/.aioson/agents/orchestrator.md` if it exists.
Affected AC: AC-SDLC-21

### M-02 — workflow:execute / workflow:next blocked output missing next-agent guidance
File: `src/commands/workflow-execute.js` or `src/commands/workflow-next.js` (gate-blocked output)
Problem: AC-SDLC-08 (conformance) requires that when `workflow:next` blocks on a gate, the output names the next agent or gate command and explains why. This was not implemented.
Expected fix: When `workflow:next` outputs a gate-blocked message, include the responsible agent and the specific `gate:approve` command.
Affected AC: AC-SDLC-08, AC-SDLC-14

### M-03 — No phase-skip mechanism for partially-done Sheldon manifests
File: `src/preflight-engine.js` (`scanActiveManifest`) + `src/commands/preflight.js`
Problem: AC-SDLC-27 requires @dev to skip completed phases in a manifest. The current `scanActiveManifest` only reads the top-level manifest status — it does not identify which specific phases are done vs. pending.
Expected fix: `scanActiveManifest` should also return the first pending phase from the phase table. Preflight should expose `next_pending_phase` when the manifest is active.
Affected AC: AC-SDLC-27

### M-04 — devlog:process test fixture not created
File: `tests/devlog-process-fixture.test.js` (to be created)
Problem: AC-SDLC-36 requires `devlog:process` tests that use fixture/copy devlogs, not real project devlogs. No such test exists.
Expected fix: Create a test that copies a fixture devlog to a temp directory and runs `devlog:process` on that copy, asserting the result without touching `aioson-logs/`.
Affected AC: AC-SDLC-36

## Optional corrections (Low — acceptable before release)

### L-01 — agent:done / pulse:update resume state not verified
File: `src/commands/runtime.js` (agent:done) or `src/commands/pulse-update.js`
Problem: AC-SDLC-37 requires that agent:done and pulse:update persist enough state to resume (last_agent, last_gate, active feature, next action). Not verified in this session.
Note: These commands may already produce sufficient state. Verification pass needed.

### L-02 — CLI help for workflow:execute --feature not checked
File: `src/cli.js` (printHelp), i18n messages
Problem: AC-SDLC-38 requires that `--feature` appears in help for `workflow:execute`. Not verified.

### L-03 — CRLF normalization in updateFrontmatterField
File: `src/commands/gate-approve.js` (`updateFrontmatterField`)
Problem: Function splits on `\r?\n` but joins with `\n`, which normalizes CRLF to LF. Low risk since the parser handles both.
