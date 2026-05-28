---
phase: 4
slug: conflict-policy
feature: operator-memory
release_target: v1.15.0
status: pending
depends_on: [phase-3-universal-loading]
---

# Phase 4 — Conflict policy + warning surface

## Scope

Implement V1 binary conflict policy: project rules in `.aioson/rules/` always win when they conflict with operator-memory decisions. Conflicts surface a visible warning at agent preflight; operator decisions remain intact (not silently overwritten). Partial-overlap gradient (where operator memory adds qualifiers without contradicting the rule) is V2 (per PMD-09). Phase 4 also flips `AIOSON_OPERATOR_MEMORY=true` default-on after green test runs (inception-risk gate).

## New or modified entities

- **`src/operator-memory/conflict.js`** (NEW): `detectConflicts(decisions, rules)`, `formatConflictWarning(conflict)`. Pure functions.
- **Conflict warning format** (stderr-bound, one line per conflict, emitted at agent preflight after MEMORY.md load):
  ```
  ⚠ Operator memory 'commit-autonomy-after-slice' conflicts with project rule 'no-autonomous-commit.md'. Project rule applies.
  ```
- **Telemetry event** `op_conflict_warning` per PMD-12 — emitted per conflict at preflight (not per agent invocation; debounced via timestamp window similar to F2 `last_workflow_event_at`).
- **Conflict detection heuristic** (V1 keyword-based, evolves in V2 to LLM-tagged matching):
  - Each project rule frontmatter may have new optional field `conflicts_with_signal_types: [authorization|exclusion|correction]`
  - Each operator decision has `signal_type` from Phase 2 schema
  - Conflict candidate: rule's `conflicts_with_signal_types` intersects with decision's `signal_type` AND rule body shares ≥ 2 keywords with decision body (FTS5-assisted)
  - V1 false-positive tolerance: ≤ 20% (some over-warning is OK; missing a real conflict is NOT)
- **Feature flag flip**: `AIOSON_OPERATOR_MEMORY` default → `true` (after Phase 4 ships green, per inception risk mitigation in manifest). Documented in CHANGELOG.
- **Project rule new optional frontmatter field** (additive, no breaking change): `conflicts_with_signal_types`.

## User flows covered

- **F4.1 — Conflict detected at preflight**:
  1. Operator has `decisions/commit-autonomy-after-slice.md` (signal_type: authorization)
  2. Project has `.aioson/rules/no-autonomous-commit.md` with `conflicts_with_signal_types: [authorization]` + body mentioning "commit", "autonomous"
  3. Agent preflight: load MEMORY.md → detectConflicts → warning emitted to stderr
  4. Agent absorbs context: knows project rule wins; operator decision is informational only for this project
  5. Telemetry `op_conflict_warning` emitted (debounced 60s — same project session shouldn't spam stderr)
- **F4.2 — No conflict (rule applies to different signal)**:
  1. Operator: authorization decision
  2. Project rule: `conflicts_with_signal_types: [exclusion]` (different signal type)
  3. No conflict candidate → silent
- **F4.3 — User intentionally overrides** (deferred to V2 — placeholder `aioson op:override <slug> --in-project` command stubs as `Not yet implemented (v2 — gradient policy)`)

## Acceptance criteria

- **AC-P4-01** `detectConflicts(decisions, rules)` returns array of `{decision_slug, rule_path, reason, severity}` per match; empty when no conflicts.
- **AC-P4-02** Conflict warning format matches spec verbatim (single stderr line per conflict, `⚠` prefix, "Project rule applies." suffix).
- **AC-P4-03** Telemetry `op_conflict_warning` emitted exactly once per conflict per session (debounce window: 60s via `last_conflict_event_at` per slug, similar pattern to F2 idempotency).
- **AC-P4-04** Project rule frontmatter `conflicts_with_signal_types` is optional; rules without it → no conflict detection runs against them (zero noise from rules that don't opt in).
- **AC-P4-05** Operator decision is NOT modified on conflict — file untouched, no `superseded_by` set (that field is for cross-decision supersedence per PMD-11, not for conflicts).
- **AC-P4-06** Keyword match threshold: ≥ 2 shared keywords between rule body and decision body (case-insensitive, ignore stopwords). Configurable via env `AIOSON_OPERATOR_CONFLICT_KEYWORD_THRESHOLD` (default 2).
- **AC-P4-07** False-positive rate measured via fixture corpus (15 known non-conflict pairs + 10 known conflict pairs) — ≤ 20% FP, 0 FN per AC.
- **AC-P4-08** Feature flag `AIOSON_OPERATOR_MEMORY` flipped to default `true` AFTER Phase 4 test suite green (CI gate). CHANGELOG v1.15.0 entry calls out the flip explicitly.
- **AC-P4-09** When flag flipped on, sync-agents-preflight (T5) confirms no template drift caused by flip + universal directive integration.
- **AC-P4-10** Smoke runner `[OM4] conflict policy` exercises F4.1 + F4.2 in isolated fixture (project rule + operator decision in tmp dir).

## Implementation sequence

1. **`src/operator-memory/conflict.js`** (NEW): pure helpers as above.
2. **`src/operator-memory/loader.js`** (Phase 3) — extend `loadMemoryIndex` to call `detectConflicts` post-load when `AIOSON_OPERATOR_MEMORY=true` AND `.aioson/rules/` exists.
3. **`template/CLAUDE.md` + `template/AGENTS.md`** — directive (from Phase 3) updated to wire conflict-warning emission into preflight. T5 parity verifies.
4. **Telemetry**: extend `dossierTelemetry` with `op_conflict_warning` event + debounce timestamp persistence (small `~/.aioson/operators/{identity}/_conflict_state.json`).
5. **CLI doc / `--help`** for `op:list` (Phase 3) — show conflict status per decision when `--with-conflicts` flag passed.
6. **Feature flag flip**: change default of `AIOSON_OPERATOR_MEMORY` resolution in directive guard from `false` to `true`. Backward-compat: `AIOSON_OPERATOR_MEMORY=false` still respected for opt-out.
7. **`tests/operator-memory-conflict.test.js`** (NEW): 15+ tests AC-P4-01..10 + FP/FN corpus from AC-P4-07.
8. **Smoke runner** `[OM4]` extension.
9. **Wiring audit** Phase 4 entry + cross-phase note "feature flag flipped default-on".
10. **CHANGELOG v1.15.0** entry explicitly documenting flag flip.

## External dependencies

None new.

## Notes for @dev

- Conflict detection is the riskiest part: false positives spam stderr (annoying); false negatives let operator memory silently override project rules (dangerous). Per AC-P4-07, FP tolerance is 20% but FN is 0%. Tune keyword threshold + signal-type filter conservatively.
- Debounce (AC-P4-03): same-conflict-same-session shouldn't spam. Per-slug timestamp in `~/.aioson/operators/{identity}/_conflict_state.json` — JSON map `{slug: ISO_timestamp}`. Inspired by F2 `last_workflow_event_at` idempotency pattern.
- Flag flip (AC-P4-08): critical inception risk. CI run for Phase 4 must include explicit flag-on smoke before merge. If smoke fails, do NOT flip — ship Phase 4 with flag still off and address in patch.
- Project rule `conflicts_with_signal_types` is additive: existing rules without this field generate NO false positives because they don't opt in. This makes the feature backward-compat — only rules updated to opt in start participating in conflict detection.

## Notes for @qa

- Build FP/FN corpus (AC-P4-07) in `tests/fixtures/operator-memory/conflict-corpus/`:
  - 10 conflict pairs: rule + decision that SHOULD conflict (different phrasings of same underlying constraint)
  - 15 non-conflict pairs: rule + decision that share keywords but are about different concerns (e.g. "commit" in code-quality rule vs commit in autonomy decision)
- Test the flag flip explicitly: add CI step that runs smoke twice — once with flag=false (pre-flip behavior baseline), once with flag default (post-flip). Both must be green.

## Phase-specific reference sources

- `researchs/agent-memory-backends-2026/summary.md` — Zep validity-window pattern (informs `superseded_by` ≠ conflict; this phase keeps the orthogonality)
- AIOSON `src/commands/runtime.js` `maybeAutoAdvanceWorkflow` — debounce pattern (last_workflow_event_at 1s window)
- AIOSON `src/commands/workflow-next.js` `assertManifestNotPending` — warning surface format precedent
