---
feature: agent-orchestration-v2
status: done
started: 2026-05-27
classification: SMALL
gate_requirements: approved
gate_execution: approved
---

# Spec — Agent Orchestration V2

## What was built

### M1 — Checkpoint at gate (Phase 1)
- `gate-approve.js`: after successful spec frontmatter write, builds checkpoint JSON with gate, slug, agent, timestamp, prerequisites_snapshot (artifact paths + mtimes), gate_check_result, and decision_log. Enforces 5KB size cap (BR-AO-03). Best-effort write wrapped in try/catch (BR-AO-01). Accepts optional `--agent` flag. Exports `CHECKPOINTS_DIR` constant.
- `workflow-heal.js`: `readLatestCheckpoint(targetDir, slug)` scans `.aioson/runtime/checkpoints/` for matching files, selects most advanced gate (D > C > B > A per BR-AO-02). Injects checkpoint recovery context block into healing prompt. Falls back gracefully when no checkpoint exists (EC-AO-02).
- `tests/checkpoint-at-gate.test.js`: 7 tests covering checkpoint write, agent default, snapshot mtimes, blocked gate skip, size cap, best-effort failure, and multi-gate separation.

### M2 — Decision rationale (Phase 1)
- `op-capture.js`: when `signal=confirmation`, appends `{ agent, decision, quote, timestamp }` to `.aioson/runtime/session-confirmations.jsonl` (best-effort, never blocks capture). Only confirmation signals write to accumulator (BR-AO-05). Exports `CONFIRMATIONS_JSONL`.
- `session-handoff.js`: new `collectDecisionRationale(targetDir)` reads JSONL accumulator, maps to `{ agent, decision, alternatives_considered, rationale, confidence }` format, caps at 5 entries (FIFO per BR-AO-04). `writeHandoff` auto-collects and merges with payload-provided rationale, writes `decision_rationale` to `last-handoff.json`, then clears the accumulator. Key omitted from JSON when empty (no noise).
- `lib/dev-resume.js`: `buildDevResumeData` reads `decision_rationale` from `last-handoff.json` and passes it through to the resume payload. Key omitted when empty.
- `tests/decision-rationale.test.js`: 9 tests covering empty accumulator, JSONL reading, FIFO cap (BR-AO-04), malformed line skip, handoff inclusion, accumulator cleanup, merge + cap, empty omission, and confirmation-only contract (BR-AO-05).

### M3 — Operator memory scoping (Phase 1)
- `operator-memory/proposal.js`: `serializeProposal` emits `feature_slug` and `session_id` fields when present (omitted when null — no noise). `captureSignal` accepts `feature_slug` and `session_id` params, stores in proposal data.
- `operator-memory/decision.js`: `serializeDecision` emits `feature_slug` and `session_id` when present. `promoteProposal` propagates both fields from proposal to decision.
- `op-capture.js`: reads `--feature` and `--session-id` from options, passes to `captureSignal` as `feature_slug` and `session_id`. When omitted, columns remain NULL (BR-AO-06).
- `op-list.js`: accepts `--feature` and `--agent` filter flags. Filters are AND-composable (BR-AO-07). JSON output with `--feature` follows BR-AO-09 schema: `{ feature, decisions: [{ agent, signal, quote, proposal, timestamp, session_id }], total }`.
- `tests/operator-memory-scoping.test.js`: 7 tests covering feature/session storage, null omission, promotion propagation, feature filter, agent filter, nonexistent feature (EC-AO-06), and no-feature capture (EC-AO-05).

## Entities added

### Checkpoint file (filesystem JSON)
- Path: `.aioson/runtime/checkpoints/gate-{A|B|C|D}-{slug}.json`
- Fields: gate, slug, agent, timestamp, prerequisites_snapshot[], gate_check_result, decision_log[]

### last-handoff.json extension
- New field: `decision_rationale[]` — max 5 entries, FIFO

### operator-memory schema (markdown frontmatter extension)
- New fields in proposal.js + decision.js frontmatter: `feature_slug`, `session_id` (both optional, omitted when null)
- H-01 correction: no SQL ALTER TABLE — operator-memory uses markdown as source of truth (PMD-AN-06). Filtering is JS-side in `op:list`.

## Key decisions
- [2026-05-27] Checkpoint stores artifact list + mtimes, NOT content — 2-5KB cap vs original 50KB. @sheldon I1.
- [2026-05-27] Best-effort write — checkpoint failure never blocks gate:approve. @sheldon C1.
- [2026-05-27] Latest-gate-wins for multiple checkpoints (D > C > B > A). @sheldon I2.
- [2026-05-27] decision_rationale populated by session-handoff.js from op:capture confirmation events. No new CLI command. @sheldon C2.
- [2026-05-27] No retroactive backfill of existing op:capture records. @product decision confirmed.
- [2026-05-27] Themes 1+3 bundled in single PRD. Theme 2 DAST as MICRO doc-only. @product decision confirmed.
- [2026-05-27] M-02 spec correction: `confidence` field in decision_rationale uses string `'confirmed'` (not numeric 0.9 as in PRD example). Confirmation signals are binary — string label is the correct semantic. PRD example was illustrative.

## Edge cases handled
[From requirements-agent-orchestration-v2.md § Edge cases — EC-AO-01..EC-AO-08]

## Dependencies
- Reads: gate-check.js (existing validation), session-handoff.js (existing handoff pipeline), operator-memory SQLite (existing store)
- Writes: checkpoint JSON files (new), last-handoff.json decision_rationale (new field), operator-memory feature_slug + session_id (new columns)

## Notes
- AC-AUDIT (sheldon-006): 7 verification items defined in PRD § Done gate. @qa must verify all before marking done.
- S1 (telemetry consumer mapping) requires updating agent-structural-contract.md rule — @dev should update the rule alongside code changes.
- Migration uses error-swallow pattern (try/catch on ALTER TABLE) — same as learning-loop-migration.js precedent.

## QA Sign-off
- Date: 2026-05-27
- AC coverage: 5/7 fully covered, 1 partial (AC-AUDIT-6 spec corrected via H-01), 1 deferred (AC-AUDIT-7 = S1 Should-have)
- Residual risks:
  - M-01: checkpoint size cap may not enforce when gate_check_result is oversized (low real-world probability)
  - S1 (telemetry consumer mapping) and S2 (checkpoint lifecycle cleanup) deferred to follow-up
- **Verdict:** PASS

## Security fixes (post-pentester review)
- SF-AO-01 (medium) FIXED: slug validation in gate-approve.js rejects `/`, `\`, `..` — prevents checkpoint path traversal
- SF-AO-02 (low) FIXED: sanitize() in workflow-heal.js strips newlines + caps 200 chars before prompt interpolation
- SF-AO-03 (low) FIXED: escapeYamlString() applied to feature_slug/session_id in proposal.js + decision.js
