---
generated: "2026-07-10T22:20:00-03:00"
framework: "Node.js CLI"
test_runner: "node:test"
---

# Test Inventory — Agent Execution Telemetry Bridge

## Summary

- Total source files scanned: 5
- Files with full focused coverage: 3
- Files with partial boundary coverage: 2
- Files with no coverage: 0

## Coverage map

| Source file | Test files | Status |
|---|---|---|
| `src/agent-execution/telemetry-bridge.js` | `tests/agent-execution-telemetry-{bridge,stream,failure,capacity,correlation,recovery}.test.js` | ◑ boundary audit required |
| `src/runtime-store.js` (execution telemetry APIs) | `tests/agent-execution-telemetry-{store,state,recovery,bounds}.test.js` | ◑ boundary audit required |
| `src/commands/agent-execution.js` | `tests/agent-execution-telemetry-cli.test.js` | ✓ covered |
| `src/agent-execution/dispatcher.js` | `tests/agent-execution-telemetry-{smoke,no-shell,verification}.test.js` | ✓ covered |
| `src/agent-execution/reports.js` | `tests/agent-execution-telemetry-report.test.js` | ✓ covered |

## Risk priorities

1. Multi-chunk redaction and byte-safe stream assembly across chunk boundaries.
2. Backpressure, dropped-event counters and one-shot drop summaries.
3. Cursor pagination without gaps/duplicates while concurrent events arrive.
4. Concurrent runs and isolation of sequence numbers/correlation.
5. Recovery fingerprint mismatch, terminal monotonicity and active-run retention.
6. Runtime DB unavailable: dispatch remains best-effort without hiding execution result.
7. CLI `status`/`events`: cursor validation, pagination metadata and missing-run behavior.

Existing QA evidence reports 12/12 ACs and 14/14 harness checks passing. The tester lane therefore uses risk-first gap filling and adds tests only where the boundary matrix is not already asserted.
