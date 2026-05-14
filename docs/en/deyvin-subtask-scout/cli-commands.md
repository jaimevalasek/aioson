# CLI Reference — Sub-task Scout

> Three verbs. Each section covers the full contract: flags, behavior, exit codes, output examples.

---

## `aioson scout:prep`

Prepares a scout: validates inputs, checks caps, generates the standardized sub-agent prompt.

**Tier:** 1 (silent — no output by default; use `--json`)

```
aioson scout:prep [path]
  --question="<text>"
  --scope-paths="<path1>,<path2>"
  --parent-agent=<name>
  --parent-session-id=<id>
  --parent-session-excerpt="<text>"
  [--feature-slug=<slug>]
  [--json]
```

### Flags

| Flag | Required | Description |
|---|---|---|
| `--question="<text>"` | yes | Question the sub-agent must answer |
| `--scope-paths="<paths>"` | yes (or `--scope-globs`¹) | Files and directories to inspect, comma-separated. Directories expand 1 level |
| `--parent-agent=<name>` | yes | Dispatching agent. In V1, only `"deyvin"` is accepted |
| `--parent-session-id=<id>` | yes | Parent session ID — used to track caps per session |
| `--parent-session-excerpt="<text>"` | yes | Why the scout was dispatched (50-1000 chars). Blocked if absent — this is the cold-load comprehension field |
| `--feature-slug=<slug>` | no | Associated feature (for automatic archival on `feature:close`) |
| `--json` | no | JSON output (`{ ok, id, prompt, output_path, cap_remaining }`) |

¹ `--scope-globs` is deferred to V2 (Node 18-21 has no built-in `fs.glob`). If passed, returns `error.code = "globs_not_implemented_v1"`.

### Behavior

1. Validates all required fields.
2. Resolves `scope_paths`: relative → absolute, verifies they stay within `rootDir`.
3. Checks caps: `max_scouts_per_session` and `max_files_in_scope`.
4. Increments `scouts_in_session` in state file (with file-lock).
5. Generates standardized prompt with question, scope, output schema, and tool whitelist (`[Read, Grep]` / `[Bash, Edit, Write]` disallowed).
6. Returns `{ id, prompt, output_path, cap_remaining }`.

### Exit codes

| Code | When |
|---|---|
| 0 | Scout prepared successfully |
| 2 | Invalid argument, cap exceeded, scope too large, path outside root |

### Examples

```bash
# Basic with JSON
aioson scout:prep \
  --question="Where is the previous featureSlug not cleared in workflow:next?" \
  --scope-paths="src/commands/workflow-next.js,src/handoff-contract.js" \
  --parent-agent=deyvin \
  --parent-session-id=sess-abc123 \
  --parent-session-excerpt="User reported state inheritance bug; need to inspect loadOrCreateState logic" \
  --json
```

```json
{
  "ok": true,
  "id": "scout-2026-05-14-a3b7c1",
  "prompt": "You are a read-only code survey sub-agent...",
  "output_path": ".aioson/runtime/scouts/scout-2026-05-14-a3b7c1.json",
  "cap_remaining": 2
}
```

Cap error:

```json
{
  "ok": false,
  "error": {
    "code": "cap_exceeded",
    "message": "max_scouts_per_session=3 reached for parent_session_id=sess-abc123",
    "remediation": "Override .aioson/config/scout-engine.json or open a new session"
  }
}
```

---

## `aioson scout:validate`

Validates the JSON returned by the sub-agent against the output schema. Tracks retries in the state file.

**Tier:** 1 (silent)

```
aioson scout:validate [path] --input=<path-to-json> [--json]
```

### Flags

| Flag | Required | Description |
|---|---|---|
| `--input=<path>` | yes | Path to the JSON file the sub-agent wrote |
| `--json` | no | JSON output |

### Behavior

1. Reads the file at `--input`.
2. Validates against `OUTPUT_SCHEMA` (strict: `additionalProperties: false`).
3. Increments `retries_by_id[id]` in state file.
4. If `retries_by_id[id] > max_retries_on_malformed_json` → returns `retry_exhausted` without testing the schema.

### Output schema summary (what the sub-agent must produce)

```json
{
  "id": "scout-{slug?}-{date}-{rand6}",
  "parent_agent": "deyvin",
  "parent_session_id": "sess-abc123",
  "parent_session_excerpt": "...",
  "feature_slug": null,
  "question": "...",
  "scope": { "paths": [...], "files_requested": [...] },
  "findings": [
    {
      "file": "src/commands/workflow-next.js",
      "line": 42,
      "evidence": "loadOrCreateState checks featureSlug but does not reset on feature transition",
      "relevance": "high",
      "explanation": "..."
    }
  ],
  "confidence": "high",
  "recommendation": "...",
  "files_inspected": [...],
  "status": "success",
  "completed_at": "2026-05-14T10:00:00.000Z"
}
```

### Exit codes

| Code | When |
|---|---|
| 0 | JSON valid against output schema |
| 2 | Schema invalid, retry exhausted, file not found |

### Examples

```bash
aioson scout:validate --input=.aioson/runtime/scouts/scout-2026-05-14-a3b7c1.json

# With detailed JSON on failure:
aioson scout:validate --input=... --json
```

Failure output:

```json
{
  "ok": false,
  "error": {
    "code": "schema_invalid",
    "details": [
      { "field": "findings[0].evidence", "reason": "required field missing" },
      { "field": "confidence", "reason": "must be one of: high, medium, low" }
    ]
  },
  "retry_remaining": 1
}
```

---

## `aioson scout:commit`

Persists the validated report, emits telemetry, decrements the cap counter.

**Tier:** 1 (silent)

```
aioson scout:commit [path] --input=<path-to-json> [--json]
```

### Flags

| Flag | Required | Description |
|---|---|---|
| `--input=<path>` | yes | Path to the validated JSON |
| `--json` | no | JSON output |

### Behavior

1. Reads the file at `--input`.
2. Checks if the `id` was already committed in this session (idempotent — re-commit is a no-op with `committed: false, reason: 'already_committed'`).
3. Copies the file to `.aioson/runtime/scouts/{id}.json`.
4. Emits `runtime:emit type=sub_task action=committed` to `agent_events`.
5. Decrements `scouts_in_session` in state file (clamped to 0).
6. Records `committed_ids[id] = true` in state file.

> **Idempotency:** the sub-agent may write the report to `output_path` before `scout:commit` runs, so the file already exists at the target on first commit. The idempotency check uses `committed_ids` in state (not file presence) — this ensures the first commit always processes correctly.

### Exit codes

| Code | When |
|---|---|
| 0 | Committed successfully (or no-op if already committed) |
| 1 | File not found, state lock failure, telemetry failure |

### Examples

```bash
aioson scout:commit --input=.aioson/runtime/scouts/scout-2026-05-14-a3b7c1.json

# With JSON:
aioson scout:commit --input=... --json
```

```json
{
  "ok": true,
  "committed": true,
  "id": "scout-2026-05-14-a3b7c1",
  "path": ".aioson/runtime/scouts/scout-2026-05-14-a3b7c1.json",
  "cap_remaining": 1
}
```

Re-commit (idempotent):

```json
{
  "ok": true,
  "committed": false,
  "reason": "already_committed"
}
```

---

## Continue reading

- [How to use](./how-to-use.md) — concrete flows
- [Diagrams](./diagrams.md) — visual flow
- [Troubleshooting](./troubleshooting.md) — known issues
