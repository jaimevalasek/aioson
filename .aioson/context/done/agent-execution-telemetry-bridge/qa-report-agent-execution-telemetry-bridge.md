# QA Report — agent-execution-telemetry-bridge — 2026-07-10

**Verdict:** PASS

## AC coverage

| AC | Status | Evidence |
|---|---|---|
| AC-01..AC-12 | Covered | `aioson ac:test-audit`: 12/12; focused telemetry/dispatcher suite: 98/98 |

## Gate D evidence

- Harness contract: 14/14 executable criteria passed.
- Full suite: 3690 passed, 0 failed, 1 skipped (`npm test`, 277.25s first run; 172.65s under harness).
- Focused suite: 98 passed, 0 failed.
- Runtime-store migration is additive and idempotent through `CREATE TABLE/INDEX IF NOT EXISTS`.
- Correlation, monotonic state transitions, report binding, cursor ordering/bounds, retention, recovery fingerprint, no-shell dispatch, streaming redaction and bounded memory are covered by executable tests.
- `audit:code --changed`: 0 High, 0 Medium; 23 Low duplication advisories.
- Security artifact: 0 open Critical/High. One open Medium documents the missing formal `Attack Surface Map`; implementation boundaries are covered by correlation/feature ownership tests.

## Findings

### Medium

**[M-01] `security:audit` formatter crashes when findings mix `finding_id` and `id`**  
File: security audit aggregation/ordering path (CLI reports `localeCompare` on `undefined`).  
Risk: the audit persists its artifact but returns `command_error`, obscuring an otherwise usable review result.  
Fix: normalize the finding identity before sorting mixed scanner and pentester findings. This is an auditor compatibility defect, not a telemetry-bridge behavior blocker.

**[M-02] Attack Surface Map is not formalized in requirements**  
File: `.aioson/context/requirements-agent-execution-telemetry-bridge.md`  
Risk: automated SEC-SBD-03 review cannot infer the already-tested feature/attempt ownership boundary.  
Fix: add a formal Attack Surface Map in a documentation follow-up.

## Residual risks

- External Codex/Claude/OpenCode live behavior remains dependent on each installed CLI's event format and capabilities; adapters fail closed and persist bounded diagnostics.
- Full-suite duration varies substantially on Windows; the previous 120s harness default was demonstrably a false timeout. The new 300s default is justified by successful runs of 172.65s and 277.25s.
- `security:audit` aggregation bug should be corrected independently; direct artifact inspection was used as fallback evidence in this QA pass.

## Recommended next agents

- `@tester` — run systematic coverage/quality verification for the new runtime-store and streaming paths.
- `@validator` — execute the binary harness contract before the human `feature:close` gate.

## Summary

0 Critical, 0 High, 2 Medium, 23 Low audit advisories. AC coverage: 12/12. Gate D QA evidence: PASS.

## Re-verification — tester corrections cycle 1

- Boundary regressions: 3/3 passed.
- Focused telemetry/compatibility: 24/24 passed; adversarial proportional subset: 22/22 passed.
- AC audit: 12/12 covered.
- Stream isolation: partial stdout/stderr buffers are independent and close deterministically.
- Cursor: `limit + 1` lookahead makes an exact final page report `has_more: false`.
- Retention: pruning is restricted to `passed`, `failed`, `cancelled` and `paused`; active runs remain intact.
- Security re-check: 0 open Critical/High; existing Medium Attack Surface Map documentation finding remains review-only.
- Full `npm test` was not repeated because the correction diff is restricted to the three focused runtime/stream boundaries; the previous full PASS remains applicable.

**Cycle 1 verdict:** PASS — tester findings resolved; ready for `@validator`.
