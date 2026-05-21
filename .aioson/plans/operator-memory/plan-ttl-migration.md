---
phase: 5
slug: ttl-migration
feature: operator-memory
release_target: v1.16.0
status: pending
depends_on: [phase-4-conflict-policy]
---

# Phase 5 — TTL decay + migration + closure

## Scope

Per-category TTL half-life decay (PMD-03), `last_reinforced` tracking, 10k hard cap (PMD-04), migration from `.aioson/context/user-profile.md` (PMD-10), `op:identity set` operational + `history/` soft-delete cleanup. Closes the operator-memory feature.

## New or modified entities

- **Category-aware decay engine** at `src/operator-memory/decay.js` (NEW):
  - Categories with half-life days:
    ```
    identity:  365  (autonomy_preference, communication_style — rarely change)
    autonomy:  180  (commit/push/deploy autonomy — change with team trust shifts)
    tooling:   90   (CLI authorization, tool preferences — change with tooling moves)
    default:   90   (uncategorized — same as PRD original flat 90d)
    ```
  - **`last_reinforced` tracking**: every detected signal that maps to an existing decision (by slug match) updates `last_reinforced: <ISO>` in the decision frontmatter (additive in Phase 2 schema; activated by Phase 5 decay loop).
  - **Decay prompt** fires when `now - last_reinforced > category_half_life`: stderr message `⏱ Memory '<slug>' is {N}d stale ({category}, half-life={half-life}d). Still valid? aioson op:reinforce <slug> | op:forget <slug>` — soft, non-blocking. Debounced per-slug (30d window — don't spam same slug).
- **`op:reinforce <slug>`** (NEW Phase 5 command): updates `last_reinforced` to now without requiring a signal capture. Used by user to silence decay prompt for decisions they still endorse.
- **`op:migrate`** (NEW Phase 5 command): reads `.aioson/context/user-profile.md`, extracts known fields (per the existing 8-dimension schema), creates corresponding decisions in `~/.aioson/operators/{identity}/decisions/`. Idempotent (re-running skips already-migrated fields). Per PMD-05, migration is explicit one-shot — not automatic.
- **`user-profile.md` deprecation marker**: after successful migration, write a YAML frontmatter field `deprecated_by: operator-memory` + `deprecated_at: <ISO>` to the file. Existing agents that still read `user-profile.md` see the marker + emit one-time deprecation warning per session.
- **10k hard cap enforcement** at `src/operator-memory/prune.js` (NEW):
  - When `op:capture` or `op:promote` would exceed 10k total decisions for an identity, prune `last_reinforced`-oldest non-`identity`-category decisions first. Identity-category decisions never pruned automatically.
  - Pruned items move to `history/{ISO}-pruned-{slug}.md` (same soft-delete bucket as `op:forget`).
- **`op:identity set <id>`** (Phase 5 — replaces Phase 1 stub message): allows switching active identity for the current shell session (writes to `$AIOSON_OPERATOR_ID` env semantics via process.env modification — only useful for CI / scripted contexts where env var setup is awkward).
- **`history/` cleanup** at decay: deleted/pruned/superseded items older than 365 days are hard-deleted from history/. Telemetry `op_history_cleanup` emitted.

## User flows covered

- **F5.1 — Decay prompt fires**:
  1. Decision `commit-autonomy-after-slice` last reinforced 200 days ago (category: autonomy, half-life: 180d)
  2. Threshold exceeded → next session at preflight: stderr `⏱ Memory 'commit-autonomy-after-slice' is 200d stale (autonomy, half-life=180d). Still valid? aioson op:reinforce commit-autonomy-after-slice | op:forget commit-autonomy-after-slice`
  3. User runs `op:reinforce commit-autonomy-after-slice` → `last_reinforced` = now → prompt silenced for next 180d
  4. OR user runs `op:forget commit-autonomy-after-slice` → soft-deleted to history/
  5. OR user ignores → prompt re-fires after 30d debounce window
- **F5.2 — Migration from user-profile.md**:
  1. `.aioson/context/user-profile.md` exists with `autonomy_preference: high`, `communication_style: terse`
  2. User runs `aioson op:migrate`
  3. CLI reads user-profile.md, creates decisions: `autonomy-preference-high.md` (category: identity), `communication-style-terse.md` (category: identity)
  4. CLI writes `deprecated_by: operator-memory` + `deprecated_at` to user-profile.md frontmatter
  5. Re-running `op:migrate` skips (idempotent — checks `deprecated_by` field)
- **F5.3 — Hard cap reached (rare)**:
  1. Identity has 9999 decisions (edge case for power users / long-running CI bots)
  2. `op:capture` triggers another promote → would be 10001
  3. Prune engine selects oldest `last_reinforced` non-identity decision → moves to `history/{ISO}-pruned-{slug}.md`
  4. Telemetry `op_history_cleanup` emitted with `reason: 'hard_cap', pruned_count: 1`
- **F5.4 — `op:identity set` for CI**:
  1. CI bot script: `aioson op:identity set ci-bot-shared && aioson agent:run ...`
  2. CLI exports `AIOSON_OPERATOR_ID=ci-bot-shared` into process env for the rest of the shell session

## Acceptance criteria

- **AC-P5-01** Categories map (identity=365d, autonomy=180d, tooling=90d, default=90d) is encoded in `decay.js`. Override possible via `AIOSON_OPERATOR_DECAY_<CATEGORY>_DAYS` env vars (escape hatch for testing).
- **AC-P5-02** `last_reinforced` field updated on every signal-match capture (Phase 2 capture pipeline extended here — additive, no breaking change).
- **AC-P5-03** Decay prompt fires at preflight when stale; debounced 30d per slug via `~/.aioson/operators/{identity}/_decay_state.json`.
- **AC-P5-04** `op:reinforce <slug>` updates `last_reinforced` without requiring signal capture. Exit 1 if slug not found.
- **AC-P5-05** `op:migrate` consumes `.aioson/context/user-profile.md`. Idempotent (check `deprecated_by` field before processing). Telemetry `op_migrate` emitted with `{fields_imported: N, skipped: M}`.
- **AC-P5-06** `user-profile.md` post-migration has `deprecated_by: operator-memory` + `deprecated_at: <ISO>` frontmatter fields. Agents that still read user-profile.md surface deprecation warning once per session.
- **AC-P5-07** 10k hard cap: enforced at promote time. Prune engine selects oldest `last_reinforced` non-identity decisions until count ≤ 9999. Pruned items archived in `history/` (not hard-deleted at this stage).
- **AC-P5-08** History cleanup: items older than 365d in `history/` are hard-deleted on each decay sweep. Telemetry emitted.
- **AC-P5-09** `op:identity set <id>` exports env var for current shell; documents that change is non-persistent (use `.bashrc` / equivalent for persistence). Exit 1 on invalid id (PMD-05 regex).
- **AC-P5-10** Cross-phase consolidation (BR-05 analog from workflow-handoff-integrity): wiring audit `wiring-audit-operator-memory.md` Phase 5 section confirms all 5 phases have call sites grepped + unit tests passing + smoke coverage. Required before Gate D.
- **AC-P5-11** CI release-smoke workflow (T6 pattern from workflow-handoff-integrity) covers operator-memory: extend `scripts/smoke-run-chain.js` with `[OM-ALL]` cross-phase section exercising F5.1 + F5.2 + F5.3 paths.
- **AC-P5-12** CHANGELOG v1.16.0 entry documents feature closure: all 5 phases shipped, DD-05 progressive-release strategy completed (mirrors workflow-handoff-integrity language).
- **AC-P5-13** `features.md` operator-memory marked `done` at Gate D approval.
- **AC-P5-14** `feature:archive` moves all operator-memory artifacts to `.aioson/context/done/operator-memory/`.

## Implementation sequence

1. **`src/operator-memory/decay.js`** (NEW): pure decay logic (category map + threshold checks).
2. **`src/operator-memory/prune.js`** (NEW): hard cap enforcement.
3. **`src/commands/op-reinforce.js`** (NEW).
4. **`src/commands/op-migrate.js`** (NEW).
5. **`src/commands/op-identity.js`** (Phase 1): replace `set` stub with full impl (PMD-05 validation reused).
6. **Capture pipeline extension** (Phase 2): `op:capture` updates `last_reinforced` when signal matches existing decision (additive — no breaking change).
7. **`tests/operator-memory-decay.test.js`** (NEW): 15+ tests AC-P5-01..09.
8. **`tests/operator-memory-migrate.test.js`** (NEW): 8+ tests for migration idempotency + deprecation marker behavior.
9. **Smoke runner** `[OM-ALL]` cross-phase section.
10. **Wiring audit** Phase 5 + cross-phase consolidation table (identical structure to workflow-handoff-integrity).
11. **CHANGELOG v1.16.0** entry.
12. **Gate D**: `aioson gate:approve . --feature=operator-memory --gate=D` after QA sign-off.
13. **`feature:archive`**: move artifacts to `.aioson/context/done/operator-memory/`.

## External dependencies

None new.

## Notes for @dev

- Decay engine runs at preflight (when flag on); keep it cheap — read state.json + compare timestamps. No expensive scan of all decisions every preflight (limit to slugs in MEMORY.md index).
- Migration (AC-P5-05): be conservative on field mapping. Only migrate the 8 known fields from `user-profile.md`. Unknown fields stay in user-profile.md untouched — no data loss.
- Hard cap (AC-P5-07): 10k is generous. Tests at 100-cap with env override (`AIOSON_OPERATOR_MAX_DECISIONS=100`) — keeps test runtime sane.

## Notes for @qa

- Decay prompt UX (F5.1): the soft-non-blocking pattern matters. Verify decay prompt does NOT halt the agent session — agent continues normally; prompt is informational stderr.
- Migration idempotency (AC-P5-05): run `op:migrate` 3 times in succession — fields_imported drops to 0 after first run; no duplicate decisions.
- Cross-phase smoke (AC-P5-11): the `[OM-ALL]` section is the equivalent of T6's "actual repo parity safety net" — final correctness check.

## Phase-specific reference sources

- `researchs/agent-memory-backends-2026/summary.md` — per-category half-life (MNEMOS/Engram precedent for PMD-03)
- AIOSON `.aioson/context/user-profile.md` — 8-dimension schema (migration source)
- AIOSON workflow-handoff-integrity wiring audit cross-phase table (template for AC-P5-10 cross-phase consolidation)
