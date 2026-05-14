---
gate_execution: approved
feature: deyvin-subtask-scout
status: in_progress
started: 2026-05-13
classification: SMALL
sources:
  - prd: .aioson/context/prd-deyvin-subtask-scout.md
  - sheldon: .aioson/context/sheldon-enrichment-deyvin-subtask-scout.md
  - manifest: .aioson/plans/deyvin-subtask-scout/manifest.md
  - requirements: .aioson/context/requirements-deyvin-subtask-scout.md
---

# Spec — deyvin-subtask-scout

## What was built

- **Phase 1 (`core-engine`) — done 2026-05-13** — `src/sub-task-schemas.js` (3 schemas: INPUT/OUTPUT/CONFIG, plain JS objects, ~150 LOC) + `src/sub-task-engine.js` (8 exports, hand-rolled recursive validator, ~330 LOC) + `tests/sub-task-engine.test.js` (51 cases). Tests: **51/51 pass**. Zero new deps. All 7 ACs (E1-E7) green.
- **Phase 2 (`cli-verbs`) — done 2026-05-13** — `src/sub-task-state.js` (state file + lock, ~140 LOC), `src/commands/scout-prep.js` (~170 LOC), `src/commands/scout-validate.js` (~110 LOC), `src/commands/scout-commit.js` (~140 LOC), `template/.aioson/config/scout-engine.json` (empty `{}` to keep defaults active), `tests/scout-cli.test.js` (10 spawn-based integration cases). `src/cli.js` extended with 3 new commands. Tests: **10/10 CLI + 61/61 scout total + 2238/2275 full regression** (same 37 pre-existing failures). All 9 ACs (C1-C9) green.
- **Phase 3 (`wiring-and-lifecycle`) — done 2026-05-13** — `.aioson/agents/deyvin.md` + template byte-identical (rubric line + new "Sub-task scout invocation" section with CLI + CLI-less subsections per-harness; final size 13611 bytes under 15360 budget). `src/dossier/scout-section.js` (idempotent dossier auto-append). `src/commands/feature-close.js` extended with `archiveScoutsForFeature` hook (copies attached scouts to `.aioson/context/features/{slug}/scouts/`, appends dossier line, emits `archived_on_close` telemetry, idempotent on re-close). `src/commands/memory.js` extended with `collectScoutSummary` + new "Scouts dispatched" row (always present; queries `agent_events WHERE event_type='sub_task'`). `src/doctor.js` extended with `assessScoutPruning` advisory check + `--fix` deletion (attached scouts NEVER pruned). `src/i18n/messages/en.js` extended with 3 keys for the new doctor advisory. Tests: 3 new files, **19/19 pass** (deyvin-scout-wiring + scout-section + feature-close-scouts-archival). All 8 ACs (W1-W8) green. **Full regression post-Phase 3: 2257/2294 pass; same 37 pre-existing failures preserved. Zero new regressions.** **Feature complete.**

## Feature complete — 2026-05-13

All 3 phases done. 80 new scout-related tests across 4 files (sub-task-engine 51 + scout-cli 10 + deyvin-scout-wiring 8 + scout-section 8 + feature-close-scouts-archival 3 = 80). 24 phase ACs all green. 14 manifest pre-made decisions honored. 5 deferred decisions resolved during analyst phase. 6 tactical decisions taken during dev phases (documented below). Ready for `@qa` Gate D.

## Entities added

File-system entities only (no DB tables). Full field-level definition in `requirements-deyvin-subtask-scout.md > ## New entities`.

| # | Entity | Persisted at | Created by |
|---|--------|--------------|-----------|
| 1 | `ScoutReport` | `.aioson/runtime/scouts/{id}.json` (ephemeral) → `.aioson/context/features/{slug}/scouts/{id}.json` (archive) | sub-agent → `scout:commit` → `feature:close` |
| 2 | `ScoutInput` | (not persisted — CLI args) | parent agent |
| 3 | `ScoutState` | `.aioson/runtime/scouts/.state.json` | `scout:prep` (auto-init) |
| 4 | `ScoutConfig` | `.aioson/config/scout-engine.json` (optional override) | user (manual) |
| 5 | `ScoutDossierEntry` | `.aioson/context/features/{slug}/dossier.md` (appended) | `feature:close` archival hook |
| 6 | `ScoutTelemetryEvent` | `agent_events` SQLite table (existing) | `runtime:emit type=sub_task` |

## Key decisions

- **2026-05-13** [@product] **Scope V1 = `@deyvin` only** — `parent_agent` parameter exists but only `"deyvin"` is whitelisted. Multi-agent expansion is V2.
- **2026-05-13** [@product] **Execution model = aioson contract layer + harness sub-agent** — same pattern as `harness:validate` and `memory:reflect-prepare/commit`. Aioson does not spawn sub-agents directly; the harness (Claude Code Agent tool, Codex MultiAgentV2) does.
- **2026-05-13** [@sheldon] **Hand-rolled JSON validator (zero new deps)** — `package.json` keeps single dep `better-sqlite3`. `ajv` deferred to V2 if schema grows.
- **2026-05-13** [@sheldon] **CLI-less fallback embedded in `deyvin.md`** — closes sheldon-005 (q=4). Downstream adopters in plain Claude Code without `aioson` installed can still dispatch scouts (degrades silently: no telemetry, no caps, no archival).
- **2026-05-13** [@sheldon] **`parent_session_excerpt` required field (50-1000 chars)** — closes the cold-load comprehension gap. Future agents reading archived scouts in isolation can reconstruct intent.
- **2026-05-13** [@sheldon] **Nautilus pattern on sub-agent: `tools: [Read, Grep]`, `disallowedTools: [Bash, Edit, Write]`** — read-only enforced via prompt template AND (where supported) harness config.
- **2026-05-13** [@sheldon] **Lifecycle: 90-day prune for unattached + permanent archival for attached** — raised from initial 30-day default for cold-load memory preservation.
- **2026-05-13** [@sheldon] **Dossier auto-append mandatory on archival** — promoted from Should-have to Must-have. Aligns with `agent-chain-continuity` (closed 2026-05-07) dossier-as-cold-load-entry convention.
- **2026-05-13** [@sheldon] **`memory:summary` integration mandatory** — promoted to Must-have. Without scout count visibility in `memory:summary`, scouts are invisible to cold-load agent bootstrap.
- **2026-05-13** [@analyst] **`parent_session_excerpt` block at `scout:prep` if missing** — Open Question resolved as BLOCK, not WARN. The field is the feature's central value prop.
- **2026-05-13** [@analyst] **Sub-agent timeout: trust harness + observability emission** — aioson does NOT enforce wall-clock. If `completed_at - prep_at > 300s` (configurable), emit `runtime:emit type=sub_task action=slow_completion`. Tunable via `slow_completion_warn_seconds`.
- **2026-05-13** [@analyst] **File lock: simple `.state.json.lock` with PID + ISO timestamp, stale 30s** — race-tolerant for V1 single-user scenarios.
- **2026-05-13** [@analyst] **Prune mechanism: `aioson doctor --fix` ONLY** — no `workflow:next` startup hook (would slow every command).
- **2026-05-13** [@analyst] **Per-harness invocation block inline in `deyvin.md`** — Claude Code Agent tool + Codex MultiAgentV2 documented; Gemini/OpenCode emit `harness_unsupported` and trigger CLI-less inline survey fallback.
- **2026-05-13** [@analyst] **Telemetry table = existing `agent_events`** — no schema migration; `event_type='sub_task'` just becomes a new value (column is free-form `TEXT`).
- **2026-05-13** [@analyst] **Scout id format greppable per feature** — `scout-{slug}-{YYYY-MM-DD}-{rand6}` when `feature_slug` set; else `scout-{YYYY-MM-DD}-{rand6}`.
- **2026-05-13** [@dev] **Schemas in separate file (`src/sub-task-schemas.js`)** — kept separate per spec.md pending-items default. ~150 LOC; clean diff-readability boundary.
- **2026-05-13** [@dev] **`buildPrompt(input, options)` two-arg signature** — `expected_output_path` is a runtime concern (CLI wrapper supplies after path resolution), not a user input field. Avoids polluting `INPUT_SCHEMA` with implementation details. Test `buildPrompt — uses options.expected_output_path` covers both signatures.
- **2026-05-13** [@dev] **`enforceCaps` action shapes**: `{kind: 'prep'|'commit'|'validate', parent_session_id, [scope_size], [scout_id], [config], [max_files_override]}`. Engine mutates state in-place AND returns it for caller convenience. Cap arrows: `prep` increments `scouts_in_session`; `commit` decrements (clamped to 0); `validate` increments `retries_by_id[id]` until `max_retries_on_malformed_json` hit, then `retry_exhausted`.
- **2026-05-13** [@dev] **`commit` does not require config** — decrement-only operation, no policy checks needed. Saves callers from threading config through commit path.
- **2026-05-13** [@dev] **`additionalProperties: false` enforced on INPUT_SCHEMA, OUTPUT_SCHEMA, CONFIG_SCHEMA, and nested objects (scope, finding, error_entry, next_scout)** — strict-by-default. Any unknown key surfaces as `{field: <key>, reason: 'unknown key'}`. BR-11 satisfied with zero special-case code.
- **2026-05-13** [@dev] **Recursive validator in single function `validateValue(value, node, pathStack)`** — ~80 LOC, dispatches on `node.type` (string/integer/enum/array/object). No external lib. Tested via 18 negative cases across the 4 validators (validateInput/Output/Config + buildPrompt's input check).
- **2026-05-13** [@dev — Phase 2] **Extra module `src/sub-task-state.js` for state file + locking** — keeps the 3 CLI commands focused. `withLock(rootDir, scoutDir, mutator)` is the synchronous helper that acquire-read-mutate-write-release in one call. Lock file is `.state.json.lock` (PID + ISO), stale at 30s, retry every 100ms with 30s deadline. Single-user / single-machine V1.
- **2026-05-13** [@dev — Phase 2] **`scope_globs` deferred to V2** — Node 18-21 lacks built-in `fs.glob`. Adding a glob dep would violate the zero-deps philosophy committed in Phase 1. CLI returns `error.code = "globs_not_implemented_v1"` if `--scope-globs` is passed. Spec already documents `scope_paths` accepting directory paths (which expand to direct file children, one level), covering most practical V1 use cases. AC EC-01 unchanged: scope_paths empty AND scope_globs empty → input_invalid.
- **2026-05-13** [@dev — Phase 2] **`cli.js` exit-code propagation only fires under `--json`** — discovered during integration tests: `cli.js:1401-1408` wraps both `writeJson(result)` and `process.exitCode = result.exitCode` inside `if (jsonMode)`. Without `--json`, exit code stays 0 even when result.exitCode=2. Tests use `--json` explicitly (matches existing CLI test convention). Not fixed at cli.js level — semantic change with broader blast radius; documented for future hardening pass.
- **2026-05-13** [@dev — Phase 2] **`template/.aioson/config/scout-engine.json` ships as `{}`** — first draft included `_doc`/`_defaults`/`_usage` underscore-prefixed documentation keys, but `validateConfig` strict-mode rejects unknown keys (BR-11). Empty `{}` ships safely via `aioson update` to all downstream projects (no risk of breaking their config on update). Documentation lives in requirements + spec, not in the file itself.
- **2026-05-13** [@dev — Phase 2] **`runtime:emit type=sub_task` reuses `logAgentEvent(db, runtimeDir, {agentName, message, type, meta})` helper** from `src/runtime-store.js` — same pattern as `memory-reflect-prepare/commit`. Zero schema migration; events land in existing `agent_events` table with `event_type='sub_task'`. Telemetry is best-effort (try/catch around the emit call) — never fails the CLI command.
- **2026-05-13** [@dev — Phase 2] **`scout:commit` is idempotent on re-commit** — checks `fs.existsSync(target)` before writing; returns `{committed: false, reason: 'already_exists'}` if file exists. Caller can safely retry. Phase 3 `feature:close` will rely on this when re-archiving on re-close.
- **2026-05-13** [@dev — Phase 3] **`src/dossier/scout-section.js` as small standalone module** — kept the dossier auto-append helper out of the larger `src/dossier/store.js` to minimize blast radius on existing dossier logic. Exports `appendScoutToFeatureDossier`, `buildBullet`, `ensureSectionAndAppend`, `SECTION_HEADING`. Pure string manipulation + `fs.readFileSync`/`writeFileSync` (no async — called from `feature-close.js` which awaits the function).
- **2026-05-13** [@dev — Phase 3] **Bug found and fixed during testing: `firstSentence` regex was splitting on ANY period** — including the period in filenames like `workflow-next.js`. Fixed to require period followed by whitespace OR end-of-string (`/^([\s\S]*?\.)(?:\s|$)/`). Test case `buildBullet — formats id, question, first sentence...` caught it before merge. Logged as a discipline win for hand-rolled validators with adversarial test inputs.
- **2026-05-13** [@dev — Phase 3] **`feature:close` archival hook is read-only on runtime files** — copies `.aioson/runtime/scouts/{id}.json` to archive but does NOT delete the runtime copy. Pruning of runtime stays the responsibility of `aioson doctor --fix` (sheldon-005 separation: archival = data preservation; doctor = housekeeping). On re-close, archival simply overwrites archive file (same content) and dossier append is no-op (idempotent by id presence check).
- **2026-05-13** [@dev — Phase 3] **`memory:summary` always shows the Scouts dispatched row** — even when count=0. Future cold-load agents reading `aioson memory:summary --json` see the row exists, signalling that the scout layer is part of the system (not silently absent). The `topTopics` field is best-effort (extracted from `payload_json.question` if present); older events without `question` in payload contribute to the count but not topics.
- **2026-05-13** [@dev — Phase 3] **`assessScoutPruning` in doctor uses `loadScoutConfig`** to honor user override of `prune_unattached_after_days` — stale threshold tracks per-project config. Failures (e.g., bad config file) fall back to 90d default silently rather than blocking the doctor run. **Attached scouts are never pruned by doctor** even if older than the threshold — preservation of cold-load memory takes precedence over disk hygiene.
- **2026-05-13** [@dev — Phase 3] **i18n keys added only to `en.js`** — `pt-BR.js`, `es.js`, `fr.js` will fall back to en for the new keys. Translating to other locales is a follow-up for a future i18n pass; not blocking for V1 because the 3 affected message strings are advisory + administrator-facing.
- **2026-05-13** [@dev — corrections round 1, C-01 fix] **`scout:commit` idempotency now tracks committed scout ids in state, not file existence** — the documented happy path has the sub-agent writing the report to `output_path` BEFORE `scout:commit` runs, so the file already exists at the target on first commit. Old check (`fs.existsSync(targetPath)`) returned `committed:false, reason:"already_exists"` even on FIRST commit, breaking the cap counter and telemetry. New check: `state.sessions[sid].committed_ids[id]` is the truth source for "have I already committed this scout?". Reason renamed `'already_exists'` → `'already_committed'` for accuracy. State entity 3 (ScoutState) gained `committed_ids: {[id]:true}` field, initialized lazily.
- **2026-05-13** [@dev — corrections round 1, M-01 fix] **New `src/sub-task-telemetry.js` module bypasses `logAgentEvent`'s session lifecycle** — feature-close fires exactly one sub_task event per invocation; `logAgentEvent`'s startRun lifecycle would land it as `event_type='start'` with `payload_json=null`, invisible to `collectScoutSummary`'s `WHERE event_type='sub_task'` query. New helper `emitSubTaskEvent(rootPath, {message, parent_session_id, payload})` writes directly to `agent_events`. **FK constraint discovered:** `agent_events.run_key` is FK→`agent_runs.run_key`. Resolved with `ensureSubTaskAnchorRun(db)` that maintains a single sentinel `agent_runs` row (`run_key='sub-task-scout-anchor'`, agent_name='sub-task-scout') via `INSERT OR IGNORE`. Zero schema migration needed.
- **2026-05-13** [@dev — corrections round 1, L-01 fix] **`scope_paths` sandbox check in `resolveScope`** — added `isInsideRoot(absPath, rootDir)` check after `path.resolve`. Paths landing outside rootDir (e.g., `../../etc/passwd`) push to `rejected[]` with reason `'path_outside_root'`. CLI returns exit 2 `error.code='path_outside_root'` if any rejected. Defensive: directory enumeration also re-checks each child. Hardens the V1 surface against accidental + future API/MCP/webhook misuse.
- **2026-05-13** [@dev — corrections round 1, discovered] **`agent_events.run_key` is a FOREIGN KEY** to `agent_runs.run_key` with `db.pragma('foreign_keys = ON')` enforcement — discovered during M-01 hands-on verification. Initial direct insert without sentinel agent_runs row failed silently (best-effort try/catch swallowed `FOREIGN KEY constraint failed`). The sentinel-anchor pattern is the right fix for any future direct-insert telemetry. Documented for cross-feature reuse.

## Edge cases handled

All 16 cases EC-01 through EC-16 enumerated in `requirements-deyvin-subtask-scout.md > ## Edge cases`. Each maps to a phase AC for verification:
- EC-01, EC-02, EC-08, EC-09, EC-10 → Phase 2 ACs (CLI surface)
- EC-03, EC-04, EC-05, EC-12, EC-13, EC-14, EC-15 → Phase 1 ACs (engine validators)
- EC-06, EC-07, EC-11, EC-16 → Phase 3 ACs (lifecycle integration)

## Dependencies

**Reads:**
- `features.md` (active feature lookup at `scout:prep` time)
- `prd-{slug}.md` frontmatter (classification check, indirect via existing `feature:close` flow)
- `.aioson/config/scout-engine.json` (when present; falls back to defaults)
- Scope files passed in `scope_paths` / `scope_globs` (read by sub-agent inside its isolated context)

**Writes:**
- `.aioson/runtime/scouts/{id}.json` (per scout)
- `.aioson/runtime/scouts/.state.json` (cap state)
- `.aioson/context/features/{slug}/scouts/{id}.json` (archival on feature:close)
- `.aioson/context/features/{slug}/dossier.md` (append `## Sub-task scouts` section + bullets)
- `agent_events` SQLite table (telemetry rows)

**Modifies:**
- `.aioson/agents/deyvin.md` + `template/.aioson/agents/deyvin.md` (rubric line + new section, byte-identical)
- `src/cli.js` (register 3 new subcommands)
- `src/commands/feature-close.js` (extend with archival step)
- `src/commands/memory-summary.js` (add scout count row)
- `src/commands/doctor.js` (add `scouts_directory_pruning` advisory)
- `src/dossier.js` (or new helper — add `appendScoutToFeatureDossier`)

**Does NOT touch:**
- `runtime-store.js` schema (no migration)
- `package.json` deps (zero new deps)
- `workflow-next.js` (scouts are diagnostic, not workflow stages)
- Other agent prompts (only `deyvin.md`)

## Notes

### For @dev — implementation order

Follow phase dependency strictly: 1 → 2 → 3. Each phase ships as one or more commits and merges independently.

**Phase 1 (`core-engine`)** is pure logic — no CLI, no agent integration. Ship and commit before starting Phase 2 so engine tests are stable.

**Phase 2 (`cli-verbs`)** wraps the engine with CLI surface + state persistence. Integration tests use `child_process.spawnSync` against `node bin/aioson.js scout:* ...`. These tests are SLOW (~1s each); marking them OK as long as `npm test` still completes under 60s total.

**Phase 3 (`wiring-and-lifecycle`)** is the highest-risk phase because it touches existing files (`feature-close.js`, `memory-summary.js`, `doctor.js`, `deyvin.md`). Run regression tests after every file edit (`npm test`). Do NOT batch the deyvin.md changes with code changes — split into logical commits so any rollback surgical.

**Critical for cold-load value (per project memory philosophy):** every scout report archived to `.aioson/context/features/{slug}/scouts/{id}.json` is a permanent disk artifact future agents will read. The `parent_session_excerpt` and `recommendation` fields must be **agent-readable narratives**, not tool dumps. The prompt template (Phase 1) is what enforces this — invest in template quality.

### For @qa — review focus

- **Read-only sub-agent (BR-01)**: verify the prompt template explicitly forbids Bash/Edit/Write. Cross-check the deyvin.md invocation block enforces the same. This is the security-critical contract.
- **Cold-load comprehension test (BR-02 + cold-load value prop)**: open an archived scout JSON in isolation; can you reconstruct what was investigated and the recommended next step from `parent_session_excerpt` + `question` + `recommendation` alone? If no, the prompt template is too lax.
- **CLI-less fallback (sheldon-005)**: manual smoke test — temporarily rename `aioson` binary, activate `/deyvin`, confirm fallback section in `deyvin.md` produces a usable scout flow. This is hard to automate; budget time for human verification.
- **Workspace/template parity (sheldon-001)**: `Compare-Object` (PowerShell) or `diff -q` (bash) on `.aioson/agents/deyvin.md` and `template/.aioson/agents/deyvin.md` — must be byte-identical. Phase 3 AC W2.
- **Wiring audit (sheldon-006)**: don't trust "code compiles + tests pass" as done. Verify the rubric line in `deyvin.md` actually points to a working invocation, the `feature:close` step actually copies files, the `memory:summary` actually shows the new row. Hands-on verification, not just CI green.

### For cold-load future agents

This spec file is itself a cold-load artifact. The "Key decisions" section is append-only — future agents reading this should see the full decision history with attribution and rationale, not a flattened "current state" snapshot. When making new decisions during implementation, append; do not replace.

### Pending items for @dev to resolve

These items were intentionally left for implementation discovery:
- Exact API signature for `appendScoutToFeatureDossier` — read existing `src/dossier.js` first, follow established conventions
- Decision: keep `src/sub-task-schemas.js` separate or inline in `src/sub-task-engine.js`? Default: separate for diff-readability, but inline if total LOC < 300
- Decision: glob library — Node's built-in `fs.glob` (Node 22+) or existing aioson glob helper if present? Verify project's Node version target (`engines.node: ">=18.0.0"` per package.json — need a fallback for 18-21)
- Decision: `runtime:emit` exact CLI surface for sub_task events — invoke via existing CLI flow or call `runtime-store` helper directly? Mirror what `memory-reflect-commit` does

These are tactical decisions, not architectural. Record each as a new "Key decisions" line when made.

## QA Sign-off

- **Date:** 2026-05-14
- **Verdict:** PASS
- **Gate D (execution):** approved
