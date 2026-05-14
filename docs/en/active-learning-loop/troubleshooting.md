# Troubleshooting — Active Learning Loop

> Each section: **symptom** → **diagnosis** → **fix**. Always start with `aioson doctor .` — it detects most issues.

---

## 1. Stuck distillation lock (`lock_held`)

**Symptom:** `feature:close` returns with a "distillation already in progress" notify on every subsequent call for the same feature, even with no other process running. Or the distillation got stuck in a state where `end_at` was never set.

**Diagnosis:** AIOSON crashed (SIGKILL, power loss, manual process kill) during distillation. The lock row in `evolution_log` was left with `end_at=NULL`, signaling "in progress", but there's no active process.

Confirm:

```bash
sqlite3 .aioson/runtime/aios.sqlite \
  "SELECT rowid, feature_slug, event_type, start_at, end_at, payload_json
   FROM evolution_log
   WHERE event_type IN ('auto_distillation', 'distillation_failed')
     AND end_at IS NULL;"
```

If `start_at` is far in the past and there's no active process, it's a stuck lock.

**Fix (V1 — manual):**

```bash
sqlite3 .aioson/runtime/aios.sqlite \
  "UPDATE evolution_log
   SET end_at=datetime('now'), payload_json=json_patch(payload_json, '{\"state\":\"unlocked_manually\"}')
   WHERE feature_slug='<slug>'
     AND event_type='auto_distillation'
     AND end_at IS NULL;"
```

Replace `<slug>` with the slug of the feature with the stuck lock.

Then verify:

```bash
sqlite3 .aioson/runtime/aios.sqlite \
  "SELECT feature_slug, end_at FROM evolution_log
   WHERE event_type='auto_distillation' AND end_at IS NULL;"
# should return 0 rows
```

You can now run `feature:close` again.

**V2 trajectory:** the `aioson memory:unlock --feature=<slug>` command will automate this unlock. Until then, the manual fix above is the path.

---

## 2. MICRO projects — distillation and doctor checks absent

**Symptom:** `feature:close --verdict=PASS` completes without any "distillation: N promoted" line. `aioson doctor .` does not show the three curation checks.

**Diagnosis:** the project is classified as MICRO. This is the expected configuration — MICRO projects opt out of the entire loop:

```json
// .aioson/config/learning-loop.json
{
  "skip_on_classification": ["MICRO"]
}
```

Also applies to individual features classified as MICRO in the PRD frontmatter:

```yaml
# .aioson/context/prd-my-feature.md
---
classification: MICRO
---
```

**How to verify:**

```bash
# Check project classification
grep -r "classification:" .aioson/context/project.context.md
# or
aioson doctor . --json | grep classification

# Check a specific feature
head -10 .aioson/context/prd-my-feature.md
```

**If you want to enable the loop on MICRO projects:**

Edit `.aioson/config/learning-loop.json` and remove `"MICRO"` from `skip_on_classification`:

```json
{
  "skip_on_classification": []
}
```

Not recommended — MICRO projects generally don't have enough features for the loop to be useful. The minimum threshold of 5 features for the doctor checks probably won't be reached anyway.

---

## 3. `pattern:detect` not running — `merge_candidate_count` always 0

**Symptom:** the distillation notify always shows `0 merge candidates`, even with many promoted learnings with similar content.

**Diagnosis:** this is expected behavior in V1. The `feature:close` hook runs `learning:auto-promote` but does **not** run `pattern:detect`. The existing `pattern:detect` is squad-scoped and incompatible with feature scope. `merge_candidate_count` is always 0 in V1.

This limitation is tracked for a follow-up. There is no direct workaround.

**What you can do in the meantime:**

If you want to manually detect patterns across promoted learnings:

```bash
aioson memory:search "your-term" --surface=learnings
```

And archive learnings that are clearly duplicates:

```bash
aioson memory:archive --id=learning:duplicate-learning --reason="identical content to learning:primary-learning"
```

---

## 4. `aioson update` overwrites `learning-loop.json`

**Symptom:** you customized `.aioson/config/learning-loop.json` (changed `timeout_ms`, `auto_promote_threshold`, etc.) and then ran `aioson update`. Your customizations were lost.

**Diagnosis:** this is the current installer policy — `aioson update` overwrites `learning-loop.json` with the template values. It is a documented behavior to be fixed in a future version.

**Workaround:**

Before running `aioson update`, make a manual backup:

```bash
cp .aioson/config/learning-loop.json .aioson/config/learning-loop.json.bak
```

After `aioson update`, restore your customizations:

```bash
# Compare what changed
diff .aioson/config/learning-loop.json .aioson/config/learning-loop.json.bak

# Restore customized fields manually
# Edit .aioson/config/learning-loop.json with your preferences
```

**Trajectory:** the installer will switch to merge-aware copy for this file, preserving user customizations. Until then, a manual backup before `aioson update` is necessary if you have customizations.

---

## 5. Distillation failing silently

**Symptom:** `feature:close` runs and returns 0, but without the distillation notify, and `doctor` reports `distillation_lag`.

**Diagnosis:** the distillation hook failed but swallowed the error (correct behavior — distillation is best-effort). The error was recorded in `evolution_log`.

**Investigate:**

```bash
sqlite3 .aioson/runtime/aios.sqlite \
  "SELECT feature_slug, start_at, payload_json
   FROM evolution_log
   WHERE event_type='distillation_failed'
   ORDER BY start_at DESC LIMIT 5;"
```

The `payload_json` contains `error_phase` and `error_message`:

```json
{
  "state": "failed",
  "error_phase": "auto-promote",
  "error_message": "SQLITE_LOCKED: database is locked"
}
```

Common causes by `error_phase`:

| Phase | Typical cause |
|---|---|
| `auto-promote` | DB locked, `project_learnings` with invalid schema |
| `timeout` | Distillation took more than `timeout_ms` (default: 5000) |
| `lock-acquire` | INSERT lock failed — concurrency or DB corruption |

**Common fixes:**

- `SQLITE_LOCKED`: another process has the DB open. Close other terminals running AIOSON.
- `timeout`: increase `timeout_ms` in `learning-loop.json` (e.g., `10000`).
- DB corruption: `sqlite3 .aioson/runtime/aios.sqlite "PRAGMA integrity_check;"`.

---

## 6. `memory:archive` refused — `AIOSON_RUNTIME_HOOK=1`

**Symptom:**

```
Error: memory:archive is a tier-2 human-only operation.
  Cannot run with AIOSON_RUNTIME_HOOK=1 (automated hook context).
```

**Diagnosis:** you're trying to run `memory:archive` (or `memory:restore`) from inside an automated hook — a script that sets `AIOSON_RUNTIME_HOOK=1`. These commands are intentionally restricted to humans.

**Fix:** run the command manually in the terminal, outside the hook context:

```bash
# Without AIOSON_RUNTIME_HOOK=1 in the environment
aioson memory:archive --id=rule:my-rule --reason="..."
```

If you need an automated script to archive items, consider that this is a design problem — deliberate archival with a reason is a semantic operation that should be human-approved.

---

## 7. `memory:search` returns `query_unparseable`

**Symptom:**

```json
{ "ok": false, "reason": "query_unparseable" }
```

**Diagnosis:** after stripping all FTS5 operator characters (`* ( ) ^ : + - "`), the query became empty or only whitespace.

Examples of problematic queries:

```bash
aioson memory:search "***"        # all chars are operators
aioson memory:search "+"          # pure operator
aioson memory:search "(NOT)"      # parentheses + NOT stripped → empty
```

**Fix:** use ordinary words:

```bash
aioson memory:search "authentication"
aioson memory:search "jwt refresh token"
```

---

## 8. FTS5 out of sync — search not returning recent results

**Symptom:** `memory:search` doesn't find a learning you know exists and is active.

**Diagnosis:** the FTS5 triggers may have failed during a previous write (e.g., crash during INSERT into `project_learnings`). The FTS5 index fell out of sync with the base table.

**Diagnose:**

```bash
sqlite3 .aioson/runtime/aios.sqlite \
  "SELECT COUNT(*) FROM project_learnings WHERE status != 'archived';"
# vs
sqlite3 .aioson/runtime/aios.sqlite \
  "SELECT COUNT(*) FROM project_learnings_fts;"
```

If the counts diverge, the index is out of sync.

**Fix — rebuild the index:**

```bash
sqlite3 .aioson/runtime/aios.sqlite \
  "INSERT INTO project_learnings_fts(project_learnings_fts) VALUES('rebuild');"
```

The `rebuild` is a safe, idempotent FTS5 operation — it rebuilds the index from the base table.

---

## Quick diagnostic commands

| Goal | Command |
|---|---|
| See all checks | `aioson doctor .` |
| See active distillation locks | `sqlite3 .aioson/runtime/aios.sqlite "SELECT * FROM evolution_log WHERE end_at IS NULL;"` |
| See recent distillations | `sqlite3 .aioson/runtime/aios.sqlite "SELECT feature_slug, event_type, start_at, end_at FROM evolution_log WHERE event_type LIKE '%distillation%' ORDER BY start_at DESC LIMIT 10;"` |
| See distillation failures | `sqlite3 .aioson/runtime/aios.sqlite "SELECT feature_slug, payload_json FROM evolution_log WHERE event_type='distillation_failed';"` |
| Check FTS5 sync | `sqlite3 .aioson/runtime/aios.sqlite "SELECT COUNT(*) FROM project_learnings; SELECT COUNT(*) FROM project_learnings_fts;"` |
| Rebuild FTS5 | `sqlite3 .aioson/runtime/aios.sqlite "INSERT INTO project_learnings_fts(project_learnings_fts) VALUES('rebuild');"` |
| Check DB integrity | `sqlite3 .aioson/runtime/aios.sqlite "PRAGMA integrity_check;"` |
