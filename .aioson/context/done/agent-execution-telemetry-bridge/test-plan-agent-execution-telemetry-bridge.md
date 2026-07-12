---
feature: agent-execution-telemetry-bridge
generated: "2026-07-10T22:30:00-03:00"
strategy: risk-first-gap-filling
verdict: FAIL
next_agent: dev
status: resolved
---

# Test Plan — Agent Execution Telemetry Bridge

## Scope

Boundary verification after QA PASS: multi-chunk streaming, backpressure/drop summaries, cursor pagination, concurrent isolation, recovery/fingerprint, retention, runtime DB best-effort behavior and CLI status/events.

## Existing evidence retained

- Existing focused telemetry suite covers redaction across chunks, oversized pending lines, bounded output, state monotonicity, correlation, report binding, basic cursor reads, fingerprint recovery and CLI ownership.
- QA reported AC 12/12 and harness 14/14 before this tester pass.

## Bugs found

### [bug-found] Stream buffers cross stdout/stderr boundaries

`createTelemetryBridge` stores one shared `pending` string. A partial stderr chunk followed by a newline-terminated stdout chunk is merged and persisted as stdout. This corrupts ordering/attribution and can change redaction context.

Evidence: `tests/agent-execution-telemetry-boundaries.test.js` — `AC-04: partial stdout and stderr chunks remain isolated by stream`.

### [bug-found] Exact final cursor page falsely reports more data

`listExecutionEvents` uses `events.length === limit` as `has_more`; when the final page contains exactly `limit` records it returns true despite no subsequent event. Query `limit + 1` and trim, or probe the next sequence.

Evidence: `tests/agent-execution-telemetry-boundaries.test.js` — `AC-09: exact final page reports has_more false`.

### [bug-found] Retention deletes active executions

`pruneExecutionTelemetry` filters only by `updated_at`. A long-running execution whose telemetry timestamp is older than retention can be deleted, cascading all events. Retention must exclude active states (`queued`, `running`, `waiting_report`, `correcting`) and prune only terminal/paused runs.

Evidence: `tests/agent-execution-telemetry-boundaries.test.js` — `AC-10: retention never removes an active running execution`.

## Boundary matrix result

| Boundary | Result |
|---|---|
| Redaction across chunks / oversized pending | PASS — existing tests |
| Queue cap and truncation summary | PASS — existing tests |
| Stream isolation | FAIL |
| Cursor order and bounds | PASS — existing tests |
| Exact-page `has_more` | FAIL |
| Concurrent run correlation/sequence isolation | PASS — SQLite transaction + existing correlation tests; no contrary evidence |
| Fingerprint mismatch recovery | PASS — existing tests |
| Active-run retention | FAIL |
| Runtime DB unavailable best-effort | Not continued after blocking product bugs; retest after @dev correction |
| CLI status/events ownership | PASS — existing tests |

## Verification command

```powershell
node --test tests/agent-execution-telemetry-boundaries.test.js
```

Expected current result: 3 failing regression tests. Route to `@dev`; tester must not modify production code.

## 4-tier verification

- Tier 1 — Exists: PASS; bridge, store and CLI surfaces exist.
- Tier 2 — Substantive: PASS; implementations are non-stub.
- Tier 3 — Wired: PASS; dispatcher/CLI use the telemetry bridge and runtime store.
- Tier 4 — Functional: FAIL; three boundary invariants are violated.

## Test smell audit

The new tests use isolated temporary databases, explicit inputs and direct assertions. No external services, conditional test logic, unbounded time dependency or mock overdose.
