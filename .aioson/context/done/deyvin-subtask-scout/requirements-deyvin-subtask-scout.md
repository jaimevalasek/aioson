---
slug: deyvin-subtask-scout
classification: SMALL
created_at: 2026-05-13
created_by: analyst
sources:
  - .aioson/context/prd-deyvin-subtask-scout.md
  - .aioson/context/sheldon-enrichment-deyvin-subtask-scout.md
  - .aioson/plans/deyvin-subtask-scout/manifest.md
  - researchs/sub-agent-patterns-2026/summary.md
  - researchs/multi-agent-token-budget-2026/summary.md
---

# Requirements — deyvin-subtask-scout

## Feature summary

Sub-task scout primitive for `@deyvin`: dispatch context-isolated diagnostic surveys (>5 files / runtime-flow tracing) without burning parent context. Returns deterministic JSON findings persisted as **disk-first cold-load-readable memory**.

## New entities (file shapes — no DB tables)

This feature does not introduce DB tables. All entities are file artifacts (JSON/MD) and runtime state. The existing `agent_events` SQLite table is reused for telemetry.

### Entity 1 — `ScoutReport` (the central entity)

Persisted at `.aioson/runtime/scouts/{id}.json` (ephemeral) and copied to `.aioson/context/features/{slug}/scouts/{id}.json` on `feature:close` (permanent archive when `feature_slug` is set).

| Field | Type | Nullable | Constraints |
|-------|------|----------|-------------|
| `schema_version` | integer | no | const `1` (V1) |
| `id` | string | no | format: `scout-{slug}-{YYYY-MM-DD}-{rand6}` if `feature_slug` set; else `scout-{YYYY-MM-DD}-{rand6}`. `rand6` = 6 lowercase hex chars |
| `parent_agent` | string (enum) | no | V1: only `"deyvin"`. Engine accepts param but rejects unknowns |
| `parent_session_id` | string | no | harness-supplied; opaque to engine |
| `parent_session_excerpt` | string | **no (required)** | 50-1000 chars. WHY the scout was dispatched, written by parent at `scout:prep` time. **Block** at prep if missing or out of range |
| `feature_slug` | string | yes | when set, triggers permanent archival on `feature:close` |
| `question` | string | no | 10-500 chars. The sub-agent's investigative target |
| `scope` | object | no | `{paths: string[], globs: string[], exclude: string[], files_resolved: string[]}` |
| `completed_at` | ISO datetime | no | when sub-agent finished (set by sub-agent) |
| `status` | string (enum) | no | `success`, `partial`, `no_findings`, `error` |
| `confidence` | string (enum) | no | `low`, `medium`, `high` |
| `recommendation` | string | no | 30-1000 chars. Actionable, future-LLM-readable narrative |
| `findings` | array | no | each: `{file, line, evidence (≤200 chars), relevance (low|medium|high), explanation (20-300 chars)}`. May be empty if `status=no_findings` |
| `files_inspected` | array of strings | no | every file the sub-agent actually read (audit trail) |
| `next_scout_suggested` | object | yes | `{question, scope}` if sub-agent recommends a follow-up scout |
| `errors` | array | yes | populated only when `status=error`; each `{type, message}` |

### Entity 2 — `ScoutInput` (CLI input, never persisted)

Used by `aioson scout:prep`. Validated by `validateInput()`.

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `question` | string | yes | 10-500 chars |
| `scope_paths` | string[] | yes (or `scope_globs`) | non-empty if `scope_globs` empty |
| `scope_globs` | string[] | yes (or `scope_paths`) | non-empty if `scope_paths` empty |
| `scope_exclude` | string[] | no | defaults: `["**/node_modules/**", "**/.git/**"]` |
| `parent_agent` | string (enum) | yes | V1: `"deyvin"` only |
| `parent_session_id` | string | yes | opaque |
| `parent_session_excerpt` | string | **yes (block if missing)** | 50-1000 chars |
| `feature_slug` | string | no | active feature slug from `features.md` |
| `max_files_in_scope_override` | integer | no | per-call cap override; bounded to `[1, 200]` |

### Entity 3 — `ScoutState` (runtime cap tracking)

Persisted at `.aioson/runtime/scouts/.state.json`. Managed by CLI commands (not engine). File-locked via `.state.json.lock` (PID + ISO timestamp; stale >30s).

```json
{
  "schema_version": 1,
  "sessions": {
    "<parent_session_id>": {
      "scouts_in_session": 2,
      "started_at": "ISO",
      "last_prep_at": "ISO",
      "retries_by_id": { "scout-...": 1 }
    }
  }
}
```

Housekeeping: on every `scout:prep`, prune session entries where `scouts_in_session === 0` AND `started_at > 24h ago`.

### Entity 4 — `ScoutConfig` (user-tunable)

`.aioson/config/scout-engine.json`. All keys optional; defaults from `defaultConfig()`. Strict validation: unknown keys rejected.

| Key | Type | Default | Range | Notes |
|-----|------|---------|-------|-------|
| `max_scouts_per_session` | integer | 3 | [1, 100] | hard cap per parent session |
| `max_files_in_scope` | integer | 20 | [1, 500] | resolved file count after glob expansion |
| `max_retries_on_malformed_json` | integer | 1 | [0, 5] | `0` = no retry |
| `max_depth` | integer | 2 | [1, 5] | scout-spawned-scout depth limit |
| `scout_dir` | string | `.aioson/runtime/scouts` | non-empty path | relative to project root |
| `archive_root` | string | `.aioson/context/features` | non-empty path | for feature-attached archival |
| `prune_unattached_after_days` | integer | 90 | [7, 365] | unattached scout TTL |
| `slow_completion_warn_seconds` | integer | 300 | [10, 3600] | emits `slow_completion` warning if exceeded |

### Entity 5 — `ScoutDossierEntry` (auto-appended on archival)

Single bullet line appended to `.aioson/context/features/{slug}/dossier.md` under `## Sub-task scouts` heading:

```
- {scout.id}: {scout.question} → {scout.recommendation_first_line} (confidence: {scout.confidence}, {N} findings)
```

`recommendation_first_line` = first sentence of `recommendation` field, truncated at 200 chars with `…` if longer. `N findings` = `scout.findings.length`. Idempotent: if line containing `{scout.id}` already present, skip.

### Entity 6 — `ScoutTelemetryEvent` (SQLite row)

Reuses existing `agent_events` table. Inserted via `runtime:emit`:

| Column | Value |
|--------|-------|
| `run_key` | parent_session_id (foreign key into agent_runs if present; else opaque string) |
| `event_type` | `"sub_task"` |
| `message` | `<action>` (one of: `prepared`, `validated`, `committed`, `failed`, `cap_exceeded`, `slow_completion`, `archived_on_close`, `pruned`) |
| `payload_json` | JSON: `{id, action, feature_slug?, scope_size?, retry_count?, elapsed_ms?, error_code?}` |
| `created_at` | ISO datetime |

## Changes to existing entities

### `agent_events` table
No schema change. New `event_type` value `"sub_task"` (column is free-form `TEXT`, no enum constraint per `src/runtime-store.js:165-173`). Telemetry adds rows; query layer (`memory:summary`) extends to read them.

### `feature:close` command
New step inserted after existing artifact-move logic: copy `.aioson/runtime/scouts/{id}.json` → `.aioson/context/features/{slug}/scouts/{id}.json` for every scout where `feature_slug == closing_slug`; auto-append dossier; emit `runtime:emit type=sub_task action=archived_on_close`. Backwards-compatible: missing scouts dir = no-op.

### `aioson doctor` command
New advisory check `scouts_directory_pruning` (severity: `warning`). `--fix` deletes unattached scouts > `prune_unattached_after_days`. Attached scouts (with `feature_slug`) **never pruned by doctor**, regardless of age — only deleted manually.

### `aioson memory:summary` command
Adds row: `Scouts dispatched (last {N} sessions): {total_count} (top topics: {top-3-keywords})`. Derived from SQL on `agent_events WHERE event_type='sub_task' AND message IN ('committed', 'archived_on_close')`. Always present, even when count is 0.

### `.aioson/agents/deyvin.md` (workspace + template — sheldon-001 q=5)
- Rubric line 111 updated to reference `aioson scout:prep`.
- New section **"Sub-task scout invocation"** with **two subsections**: CLI path + CLI-less fallback. Per-harness invocation examples (Claude Code Agent tool, Codex MultiAgentV2) inline.
- Kernel size budget: ≤ 15360 bytes post-merge (currently ~9398B; estimated +3.5KB → ~12.9KB OK).

## Relationships

- `ScoutReport.parent_session_id` → `agent_runs.run_key` (loose foreign key when present; opaque otherwise)
- `ScoutReport.feature_slug` → `features.md` row → `.aioson/context/features/{slug}/dossier.md` (file path) → `## Sub-task scouts` section
- `ScoutTelemetryEvent.payload_json.id` → `ScoutReport.id` (referential integrity by convention; not DB-enforced)
- `ScoutState.sessions.{id}` → `ScoutReport.parent_session_id` (1-to-N)

## Migration order

No DB migrations. File system additions (idempotent, created on demand by callers):

1. `.aioson/runtime/scouts/` — created by first `scout:prep` invocation (`mkdir -p`)
2. `.aioson/runtime/scouts/.state.json` — created by first `scout:prep` (initialized as `{schema_version: 1, sessions: {}}`)
3. `.aioson/context/features/{slug}/scouts/` — created by `feature:close` when scouts attached
4. `template/.aioson/config/scout-engine.json` — distributed via `aioson update` (new file in template; user copies to `.aioson/config/` only if overriding defaults)

## Business rules

| ID | Rule | Enforced by |
|----|------|-------------|
| BR-01 | Sub-agent must operate read-only: `tools: [Read, Grep]`, `disallowedTools: [Bash, Edit, Write]`. Enforced via prompt template (Nautilus pattern, sheldon-003 q=5) AND harness-config when supported (Claude Code) | `buildPrompt()` in engine + deyvin.md invocation block |
| BR-02 | `parent_session_excerpt` is **required** at every `scout:prep` call. Missing or out-of-range → `error.code=input_invalid`, exit 2. **Never null, never warn-only** | `validateInput()` in engine + CLI surface |
| BR-03 | Scout id format: `scout-{slug}-{YYYY-MM-DD}-{rand6}` if `feature_slug` provided; else `scout-{YYYY-MM-DD}-{rand6}`. `rand6` = 6 lowercase hex chars (`crypto.randomBytes(3).toString('hex')`) | `generateScoutId()` in engine |
| BR-04 | Cap defaults applied unless overridden in `.aioson/config/scout-engine.json`. Unknown config keys → strict reject | `validateConfig()` + `loadConfig()` |
| BR-05 | `feature_slug` set at `scout:prep` triggers permanent archival on `feature:close` AND mandatory dossier append | `feature:close` extension in Phase 3 |
| BR-06 | Scouts unattached pruned after `prune_unattached_after_days` (default 90d) by `aioson doctor --fix`. Attached scouts NEVER pruned by doctor | `doctor` advisory + fix |
| BR-07 | Sub-agent timeout: aioson does NOT enforce. If `completed_at - prep_at > slow_completion_warn_seconds` (default 300s), emit `runtime:emit type=sub_task action=slow_completion` at `scout:commit` time | `scout:commit` |
| BR-08 | When CLI returns `error.code=harness_unsupported`, deyvin.md fallback runs inline survey (no scout, no telemetry, no archival). Documented behavior, not error | deyvin.md CLI-less section |
| BR-09 | Re-commit of same scout id is a no-op (idempotent). Returns `{committed: false, reason: "already_exists"}`, exit 0 | `scout:commit` |
| BR-10 | Re-archival of same scout in dossier is a no-op (check by id presence in section) | `appendScoutToFeatureDossier()` |
| BR-11 | Unknown config key in `.aioson/config/scout-engine.json` → strict reject with `error.code=config_invalid` and per-key `error.details` | `validateConfig()` |
| BR-12 | Telemetry events (`event_type='sub_task'`) land in `agent_events` SQLite table; queryable via existing runtime-store helpers | `runtime:emit` reuse |
| BR-13 | File lock on `.state.json` via `.state.json.lock` file (PID + ISO timestamp). Lock considered stale and reclaimable after 30s | CLI commands (Phase 2) |
| BR-14 | Sub-agent prompt MUST include all 8 sections: Question, Why (parent_session_excerpt verbatim), Scope, Hard constraints, Output schema, Output target, Required fields, What success | `buildPrompt()` (Phase 1 AC E1) |
| BR-15 | `validateOutput()` rejects scout reports missing any required field, or with `evidence > 200 chars`, or `recommendation < 30 chars` or `> 1000 chars`, or `parent_session_excerpt` outside `[50, 1000]` chars | `validateOutput()` (Phase 1 AC E3) |

## Edge cases

| ID | Case | Behavior |
|----|------|----------|
| EC-01 | `scope_paths` empty AND `scope_globs` empty | `scout:prep` → exit 2 `error.code=input_invalid`, `details: [{field: "scope", reason: "at least one of scope_paths or scope_globs required"}]` |
| EC-02 | Resolved scope > `max_files_in_scope` | `scout:prep` → exit 2 `error.code=scope_too_large`, `details: {resolved_count: N, limit: M}` |
| EC-03 | Sub-agent returns malformed JSON | `scout:validate` → exit 2 `schema_invalid`, increment `retries_by_id[id]`. On 2nd failure (or `retries_by_id[id] >= max_retries_on_malformed_json+1`) → `retry_exhausted`, persist scout with `status: error`, emit `failed` |
| EC-04 | Sub-agent returns valid JSON but `findings: []` | `status: no_findings` is valid; recommendation field must explain why no findings |
| EC-05 | Sub-agent stalls / times out (harness-side, aioson can't directly detect) | State file entry orphaned; pruned on next `scout:prep` housekeeping when session entry > 24h old |
| EC-06 | `feature:close` runs but `.aioson/context/features/{slug}/scouts/` doesn't exist | Create dir + continue archival |
| EC-07 | Scout has `feature_slug` but feature no longer in `features.md` (manually deleted) | `feature:close` doesn't run for unknown slug; scout stays in `runtime/scouts/` until pruned (with warning emitted by `doctor`) |
| EC-08 | Two `scout:prep` calls in same parent session, concurrent | File lock waits up to 30s; second call proceeds after lock release. If lock stale (>30s) → reclaim with PID-stale warning |
| EC-09 | Parent agent dies mid-flow (after prep, before commit) | State file entry orphaned; aged out by 24h housekeeping. Output JSON file (if written by sub-agent) sits in scouts dir until prune or manual `scout:archive` |
| EC-10 | Config `max_scouts_per_session: 0` | `validateConfig()` rejects (range `[1, 100]`); CLI exit 2 `config_invalid` |
| EC-11 | Same `feature_slug` matches multiple in_progress entries in `features.md` (broken state) | `scout:prep` accepts (tolerant); `feature:close` for first matching slug archives all attached scouts (existing behavior of feature:close handles broken features.md) |
| EC-12 | Scout sub-agent writes JSON to wrong path (not the returned `output_path`) | `scout:validate --input=<wrong-path>` would still validate if file exists at `<wrong-path>`; `scout:commit` writes to `config.scout_dir/{id}.json` regardless of input path. Net: tolerant of harness file-write quirks |
| EC-13 | Scout report contains `next_scout_suggested` but parent has hit cap | Parent agent surfaces the suggestion to user; spawning is the parent's choice. Engine does not auto-spawn |
| EC-14 | Scout `evidence` field > 200 chars | Validator rejects. **Does NOT auto-truncate** — sub-agent must produce compliant output. Re-prompt with error.details on 1st failure |
| EC-15 | `parent_session_excerpt` is exactly 50 chars | Accepted (inclusive lower bound). 49 chars → reject |
| EC-16 | `feature:close` runs twice for same feature | First run archives; second is idempotent (BR-09 semantics for commit + BR-10 for dossier). Re-archival overwrites file (same content, no harm) |

## Out of scope for this feature

- Multi-agent dispatch (parent_agent ≠ "deyvin"): engine accepts the parameter, but rubric is wired only for deyvin in V1
- `/scout` standalone slash command
- Scout result reuse / de-duplication
- CLI-only deterministic scout (no LLM): considered and rejected — value is interpretation, not just file location
- Streaming or interactive scouts: V1 is one-shot
- Cross-session scout reuse
- Wall-clock timeout enforcement (aioson does not enforce; warning-only)
- Auto-spawn of `next_scout_suggested` (parent decides)
- Scout-driven workflow:next routing (scouts are diagnostic, not workflow stages)
- Migration of historical scouts from any prior format (V1 is greenfield; no historical scouts exist)

## Acceptance criteria mapping

Inherits all 24 phase ACs from `.aioson/plans/deyvin-subtask-scout/plan-*.md`:
- Phase 1 (`core-engine`): E1-E7 (7 ACs)
- Phase 2 (`cli-verbs`): C1-C9 (9 ACs)
- Phase 3 (`wiring-and-lifecycle`): W1-W8 (8 ACs)

This requirements document does NOT redefine ACs. It enriches the entities and rules that those ACs verify.

## Resolutions captured (deferred decisions from sheldon manifest)

| Manifest ref | Resolution by @analyst |
|---|---|
| Deferred 1: parent_session_excerpt block-vs-warn | **Block** (BR-02). Required at every prep |
| Deferred 2: sub-agent timeout semantics | **Trust harness + observability** (BR-07). No enforcement; warning at >300s default |
| Deferred 3: file lock strategy | **Simple `.state.json.lock`** (BR-13). PID + timestamp, stale 30s |
| Deferred 4: prune mechanism | **`aioson doctor --fix` only** (BR-06). No workflow:next hook |
| Deferred 5: per-harness invocation block | **Inline in deyvin.md** (Phase 3). Claude Code + Codex documented; Gemini/OpenCode → CLI-less fallback |

## Notes for @dev

- Read `.aioson/plans/deyvin-subtask-scout/plan-core-engine.md` first; start there.
- Use `src/memory-reflect-engine.js` as the structural template for `src/sub-task-engine.js` (pure module, no I/O, called by CLI commands).
- `agent_events` table column `event_type` is free TEXT (no enum constraint per `src/runtime-store.js:165-173`) — adding `'sub_task'` requires zero schema changes.
- For `runtime:emit type=sub_task`, populate `payload_json` per the `ScoutTelemetryEvent` shape in this doc. The shape is what `memory:summary` will parse.
- The hand-rolled JSON validator should be ~150 LOC max. If it grows past that, that's a signal to add `ajv` (decision deferred to V2).
- Phase 3's `appendScoutToFeatureDossier` should follow the existing `dossier.js` API conventions (read it before extending; do not add a new file if existing module fits).

## Notes for @qa

- All 16 edge cases (EC-01 through EC-16) need explicit test coverage. Most map 1:1 to phase ACs; cross-check during review.
- BR-01 (read-only sub-agent) is the security-critical rule. Verify by inspecting the prompt template AND the deyvin.md invocation block — both must enforce. (Harness-level enforcement is beyond aioson's reach; we document the contract.)
- BR-02 (excerpt required) is the cold-load comprehension hinge. Test scenario: dispatch scout, archive on feature:close, simulate cold-load by reading the archived JSON in isolation — the excerpt + recommendation must reconstruct intent.
- File lock (BR-13) cannot be reliably tested in CI without race-condition harness. Manual smoke + concurrency-stress test acceptable; document if skipped.

## Notes for cold-load future agents

This feature is itself an example of AIOSON's disk-first philosophy. Any future agent that opens `.aioson/context/features/deyvin-subtask-scout/scouts/{id}.json` (after this feature ships and is used) should be able to reconstruct what the scout investigated using only `parent_session_excerpt` + `question` + `recommendation` — no parent chat history required. **Validate this property when reviewing scout reports during QA.**
