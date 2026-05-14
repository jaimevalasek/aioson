---
phase: 2
slug: cli-verbs
status: pending
depends_on: [core-engine]
---

# Phase 2 — CLI verbs

## Scope
Three new CLI subcommands wrapping `src/sub-task-engine.js`, plus the config schema file in `template/` and end-to-end integration tests. The CLI compiles and tests run independently of Phase 3 (no agent prompt wiring yet).

## New entities
- `src/commands/scout-prep.js` — implements `aioson scout:prep`
- `src/commands/scout-validate.js` — implements `aioson scout:validate`
- `src/commands/scout-commit.js` — implements `aioson scout:commit`
- `src/cli.js` — modified: register the three new subcommands in the dispatch table
- `template/.aioson/config/scout-engine.json` — new file with schema documentation comment + default values (commented out so override is opt-in)
- `tests/scout-cli.test.js` — spawns `node bin/aioson.js scout:* ...` against fixture project trees

## CLI surfaces

### `aioson scout:prep`

```
Usage: aioson scout:prep <root-path>
  --question="<text>"                       (required)
  --scope-paths="path1,path2,..."           (required if no --scope-globs)
  --scope-globs="src/**/*.js,..."           (required if no --scope-paths)
  --scope-exclude="**/node_modules/**,..."  (optional, defaults sane)
  --parent-agent=<name>                     (required, V1=deyvin only)
  --parent-session-id=<id>                  (required)
  --parent-session-excerpt="<text>"         (required, 50-1000 chars)
  --feature-slug=<slug>                     (optional)
  --max-files-in-scope=<n>                  (optional override)
```

Output (stdout, JSON, exit 0):
```json
{
  "id": "scout-...",
  "prompt": "<full prompt string from buildPrompt>",
  "output_path": ".aioson/runtime/scouts/scout-....json",
  "cap_remaining": 2
}
```

Failure (stderr structured JSON, exit 2):
```json
{
  "error": {
    "code": "input_invalid|cap_exceeded|scope_too_large|harness_unsupported",
    "message": "<human-readable>",
    "details": [...],
    "remediation": "<what to do>"
  }
}
```

### `aioson scout:validate`

```
Usage: aioson scout:validate <root-path>
  --input=<path-to-candidate-json>          (required)
```

Reads candidate file, runs `validateOutput`, increments retry counter in state file on failure. Exit 0 = PASS. Exit 2 = FAIL with structured error containing `error.details` (per-field violations).

### `aioson scout:commit`

```
Usage: aioson scout:commit <root-path>
  --input=<path-to-validated-json>          (required)
```

Behavior:
1. Re-runs `validateOutput` (defense-in-depth).
2. Writes to `<config.scout_dir>/{id}.json` (default `.aioson/runtime/scouts/{id}.json`).
3. Decrements `cap_remaining` for `parent_session_id` in state file.
4. Emits `runtime:emit --type=sub_task --action=committed --metadata='{"id":"<id>","feature_slug":"<slug>"}'`.
5. Returns exit 0 with `{committed: true, path: "..."}` on stdout.
6. Idempotent: re-commit of same id is a no-op (returns `{committed: false, reason: "already_exists"}`, exit 0).

## State file
`.aioson/runtime/scouts/.state.json` — managed by CLI commands (not by engine):
```json
{
  "sessions": {
    "<parent_session_id>": {
      "scouts_in_session": 2,
      "started_at": "ISO",
      "retries_by_id": {
        "scout-...": 1
      }
    }
  }
}
```
Pruned per-session entry when `scouts_in_session === 0` AND `started_at > 24h ago` (housekeeping on every `scout:prep` call).

File-lock strategy: simple `.state.json.lock` file with PID + timestamp. If lock older than 30s, considered stale and overwritten. (V1 simplicity over correctness; `@dev` may upgrade to OS-level lock if races emerge.)

## Acceptance criteria

| ID | Criterion | Test |
|----|-----------|------|
| C1 | `aioson scout:prep` with valid args returns JSON with all 4 required fields on stdout (exit 0). Missing `--question` → exit 2 with `error.code = "input_invalid"`. | spawn-based integration test |
| C2 | `aioson scout:prep` with `parent_agent=foo` (not in V1 whitelist) → exit 2 `unknown_parent_agent`. | integration test |
| C3 | Four sequential `scout:prep` calls with same `--parent-session-id` and default config → 4th returns exit 2 `cap_exceeded`. State file correctly tracks count. | integration test (uses tmp dir as root) |
| C4 | `scope_paths` resolving to >20 files → exit 2 `scope_too_large` with `error.details.resolved_count`. Override via `--max-files-in-scope=50` makes it pass (still respects `max_files_in_scope=50` from override). | integration test with fixture |
| C5 | `aioson scout:validate` on valid output JSON → exit 0. On JSON missing `parent_session_excerpt` → exit 2 with `error.details = [{field: "parent_session_excerpt", reason: "required"}]`. | integration test with fixtures |
| C6 | `aioson scout:validate` failing twice in a row for same id → 2nd call returns `error.code = "retry_exhausted"`. State file reflects `retries_by_id[id] >= max_retries_on_malformed_json`. | integration test |
| C7 | `aioson scout:commit` writes file at `<scout_dir>/{id}.json`, emits `runtime:emit type=sub_task action=committed`, decrements `cap_remaining`. Re-commit of same id = no-op exit 0. | integration test (asserts file exists + SQLite row exists + idempotency) |
| C8 | `.aioson/config/scout-engine.json` with `max_scouts_per_session=5` → 5 preps succeed, 6th rejected. Unknown config key (`max_foo: 1`) → `validateConfig` rejects on first prep call with structured error. | integration test |
| C9 | All `tests/scout-cli.test.js` pass. No regression in `tests/cli.test.js`, `tests/runtime-emit.test.js`, or other CLI suites. | CI run |

## Implementation sequence
1. Wire all three subcommands in `src/cli.js` dispatch table (stub handlers first to avoid import-cycle issues).
2. Implement `src/commands/scout-prep.js` (call `validateInput`, `enforceCaps`, `buildPrompt`, `generateScoutId`; write state).
3. Implement `src/commands/scout-validate.js` (call `validateOutput`, update retry counter).
4. Implement `src/commands/scout-commit.js` (re-validate, persist, emit telemetry, decrement cap).
5. Add `template/.aioson/config/scout-engine.json` with all keys commented out.
6. Write `tests/scout-cli.test.js` (uses `child_process.spawnSync` against `node bin/aioson.js scout:* ...`).
7. Run `npm test`. All green.

## External dependencies
- Existing `src/runtime-store.js` for `runtime:emit` telemetry and SQLite access.
- Existing `src/cli.js` dispatch convention.
- `node:child_process` (built-in) for tests.

## Notes for @dev
- **Spawn-based tests are slow** but they exercise the actual binary. Mark this suite as integration; can be skipped in `npm run lint` but must run in `npm test`.
- **State file race window**: cap counter increment and JSON write are not atomic. V1 accepts this race (single-user, single-machine). Document the limit in `scout-engine.js` JSDoc.
- **`runtime:emit` schema**: confirm `type=sub_task` is acceptable (no enum constraint in current `runtime-store.js` — verify by running existing `tests/runtime-emit.test.js` after change). If schema-constrained, add `sub_task` to the enum.
- **Config file location**: `.aioson/config/` already exists (`autonomy-protocol.json` is there). Follow same convention.
- **Path handling**: use `path.join(rootPath, ...)` everywhere; never assume `process.cwd()`.

## Notes for @qa
- Spawn integration tests across all 9 ACs; aim for fixture-based isolation (each test gets a fresh tmp `aioson` project root).
- C7 idempotency test: invoke `commit` twice with same input; assert exit 0 both times, file unchanged after 2nd call (compare hash), SQLite has only ONE row for the commit event.
- C8 unknown-key test: write `{"max_foo": 1, "max_scouts_per_session": 5}` to config; assert `scout:prep` exit 2 with `error.code = "config_invalid"` (NOT silently ignored).
- Verify SQLite row count before and after each test (use the existing `runtime-store.js` query helper) to ensure no telemetry leak from prior tests.

## Phase-specific reference sources
- `src/runtime-store.js` (existing) — telemetry conventions
- `src/cli.js` (existing) — dispatch table pattern
- `src/commands/memory-reflect-prepare.js` (existing) — closest structural sibling: pure-engine + CLI-command split
- `template/.aioson/config/autonomy-protocol.json` (existing) — config file convention to mirror
