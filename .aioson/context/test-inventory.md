---
generated: "2026-05-27"
framework: "Node.js"
test_runner: "node:test"
agent: "tester"
scope: "agent-orchestration-v2 (Phase 1: M1+M2+M3)"
---

# Test Inventory — agent-orchestration-v2

## Summary
- Feature: `agent-orchestration-v2` (classification SMALL, Phase 1)
- Total source files in scope: 8
- Files with full coverage: 6
- Files with partial coverage: 1
- Files with no coverage: 1
- New tests added by @dev: 23 (7+9+7)

## Coverage map

| Source file | Test file(s) | Test count | Status |
|---|---|---|---|
| `src/commands/gate-approve.js` | gate-approve.test.js (9), checkpoint-at-gate.test.js (7) | 16 | ✓ covered |
| `src/commands/workflow-heal.js` | — | 0 | ✗ missing |
| `src/commands/op-capture.js` | operator-memory-capture.test.js (26), operator-memory-scoping.test.js (7) | 33 | ✓ covered |
| `src/commands/op-list.js` | operator-memory-loading.test.js (8+) | 8+ | ✓ covered |
| `src/session-handoff.js` | decision-rationale.test.js (9), handoff-contract-v2.test.js (19), session-handoff-pentester.test.js (9) | 37 | ✓ covered |
| `src/lib/dev-resume.js` | dev-resume.test.js (16) | 16 | ◑ partial — decision_rationale passthrough untested |
| `src/operator-memory/proposal.js` | operator-memory-capture.test.js, operator-memory-scoping.test.js | 33 | ✓ covered |
| `src/operator-memory/decision.js` | operator-memory-capture.test.js, operator-memory-scoping.test.js | 33 | ✓ covered |

## Risk priorities

### Critical gap
- **workflow-heal.js** — zero test coverage for `readLatestCheckpoint` (BR-AO-02 gate ordering), checkpoint context injection, fallback when no checkpoint (EC-AO-02)

### Medium gaps
- **BR-AO-03 size cap** — only happy path tested. No test proving truncation fires when `gate_check_result` makes checkpoint >5KB (QA finding M-01)
- **dev-resume.js** — `decision_rationale` passthrough from handoff to resume payload not verified
- **readLatestCheckpoint edge cases** — malformed JSON, empty dir, slug suffix collision (QA finding L-01)

### Low gaps
- **op:list --json --feature** — filter logic tested at unit level but not via `runOpList` command handler
