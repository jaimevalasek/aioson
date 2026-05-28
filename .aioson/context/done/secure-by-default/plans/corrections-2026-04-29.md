---
phase: 04
created: 2026-04-29
status: resolved
---

# Corrections Plan — Phase 04 — 2026-04-29

## Context
QA ran on 2026-04-29 and found 0 Critical, 1 High.

## Mandatory corrections
### C-01 — Invalid `app_target` review contracts pass the QA gate
File: `src/handoff-contract.js:216`
Problem: `validateHandoffContract()` only checks blocking findings. It never validates the `review_contract` fields that `@qa` requires for `app_target` reviews, so a malformed artifact such as `{ review_contract: { target_mode: "app_target" }, findings: [] }` still returns `ok: true`.
Expected fix: Parse the findings envelope, validate `scope_mode`, `evidence_policy`, and `findings_artifact_path` for every findings artifact, and require explicit `target_scope` when `target_mode = app_target`. Treat missing contract fields as a QA blocker and add regression coverage around the malformed-envelope case.
Affected AC: AC-SBD-4.3

## Optional corrections
### O-01 — Blocker output drops finding identity for scan/audit records
File: `src/handoff-contract.js:230`
Problem: blocker reporting uses `f.id`, but `security:scan` / `security:audit` findings use `finding_id`. The QA gate blocks correctly, but the blocker message omits the offending record ID.
Expected fix: Normalize `id` vs `finding_id` before formatting blocker messages and add one regression test for each schema shape.
Affected AC: Operability of Gate D diagnostics

## Resolution
- `src/handoff-contract.js` now validates `review_contract.scope_mode`, `review_contract.evidence_policy`, and `review_contract.findings_artifact_path` for every findings artifact that reaches the `@qa` gate.
- `target_mode = app_target` now additionally requires explicit `target_scope` before the gate can pass.
- Blocker formatting now falls back from `id` to `finding_id`, preserving the actionable record identifier for `security:scan` / `security:audit` artifacts.
- Regression coverage added in:
  - `tests/handoff-contract-pentester.test.js`
  - `tests/workflow-engine-hardening.test.js`
  - `tests/harness/pentester-scenarios.test.js`
- Verification:
  - `node --test tests/handoff-contract-pentester.test.js tests/workflow-engine-hardening.test.js tests/harness/pentester-scenarios.test.js`
  - `node --test tests/agents-command.test.js tests/json-output.test.js tests/harness/pentester-scenarios.test.js tests/pentester-text-contracts.test.js`
  - `node --test tests/workflow-engine-hardening.test.js tests/handoff-contract-pentester.test.js`
  - manual reproduction of malformed `app_target` findings artifact now returns `ok: false`
