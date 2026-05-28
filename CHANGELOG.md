# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [1.21.0] - 2026-06-XX

### Added
- **Gemini CLI deprecation warning (gemini-phaseout Phase 1).** Google announced (2026-05-20) that the Gemini CLI free/personal tier ends 2026-06-18.
  - `install-wizard` now flags Gemini as `[DEPRECATED]` in the tool list and prints a post-selection notice when Gemini is chosen.
  - `doctor` reports `harness:gemini_deprecation` (warning) when `.gemini/permissions.toml` or `.gemini/GEMINI.md` is detected — zero output on projects without `.gemini/`.
  - `permissions-generator` continues to emit `.gemini/permissions.toml` with a header warning (enterprise unaffected).
  - `tool-capabilities` Gemini entry annotated as deprecated.
  - Warning strings localized in all 4 locales (en, pt-BR, es, fr).
  - Enterprise users (Code Assist Standard/Enterprise) are unaffected.
  - Hard removal scheduled for v1.22 (post 2026-06-18). Pre-existing `.gemini/permissions.toml` will be preserved.
  - Recommended migration: `--tool=codex` or `--tool=opencode`.

## [1.18.0] - 2026-05-27

### Added
- **Agent Orchestration V2 — Phase 1: durable checkpoints, decision rationale, scoped operator memory.** Three must-have milestones shipped:
  - **M1 — Checkpoint at gate.** `gate:approve` now writes a checkpoint JSON to `.aioson/runtime/checkpoints/gate-{A|B|C|D}-{slug}.json` after successful approval. Contains `prerequisites_snapshot` (artifact paths + mtimes), `gate_check_result`, and `decision_log`. Best-effort write (BR-AO-01: try/catch, never blocks approval). 5KB size cap with `decision_log` truncation (BR-AO-03). `workflow:heal` reads the latest checkpoint for the active feature using latest-gate-wins ordering (D > C > B > A per BR-AO-02) and injects recovery context into the healing prompt. Falls back gracefully when no checkpoint exists (EC-AO-02).
  - **M2 — Decision rationale in handoffs.** `op:capture` appends confirmation signals to `.aioson/runtime/session-confirmations.jsonl`. `session-handoff.js` auto-collects these into `decision_rationale[]` in `last-handoff.json` (FIFO cap at 5 per BR-AO-04, only `signal=confirmation` per BR-AO-05). `dev:resume-data` passes rationale through to the context package. Accumulator cleared after each handoff.
  - **M3 — Scoped operator memory.** `op:capture` accepts `--feature=<slug>` and `--session-id=<id>` flags (BR-AO-06: optional, NULL when omitted). Fields stored in proposal/decision markdown frontmatter and propagated on promotion. `op:list` accepts `--feature` and `--agent` filters (AND-composable per BR-AO-07). JSON output with `--feature` follows BR-AO-09 schema.

### Notes
- **QA findings resolved:** H-01 (spec correction: markdown frontmatter, not SQL ALTER TABLE) and M-02 (confidence field type documented as string `'confirmed'`). Both are spec amendments, not code changes.
- **S1 (telemetry consumer mapping) and S2 (checkpoint lifecycle cleanup) deferred** as Should-have scope for a follow-up release.
- **Test coverage:** 36 feature-specific tests (23 by @dev + 13 by @tester). 115/115 related tests green. Full suite regression: 2822/2816 + 1 skipped + 5 fail (all pre-existing: AC-P1-07 operator-memory, AC-ALL-101 perf flake, product kernel size, pentester text contracts, tool-invocation-hardening).

## [1.17.2] - 2026-05-22

### Security
- **Neural Chain — fixes for the 3 @pentester findings against v1.17.1** (SF-NC-01 HIGH + SF-NC-02 MEDIUM + SF-NC-03 LOW). Single consolidated patch closing the `block` recommendation that prevented npm publish of v1.17.1.
  - **SF-NC-01 (HIGH) FIXED — Noise file injection via newline in chain_edges.target_path.** The @pentester probe demonstrated that a crafted row (`target_path = "legit.js\n- [ ] [AUTO-FIXABLE] /etc/passwd ..."`) bypassed the BR-NC-03 `guarded` mode guarantee because `serializeItem` interpolated the path raw and `parseItems` accepted the resulting injected line as a standalone item. New `src/neural-chain-sanitize.js#isUnsafePath` centralizes the rule: reject strings with any ASCII control char (`\x00-\x1f` + `\x7f`, includes `\n` `\r` `\t` `\0`), empty strings, and strings longer than 4096 chars. Wired at three boundaries — **Layer B ingest:** `deriveSessionPairs` (in `agent-ingest.js`) and `computeCoEditPairs` (in `git-ingest.js`) filter unsafe paths before INSERT; **Layer A render:** `flattenAudits` (in `noise-file.js`) drops items with unsafe `target_path` / `source_file` before they reach the noise file body (defense in depth for pre-v1.17.2 rows that may still be active in the database); **CLI boundary:** `runChainAudit` returns `{ ok: false, reason: 'unsafe_file_path' }` when the input file argument fails validation, before the SQL bind. The regression test reproduces the original probe with the same malicious INSERT and asserts the forged `[AUTO-FIXABLE]` line never appears in the rendered body — `guarded` mode safety contract restored.
  - **SF-NC-02 (MEDIUM) FIXED (app-layer only) — chain_edges schema validation gaps.** Same `isUnsafePath` helper covers the length cap (4096) and control-char rejection at ingest, providing the same protection as a schema CHECK without requiring a table rebuild. Schema-level CHECK constraints on `source_path` / `target_path` / `start_at` / `last_seen_at` are deferred to M2 graph maintenance, which already needs a `schema_meta` migration. Application code only writes ISO 8601 timestamps via `new Date().toISOString()` — a malicious direct INSERT could still bypass the timestamp format check at the SQL layer; this is documented as the open M2 follow-up and noted in `requirements-neural-chain.md`. The chain_edges INSERTs from `git_co_edit` and `agent_event` paths are now both protected.
  - **SF-NC-03 (LOW) FIXED — normalizeThreshold rejects negative zero + spec trust-boundary note.** `normalizeThreshold` now returns `null` when the parsed value is `-0` via `Object.is(n, -0)` check — required because `n < 0` evaluates `false` for `-0`. A crafted `.aioson/config.md` with `chain_auto_threshold: -0` now falls back to the default `0.8`. `requirements-neural-chain.md` EC-NC-07 amended with an explicit trust-boundary note: `.aioson/config.md` must remain under version control + code review; `.gitignore` on it is an anti-pattern for neural-chain. Runtime warning telemetry when `autonomy=autonomous + threshold=0` is documented as a future hardening but not shipped (low ROI given the doc note covers the operational concern).

### Notes
- **Cumulative regression**: 2780 tests, 2777 pass, 1 skipped, 2 fail (AC-P1-07 operator-memory pre-existing + AC-ALL-101 perf flake intermittent on Windows — both unrelated). +5 new tests in `tests/neural-chain-invariants.test.js` covering all three SF-NC fixes plus a Layer B unit check on `deriveSessionPairs`.
- **`security-findings-neural-chain.json`** updated — all three findings now carry `status: fixed`, `fix_release: v1.17.2`, and a `fix_summary` describing exactly what landed. `@qa` is the final decision owner per `pentester.md` ownership protocol and should re-verify before treating the findings as closed. A re-run of the @pentester probes against v1.17.2 is recommended to confirm mitigation in addition to the regression tests.
- **`npm publish` unblocked**: v1.17.1 was tagged but the @pentester block recommendation prevented publishing it. v1.17.2 supersedes pre-publish; user chooses this tag for npm publish.
- **Inception loop closed for this cycle**: @qa flagged 2 Medium → @dev hotfixed in v1.17.1 → @tester defensive invariants caught a third bug (M-003 schema drift) → @dev fixed → @pentester adversarial review found 3 more (SF-NC-01..03) → @dev fixed in this v1.17.2 release. Each agent role surfaced a class of problem the previous role could not have caught — exactly the loop neural-chain itself is designed to support for *user* code.

## [1.17.1] - 2026-05-22

### Fixed
- **Neural Chain — hotfix for 3 Medium findings from `@qa` Gate D + `@tester` gap-fill (M-01 / M-02 / M-003).** Consolidated patch — single release closing the residual risks documented in `spec-neural-chain.md` § QA sign-off + `test-plan.md` § bug-found.
  - **M-02 (bug-found-002) FIXED — BR-NC-01 dual-source dedupe.** When the same `(source_path, target_path)` pair existed under both `edge_type='git_co_edit'` AND `edge_type='agent_event'`, `queryImpacts` and `chain:audit` previously returned both rows separately, duplicating the same target in noise files (different motivos). Spec BR-NC-01 says "reportar `max(c_git, c_event)` — não soma; evita double-count entre fontes". Both SQL queries (in `src/neural-chain-agent-ingest.js#queryImpacts` and `src/commands/chain-audit.js`) now wrap the row scan in a SQLite window function `ROW_NUMBER() OVER (PARTITION BY target_path ORDER BY confidence DESC, hit_count DESC, last_seen_at DESC)` and keep only `rn = 1`. The chosen `edge_type` is the one from the row that won the max confidence (tiebreaker by hit_count then last_seen_at). 2 new tests in `tests/neural-chain-invariants.test.js` cover both call sites (hook + CLI) with a dual-source seed asserting the deduped row reports the max confidence (0.9, not 0.6+0.9) and the surviving edge_type.
  - **M-003 (bug-found-003) FIXED — chain_audit telemetry schema drift between emitters.** Previously the CLI emitter (`chain-audit.js`) and the hook emitter (`agent-ingest.js`) drifted on payload fields: CLI was missing `noise_file`/`auto_fixable_count`/`tokens_used`; hook EC-NC-05 no-op event was missing `duration_ms`/`error`; both used singular `source_file` instead of the spec'd plural `source_files`; `tokens_used` was never populated by anyone. New `src/neural-chain-telemetry.js` exposes a single `emitChainAuditEvent(db, { agent, message, ...payload })` helper that builds the full 8-field BR-NC-10 payload schema (`feature_slug, source_files[], impacts_found, auto_fixable_count, noise_file, tokens_used, duration_ms, error`) with sane defaults for the no-op path. Both call sites migrated. CLI passes `source_files: [filePath]` (singleton array) so the spec'd plural shape holds; hook passes the full session's `safeArtifacts`. `tokens_used` ships as `0` placeholder in V1 — re-instrument when LLM-mediated path activates (M2 concern). Legacy singular `source_file` alias preserved in both emit payloads to keep any v1.17.0 dashboard query working until v2. `tests/neural-chain-invariants.test.js` A.2 promoted from a 2-field subset check to the full 8-field BR-NC-10 schema validation, with type discipline (source_files is array, duration_ms is number, etc.) on both hook and CLI events.
  - **M-01 (bug-found-001) AMENDED — EC-NC-04 retry/backoff acceptably deferred in V1.** Spec EC-NC-04 + requirements EC-NC-04 + this CHANGELOG entry now explicitly acknowledge that V1 ships single-attempt try/catch instead of the spec'd 3-attempt exponential backoff. Justification: BR-NC-11 (non-blocking) is the load-bearing contract — audit failure never propagates to `runAgentDone`, agent:done completes normally regardless. The `runAgentDone` path is sequential with low contention (Living Memory reflect-prepare + Neural Chain hook run in series, no real lock pressure). The `withRetry({ attempts: 3, backoffMs: [100, 200, 500] })` helper is deferred to M1.5/M2 when squad-mode concurrent edits (EC-NC-08) actually create lock contention. Zero code change for this item — pure spec amendment.

### Notes
- **Cumulative regression**: 2775 tests, 2772 pass, 1 skipped, 2 fail (AC-P1-07 operator-memory pre-existing + AC-ALL-101 perf flake intermittent on Windows — both documented, unrelated to this hotfix). +2 tests vs v1.17.0 baseline.
- **AC-AUDIT-NC**: still 7/7 satisfied; this hotfix tightens the BR-NC-01 + BR-NC-10 contracts in code, not in scope.
- **No version bump for npm publish needed yet** — v1.17.0 has NOT been published. v1.17.1 supersedes it pre-publish. User chooses which tag to `npm publish` from when ready.
- **Bug discovery loop closed**: `@qa` flagged M-01 + M-02 in Gate D residual; `@tester` discovered M-003 via the A.2 schema completeness invariant test (test had to relax its assertion because the no-op event omitted `duration_ms` — that relaxation itself became the smoking gun); `@dev` consolidated all three in this single patch slice.

## [1.17.0] - 2026-05-21

### Added
- **Neural Chain — Phase 1 shipped end-to-end (Slices 1-6).** Impact-aware code editing for AIOSON: when an agent edits a file, the post-session hook audits chain edges (git co-edit + agent-event signals) and surfaces files that may need updating via a per-session noise file consumed by `@neo` as a blocker.
  - **Schema (Slice 1)**: `chain_edges` table in `aios.sqlite` — 10 fields, 3 indexes (2 lookup + 1 partial UNIQUE on active rows for archive-flow per BR-NC-08), CHECK constraints on `edge_type` ∈ {git_co_edit, agent_event} + `confidence` ∈ [0,1] + `hit_count > 0`. New `src/neural-chain-migration.js` idempotent runner wired downstream of `runLearningLoopMigration` in `runtime-store.js#ensureLegacyColumns`.
  - **`aioson chain:audit <file> [--feature=<slug>] [--json] [--limit=N]` (Slice 2)**: read-only CLI returning top-N active impacts ordered by confidence DESC (default 20, hard cap 200). Emits one `execution_events` row per invocation with `event_type='chain_audit'` (BR-NC-10 telemetry obligation). Failure non-blocking per BR-NC-11. i18n keys added in 4 locales.
  - **Git co-edit ingest helper (Slice 2)**: `src/neural-chain-git-ingest.js` — pure `parseGitLog` / `computeCoEditPairs` / `ingestGitCoEditEdges` plus `runGitIngest` integration wrapper. BR-NC-01 saturation at 10 co-edits, BR-NC-08 hard cap 10k per source via archive-oldest-by-`last_seen_at`, 90-day window filter, mega-commits (>50 files) + `.aioson/*` paths excluded, UPSERT respecting partial UNIQUE index. EC-NC-06 honored (skip when git history < 50 commits).
  - **Agent-event ingest hook (Slice 3)**: `src/neural-chain-agent-ingest.js` — `deriveSessionPairs` / `ingestAgentEventEdges` / `runChainHookOnAgentDone` / `queryImpacts`. Wired into both `live_event` and `standalone` branches of `runAgentDone` in `src/commands/runtime.js` (best-effort try/catch envelope, BR-NC-11). BR-NC-01 saturation at 5 hits via UPSERT ON CONFLICT incrementing `hit_count` + recomputing confidence atomically. EC-NC-05 explicitly honored — empty/single-file artifact lists still emit exactly one `chain_audit` event with `impacts_found=0` so the guardrail metric series stays continuous.
  - **Noise file write/lifecycle (Slice 4)**: `src/neural-chain-noise-file.js` — `writeNoiseFile`, `readNoiseFileAndRecompute`, `maybeDeleteNoiseFile` (sync fs, no new dependency). Path scheme `.aioson/context/noises/{feature-slug}-{YYYYMMDD-HHMM}.md` with `unspecified-{ts}.md` fallback (BR-NC-06). YAML frontmatter carries `{slug, edit_at, autonomy_mode, source_files, total_items, resolved_items}`; body lists `- [ ] {target} — {edge_type} {confidence} (source: {file})` items, file-level only (BR-NC-09; M1 forbids `:symbol` granularity). EC-NC-09 (corrupted frontmatter still returns parsed body items) + EC-NC-10 (idempotent unlink on race delete) honored.
  - **`@neo` noise blocker step (Slice 5)**: `@neo` activation protocol gains Step 1.5 — detects `.aioson/context/noises/*.md` with pending `- [ ]` items via regex or `readNoiseFileAndRecompute` helper; surfaces as ⛔ blocker with `confidence: low` and `clarification` populated, listing each pending item by target_path + motivo. Resolution path is marking `- [x]` (lazy unlink on next hook invocation per EC-NC-10); explicit skip via natural-language `"skip noises"` with `reason: skipped <N> noise file(s)` in routing block. New top-priority "Chain audit pending" stage in Step 3 takes precedence over all other stages. Mirrored byte-for-byte to `template/.aioson/agents/neo.md` (brain `sheldon-001` template parity verified via `diff -q`).
  - **Autonomy mode wiring + BR-NC-02/03 threshold rules (Slice 6)**: new `src/neural-chain-config.js` exposes `readChainConfig({ targetDir })` returning `{autonomyMode, chainAutoThreshold, source}` from `.aioson/config.md` YAML frontmatter. EC-NC-07 honored in 4 code paths (null targetDir, ENOENT, no frontmatter, invalid value) — defaults `guarded` / 0.8 with no force-edit. New `classifyImpact` applies BR-NC-02 rule (a) test-pair filename match cross-language and rule (c) `confidence > threshold AND edge_type='agent_event' AND hit_count > 5`. **Rule (b) literal identifier match deferred to M1.5/M2** — requires git diff parsing, heavy for V1 with bounded marginal gain. BR-NC-03 mode semantics fully wired: `guarded` → all noise (no marker), `standard` → matches tagged `[AUTO-FIXABLE]`, `autonomous` → matches `[AUTO-FIXABLE]` + non-matches `[AUTO-FIXABLE-BEST-EFFORT]`. Both `standard` and `autonomous` now write the noise file (Slice 4 deferred; Slice 6 enables). Telemetry payload (BR-NC-10) gains `auto_fixable_count` + `chain_auto_threshold`.
  - **`tests/neural-chain-{migration,git-ingest,agent-ingest,noise-file,autonomy}.test.js` + `tests/chain-audit.test.js`** — 81 acceptance tests cumulative across Slices 1-6 (11 + 21 + 12 + 13 + 23 + chain-audit suite). Coverage spans schema CHECK constraints, partial-UNIQUE archive flow, confidence formula + saturation, hard-cap enforcement, UPSERT idempotency, EC-NC-05/06/07/09/10, classifier mode×rule combinations, marker render + parse round-trip, hook integration auto-resolving config + per-mode classification + telemetry completeness.

### Notes
- **Phase 1 complete.** Neural Chain shipped Slices 1-6 in a single 2026-05-21 dev day (inception-mode pacing: framework feature being implemented using the framework's own agents). Single release v1.17.0 per progressive-release strategy — no per-slice version bumps.
- **AC-AUDIT-NC done gate 7/7 satisfied** (verification mapping in `spec-neural-chain.md`): item 1 `chain:audit` in `runAgentDone` ✓, item 2 `@neo` surfaces noises as blocker ✓, item 3 autonomy mode read via unit test covering 3 modes ✓, item 4 schema migration applied ✓, item 5 coverage ≥ 80% on critical paths ✓, item 6 CHANGELOG entry ✓ (this release), item 7 template parity (`diff -q .aioson/agents/neo.md template/.aioson/agents/neo.md` returns 0) ✓.
- **Primary success metric (from PRD)**: −50% second-call correction loops in 30d post-release. **Baseline instrumentation TBD** in next 20-30 sessions; post-shipping delta measured at 30-day mark.
- **Guardrail metric**: `tokens_used` in `runtime_events` filtered `type='chain_audit'` should stay stable over time. `aioson chain:stats` aggregation planned as follow-up M1.5 feature. Pulse alert when `delta_avg > 2x` month-over-month — signal that M2 graph maintenance (skill LLM-judged + heuristic + `chain:prune`) is due.
- **Out-of-scope V1, planned for V2/M2**: squad/parallel edit scenarios (EC-NC-08), `chain_node_cap` configurability (hardcoded 10k V1), BR-NC-02 rule (b) literal identifier match via git diff parsing, AST drill-down + multi-language AST via tree-sitter, Obsidian-style graph visualization, `chain:prune` skill + heuristic cleanup.
- **Brain nodes applied during implementation**: `sheldon-001` (template parity for agent files), `sheldon-005` (CLI-first integration — reused `execution_events` instead of a new table), `sheldon-006` (audit wiring before close — feature was design-complete only until AC-AUDIT-NC passed). All three reinforced as patterns by this feature's shipping cycle.

## [1.16.0] - 2026-05-21

### Added
- **Operator memory — Phase 5 TTL decay + migration + closure** (5 of 5 phases — **feature complete**).
  - **`src/operator-memory/decay.js`** (NEW): per-category half-life engine — identity=365d, autonomy=180d, tooling=90d, default=90d (PMD-03). Env override per category via `AIOSON_OPERATOR_DECAY_<CATEGORY>_DAYS`. `findStaleDecisions(identity)` returns past-half-life entries with 30d per-slug debounce via `~/.aioson/operators/{identity}/_decay_state.json`. `cleanupHistory(identity)` hard-deletes `history/*.md` entries older than 365d.
  - **`src/operator-memory/prune.js`** (NEW): 10k hard cap (PMD-04). `enforceCap(identity, {cap})` prunes oldest non-identity-category decisions first; identity-category decisions are NEVER auto-pruned. Env override via `AIOSON_OPERATOR_MAX_DECISIONS`.
  - **`aioson op:reinforce <slug>`** (NEW Phase 5 command): refreshes `last_reinforced` + increments `reinforcement_count`. Silences decay prompt for next half-life window.
  - **`aioson op:migrate`** (NEW Phase 5 command): explicit one-shot import from `.aioson/context/user-profile.md`. 8 known field mappings (autonomy_preference, communication_style, etc.). Idempotent (checks `deprecated_by: operator-memory` frontmatter). Unknown fields preserved. Marks `user-profile.md` deprecated post-migration per PMD-10.
  - **`aioson op:identity set <id>`** Phase 5 full impl replaces Phase 1 stub: mutates `process.env.AIOSON_OPERATOR_ID` for the current process + initializes the storage tree + returns the shell `export` command for persistence.
  - **`tests/operator-memory-decay.test.js`** — 23 new unit tests AC-P5-01..09 (closure ACs P5-10..14 verified by archive process).
  - **`scripts/smoke-run-chain.js`** `[OM5]` section (decay sweep, hard cap, history cleanup) + `[OM-ALL]` cross-phase loader verification (10 modules + 8 CLI commands all exporting expected functions). Total smoke now 25/25.
  - **`.aioson/context/wiring-audit-operator-memory.md`** Phase 5 entry + **cross-phase consolidation table** (PMD-07 / BR-05 Gate D blocker satisfied). 20 call sites, 114/114 cumulative unit tests, 14 smoke sections green.

### Notes
- **Feature complete.** Operator-memory shipped end-to-end: F1 (storage+identity) + F2 (capture+promotion) + F3 (universal loading directive) + F4 (conflict policy + flag flip) + F5 (decay+migration). 5 phases × 5 minor releases v1.12.0 → v1.16.0 per DD-05 progressive-release strategy (mirrors workflow-handoff-integrity exitoso).
- **20 call sites, 114 unit tests, 25 smoke checks** wired and exercised across the 5 phases. Cross-phase consolidation table in wiring-audit doc verifies every phase has call sites grepped + tests passing + smoke coverage (PMD-07 / BR-05 anti-pattern guard).
- Gate D approved post-QA sign-off. `features.md` operator-memory → `done`. Feature artifacts archived to `.aioson/context/done/operator-memory/`.
- **First operational test in production:** this very release ships AIOSON_OPERATOR_MEMORY default-ON. Existing users on `~/.aioson/` (e.g. me, who has been operating this dev session) will start participating in capture as new sessions begin. The feature is now self-evidence-generating.

## [1.15.0] - 2026-05-21

### Added
- **Operator memory — Phase 4 conflict policy + flag flip** (4 of 5 phases). Binary V1 conflict detection between operator decisions and project rules in `.aioson/rules/`. **Inception flag `AIOSON_OPERATOR_MEMORY` is now default ON** (opt-out via env var).
  - **`src/operator-memory/conflict.js`** (NEW): `detectConflicts`, `debounceConflicts`, `formatConflictWarning`, `scanProjectRules`, `parseRuleFrontmatter`. Keyword-overlap heuristic (≥ 2 stopword-filtered shared keywords) intersected with signal-type filter. Configurable threshold via `AIOSON_OPERATOR_CONFLICT_KEYWORD_THRESHOLD`.
  - **`src/operator-memory/loader.js`** — `preflightLoad` extended with conflict detection when `options.projectRoot` is supplied. Conflicts are debounced per (decision_slug, rule_basename) pair via `_conflict_state.json` (60s default window, mirrors F2 idempotency pattern).
  - **Project rule schema additive**: `.aioson/rules/*.md` may now declare `conflicts_with_signal_types: [authorization, exclusion, correction, confirmation]` in frontmatter. Rules without this field generate zero false positives (backward-compat preserved — AC-P4-04).
  - **`tests/operator-memory-conflict.test.js`** — 18 new unit tests AC-P4-01..10 including **statistical corpus** (10 conflict pairs + 15 non-conflict pairs) with verified FN=0%, FP=0%.
  - **`scripts/smoke-run-chain.js`** `[OM4]` section — 4 smoke checks (binary V1 conflict, additive no-FP, debounce window, flag-flip directive verification).
  - **`template/CLAUDE.md` + `template/AGENTS.md`** universal directive updated: signals "Default **ON** in v1.15.0+. Opt out via `AIOSON_OPERATOR_MEMORY=false`". Byte parity between the two files preserved (T5 + AC-P3-11). New size: 1307 B per file × 2 = 2614 B total (improvement from 2664 B).

### Changed
- **`AIOSON_OPERATOR_MEMORY` default flipped from `false` → `true`** per AC-P4-08. Agents now read `MEMORY.md` at preflight (when present) by default. Existing AIOSON behavior is preserved when no MEMORY.md exists per identity — directive degrades gracefully (AC-P3-08 backward-compat unchanged).
- Updated wording in directive sections to be flip-aware (still byte-identical between CLAUDE.md and AGENTS.md per parity invariant).

### Notes
- **Operator memory is now active by default.** New users running v1.15.0+ will have their first signal captures land in `~/.aioson/operators/{hash}/proposals/` automatically when agents emit `aioson op:capture`. Promotion at the 2x threshold (PMD-07) continues to be silent on first detection and emits the 1-line audit on promotion.
- Smoke runner result: 21/21 green (was 17/17 before OM4). The flag-flip safety gate (smoke must be green BOTH flag-off and flag-default) is satisfied — Phase 3's backward-compat tests still pass under default-on mode because the helpers degrade gracefully when no storage exists.
- Phase 5 (v1.16.0) ships next: per-category TTL decay, 10k hard cap enforcement, `op:reinforce`, `op:migrate` (one-shot import from `user-profile.md`), `op:identity set` full impl, history/ cleanup at 365d, cross-phase wiring audit consolidation, Gate D, and feature:archive. That's the closure release.

## [1.14.0] - 2026-05-21

### Added
- **Operator memory — Phase 3 universal loading directive** (3 of 5 phases for the `operator-memory` feature). The cross-cutting integration phase that wires operator-memory into agent prompts framework-wide. **Inception-risk phase** — directive ships behind `AIOSON_OPERATOR_MEMORY=true` flag **default OFF** until Phase 4 (v1.15.0) ships green.
  - **Universal directive** injected into `template/CLAUDE.md` AND `template/AGENTS.md`: `## Memory loading` + `## Memory capture` sections at consistent position (after `## Mandatory first action`, before `## Agents`). Byte-identical between both files (T5 parity guarantee). Flag-gated: `if process.env.AIOSON_OPERATOR_MEMORY === 'true'` — when unset/false the directive is a no-op (backward-compat per AC-P3-08).
  - **`aioson op:list` full impl** — replaces Phase 1 stub. Lists active decisions with category + signal_type + reinforced date. Supports `--proposals` (queue view), `--include-archived` (Phase 5 archive tier), `--format=json` (machine-readable).
  - **`aioson op:show <slug>` full impl** — replaces Phase 1 stub. Prints decision frontmatter + body, or proposal data when slug is in `proposals/`. `--json` supported.
  - **`src/operator-memory/index-md.js`** (NEW): MEMORY.md tier-based reader/writer. `loadMemoryIndex(identity, tier)` parses frontmatter + link entries. `regenerateIndex(identity)` rebuilds from `decisions/*.md` filesystem (markdown source-of-truth per PMD-AN-06). Hooked into `promoteProposal` + `forgetEntry` post-commit so MEMORY.md auto-refreshes after every state change.
  - **`src/operator-memory/loader.js`** (NEW): `preflightLoad(identity, taskDescription)` returns `{index, matches}` for agent-side consumption. `matchDecisions(index, taskDescription)` V1 substring + stopword heuristic (V2 will switch to FTS5-backed query).
  - **`.aioson/docs/operator-memory/memory-md-format.md`** (NEW): canonical cross-harness format spec. Documents MEMORY.md frontmatter + body schema, decision file schema, loading pseudocode, V1 support matrix (Claude Code native + Codex compatible + Gemini compatible; Cursor + Aider TBD V2), and a ~10-line POSIX reference implementation.
  - **`scripts/memory-budget-audit.js`** (NEW): enforces NFR-02 byte budgets. Per-file warn at 1500B / fail at 2000B; cross-cutting warn at 5000B / fail at 6000B. Phase 3 directive total: 2664 B (well within budget). `--json` supported. Exit 1 on fail.
  - **`tests/operator-memory-loading.test.js`** — 23 new unit tests covering AC-P3-01..12 including byte-parity between CLAUDE.md/AGENTS.md directives + budget audit self-test + cross-harness format spec sanity.
  - **`scripts/smoke-run-chain.js`** extended with `[OM3]` section — 3 smoke checks (index regenerates after promote, lazy match returns task-relevant decisions, flag-OFF graceful degrade).

### Notes
- **Inception risk explicitly mitigated**: `AIOSON_OPERATOR_MEMORY` flag is **OFF by default in this release**. Existing AIOSON sessions are unaffected — directive in template files is a no-op until the env var is set. Phase 4 (v1.15.0) will flip the default to `true` AFTER its CI gate confirms both flag-states are green.
- The directive is byte-identical between `template/CLAUDE.md` and `template/AGENTS.md` (verified by AC-P3-11 test). This is the parity contract — different file shells, identical directive content.
- Smoke runner result: 17/17 green (was 14/14 before OM3).
- MEMORY.md tier-based format (PMD-AN-02): Phase 3 ships single `MEMORY.md` (active tier). Phase 5 decay sweep will partition into `MEMORY.md` + `MEMORY-archive.md` based on category half-life crossing. Format is forward-compatible.
- Cross-harness V1 support matrix documented: Claude Code + Codex + Gemini CLI all read `CLAUDE.md` or `AGENTS.md`, both of which now contain the universal directive — they participate natively when the env flag is set. Cursor + Aider deferred to V2 (need bridge files).

## [1.13.0] - 2026-05-21

### Added
- **Operator memory — Phase 2 capture + promotion engine** (2 of 5 phases for the `operator-memory` feature). Builds on Phase 1's storage substrate to deliver the actual signal-capture pipeline:
  - **`aioson op:capture` full impl** — replaces Phase 1 stub. Captures a standing-decision signal of type `authorization | exclusion | correction | confirmation`, derives deterministic slug from `--proposal`, writes to `proposals/{slug}.md` on first detection (silent), promotes to `decisions/{slug}.md` atomically on second detection (per PMD-07 2x threshold) with the 1-line audit `✔ Memory: '<text>'. aioson op:forget <slug> p/ desfazer.` (PMD-08 silent-by-default with audit-on-promotion).
  - **`aioson op:promote <slug>` full impl** — manual promotion path that skips the 2x threshold for a pending proposal.
  - **`aioson op:forget <slug>` full impl** — soft-deletes a decision or proposal to `history/{ISO}-{slug}.md`. Idempotent (second call returns noop). Removes FTS5 row inside SQLite transaction.
  - **`src/operator-memory/slug.js`** new module: `deriveSlug`, `normalize`, `fingerprintProposal`. Deterministic kebab-case + stopword filter + truncation at word boundary + collision-suffix detection.
  - **`src/operator-memory/proposal.js`** new module: `captureSignal` (write/increment), `readProposal`, `deleteProposal`. Quotes capped at 5 most recent per AC-P2-01.
  - **`src/operator-memory/decision.js`** new module: `promoteProposal` (atomic via SQLite transaction + atomic rename per AC-P2-03), `forgetEntry`, `readDecision`, `inferCategory` (V1 keyword heuristic for autonomy/identity/tooling/default per PMD-03).
  - **`template/agents/_shared/memory-capture-directive.md`** — NEW versioned prompt template (`schema_version: "1.0"`). 4 signal types × ≥3 concrete examples + anti-pattern section + capture-call format. PMD-02 acknowledged divergence from AIOSON's deterministic principle. File is dormant in Phase 2 — Phase 3 wires it into `template/CLAUDE.md`/`AGENTS.md`.
  - **`tests/operator-memory-capture.test.js`** — 26 new unit tests covering AC-P2-01..12 (capture, promote, forget, signal validation, atomicity, FTS5 mirror correctness, category inference, body cap).
  - **`scripts/smoke-run-chain.js`** extended with `[OM2]` section — 3 smoke checks exercising capture+promote pipeline, idempotent forget, signal validation in isolated tmp HOME.
  - **`.aioson/context/wiring-audit-operator-memory.md`** Phase 2 entry populated with call sites, tests, atomicity verification.

### Notes
- Atomicity per AC-P2-03: SQLite `db.transaction()` wraps fs operations (`writeFileSync` to `.tmp` + `renameSync` + `unlinkSync` of proposal). Crash mid-transaction → SQLite rolls back; tmp file cleaned up via `finally`. POSIX `rename(2)` and Windows `MoveFileEx` provide the atomic-rename guarantee.
- Telemetry events shipped this release: `op_capture`, `op_promote`, `op_forget` via existing `dossierTelemetry.emitDossierEvent` (PMD-12 + DD-04 confirmed: extend, don't fragment).
- LLM-driven capture is acknowledged divergence from AIOSON's deterministic principle (PMD-02). The prompt template at `template/agents/_shared/memory-capture-directive.md` is the canonical signal-detection spec; versioned `schema_version` field supports V1→V2 migration.
- Smoke runner result: 14/14 green (was 11/11 before OM2 section).
- Phase 3 (Universal loading directive, v1.14.0) ships next. **Inception risk:** Phase 3 modifies template files this framework itself uses — flag-gated `AIOSON_OPERATOR_MEMORY=true` default OFF until Phase 4 ships green.

## [1.12.0] - 2026-05-21

### Added
- **Operator memory — Phase 1 storage + identity foundation** (1 of 5 phases for the `operator-memory` feature). Establishes the per-operator memory substrate that all subsequent phases build on:
  - **`aioson op:identity`** CLI command — resolves operator identity via sha256[0..16] hash of `git config user.email`, with `AIOSON_OPERATOR_ID` env override (validated regex `^[a-z0-9][a-z0-9-]{2,31}$`, reserved prefixes `_*` and `aioson-*` blocked per PMD-05). Subcommands: `show` (full), `set <id>` (Phase 1 stub — full impl ships Phase 5).
  - **`~/.aioson/operators/` storage tree** auto-created per identity: `decisions/`, `proposals/`, `history/` subdirs (Phase 2+ populates). Hybrid storage backend: shared `_index.sqlite` (FTS5 virtual table + `operators` table) for cross-decision search per PMD-01.
  - **5 CLI command stubs** (`op:capture`, `op:promote`, `op:forget`, `op:list`, `op:show`) — register the command surface, emit `op_command_stub` telemetry on invocation, return exit 1 with structured "Not yet implemented (ships in Phase N / vX.Y.Z)" message. Full impls ship across Phases 2-3.
  - **`src/operator-memory/{identity,storage}.js`** new pure-helper modules exporting `resolveIdentity`, `validateOverride`, `hashEmail`, `ensureStorageTree`, `openIndexDb`, `migrateIndexSchema`, `recordIdentityActivity`. Reusable by downstream phase commands.
  - **`tests/operator-memory-identity.test.js`** — 24 unit tests covering AC-P1-01..10 + EC-08 salt rehash + DD-02 hash size invariant.
  - **`.aioson/context/wiring-audit-operator-memory.md`** — new Gate D blocker doc, Phase 1 entry populated (will accumulate per-phase entries across v1.12.0 → v1.16.0).

### Notes
- This release opens Phase 1 of `operator-memory` MEDIUM feature (5-phase progressive rollout DD-05 mirroring `workflow-handoff-integrity` v1.9.5 → v1.10.0). Subsequent phases ship as v1.13.0 → v1.16.0.
- Per PMD-02, signal-detection capture (Phase 2+) acknowledges divergence from AIOSON's deterministic principle: prompt-template-driven inherently fuzzy. Phase 1 ships the substrate only — no LLM behavior is invoked.
- Per inception risk mitigation: universal loading directive (Phase 3) ships behind `AIOSON_OPERATOR_MEMORY=true` flag default OFF; flip default-on after Phase 4 ships green.
- DD-02 ratified: 16-char hash provides 2^64 collision space; email entropy (~25-30 bits) is the reverse-lookup bottleneck, not hash output length.

## [1.11.0] - 2026-05-20

### Added
- **@pentester agent**: adversarial security review agent with structured findings output (`security-findings-{slug}.json`) and Gate D blocking capability for MEDIUM projects.
- **@discover agent**: system discovery and semantic knowledge cache bootstrap for brownfield projects.
- **git:guard**: pre-commit guardrail that blocks forbidden files (`node_modules/`, secrets, build artifacts) from being staged or committed. Supports `--install-hook` for persistent protection.
- **commit:prepare**: automated commit preparation command that collects staged diffs, runs `git:guard`, and generates `commit-prep.json` ready for `@committer`.
- **compress:agents**: token-reduction command with structural (free) and semantic (`--llm`) modes. Backs up originals to `.original.md` and supports `--restore`.
- **tmux launcher**: `live:start` now supports tmux for persistent terminal sessions with compact ANSI status bars.
- **Runner system**: `runner:run`, `runner:queue`, `runner:plan`, and `runner:daemon` commands for persistent background job execution.
- **Design-docs governance**: modular code governance system with 5 best-practice files (`folder-structure`, `componentization`, `code-reuse`, `naming`, `file-size`) distributed automatically on install and loaded unconditionally by `@dev` and `@deyvin`.
- **SDLC process upgrade**: gates and handoff protocol enhancements across the workflow engine.
- **Feature closure automation**: `feature:close` now auto-triggers `feature:archive` on `--verdict=PASS`, moving all feature artefacts (`prd-`, `spec-`, `requirements-`, etc.) to `.aioson/context/done/{slug}/` and updating `done/MANIFEST.md`. No manual steps required.
- **Feature archive command**: `feature:archive` with `--dry-run`, `--restore`, and `--force` for retrospective archival and archive restoration. Replaces the legacy `context:trim` workflow.
- **Agent awareness of archived features**: `@cypher`, `@discover`, `@neo`, and `@sheldon` now read `.aioson/context/done/MANIFEST.md` to avoid loading full archived files.

### Changed
- **i18n architecture**: decoupled interaction language from agent prompts. Agent instruction files are now canonical English only; `conversation_language` in `project.context.md` controls user-facing language. Removed localized agent packs in favor of single canonical source.
- **Agent manifests**: moved `.manifest.json` files to `.aioson/agents/manifests/` subfolder to reduce clutter.
- **Core agents refactored**: `@product`, `@sheldon`, `@dev`, `@deyvin`, `@ux-ui`, and `@squad` split into deterministic on-demand modules for better context efficiency.
- **@committer**: enhanced with terminal checkbox UI, robust prepare fallback, and optimized workflow.
- **@squad**: enhanced with domain classification gate, investigation handoff, language policy, and package contract restoration.
- **Installer pipeline**: hardened with pentester agent integration and improved integrity checks.

### Fixed
- `@dev` pt-BR locale realignment with canonical prompt flow.
- `@squad` genome bindings and package contract restoration.
- Legacy process safeguards restored across agents.
- Safe canonical English agent sources restored after i18n decoupling.
- Accidentally tracked local directories removed from git tracking.

## [1.10.0] - 2026-05-20

### Added
- **CI pre-publish smoke chain** (Phase 5 / T6 of `workflow-handoff-integrity` — **closes the feature**). New `scripts/smoke-run-chain.js` standalone runner exercises real exported APIs from Phases 1-4 (F1 stale dev-state + state:reset, F2 agent:done auto-advance, F3 workflow:next pending guard, T5 semantic sync parity) plus a final actual-repo parity safety net. 11 deterministic checks; uses isolated `os.tmpdir()` fixtures (DD-04 mock-only, no LLM calls).
- **`.github/workflows/release-smoke.yml`** GitHub Actions workflow triggered by the `release` PR label or manual `workflow_dispatch`. Runs the full test suite + smoke chain (`AIOSON_PREPUBLISH=true`) + `npm pack --dry-run` as a merge gate before release-labeled PRs can ship to npm.
- **`tests/scripts/smoke-run-chain.test.js`** — 3 unit tests covering AC-T6-01 (green exit), AC-T6-05 (prepublish mode green on clean repo), AC-T6-08 (output discipline — all 5 sections present).
- **`tests/fixtures/medium-feature-mock/`** — 6 mock JSON files (one per MEDIUM agent: product, analyst, architect, pm, dev, qa) with `writes` and `spec_frontmatter` templates, plus README documenting PMD-05 / Sheldon R2 fixture-freshness rule.

### Notes
- **Feature closure.** `workflow-handoff-integrity` is now fully implemented across F1 (state hygiene) + F2 (forward auto-emit) + F3 (pending-decisions gate) + T5 (structural drift detection) + T6 (CI smoke). Wiring audit cross-phase consolidation completed — see `.aioson/context/wiring-audit-workflow-handoff-integrity.md`.
- **DD-05 progressive-release strategy completed:** v1.9.5 → v1.9.6 → v1.9.7 → v1.9.8 → v1.10.0 across 5 minor bumps. Each phase was shippable independently; this final v1.10.0 closes the feature with the cross-phase smoke gate.
- Smoke runner local result: `pass=11 fail=0 — All smoke checks green. Safe to proceed with publish.`

## [1.9.8] - 2026-05-20

### Added
- **Semantic parity check between workspace and template agent files** (Phase 4 / T5 of `workflow-handoff-integrity`). `sync-agents-preflight` now runs three additional diff strategies on top of the existing `## Feature dossier` length check: (1) header diff (`##`/`###` presence + order), (2) section-content hash diff (catches body drift even when headers match — exactly the 981a8fd-style migration gap), (3) frontmatter field-level diff. Each issue includes an actionable hint.
- **Mode-aware severity** via `AIOSON_PREPUBLISH=true` env var. Default mode (local dev, CI without pre-publish): semantic drift is a warning, non-blocking. Pre-publish mode: warning becomes hard fail — blocks `npm publish` until drift is resolved.
- **`src/lib/agent-semantic-diff.js`** new pure-helpers module exporting `extractHeaders`, `extractSections`, `extractFrontmatter`, `diffHeaders`, `diffSectionContent`, `diffFrontmatter`, `diffAgentFile`, `normalizeBody`, `hashBody`. Reusable by downstream consumers.
- **`checkSemanticParity(projectRoot)`** exported from `src/commands/sync-agents-preflight.js`.
- **`tests/sync-agents-preflight-semantic.test.js`** — 20 unit tests covering AC-T5-01..08 including a **regression guard test** that reproduces the 981a8fd-style diff inside an isolated fixture and confirms the new check catches it.

### Changed
- `src/commands/sync-agents-preflight.js`: `main()` now also runs semantic parity. Existing length check + learning-loop checks kept (additive). Telemetry event `semantic_parity_violation` emitted on detection (per-existing `dossierTelemetry` pattern).

### Notes
- This release closes Phase 4 of `workflow-handoff-integrity`. F1+F2+F3+T5 now cover state hygiene, forward auto-emit, gating against pending decisions, AND structural drift detection between workspace/template. Phase 5 (T6 — CI smoke ponta-a-ponta) ships next as v1.10.0.
- DD-03 (semantic diff granularity) resolved as: section-level + token-aware code blocks + frontmatter field-level. Plain text body diff deliberately skipped to avoid cosmetic noise (typo fixes).
- Smoke against actual repo: `checkSemanticParity(process.cwd())` returns 0 drift issues — confirms workspace ↔ template agent files are aligned and v1.9.4 AskUserQuestion mass-edit preserved parity correctly.

## [1.9.7] - 2026-05-20

### Added
- **Stale `dev-state.md` detection with actionable warnings** (Phase 3 / F1 of `workflow-handoff-integrity`). `aioson preflight` now cross-references `.aioson/context/features.md` and applies a 30-day TTL: stale conditions are (a) feature already marked `done`/`abandoned`, (b) feature absent from features.md (orphan / cross-project leak), (c) `last_updated > 30 days`. Each warning embeds the command to fix it (`aioson state:reset` or `aioson state:save --feature=<slug>`).
- **`aioson state:reset`** new CLI command. Removes `.aioson/context/dev-state.md`. `--archive` flag moves to `.aioson/runtime/devstate-history/{ISO}.md` for audit trail. Idempotent. `--json` returns structured result.
- **Corrupt dev-state detection (AC-F1-08).** `readDevState` flags `parseError` when the file lacks frontmatter markers or has empty frontmatter. `detectStaleDevState` returns a warning with a `state:reset` command suggestion.
- **`detectStaleDevStateRich` + `parseFeaturesMap`** exported from `src/preflight-engine.js` for downstream consumers + tests.
- **`tests/preflight-stale-devstate.test.js`** — 20 unit tests covering AC-F1-01..08, parseFeaturesMap robustness, and runStateReset (idempotent, archive variant, json mode).

### Changed
- `src/commands/preflight.js`: `runPreflight` switched the stale-detection call from sync `detectStaleDevState` to async `detectStaleDevStateRich`. Existing sync helper preserved (still used internally by `evaluateReadiness`) for backward-compat.

### Fixed
- Per PRD ("warning acionável, NÃO cleanup automático silencioso"), F1 delivers a structured stderr warning with embedded command suggestion. No interactive y/N prompt (safer for CI/non-TTY contexts than plan-f1 originally implied).

### Notes
- This release closes Phase 3 of `workflow-handoff-integrity`. F1 + F2 + F3 now cover state hygiene (Phase 3 — F1), forward auto-emit (Phase 1 — F2), and gating against pending decisions (Phase 2 — F3). Phases 4-5 (T5 semantic sync, T6 CI smoke) ship as v1.9.8 → v1.10.0.
- DPC-07 (additional path correction discovered): the PRD/architecture referenced `src/preflight.js` which does not exist. Actual layout: `src/preflight-engine.js` (helpers) + `src/commands/preflight.js` (CLI command). Both extended.

## [1.9.6] - 2026-05-20

### Added
- **`aioson workflow:next --complete=<agent>` rejects advance when manifest has pending decisions** (Phase 2 / F3 of `workflow-handoff-integrity`). Reads `.aioson/plans/{slug}/manifest.md` frontmatter; if `status` matches `^pending-(.+)-decisions$`, throws `WORKFLOW_NEXT_PENDING_DECISIONS` with actionable message recommending the agent that resolves those decisions (e.g. `pending-architect-decisions` → "Próximo agente recomendado: @architect"). Prevents the deadlock observed in `aioson-com` 2026-05-19 where `/analyst` routed to `/dev` despite manifest pending.
- **`--force` flag** on `aioson workflow:next` for explicit override (logs warning, proceeds). For emergency-use cases.
- **DD-02 hybrid regex+whitelist:** regex `^pending-(.+)-decisions$` catches any future `pending-<X>-decisions` state automatically; whitelist `[architect, product, pm, qa]` flags unrecognized captured groups (still blocks but warns "estado desconhecido" so typos don't silently route to nonexistent agents).
- **`tests/workflow-next-pending-guard.test.js`** — 10 unit tests covering AC-F3-01..07 (hard error, regex match per known agents, unknown group warning, --force override, no manifest, no slug, pattern specificity, whitelist export).

### Changed
- `src/commands/workflow-next.js`: new public helpers `assertManifestNotPending(targetDir, slug, force)` + `PENDING_STATE_WHITELIST` const exported. Guard fires at start of `options.complete` branch (line 992, BEFORE `finalizeCurrentStage`) per AC-F3-05 precedence.

### Notes
- This release closes Phase 2 of `workflow-handoff-integrity`. F2 + F3 together cover the forward (auto-emit) and gating (pre-check pending) directions of workflow handoff integrity. Phases 3-5 (F1 stale dev-state, T5 semantic sync, T6 CI smoke) ship as v1.9.7 → v1.10.0.
- Full npm test: 1 transient Windows tempdir flake (L-02 documented) — confirmed transient via targeted re-run of `tests/external-session.test.js` (21/21 pass). All other tests green.

## [1.9.5] - 2026-05-20

### Added
- **`agent:done` auto-emits `workflow:next --complete=<agent>`** (Phase 1 / F2 of `workflow-handoff-integrity`). When a workflow is active for the project (`.aioson/runtime/workflow.state.json` present + matching feature) AND the calling agent has produced its canonical artifact on disk, `aioson agent:done` now internally advances the workflow pointer. Removes the requirement for every agent prompt to literal-call `aioson workflow:next` — centralizes the trigger in `runAgentDone`. Backward-compat preserved: state file absent → no auto-advance (baseline stdout byte-identical).
- **`src/handoff-contract.js#getCanonicalArtifactsForAgent(agent, targetDir, state)`** public helper. Consumes the existing CONTRACTS map; returns absolute artifact paths array, `null` for unknown agents, `[]` for agents with no canonical artifact (e.g. `@committer`, `@dev`).
- **`--no-auto-advance` opt-out flag** on `aioson agent:done` for cases where auto-emit is undesirable (debug, manual restore, scripts).
- **`tests/baselines/agent-done-stdout.txt`** — backward-compat baseline lock per Risk-11 mitigation.
- **`tests/agent-done-auto-emit.test.js`** — 13 unit tests covering AC-F2-01..10 (happy path, backward-compat, opt-out, idempotency 1s window, corrupt state, missing artifact, unknown agent).

### Changed
- `src/commands/runtime.js#runAgentDone` injects `maybeAutoAdvanceWorkflow` call after stdout log in both live-session and standalone branches. Idempotency via `last_workflow_event_at` field added to `workflow.state.json` schema (backward-compat: missing field treated as zero).

### Notes
- This release closes Phase 1 of `workflow-handoff-integrity` MEDIUM feature. Phases 2-5 (F3 CLI guard, F1 stale dev-state, T5 semantic sync, T6 CI smoke) ship as separate releases v1.9.6 → v1.10.0 per progressive release strategy (DD-05).
- Full npm test: 2520/2521 pass; the single skipped/flaky test is AC-ALL-101 (`telemetry-foundation.test.js`, performance threshold) — pre-existing, documented as separate follow-up.
- Inception note: this hotfix was implemented via the AIOSON chain itself (`@analyst → @architect → @pm → @dev`) — eating its own dog food.

## [1.9.4] - 2026-05-20

### Fixed
- **`AskUserQuestion` no longer fires on bare agent activation.** When `/deyvin`, `/product`, `/dev`, `/neo`, or `/setup` loaded without a stated task, the agents were inventing multi-choice options around fabricated next-steps — wasting user attention and inviting arbitrary implementation paths. New **Rule 7** in `decision-presentation/SKILL.md` mandates an informational summary + wait when no task is stated; the per-agent hard constraint was reworded from "Always use `AskUserQuestion`" to "When a real decision requires user input, use `AskUserQuestion`". `@deyvin` Working kernel and `pair-execution.md` updated to mirror.
- Affects: `decision-presentation/SKILL.md`, `agents/{deyvin,product,dev,neo,setup}.md`, `docs/deyvin/pair-execution.md` (workspace + template parity preserved).

## [1.9.3] - 2026-05-19

### Fixed
- **`@pm` agent prompt in template** now correctly declares ownership of `implementation-plan-{slug}.md` for MEDIUM features (AC-SDLC-15), completing the SDLC migration started in v1.9.0 (commit `981a8fd`). Projects on 1.9.0/1/2 hit a deadlock at Gate C when running MEDIUM features via the standard chain: `/architect` routed users to `/pm`, but the legacy template prompt instructed `/pm` to NOT silently create the artifact. The workspace prompt had been updated in `981a8fd` but the template, alignment test, and a docs file were never propagated.
- **`tests/agent-runtime-alignment.test.js`** updated to assert the new canonical tokens (`## MEDIUM implementation plan (mandatory output for MEDIUM)`, `For MEDIUM features, @pm MUST produce implementation-plan-{slug}.md`, `## Non-MEDIUM handoff reality`, gate-approve command). The previous assertions were guarding the pre-`981a8fd` contract.
- **`template/.aioson/agents/manifests/pm.manifest.json`** `capabilities[0].outputs[]` now declares `.aioson/context/implementation-plan-{slug}.md` as a canonical produce of `@pm`. Test alignment also asserts this. Source manifest synced for parity.
- **`template/.aioson/skills/process/aioson-spec-driven/references/artifact-map.md`** ownership table corrected: `implementation-plan-{slug}.md` written by `@pm` for MEDIUM (AC-SDLC-15) instead of `@dev`, and read by `@dev, @deyvin, @orchestrator`. Also corrected the chain description (line 14).
- **`template/.aioson/agents/orchestrator.md`** propagated from workspace — uses feature-scoped artifact naming (`requirements-{slug}.md`, `spec-{slug}.md`, `implementation-plan-{slug}.md`, `ui-spec-{slug}.md`) matching the post-`981a8fd` contract. Previously template still used legacy generic names.

### Notes
- **Rollback:** `npm install @jaimevalasek/aioson@1.9.2` (or pin in your project's `package.json`) restores the previous behavior. Use only as last resort — the previous state had `@pm` deadlock at Gate C for MEDIUM features.
- **Affected:** any project installed from 1.9.0/1/2 running MEDIUM features through the standard chain (`/product → /analyst → /architect → /pm`).
- **How to verify the fix in your project:** after `aioson update`, run a MEDIUM feature through the chain. `/pm` should produce `implementation-plan-{slug}.md` without refusing. `aioson workflow:status` should advance through Gate C.
- **Follow-ups intentionally NOT included in this hotfix** (will be in a separate MEDIUM PRD, `prd-workflow-handoff-integrity.md`):
  - `briefing.md` / `discover.md` template drift (one-line addition about `done/MANIFEST.md` awareness — benign but not tied to a documented plan).
  - F1 (stale `dev-state.md` cleanup), F2 (workflow pointer auto-emission), F3 (analyst routing checks), T5 (CI guard for semantic drift), T6 (smoke test pre-publish).
- **Audit trail for this hotfix:** see PR description, briefing `.aioson/briefings/workflow-handoff-integrity-1-9-2/briefings.md`, PRD `.aioson/context/prd-workflow-hotfix-1-9-3.md`.

## [1.7.3] - 2026-04-13
### Fixed
- `@dev` pt-BR locale pack realigned with the canonical prompt flow, restoring the proper cold-start fallback when `dev-state.md` is already `done` and another feature is still `in_progress` in `features.md`.
- Added a regression test to keep the `@dev` prompt synchronized between the canonical file and the pt-BR locale pack, preventing future drift in the distributed template.
- Setup prompt templates now reference the current `aioson_version` (`1.7.3`) instead of the stale `1.5.1` example.

## [1.7.2] - 2026-04-07
### Fixed
- Removed 5 spurious Windows alternate data stream files (`SKILL.md:Zone.Identifier`) from `template/.aioson/skills/design-system/` that leaked from a local Windows copy operation and were never tracked by git.
- `tests/agent-contracts.test.js`: added `neo`, `sheldon`, `tester`, and `orache` to the full locale coverage check; added a separate `BASE_ONLY_AGENTS` list (`copywriter`, `design-hybrid-forge`, `site-forge`) with a dedicated test that verifies their base files ship in the template. Previously these agents were not validated by the test suite.

## [1.7.1] - 2026-04-07
### Added
- **Marketing & copywriting system**: new `@copywriter` agent (5 operating modes including VSL scripts) backed by a generic `copywriting` genome (One Belief, 5 Acts, PMS framework, market sophistication levels, 10 heuristics).
- **Marketing references library** (`.aioson/skills/marketing/references/`): 8 on-demand reference files with 70+ patterns and anti-patterns covering One Belief, 5-Act narrative structure, fascinations (12 formulas), offer structure, PMS research, copy patterns, anti-patterns checklist, and market intelligence tools. Loaded conditionally by `@copywriter` to keep context lean.
- **VSL Craft skill** (`.aioson/skills/marketing/vsl-craft.md`): Video Sales Letter production playbook — 3 formats (horizontal/vertical/hybrid), 5-act script structure, 5 hook formulas, retention techniques, testing methodology, and production specs.
- **Marketing integration across agents**: `@neo` routes to `@copywriter` when `project_type=site` and copy is missing; `@setup` registers the copywriting genome and adds copy gate to site routing; `@dev` enforces a copy guard for marketing pages and reads the 5-Act structure from `copy-{slug}.md`; `@ux-ui` maps the 5 Acts to visual sections; `@deyvin` routes marketing copy requests to `@copywriter` instead of writing inline.
- **Landing page production skills**: `landing-page-forge.md` (animation libraries, performance, SEO/LLMO, tracking, 3-track parallel production checklist) and `landing-page-deploy.md` (Vercel and Hostinger VPS deploy paths).
- **Digital marketing agency squad template** under `template/.aioson/templates/squads/digital-marketing-agency/`.

### Changed
- `@dev` site production section now includes a copy guard that blocks inline marketing copy on `project_type=site` pages — copy must come from `@copywriter` via `copy-{slug}.md`.
- `@ux-ui` copy gate now reads the 5-Act narrative structure from copy files and maps acts to UI sections.
- `@neo` workflow stage detection includes `Needs copy` for site projects without a copy file.
- `@setup` routing table splits `site` into two paths: `@copywriter → @ux-ui → @dev` (no copy yet) vs `@ux-ui → @dev` (copy ready).
- Misc updates to `@qa`, `@squad`, `squad-create`, `squad-design`, `cognitive-core-ui/motion`, `ui-ux-modern`, and `template/CLAUDE.md`.

### Notes
- Marketing references are loaded conditionally by `@copywriter` only — other agents never load them directly. This keeps the marketing system isolated and prevents contaminating non-site projects.
- The copy guard triggers exclusively for `project_type=site` marketing/sales pages. SaaS UI, dashboards, app interfaces, and documentation sites use the standard implementation flow with no behavior change.

## [1.7.0] - 2026-04-06
### Added
- **Squad autonomous execution system**: full multi-agent squad stack — intra-squad message bus (`intra-bus.js`, `squad:bus` command), executor reflection module (`reflection.js`), task decomposer, `squad:autorun` for end-to-end autonomous execution, learning system, squad daemon, verify-gate, and cross-AI synthesis. Intelligence gaps addressed in plans 80–82; 6 critical operational fixes in plan 83.
- **Runner system**: `runner:run`, `runner:queue`, `runner:plan`, and `runner:daemon` commands for persistent background job execution outside the main session loop.
- **New CLI commands**: `agent:audit` (agent integrity inspection), `brief:gen` (context brief generation), and `verify:gate` (execution pre-flight gate). Documented in `docs/pt/`.
- **SDD automation — The 80% Rule (plans 74–79)**: automation scripts that drive spec compliance across agents; harness sensors, context budget ceiling, and PGE pattern (plan 76); full SDD coverage across all agents (plan 77); locale SDD sync and pt-BR `tester.md` (plan 78); SDD automation scripts wired into agents and docs (plan 79); engine fixes for `evaluateReadiness`, `extractLastCheckpoint`, and `detectTestRunner`.
- **Agent capability sprints**:
  - Sprint 1 — task-list working memory, hook contract, file size guidelines, `CLAUDE.local.md` support.
  - Sprint 2 — context compaction protocol and self-directed plan mode.
  - Sprint 3 — CronTools protocol and config tiers documentation.
- **Web-research-cache skill**: caches web research results in `researchs/`; awareness propagated to all agents that perform web discovery.
- **`site-forge` agent**: replaces `hybrid-clone` with a dedicated site-forge agent backed by a Brains knowledge system for site cloning and forging workflows.
- **Three.js skill**: `threejs-spatial` modifier and corresponding agent (`hybrid-clone`) for Three.js spatial interface projects.
- **Operational pipeline**: event enrichment, spec-sync, token economy, devlog pipeline, and project hooks system.
- **Squad CLI integration**: `squad.md` wired to CLI tools — Step 0 scaffold, CLI integration table.
- **Tutorials site**: squads tutorial page added; Squads and Automation links activated on the tutorials index.

### Changed
- `update` now only updates already-installed files by default; use `--all` to sync every template file.
- Setup routing no longer directs to `@dev` when only `plans/` or research files are present.
- `@deyvin`, `@neo`, and `@sheldon` now load and maintain `dev-state.md` awareness.
- README redesigned with visual impact, squads ecosystem section, and spec-driven workflow documentation.

### Fixed
- `@orache` research cache: agent now writes to `researchs/` (previously only read from it).
- SDD engine reliability: `evaluateReadiness`, `extractLastCheckpoint`, `detectTestRunner` (plan 79 phase 2).
- Squad autonomous operation: 6 critical fixes for stable real-world execution (plan 83).
- Three.js patterns: race condition and invalid property reference resolved.

## [1.6.0] - 2026-04-01
### Added
- **Interactive install wizard**: animated multi-screen onboarding (`init` and `install`) with Design (screen 3) and Locale (screen 4) dimensions, multi-select for design skills, and pre-populated choices on `--reconfigure`.
- **`aioson setup` command**: unified setup entry point with auto-detected system language.
- **Spec-driven process skill** (`aioson-spec-driven`): agent contract upgrades, GSD lessons integration (must_haves, 4-tier verification, gray areas, seeds, forensics), and context budget warning threshold configuration.
- **Design skills**: `glassmorphism-ui` and `neo-brutalist-ui` added; HTML preview gallery for all 8 design skills with per-skill landing page previews.
- **Aurora Command UI hybrid**: design hybrid variation workflow and aurora-command-ui skill.
- **5-phase context optimization system**: implemented in `src/commands/context-optimizations.js`.
- **Health digest, dynamic tools, and learning evolve pipeline**: `--all` flag for the main update flow; health digest output and adaptive learning pipeline wired to the operational surface.

### Changed
- `install --reconfigure`: warns when the new profile deselects previously installed items; confirm screen strings fully localized.
- `update`: now preserves locale from the saved profile and installs all framework files when upgrading; added `--all` flag.

### Fixed
- `install`: `overwrite=true` enforced when reconfigure changes the active profile.
- `design-hybrid` options: TTY error logged correctly; test coverage expanded.
- `install-wizard`: broken banner box, wrong skip reason, and stdin hang after wizard completion resolved; terminal state now fully restored.
- Landing page previews: hero content and section titles centered correctly across all 3 previews.

## [1.5.1] - 2026-03-28
### Added
- **TDD Gate no `@dev`**: novo bloqueador explícito antes de qualquer implementação de lógica de negócio. Detecta test runner via `test_runner` em `project.context.md` ou varre a raiz em busca de `pest.xml`, `vitest.config.*`, `pytest.ini`, `.rspec`, `foundry.toml`. Mandato RED → GREEN → commit por classificação (MICRO/SMALL/MEDIUM) com exceções para migrations, configurações e conteúdo estático.
- **Novo agente `@tester`**: engenheiro de testes para aplicações já implementadas. Produz `test-inventory.md` (mapa de cobertura), `test-plan.md` (estratégia escolhida + cobertura antes/depois) e escreve testes por módulo em ordem de risco. Suporta Characterization Testing, Test Pyramid, Risk-first Gap Filling, Property-based, Contract e Mutation Testing. Mapeamento completo de frameworks: Laravel/Pest, Next.js/Vitest+RTL, Django/pytest, FastAPI/httpx, Rails/RSpec, Solidity/Foundry.
- **Detecção de documentos de kickoff no `@product` e `@sheldon`**: ambos os agentes agora varrem `plans/*.md` e `prds/*.md` na raiz do projeto antes de iniciar o fluxo. Detectam contexto (greenfield vs feature), oferecem sintetizar o conteúdo nos artefatos formais em `.aioson/context/`, e nunca modificam os arquivos fonte — o usuário decide quando deletá-los.
- Campo `test_runner` adicionado ao Context contract em `config.md` e ao template de `project.context.md` gerado pelo `@setup` (todos os 4 locales).
- Detecção automática de test runner no `@setup`: varre a raiz e preenche `test_runner` em `project.context.md` quando um runner é detectado.
- `@tester` registrado em `CLAUDE.md`, `AGENTS.md`, `OPENCODE.md`, `.gemini/commands/aios-tester.toml`, `src/constants.js` (AGENT_DEFINITIONS) e `template/.claude/commands/aioson/agent/tester.md`.
- Documentação `docs/pt` atualizada: `agentes.md` (seções `@dev`, `@qa`, `@product`, `@sheldon` novo, `@tester` novo, fluxos atualizados), `cenarios.md` (exemplo TDD no Cenário 2, exemplo kickoff doc, nota @tester vs @qa), `inicio-rapido.md` (tabela de sequências e seção de estratégia de kickoff docs).

### Changed
- `src/context-writer.js` e `src/commands/setup-context.js`: suporte ao campo `testRunner` na geração e override de `project.context.md`.
- `template/.aioson/agents/dev.md`: seção "Implementation strategy" reescrita com mandato RED→GREEN→commit; seção "Atomic execution" atualizada com referência cruzada ao TDD Gate.
- `template/.aioson/agents/product.md`: seção "Source document detection" adicionada antes de "Mode detection".
- `template/.aioson/agents/sheldon.md`: seção "Detecção de documentos fonte" adicionada antes de RF-01.
- `template/.aioson/config.md`: campo `test_runner` no Context contract; `@tester` no workflow opcional.
- Versão de referência nos templates de `project.context.md` atualizada de `0.1.25` para `1.5.1`.

## [1.5.0] - 2026-03-27
### Added
- Native web map and scrape commands for first-party web discovery and extraction workflows.
- New agent capabilities and orchestration surface including `@neo`, the Sheldon PRD enrichment flow, richer downstream gates, and improved locale-aware runtime execution rules.
- Squad-level operational improvements including webhook/channel bridge integration, daemon and registry evolution, and dashboard/design-system refinements for the squad experience.
- Cognitive Core UI design skill upgrades with stronger art direction, composition libraries, anti-generic guardrails, and more robust interaction/contrast guidance.

### Changed
- Project license changed from `MIT` to `AGPL-3.0-only` for new releases going forward.
- Package metadata and lockfile versioning are now aligned at `1.5.0`.
- Agent workflows now enforce PRD gating, stronger atomic execution behavior, and more explicit routing for MICRO and product/design-driven flows.

## [1.3.0] - 2026-03-15
### Added
- Canonical runtime observability for installed projects: runtime SQLite now acts as the primary execution store with task/run/event lifecycle tracking, workflow event synchronization, and an execution gateway prepared to instrument direct agent entrypoints, workflow enforcement, squads, and operational runs from the project runtime itself.
- `docs/pt/comandos-cli.md`: first Portuguese-first CLI reference page covering all public `aioson` commands with grouped descriptions, command map, examples, and practical usage recipes. Linked from `docs/pt/README.md` and `docs/pt/inicio-rapido.md`.

### Changed
- Full product rebrand from `aioson` to `aioson` across package metadata, CLI branding, docs, templates, prompts, tests, runtime paths, and generated project structure. The managed project directory is now `.aioson/` instead of `.aioson/`.
- npm distribution moved to the scoped package `@jaimevalasek/aioson` after the unscoped `aioson` name was rejected by npm for similarity policy reasons. Install and `npx` docs now use the scoped package while the installed CLI commands remain `aioson` and `aios`.
- Release description updated to `AI operating framework for hyper-personalized software.` to match the current platform direction.
- Legacy `dashboard:*` CLI flow removed from the public surface. `aioson dashboard:init|dev|open` no longer appear in help or docs; if called, the CLI now returns a migration error instructing users to open the separately installed dashboard app and select the project folder that already contains `.aioson/`. Updated pt docs and agent guidance to match the new app-first dashboard flow.
- `template/.aioson/skills/static/interface-design.md`: upgraded the interface-design craft guide by merging strengths from the upstream `interface-design` skill without losing AIOSON workflow fit. Added persistent design memory via `.interface-design/system.md`, existing-UI refinement rules (diagnose drift before re-theme), two fully specified directions (`Sophistication & Trust`, `Premium Dark Platform`), a mandatory pre-component decision checkpoint, and explicit memory update guidance for reusable UI patterns.

## [0.1.28] - 2026-03-04
### Added
- **`scan:project` command** (`aioson scan:project [path] [--provider=<name>] [--dry-run] [--json]`): Node.js port of the brownfield project scanner, replacing `aioson-scan.py`. Walks the project, reads key files, calls a cheap LLM (multi-provider), and generates `discovery.md` + `skeleton-system.md`. Zero npm dependencies — uses `node:fs`, `node:https`, `node:http` only.
- Multi-provider HTTP client supporting OpenAI-compatible format (DeepSeek, OpenAI, Gemini, Groq, Together, Mistral) and Anthropic native format. Configured via `aioson-models.json` (same config file as before).
- `--provider=<name>` flag to override `preferred_scan_provider` from config at runtime.
- `--dry-run` mode: walks the project and reports file counts without calling the LLM.
- i18n keys for `scan_project` section in all 4 locales (en, pt-BR, es, fr).
- `install` hint message updated in all 4 locales: `python aioson-scan.py` → `aioson scan:project`.

### Removed
- `template/aioson-scan.py`: Python scanner removed from the template. `aioson scan:project` is the normalized replacement. The `aioson-models.json` config file (provider API keys) is unchanged.

### Changed
- All 15 template agent files (analyst, dev, orchestrator — base + 4 locales each): `python aioson-scan.py` replaced with `aioson scan:project` in brownfield detection hints.

## [0.1.27] - 2026-03-04
### Added
- **HTML reports** for browser QA: `--html` flag added to `qa:run`, `qa:scan`, and `qa:report`. Generates a self-contained visual report in `reports/<date>_<time>_<mode>/index.html`. Screenshots embedded as base64 — fully portable for sharing. Existing `aios-qa-report.md` and `aios-qa-report.json` outputs are never modified; HTML is purely additive.
- `reports/index.html`: historical index auto-updated after each HTML run, listing all runs with date, mode, URL, and severity badges. Sorted newest first.
- `qa:report --html`: retroactively generates HTML from the existing `aios-qa-report.json` without re-running Playwright.
- HTML report features: severity filter buttons, collapsible finding cards (location + risk + fix + screenshot), performance cards with colour-coded thresholds, AC coverage table, routes list (scan mode), click-to-zoom screenshot lightbox, vanilla JS (no framework).
- `src/qa-html-report.js`: self-contained HTML generator module with embedded CSS and JS, `writeHtmlReport()` and `updateReportsIndex()` exports.
- i18n key `html_report_written` added to `qa_run`, `qa_scan`, `qa_report` sections in all 4 locales (en, pt-BR, es, fr).
- Missing `help_qa_*` i18n keys added to pt-BR locale (were absent; es/fr fall back to en).
- `docs/en/qa-browser.md`: `--html` flag documented for all three commands, plus a new **HTML reports** section describing folder structure, features, and `qa:report --html` retroactive mode.
- README: `--html` flag added to Browser QA command signatures and Agent usage helper examples.

## [0.1.26] - 2026-03-04
### Added
- **Browser QA engine** (`qa:init`, `qa:doctor`, `qa:run`, `qa:scan`, `qa:report`): full Playwright-powered browser testing built into aioson. No LLM required. No separate tool. Playwright is an optional runtime dependency — zero impact on users who don't need browser testing.
- `qa:init`: generates `aios-qa.config.json` by reading `prd.md` (acceptance criteria → test scenarios) and `discovery.md` (business rules). URL auto-resolved from `project.context.md`.
- `qa:doctor`: validates all prerequisites (Playwright installed, Chromium binary, config valid, URL reachable, context and prd.md present).
- `qa:run`: full QA session with 4 personas: **naive** (empty forms, 10K strings, ghost clickables), **hacker** (8 secret patterns against window globals and HTML source, 10 sensitive file paths, XSS, open redirect, SQL injection, IDOR ±1, debug routes), **power** (keyboard navigation focus visibility, boundary values on numeric/date inputs), **mobile** (375px viewport, horizontal overflow, touch targets < 44px, fonts < 12px). Post-persona: network-level probes (console stack traces, sensitive GET params, mixed content). Accessibility audit (5 WCAG checks). Performance capture (TTFB, load time, request count, transfer size). AC coverage from `prd.md` with screenshots. Output: `aios-qa-report.md` + `aios-qa-report.json` + `aios-qa-screenshots/`.
- `qa:scan`: autonomous crawler — maps all routes via BFS (configurable depth and max pages), probes each route for exposed secrets, console leaks, accessibility issues, and horizontal overflow. Sensitive files probed once per domain.
- `qa:report`: displays last generated report; `--json` returns parsed `aios-qa-report.json`.
- `@qa` agent (base + all 4 locales) updated with browser report integration rules: if `aios-qa-report.md` exists, merge findings, promote severity when both static review and browser test flag the same issue, tag ACs as `[browser-validated]`.
- i18n keys added for `qa_doctor`, `qa_init`, `qa_run`, `qa_scan`, `qa_report` sections across all 4 locales (en, pt-BR, es, fr).
- `docs/en/qa-browser.md`: full reference for all 5 qa: commands with examples, persona descriptions, probe list, performance thresholds, CI integration patterns.
- README updated: Browser QA section in Commands, Agent usage helper, JSON output, and Docs feature guides — all with links to `docs/en/qa-browser.md`.

## [0.1.25] - 2026-03-04
### Added
- `@product` agent: conversational product wizard that runs between `@setup` and `@analyst`. Starts from a raw idea and leads a natural back-and-forth conversation (8 strict conversation rules: one question at a time, no filler words, reflect before advancing, surface forgotten requirements, challenge assumptions gently, prioritize ruthlessly, draft early after 5–7 exchanges). Supports two modes: creation (no prd.md) and enrichment (prd.md exists). Produces `.aioson/context/prd.md` with 8 sections: vision, problem, users, MVP scope (🔴 must-have / 🟡 should-have), out-of-scope, user flows, success metrics, open questions.
- `template/.aioson/agents/product.md`: base agent file.
- `template/.aioson/locales/en/agents/product.md`, `pt-BR/agents/product.md`, `es/agents/product.md`, `fr/agents/product.md`: localized variants with absolute language instruction at top.
- `template/.gemini/commands/aios-product.toml`: Gemini command registration.
- Workflow chains updated in `config.md`: MICRO = `@setup → @product (optional) → @dev`; SMALL = `@setup → @product → @analyst → @architect → @dev → @qa`; MEDIUM = `@setup → @product → @analyst → @architect → @ux-ui → @pm → @orchestrator → @dev → @qa`.
- `@product` added to `CLAUDE.md` agent routing, `AGENTS.md` invocation table and file list.
- `setup.md` routing table updated in all 5 locale files to route to `@product` after setup instead of directly to `@analyst`.
- `src/constants.js`: `@product` added to `MANAGED_FILES` (base + 4 locale paths + toml) and `AGENT_DEFINITIONS` (before `@analyst`, empty `dependsOn`, output `prd.md`).

## [0.1.24] - 2026-03-04
### Added
- `skeleton-system.md`: new lightweight living index generated by `aioson-scan.py` alongside `discovery.md`. Contains file map with status indicators (✓/◑/○), key routes, module status table, and entity relationships. Designed to be read first as a cheap orientation before loading heavier context files.
- Scanner now generates both `discovery.md` and `skeleton-system.md` in a single LLM call, split by `<<<SKELETON>>>` delimiter. If the delimiter is missing, only `discovery.md` is written with a warning.
- `@dev` (base + en/pt-BR/es/fr): `skeleton-system.md` added to required input (read first). Auto-update rule: update skeleton entries when creating/deleting/modifying files. New `*update-skeleton` command to rewrite the full skeleton after a development session.
- `@analyst` (base + en/pt-BR/es/fr): brownfield pre-flight now reads `skeleton-system.md` first for quick orientation before diving into `discovery.md`.
- `@orchestrator` (base + en/pt-BR/es/fr): session start now reads `skeleton-system.md` as step 2 (before discovery.md).

## [0.1.23] - 2026-03-04
### Added
- `template/aioson-scan.py`: standalone Python scanner (zero external dependencies, stdlib only). Walks the project tree, reads up to 12 key files (package.json, composer.json, schema.prisma, routes/web.php, etc.), reads `project.context.md` and `spec.md` if present, then calls a cheap LLM API (DeepSeek, Gemini, OpenAI, Anthropic, Groq, Together, or Mistral) to generate `.aioson/context/discovery.md` with 9 structured sections. Saves main-session tokens on brownfield projects.
- `template/aioson-models.json`: API key config template for 7 providers. Auto-added to `.gitignore` on install to prevent key commits.
- Brownfield project detection in installer: when `framework_installed` is detected and the project has >20 files, `install` and `update` now emit an alert with instructions to run `aioson-scan.py` first.
- `@analyst` (base + en/pt-BR/es/fr): **Brownfield pre-flight** section — checks `framework_installed`, skips Phases 1–3 if `discovery.md` already exists, alerts the user to run the scanner if it is missing. Rule enforced: always read `spec.md` alongside `discovery.md`.
- `@dev` (base + en/pt-BR/es/fr): **Brownfield alert** section — if `framework_installed=true` and `discovery.md` is missing, alerts the user to run `aioson-scan.py` before proceeding.
- `@orchestrator` (base + en/pt-BR/es/fr): session start now reads `discovery.md` AND `spec.md` together at session open, with brownfield alert when `discovery.md` is absent.

## [0.1.22] - 2026-03-04
### Fixed
- `setup:context` command: `--lang=pt-BR` (and any `--lang` alias) was silently ignored — `applyExplicitOverrides` only read `options.language` but the parser stores the flag as `options.lang`. Fixed by reading `options.language ?? options.lang`, consistent with all other commands (`install`, `update`, `init`, `locale-apply`, etc.). Running `npx aioson setup:context . --defaults --lang=pt-BR` now correctly installs the pt-BR locale agents.

## [0.1.21] - 2026-03-03
### Changed
- `@ux-ui` Step 0 (base + en/pt-BR/es/fr locales): added **Option C — Default / Skip** to the visual style question. When chosen, the agent skips style confirmation and goes directly to Step 1 using `interface-design.md` as the sole design authority, letting domain exploration drive the visual direction organically. Accepted inputs: C / skip / pular / saltar / passer / padrão / default.

## [0.1.20] - 2026-03-03
### Added
- `template/.aioson/skills/static/react-motion-patterns.md`: new skill with React/Next.js equivalents of the wow effects from `static-html-patterns.md`. Covers 10 patterns: animated mesh background, animated gradient text, scroll reveal (Framer Motion + Intersection Observer fallback), 3D card tilt hook, hero staggered entrance, infinite logo marquee, scroll progress bar, glassmorphism card, floating orbs, and page transition. All patterns include `prefers-reduced-motion` fallback and touch-device guards.
- Laravel installation links to `skills/dynamic/laravel-docs.md`: three-path table (Herd/standard, Sail/Docker, Jetstream+Livewire) with specific URLs, detection signals per stack, and Livewire v3 MCP fetch example.

### Changed
- `template/.aioson/skills/static/laravel-conventions.md`: added project folder structure tree, naming convention table (13 artefacts, singular/plural rules), and Livewire component section with `#[Computed]`, `wire:model.live`, classic controller variant, and coexistence rule.
- `@dev` agent (base + en/pt-BR/es/fr locales): added **Motion and animation** section — when `framework=React|Next.js`, agent now reads `react-motion-patterns.md` before implementing animations. Framer Motion as primary, CSS `@keyframes` as fallback. Hard rule against heavy motion in admin/CRUD interfaces.
- `@dev` agent (base + en/pt-BR/es/fr locales): added Laravel project structure layout block and singular/plural naming rules to the Laravel conventions section.

## [0.1.19] - 2026-03-03
### Added
- `src/commands/test-agents.js`: new `test:agents` CLI command — 99 structural checks across all 8 base agents and all locale files (32 base checks + 64 locale checks + 3 critical skill checks). Validates: file existence, `## Mission` section, `## Hard constraints` section, `.md-only` context rule, and language instruction within first 15 lines of each locale agent.
- `src/commands/locale-diff.js`: new `locale:diff` CLI command — compares `##` heading structure of base agent files vs locale translations, normalizes headings (strips accents for cross-language comparison), and reports sections present in base but missing in locale. Supports `--lang` filter and single-agent argument.
- `template/.aioson/skills/static/django-patterns.md`: comprehensive Django conventions skill (342 lines) — project structure, `TimestampMixin`, service layer, DRF serializers, URL namespacing, settings split (base/dev/prod), Admin registration, `pytest-django` test patterns, N+1 prevention rules.
- `template/.aioson/skills/static/fastapi-patterns.md`: comprehensive FastAPI conventions skill (344 lines) — async project structure, `pydantic-settings`, SQLAlchemy async engine, Pydantic input/output schema separation, service layer, JWT via `HTTPBearer`, Alembic migrations, `pytest + httpx AsyncClient` patterns.
- `template/.aioson/skills/dynamic/README.md`: explains static vs dynamic skills pattern and lists all 6 dynamic skill files with their source URLs.

### Changed
- `@dev` agent (base + en/pt-BR/es/fr locales): `architecture.md` and `discovery.md` now marked as `*(SMALL/MEDIUM only)*` in Required input. Added explicit MICRO callout — only `project.context.md` is guaranteed for MICRO projects.
- `@orchestrator` base agent: renamed `## Rules` → `## Hard constraints` for consistency with all other agents.
- `@dev`, `@qa`, `@orchestrator` base agents: added `.md-only` context rule (was missing — `test:agents` detected the gap).
- Locale `en` agents (analyst, architect, pm, ux-ui, dev, qa, orchestrator): added ABSOLUTE INSTRUCTION language marker at top (was missing in en locale — `test:agents` detected the gap).
- All 6 dynamic skill stubs expanded with concrete source URLs, focus areas, and MCP tool fetch examples to replace the minimal placeholder content.

## [0.1.18] - 2026-03-03
### Fixed
- Language bug: locale agent files (pt-BR, es, fr) were responding in English even after `aioson install --lang=<locale>` because the language rule was at the bottom of each file. LLMs process top-to-bottom and would default to English before reading the rule.
- Added `> **⚠ ABSOLUTE INSTRUCTION — LANGUAGE**` blockquote as the **first content after the title** in all 8 agents across all 3 locales (pt-BR, es, fr) + en locale (24 files total). Instruction explicitly forbids English and names the target language before any mission, sequence, or detection logic runs.
- `@ux-ui` output contract: HTML deliverable was being saved to `.aioson/context/landing-preview.html` instead of the project root. Fixed to `index.html` in the project root across all 5 ux-ui files (base + en/pt-BR/es/fr locales).

## [0.1.17] - 2026-03-03
### Added
- `static-html-patterns.md` Section 0 — **Hero Law**: explicit rule that the hero MUST be full-viewport animated background + ONE headline + TWO buttons. Cards in the hero are forbidden.
- `static-html-patterns.md` Section 2a-extra — **Mandatory Wow Techniques** for Bold & Cinematic (three required, not optional):
  - Animated mesh background (`@keyframes meshDrift 20s`) — static gradients replaced
  - Animated gradient text (`@keyframes textGradient 8s`) on headline `<em>` key phrase
  - 3D card tilt on hover (`perspective(700px) rotateX/rotateY` on `mousemove`, skipped on touch + reduced motion)
- `@setup` agent (base + all 4 locales) — **Step 3: Next agent guidance** appended to Post-setup action. Agent now closes by explicitly naming the next `@agent` based on `project_type` + `classification`, using the exact `@name` format so AI clients (Codex, Claude Code, Gemini) can trigger it.
- `@setup` pt-BR/es/fr/en locales — spec.md skip hint for `project_type=site` + MICRO classification.

### Changed
- `@ux-ui` Step 0 (base + en/pt-BR/es/fr locales) — upgraded from "ask one question" to **HARD STOP blocking gate**: agent must not read files, write HTML/CSS, or proceed to Step 1 until user answers the visual style question.
- `@ux-ui` Landing page mode (base + all locales) — added **Hero Law** constraint and **Mandatory Wow Techniques** section explicitly referencing the three required animations.
- `@ux-ui` es/fr locales — **full rewrite** to match the updated base agent: added Step 0 (visual style intake), landing page mode, hero law, mandatory wow techniques, full output contract.

## [0.1.16] - 2026-03-03
### Added
- `template/.aioson/skills/static/static-html-patterns.md`: new **Section 14 — Premium Template Patterns (Aigocy-style)** with 10 production patterns extracted from a real AI-agency landing page (ThemeForest #61450410):
  - **14a. effectFade animations**: `fadeUp` and `fadeRotateX` (3D perspective entrance) with `data-delay` stagger pattern for GSAP
  - **14b. Infinite logo marquee**: CSS-only `@keyframes infiniteSlide` with auto-clone JS and hover-pause for accessibility
  - **14c. SVG animated paths**: SMIL `<animateMotion>` hub-and-spoke diagram connecting icons to a center product image
  - **14d. Scroll-to-top with circular progress**: CSS `stroke-dashoffset` progress ring updated by scroll JS
  - **14e. Split Swiper**: synchronized text + image sliders with `effect: 'fade'` and `slideTo()` binding
  - **14f. Swiper progress bar navigation**: thin animated fill bar replacing pagination dots for portfolio sliders
  - **14g. box-white / box-black section alternation**: CSS pseudo-element radial glow replacing decorative PNG images
  - **14h. Accordion FAQ**: native `<details>`/`<summary>` version with `rotate(45deg)` icon transition
  - **14i. Footer with watermark background logo**: faded brand name in `position: absolute` behind 3-column dense footer
  - **14j. Canvas cursor trail**: fading dot trail on `mousemove`, skipped on touch devices and `prefers-reduced-motion`
- Section 13 pre-delivery checklist: added "No placeholder text remains" item

### Changed
- `@setup` agent output template (`aioson_version`) bumped to `0.1.16` across all locales (en, pt-BR, es, fr) and base agent file

## [0.1.12] - 2026-03-02
### Added
- New static skill: `template/.aioson/skills/static/interface-design.md` — a comprehensive UI/UX craft guide derived from the interface-design project, covering: Intent-First Framework (3 mandatory questions before any layout), Domain Exploration (4 required outputs: domain concepts, color world, signature element, defaults to avoid), 6 design directions with full token specs (Precision & Density, Warmth & Approachability, Data & Analysis, Editorial, Commerce, Minimal & Calm), complete token architecture (foreground/background/border/brand/semantic roles), depth strategy (commit to ONE), component state matrix, 4 quality checks (swap/squint/signature/token tests), self-critique process (composition → craft → content → structure).
- Portuguese documentation at `docs/pt/`:
  - `README.md`: index linking all guides.
  - `inicio-rapido.md`: quick start with install commands, classification scoring, and 3-command setup.
  - `agentes.md`: per-agent reference with when-to-use, activation command, what it delivers, and concrete examples.
  - `cenarios.md`: 4 complete worked examples — MICRO (landing page), SMALL (Laravel clinic API with @analyst output, @architect folder structure, @dev code), MEDIUM (Next.js SaaS with 3-lane parallel orchestration), MEDIUM dApp (Ethereum NFT marketplace with Solidity contract example).
  - `web3.md`: Portuguese Web3 guide covering setup flags for Ethereum/Solana/Cardano, monorepo structure, per-agent Web3 conventions, and skill reference.

### Changed
- `@ux-ui` agent (base + all 4 locales: en/pt-BR/es/fr): mandatory pre-work now references `interface-design.md` skill, adds Intent-First step, Domain Exploration step (4 required outputs), single design direction declaration, 4 quality checks (swap/squint/signature/token tests), and self-critique gate before delivery. Output contract expanded with focal point, reading order, full state matrix, and handoff notes for signature visual moves.
- `workflow:plan` sequences corrected: `@ux-ui` now included in SMALL (`setup → analyst → architect → ux-ui → dev → qa`) and MEDIUM (`setup → analyst → architect → ux-ui → pm → orchestrator → dev → qa`), matching `config.md` and agent documentation.
- 13 static skills expanded from 5–7 stub lines to 200–337 lines of production-grade, code-first references:
  - `laravel-conventions`: controllers as orchestrators, Form Requests, Actions, Policies, Events+queued Listeners, Jobs, API Resources, N+1 prevention, Model conventions, Migrations, Pest tests.
  - `tall-stack-patterns`: Livewire lifecycle + real-time validation, inter-component events, lazy loading, Alpine.js scope rules, Tailwind design system discipline, full Flux UI examples (button/modal/table/dropdown/sidebar).
  - `filament-patterns`: Resource structure (form/table/filters/actions), custom Pages, Stats Widgets, Relation Managers, policy enforcement, advanced form fields (repeater, conditional, file upload), business logic delegation.
  - `flux-ui-components`: full component inventory, buttons (all variants + loading states), form field group, modal with programmatic control, dropdown menus, table with sort + empty state, badges, sidebar navigation.
  - `jetstream-setup`: Inertia vs Blade decision matrix, Teams with roles/permissions, API tokens, profile customization, 2FA, password confirmation middleware, post-install checklist.
  - `git-conventions`: full Conventional Commits spec with type table + examples, Git Flow vs GitHub Flow, branch naming, PR template, tagging, protected history rules.
  - `nextjs-patterns`: Server vs Client mental model, App Router structure, async Server Components, Server Actions with Zod, Client Components (when/why), Route Handlers for webhooks only, metadata/SEO, loading.tsx + error.tsx.
  - `node-express-patterns`: layered architecture (routes/controllers/services/repositories), Zod validation middleware, typed auth + role checking, AppError class hierarchy, centralized error handler, rate limiting, graceful shutdown.
  - `node-typescript-patterns`: strict tsconfig baseline, Zod at all external boundaries, env validation at startup, branded domain types for IDs, const-object enums, repository interface pattern, explicit return types, asyncHandler.
  - `rails-conventions`: Service Objects with Result type, model scopes/enums/validations, Active Record N+1 prevention, async Jobs with retry, Mailer patterns, serializers, Pundit authorization, RSpec request + unit specs.
  - `web3-ethereum-patterns`: CEI pattern, ReentrancyGuard, pull over push, AccessControl roles, gas optimization (struct packing, custom errors), Hardhat test patterns with loadFixture, wagmi v2 frontend integration, deployment scripts.
  - `web3-solana-patterns`: eUTxO/account model, Anchor program structure, account data with LEN, PDA seeds + bump storage, CPI signing, Anchor constraints, compute budget management, full Anchor test suite.
  - `web3-cardano-patterns`: eUTxO mental model, Aiken project structure, datum/redeemer type design, spending validator, minting policy, Aiken tests, off-chain with Lucid, datum versioning strategy, deployment checklist.
  - `web3-security-checklist`: 7 critical vulnerabilities with code examples (reentrancy, access control, integer overflow, oracle manipulation, flash loans, front-running, signature replay), pre-deployment checklist (static analysis/fuzzing/invariant tests/multisig/timelock), emergency response protocol.

### Fixed
- `workflow:plan` was silently omitting `@ux-ui` from SMALL and MEDIUM sequences despite `config.md` and all agent documentation specifying it as a required step. Fixed in `src/commands/workflow-plan.js` and updated `tests/workflow-plan.test.js`.

## [0.1.11] - 2026-03-02
### Added
- Agent prompt enrichment across all 8 agents:
  - `@analyst`: 6 concrete Phase 1 discovery questions, entity deep-dive example (scheduling system), field-level table format for Phase 3, `Visual references` and `Risks identified` output sections, responsibility boundary note.
  - `@architect`: concrete folder/module structure trees for MICRO/SMALL/MEDIUM across Laravel (TALL), Node/Express, Next.js (App Router), and dApp (Hardhat/Foundry/Anchor) stacks.
  - `@pm`: explicit 2-page golden rule with cut-ruthlessly instruction, when-to-use guidance (SMALL/MEDIUM only, skip MICRO), exact `prd.md` section template.
  - `@dev`: Laravel ALWAYS/NEVER convention list (Form Requests, Actions, Policies, Events+Listeners, Jobs, Resources, N+1 prevention), UI/UX conventions, Web3 guards for dApp projects, semantic commit format with examples, responsibility boundary note.
  - `@orchestrator`: MEDIUM-only activation condition with early exit, 4-step orchestration process, dependency graph example, parallel vs sequential classification rules, `agent-N.status.md` and `shared-decisions.md` status file protocol.
  - `@setup`: explicit `framework_installed` contract semantics (true/false downstream behavior), monorepo detection guidance for mixed Web3 + backend repos.
  - `@ux-ui` and `@qa`: no structural changes (already complete).
- All 8 locale packs (`en`, `pt-BR`, `es`, `fr`) synchronized with enriched agent content.
- `isMonorepoDetection()` in `src/detector.js`: returns `true` when a Web3 framework and a backend or frontend framework coexist in the same directory.
- Monorepo detection note propagated to `setup:context` output (localized via `note_monorepo` key in all 4 i18n message files).
- `note_monorepo` i18n key added to `en`, `pt-BR`, `es`, and `fr` message dictionaries.
- 4 new tests for `isMonorepoDetection` in `tests/detector.test.js`.

### Changed
- `setup:context` now prepends a localized monorepo warning note when Web3 and application framework signals coexist in the project directory.
- `template/.aioson/config.md` context contract updated with explicit `framework_installed` semantics.
- `aioson_version` example in `@setup` output template corrected from `0.1.8` to `0.1.10`.
- `tests/agent-contracts.test.js` updated to reflect new `@dev` section names (`Laravel conventions`, `Responsibility boundary`).

### Added
- Full `pt-BR` CLI dictionary at `src/i18n/messages/pt-BR.js`.
- Localized agent prompt packs for:
  - `es` at `template/.aioson/locales/es/agents/*.md`
  - `fr` at `template/.aioson/locales/fr/agents/*.md`
- New `@ux-ui` agent contract and template set:
  - `.aioson/agents/ux-ui.md`
  - `.aioson/locales/{en,pt-BR,es,fr}/agents/ux-ui.md`
  - `.gemini/commands/aios-ux-ui.toml`
- Legacy framework detection support:
  - `CodeIgniter 3`
  - `CodeIgniter 4`
- New package installation validation command:
  - `aioson test:package [source-path] [--keep] [--dry-run] [--json]`
- New workflow planning command:
  - `aioson workflow:plan [path] [--classification=MICRO|SMALL|MEDIUM] [--json]`
- `mcp:init` tool presets generation under `.aioson/mcp/presets/`:
  - `claude.json`
  - `codex.json`
  - `gemini.json`
  - `opencode.json`
- New MCP validation command:
  - `aioson mcp:doctor [path] [--strict-env] [--json]`
- New parallel orchestration bootstrap command:
  - `aioson parallel:init [path] [--workers=2..6] [--force] [--dry-run] [--json]`
- New parallel diagnosis/remediation command:
  - `aioson parallel:doctor [path] [--workers=2..6] [--fix] [--force] [--dry-run] [--json]`
- New parallel scope assignment command:
  - `aioson parallel:assign [path] [--source=auto|prd|architecture|discovery|<file>] [--workers=2..6] [--force] [--dry-run] [--json]`
- New parallel consolidated status command:
  - `aioson parallel:status [path] [--json]`
- Optional `mcp:init` tool filter:
  - `--tool=claude|codex|gemini|opencode`
- `test:smoke` mixed monorepo profile:
  - `--profile=mixed` for combined Web2 + Web3 workspace validation
- `test:smoke` parallel orchestration profile:
  - `--profile=parallel` to validate `parallel:init/assign/status/doctor` in one flow
- Formal JSON schema documentation for automation:
  - `docs/en/json-schemas.md`
  - `docs/en/schemas/index.json`
  - `docs/en/schemas/*.schema.json` for each JSON command contract
  - includes `docs/en/schemas/mcp-doctor.schema.json`
  - includes `docs/en/schemas/parallel-init.schema.json`
  - includes `docs/en/schemas/parallel-doctor.schema.json`
  - includes `docs/en/schemas/parallel-assign.schema.json`
  - includes `docs/en/schemas/parallel-status.schema.json`

### Changed
- Version resolution is now centralized via `src/version.js` and shared across `info`, `setup:context`, and installer metadata generation.
- Removed remaining hardcoded `0.1.8` fallback in `setup:context` version assignment.
- Locale resolution now supports canonical fallback for Portuguese:
  - `pt-BR` -> `pt-br`
  - `pt_br` -> `pt-br`
  - `pt` -> `pt-br`
- Locale resolution now also supports regional fallback for:
  - `es-*` -> `es`
  - `fr-*` -> `fr`
- Agent locale resolution now supports:
  - `es-*` -> `es`
  - `fr-*` -> `fr`
- `update` now reapplies active agent prompts from `conversation_language` in context, preventing locale reset after template refresh.
- `mcp:init` now writes both shared plan and tool-specific preset templates.
- `mcp:init` Context7/Database presets now default to remote-endpoint bridge templates (`mcp-remote`) with URL env vars instead of generic command placeholders.
- `mcp:init` invalid `--tool` errors are now localized via i18n dictionaries.
- `mcp:doctor` human-readable check messages and summary are now fully localized.
- `workflow:plan` advisory notes are now localized from i18n keys instead of hardcoded English.
- `setup:context` onboarding notes are now localized (including beginner recommendation notes and stack-option notes).
- `test:package` failure messages are now localized via i18n dictionaries.
- `parallel:doctor` check/hint messages are now fully localized (including severity labels).
- Internal validation failures inside `test:smoke` are now localized instead of hardcoded English.
- `parallel:status` human-readable status rows and lane summaries are now localized (including status labels).
- `mcp:doctor` severity prefixes are now localized per locale (`OK/WARN/FAIL` equivalents).
- `test:package` now localizes fallback command failure detail when stderr/stdout are empty.
- `parallel:assign` lane scope summary lines are now localized in human-readable output.
- Parallel commands now localize fallback `unknown` classification labels in human-readable errors.
- `mcp:init` now avoids hardcoded fallback text for invalid `--tool` and uses i18n-backed messaging.
- `mcp:init` now localizes generated server `reason` fields and preset `notes` content via i18n.
- Removed remaining hardcoded `unknown` fallbacks in `parallel:doctor` check messages and `context:validate` parse-reason output.
- `context:validate` now localizes known frontmatter parse reason codes into human-readable locale messages.
- `mcp:doctor` now localizes context frontmatter parse reason codes using the same i18n mapping as `context:validate`.
- Standardized localized line formatting for `agents`, `locale:apply`, `workflow:plan`, and `parallel:init` human-readable listings.
- Localized diagnostic line wrappers for `mcp:doctor` and `parallel:doctor` checks/hints, plus `context:validate` issue list rows.
- Localized diagnostic/action wrapper lines in `doctor` command output (checks, hints, fix actions, and detail lines).
- `cli` help and unknown-command wrapper lines are now localized via i18n keys instead of inline formatting.
- `init` and `install` now print explicit multi-IDE onboarding hints (`agents` + `agent:prompt setup`) with optional `--tool=codex|claude|gemini|opencode` guidance.
- Agent flow now supports explicit UI/UX handoff:
  - `@architect` may hand off key screens/component constraints to `@ux-ui`
  - `@dev` now consumes `.aioson/context/ui-spec.md` when present
  - `SMALL`/`MEDIUM` default sequence includes `@ux-ui`
- `doctor` now enforces multi-IDE gateway contracts (Claude/Codex/Gemini/OpenCode) and validates required Gemini/OpenCode files.
- `doctor` now also validates each Gemini command file (`.gemini/commands/aios-*.toml`) maps to the expected shared agent instruction file.
- `doctor --fix` now restores broken gateway contract files (Claude/Codex/Gemini/OpenCode + Gemini command mappings) from template in safe mode.
- `update` now supports `--lang=en|pt-BR|es|fr` (and `--language`) to force localized agent-pack sync during update, including dry-run planning.
- `--json` output mode now supports `init`, `install`, and `update` with clean machine-readable payloads (no mixed human logs).
- `--json` output mode now also supports `agents`, `agent:prompt`, `locale:apply`, `setup:context`, and `i18n:add`.
- JSON payloads for `init/install/update/agents/agent:prompt/locale:apply/setup:context/i18n:add` now include stable `ok` and command context fields.
- JSON schema catalog expanded with formal contracts for:
  - `init`
  - `install`
  - `update`
  - `agents`
  - `agent:prompt`
  - `locale:apply`
  - `setup:context`
  - `i18n:add`
- `init` and `install` now support `--lang=en|pt-BR|es|fr` to auto-apply localized agent packs during bootstrap.
- Setup templates now default `aioson_version` to `0.1.8`.
- `ui-ux-modern` static skill was expanded to a production-ready checklist with token, state, accessibility, responsive, and handoff guidance.
- Developer onboarding now handles `Other` backend/frontend choices as true free-text custom values (legacy/custom stacks).
- Expanded automated coverage:
  - `tests/i18n-cli.test.js`
  - `tests/init-install-guidance.test.js`
  - `tests/prompt-tool.test.js`
  - `tests/init-install-guidance.test.js` now validates locale pack auto-apply on `init/install --lang`
  - `tests/version.test.js`
  - `tests/update.test.js` now covers `--lang` override and dry-run locale sync planning
  - `tests/json-output.test.js` now covers `init/install/update --json`
  - `tests/json-output.test.js` now covers `agents/agent:prompt/locale:apply/setup:context/i18n:add --json`
  - `tests/json-schema-files.test.js` now validates expanded schema catalog
  - `tests/locales.test.js`
  - `tests/agent-contracts.test.js`
  - `tests/smoke.test.js` now verifies active agent prompt locale application for `--lang=es` and `--lang=fr`
  - `tests/mcp-doctor.test.js`
  - `tests/mcp-init.test.js` now covers invalid `--tool` handling
  - `tests/setup-context.test.js` now validates localized onboarding notes
  - `tests/parallel-doctor.test.js` now validates localized check messages
  - `tests/parallel-init.test.js`
  - `tests/parallel-doctor.test.js`
  - `tests/parallel-assign.test.js`
  - `tests/parallel-status.test.js`
  - `tests/json-output.test.js` now covers `mcp:doctor --json`
  - `tests/package-test.test.js`
  - `tests/workflow-plan.test.js`
  - extended `tests/mcp-init.test.js` and `tests/json-output.test.js`
  - smoke JSON e2e checks for `--locale=es` and `--locale=fr`
  - smoke coverage for `--profile=parallel`

## [0.1.7] - 2026-03-01
### Added
- JSON output mode (`--json`) for:
  - `aioson info`
  - `aioson doctor`
  - `aioson context:validate`
  - `aioson test:smoke`
- New JSON output test suite: `tests/json-output.test.js`.

### Changed
- CLI now returns structured JSON errors for unknown commands and runtime failures when `--json` is enabled.
- `setup:context` and setup templates now default `aioson_version` to `0.1.7`.

## [0.1.6] - 2026-03-01
### Added
- `test:smoke` now supports chain-specific Web3 profiles:
  - `--web3=ethereum`
  - `--web3=solana`
  - `--web3=cardano`
- Web3 smoke workflow now verifies:
  - framework detection per chain profile
  - `project.context.md` dApp/Web3 frontmatter consistency.

### Changed
- CLI help and docs updated for `test:smoke --web3`.
- `setup:context` and setup templates now default `aioson_version` to `0.1.6`.

## [0.1.5] - 2026-03-01
### Added
- Web3 framework detection:
  - Ethereum: `Hardhat`, `Foundry`, `Truffle`
  - Solana: `Anchor`, `Solana Web3`
  - Cardano: `Cardano` (Aiken/Cardano SDK signals)
- New Web3 skill templates:
  - static: `web3-ethereum-patterns`, `web3-solana-patterns`, `web3-cardano-patterns`, `web3-security-checklist`, `node-typescript-patterns`
  - dynamic: `ethereum-docs`, `solana-docs`, `cardano-docs`
- New documentation page: `docs/en/web3.md`.

### Changed
- `project_type` now accepts `dapp`.
- `setup:context` now supports Web3 context fields (`web3_enabled`, `web3_networks`, `contract_framework`, `wallet_provider`, `indexer`, `rpc_provider`).
- `setup:context` and setup templates now default `aioson_version` to `0.1.5`.

## [0.1.4] - 2026-03-01
### Added
- New command:
  - `aioson test:smoke [workspace-path] [--lang=en|pt-BR] [--keep]`
- New smoke test suite: `tests/smoke.test.js`.

### Changed
- `doctor` now supports safe remediation mode:
  - `aioson doctor --fix`
  - `aioson doctor --fix --dry-run`
- `setup:context` and setup templates now default `aioson_version` to `0.1.4`.

## [0.1.3] - 2026-03-01
### Added
- Localized agent prompt packs:
  - `.aioson/locales/en/agents/*.md`
  - `.aioson/locales/pt-BR/agents/*.md`
- New command:
  - `aioson locale:apply [path] [--lang=en|pt-BR] [--dry-run]`
- Agent path resolution now supports locale-aware prompts with fallback to active agent paths.
- New locale test suite: `tests/locales.test.js`.

### Changed
- `setup:context` now applies localized agent prompts based on `conversation_language`.
- Documentation updated for locale pack workflow.

## [0.1.2] - 2026-03-01
### Added
- New commands:
  - `aioson agents`
  - `aioson agent:prompt <agent> [--tool=...]`
  - `aioson context:validate [path]`
  - `aioson setup:context [path]` (interactive or defaults mode)
- New modules:
  - `src/context.js` for frontmatter parsing and context contract validation
  - `src/agents.js` for agent metadata and prompt generation
  - `src/context-writer.js` for context rendering and classification scoring
- New test suites:
  - `tests/context.test.js`
  - `tests/agents.test.js`
  - `tests/context-writer.test.js`

### Changed
- `doctor` now validates `project.context.md` frontmatter and required fields, including `conversation_language` format.

## [0.1.1] - 2026-03-01
### Changed
- Converted remaining template files to English (`.aioson` agents/config and Gemini command descriptions).
- Hardened `@setup` instructions to prevent silent defaults for `project_type`, `profile`, `classification`, and language.
- Added explicit `conversation_language` to context contract so agent interaction language can be enforced.

## [0.1.0] - 2026-03-01
### Added
- Initial CLI commands: init, install, update, info, doctor
- Multi-IDE template gateways (Claude, Codex, Gemini, OpenCode)
- Framework detector and installer/updater core
- i18n message system with English default
- Automated tests for detector, installer, doctor, i18n
- `i18n:add <locale>` command to scaffold new locale dictionaries
- GitHub Actions CI and tag-based npm release workflows

### Changed
- Project-facing content standardized to English
- CLI i18n upgraded with dynamic locale loading and fallback behavior
