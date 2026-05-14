# CLI reference — Active Learning Loop

> Four new verbs. Each section covers the full contract: flags, behavior, exit codes, output examples.

---

## `aioson context:load`

Records that an agent loaded a rule or brain. Writes a `rule_loaded` or `brain_loaded` event to `execution_events`.

**Tier:** 1 (silent — no output by default)

```
aioson context:load [path] --target=<rule|brain>:<slug> --agent=<name> [options]
```

### Flags

| Flag | Required | Description |
|---|---|---|
| `--target=<type>:<slug>` | yes | Type (`rule` or `brain`) and identifier. Ex: `rule:authn-rules`, `brain:sheldon-005` |
| `--agent=<name>` | yes | Name of the loading agent. Ex: `dev`, `qa`, `sheldon` |
| `--batch="a,b,c"` | no | Additional slugs to record in batch (same type and agent). Comma-separated |
| `--feature=<slug>` | no | Associated feature (for traceability in `execution_events`) |
| `--verbose` | no | Prints confirmation for each recorded event |
| `--json` | no | JSON output (`{ ok, event, target, agent }`) |

### Behavior

- Creates a row in `execution_events` with `event_type='rule_loaded'` or `event_type='brain_loaded'`, `payload_json` containing `target_slug`, `agent`, `feature_slug` (if provided).
- `--batch="b,c"` records additional events for slugs `b` and `c` with the same type as the primary `--target`.
- Payload cap: 4KB per event.
- Cross-platform path normalization: slugs are normalized before writing.
- Does not validate whether the rule/brain file exists — it's pure telemetry.

### Exit codes

| Code | When |
|---|---|
| 0 | Event(s) recorded successfully |
| 1 | Argument error (malformed target, missing agent) |

### Examples

```bash
# Basic
aioson context:load --target=rule:authn-rules --agent=dev

# Batch of 3 rules + verbose
aioson context:load --target=rule:authn-rules --agent=dev \
  --batch="jwt-patterns,session-management" --verbose

# Associated with feature + JSON
aioson context:load --target=brain:sheldon-006 --agent=sheldon \
  --feature=authn-flow --json
```

---

## `aioson memory:search`

BM25 search over `project_learnings` (title + evidence) via SQLite FTS5.

**Tier:** 1 (silent — does not emit notify)

```
aioson memory:search "<query>" [path] [options]
```

### Flags

| Flag | Default | Description |
|---|---|---|
| `"<query>"` | — (required) | Search text. Maximum 500 characters |
| `path` | `.` | Project root directory |
| `--limit=N` | 5 | Maximum number of results |
| `--surface=<value>` | `learnings` | Where to search: `rules`, `learnings`, or `all` |
| `--include-archived` | false | Includes entries with `archived` status |
| `--json` | false | JSON output |

### Behavior and query sanitization

Each token (whitespace-separated) is converted to a quoted phrase and ANDed with the others:

```
"JWT authentication"  →  '"JWT" "authentication"'
```

FTS5 operator characters (`* ( ) ^ : + - "`) are stripped before conversion. If after sanitization the query results in an empty string, the command returns `{ ok: false, reason: 'query_unparseable' }` with exit code 0 (not an error — expected behavior).

Archived entries are excluded by default; `--include-archived` includes them.

Ranking: BM25 (lower score = more relevant).

### Exit codes

| Code | When |
|---|---|
| 0 | Search executed (even with no results) |
| 1 | Argument error or DB failure |

### Output examples

```bash
aioson memory:search "JWT authentication"
```

```
2 results for "JWT authentication"

[1] authn-refresh-token-ttl  (promoted)
    Refresh tokens must have a 7-day max TTL.
    Evidence: 4 sessions

[2] jwt-audience-check  (for_review)
    Validate 'aud' claim on all endpoints.
    Evidence: 2 sessions
```

No results:

```
0 results for "xyzzy"
```

Unparseable query:

```json
{ "ok": false, "reason": "query_unparseable" }
```

Full JSON output:

```json
{
  "ok": true,
  "query": "JWT authentication",
  "sanitized_query": "\"JWT\" \"authentication\"",
  "results": [
    {
      "id": "authn-refresh-token-ttl",
      "title": "authn-refresh-token-ttl",
      "status": "promoted",
      "score": -2.14,
      "snippet": "Refresh tokens must have a 7-day max TTL."
    }
  ],
  "total": 2
}
```

---

## `aioson memory:archive`

Archives a rule, learning, or brain: moves the physical file to `_archived/YYYY-MM-DD/` and records the history in `evolution_log`.

**Tier:** 2 (notified — emits `notify --level=warn` before mutation)

**Human-only:** refuses when `AIOSON_RUNTIME_HOOK=1` is set.

```
aioson memory:archive [path] --id=<rule|learning|brain>:<slug> --reason="<text>" [options]
```

### Flags

| Flag | Required | Description |
|---|---|---|
| `--id=<type>:<slug>` | yes | Type and slug of the target. Types: `rule`, `learning`, `brain` |
| `--reason="<text>"` | yes | Archival reason (recorded in `evolution_log`) |
| `--feature=<slug>` | no | Associated feature (for traceability) |
| `--dry-run` | no | Simulates without side effects — prints what would happen |
| `--json` | no | JSON output |

### Paths by type

| Type | Source | Destination |
|---|---|---|
| `rule` | `.aioson/rules/<slug>.md` | `.aioson/rules/_archived/YYYY-MM-DD/<slug>.md` |
| `brain` | `.aioson/brains/<slug>.brain.json` | `.aioson/brains/_archived/YYYY-MM-DD/<slug>.brain.json` |
| `learning` | `.aioson/context/<slug>.json` | `.aioson/context/_archived/YYYY-MM-DD/<slug>.json` |

Name collision at destination: `-{seq}` suffix is added automatically (`-1`, `-2`, etc.).

### Behavior

1. Checks `AIOSON_RUNTIME_HOOK=1` — refuses if set.
2. Resolves the file path. Errors if not found.
3. Idempotent noop if already archived.
4. Emits `notify --level=warn` before any mutation.
5. Atomic operation: BEGIN TRANSACTION, physical move, INSERT/UPDATE in `evolution_log`, COMMIT. If COMMIT fails, attempts to reverse the physical move.
6. Records `event_type='archived'` in `evolution_log` (previous active entry receives `end_at`).

### Exit codes

| Code | When |
|---|---|
| 0 | Archived successfully (or noop if already archived) |
| 0 | `--dry-run` executed |
| 1 | Target not found, AIOSON_RUNTIME_HOOK=1, DB or FS failure |

### Examples

```bash
# Dry-run first
aioson memory:archive --id=rule:legacy-session-cookies \
  --reason="replaced by JWT auth (authn-flow)" --dry-run

# Real execution
aioson memory:archive --id=rule:legacy-session-cookies \
  --reason="replaced by JWT auth (authn-flow)"

# With associated feature
aioson memory:archive --id=rule:legacy-session-cookies \
  --reason="replaced by JWT auth (authn-flow)" --feature=authn-flow

# JSON
aioson memory:archive --id=rule:legacy-session-cookies \
  --reason="obsolete" --json
```

JSON output:

```json
{
  "ok": true,
  "action": "archived",
  "type": "rule",
  "slug": "legacy-session-cookies",
  "source": ".aioson/rules/legacy-session-cookies.md",
  "dest": ".aioson/rules/_archived/2026-05-14/legacy-session-cookies.md",
  "evolution_log_rowid": 42
}
```

---

## `aioson memory:restore`

Restores an archived item: moves it back to the original path and records `event_type='restored'` in `evolution_log`.

**Tier:** 2 (notified — emits `notify --level=warn` before mutation)

**Human-only:** refuses when `AIOSON_RUNTIME_HOOK=1` is set.

```
aioson memory:restore [path] --id=<rule|learning|brain>:<slug> [options]
```

### Flags

| Flag | Required | Description |
|---|---|---|
| `--id=<type>:<slug>` | yes | Type and slug of the item to restore |
| `--reason="<text>"` | no | Restoration reason (recorded in `evolution_log`) |
| `--feature=<slug>` | no | Associated feature (for traceability) |
| `--dry-run` | no | Simulates without side effects |
| `--json` | no | JSON output |

### Behavior

1. Locates the most recent file in `_archived/*/` matching the slug.
2. Verifies that the original destination path is available — errors if a file already exists there.
3. Emits `notify --level=warn` before any mutation.
4. Atomic operation: physical move + INSERT `event_type='restored'` + UPDATE `end_at` of the active `archived` entry.

### Exit codes

| Code | When |
|---|---|
| 0 | Restored successfully |
| 0 | `--dry-run` executed |
| 1 | Item not found in `_archived/`, original path already occupied, AIOSON_RUNTIME_HOOK=1 |

### Examples

```bash
# Dry-run
aioson memory:restore --id=rule:rate-limiting-rules --dry-run

# Real execution with reason
aioson memory:restore --id=rule:rate-limiting-rules \
  --reason="rule still needed — removal was premature"

# JSON
aioson memory:restore --id=rule:rate-limiting-rules --json
```

---

## `aioson feature:close` (modified)

The existing `feature:close` command gained a distillation hook at the end. The syntax has not changed — only `--no-distill` was added.

```
aioson feature:close --slug=<slug> --verdict=<PASS|FAIL|ABANDONED> [--no-distill]
```

### Added flag

| Flag | Description |
|---|---|
| `--no-distill` | Skips the distillation hook for this call (does not permanently alter config) |

### Hook behavior

- Only runs when `--verdict=PASS` and classification is not MICRO.
- Foreground with 5s timeout (configurable in `learning-loop.json`).
- Exit code always 0, even if distillation fails.
- Emits exactly 1 notify `--level=info --topic=learning-loop` with the summary.
- Records result in `evolution_log` (`auto_distillation` or `distillation_failed`).

---

## Continue reading

- [How to use](./how-to-use.md) — end-to-end examples
- [Doctor checks](./doctor-checks.md) — what the doctor checks mean
- [Troubleshooting](./troubleshooting.md) — known issues
