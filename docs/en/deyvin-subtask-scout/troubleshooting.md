# Troubleshooting — Sub-task Scout

---

## Cap exceeded (`cap_exceeded`)

**Symptom:** `aioson scout:prep` returns exit 2 with `error.code = "cap_exceeded"`.

**Why it happens:** the `parent_session_id` has already dispatched `max_scouts_per_session` scouts in this session (default: 3).

**Solutions:**

1. **Consolidate scouts** — combine related questions into a single scout with a wider scope.
2. **New session** — start a new session (new `parent_session_id`); caps are per session, not per project.
3. **Increase the limit** in the project:

```json
// .aioson/config/scout-engine.json
{ "max_scouts_per_session": 5 }
```

If the `cap_exceeded` rate exceeds 5% in real usage, the defaults are too tight — adjust them.

---

## Scope too large (`scope_too_large`)

**Symptom:** `aioson scout:prep` returns `error.code = "scope_too_large"`.

**Why it happens:** `scope_paths` resolved to more than `max_files_in_scope` files (default: 20).

**Solutions:**

1. **Specify concrete files** instead of directories:
   ```bash
   # instead of:
   --scope-paths="src/"
   # use:
   --scope-paths="src/commands/workflow-next.js,src/handoff-contract.js"
   ```

2. **Increase the limit** in the project:
   ```json
   { "max_files_in_scope": 30 }
   ```

> Directories in `scope_paths` expand only 1 level deep (direct children). `scope_globs` is deferred to V2.

---

## Malformed JSON from sub-agent (`schema_invalid`)

**Symptom:** `aioson scout:validate` returns exit 2 with `error.code = "schema_invalid"`.

**Why it happens:** the sub-agent didn't produce JSON valid against `OUTPUT_SCHEMA`. Possible causes:
- Required field missing (`parent_session_excerpt`, `confidence`, `recommendation`)
- `confidence` with invalid value (must be `high`, `medium`, or `low`)
- `evidence` or `explanation` exceeding character limits (200 and 300 respectively)
- Extra keys (schema has `additionalProperties: false`)

**Solution:** re-prompt the sub-agent with the exact error:

```
Your previous output failed validation:
- findings[0].evidence: required field missing
- confidence: must be one of: high, medium, low

Re-run and produce valid JSON per the schema.
```

You have 1 retry (`max_retries_on_malformed_json=1`). If the second attempt also fails, the scout persists with `status: "error"` and `@deyvin` must handle it manually (handoff or direct answer).

---

## Retry exhausted (`retry_exhausted`)

**Symptom:** `aioson scout:validate` returns `error.code = "retry_exhausted"`.

**Why it happens:** the sub-agent failed validation twice in a row (prep + 1 retry).

**What to do:**

1. The scout was persisted with `status: "error"` at `.aioson/runtime/scouts/{id}.json`.
2. `@deyvin` informs the user and offers handoff to `/aioson:agent:architect` or a direct best-effort answer.
3. To increase retries: `{ "max_retries_on_malformed_json": 2 }` in config (rarely needed — if it happens frequently, the prompt template needs tightening).

---

## Harness without sub-agent support (`harness_unsupported`)

**Symptom:** Gemini CLI or OpenCode don't natively support the Agent tool / sub-agent.

**What happens:** `scout:prep` returns normally, but the harness emits `harness_unsupported` when trying to dispatch the sub-agent.

**Solution:** use the CLI-less fallback embedded in `deyvin.md`. The "Sub-task scout invocation — CLI-less fallback" section describes how to build the prompt manually and dispatch it via the Claude Code Agent tool, or adapt it for the available harness.

The fallback produces the same JSON report, but without caps, SQLite telemetry, or automatic archival.

---

## State file lock stuck

**Symptom:** `aioson scout:prep` (or `scout:commit`) hangs for more than 30 seconds.

**Why it happens:** `.aioson/runtime/scouts/.state.json.lock` exists with the PID of a dead process.

**Solution:**

```bash
# Check if the PID is still alive
cat .aioson/runtime/scouts/.state.json.lock
# { "pid": 12345, "lockedAt": "2026-05-14T10:00:00.000Z" }

# If the process no longer exists, remove manually:
rm .aioson/runtime/scouts/.state.json.lock
```

The lock is automatically declared stale after 30s — on the next CLI operation it will be overwritten without intervention.

---

## `parent_session_excerpt` blocked

**Symptom:** `aioson scout:prep` returns `error.code = "input_invalid"` with `field: "parent_session_excerpt"`.

**Why it happens:** the field is required (cannot be omitted or under 50 chars).

**Why it exists:** future agents reading the archived scout in cold-load need to reconstruct context without any conversation history. The `parent_session_excerpt` is the only field that explains the WHY.

**Solution:** pass an informative excerpt from the parent session (50-1000 chars):

```bash
--parent-session-excerpt="User reported bug where workflow:next inherits featureSlug from previous handoffs; investigating loadOrCreateState in workflow-next.js"
```

---

## Orphaned scouts accumulating in `.aioson/runtime/scouts/`

**Symptom:** `aioson doctor .` reports advisory `scouts_directory_pruning` with old scouts without `feature_slug`.

**What they are:** scouts dispatched without `--feature-slug` or from features already closed whose `feature_slug` doesn't match any feature in `features.md`.

**Solution:**

```bash
# Preview which would be pruned
aioson doctor . --json | grep scouts_directory_pruning

# Prune (deletes orphaned scouts >90d; NEVER prunes scouts with feature_slug)
aioson doctor . --fix
```

To manually preserve an orphaned scout before pruning (e.g., for future auditing), copy it outside the runtime directory or associate it with a feature:

```bash
cp .aioson/runtime/scouts/{id}.json .aioson/context/features/{slug}/scouts/
```

---

## `aioson update` overwrites `scout-engine.json`

**Symptom:** customizations in `.aioson/config/scout-engine.json` are lost after `aioson update`.

**Status:** current installer behavior (M-01 follow-up — see also the same issue for `learning-loop.json`). The fix (smart merge) is planned as a MICRO feature.

**Workaround:** back up before running `aioson update`:

```bash
cp .aioson/config/scout-engine.json /tmp/scout-engine-backup.json
aioson update
# restore customizations manually
```

---

## `scope_globs` not implemented

**Symptom:** `error.code = "globs_not_implemented_v1"` when using `--scope-globs`.

**Why:** Node 18-21 has no native `fs.glob`; adding a glob dependency would break V1's zero-deps policy.

**Workaround:** use `scope_paths` with explicit files or directories (1-level expansion). Globs will be supported in V2.
