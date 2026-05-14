---
decision: DD-3
phase: 5
slug: feature-close-distillation-hook
resolved_by: architect
resolved_at: 2026-05-14
status: closed
---

# DD-3 — Concurrency lock primitive

**Resolution**: **SQLite row-level via INSERT + UPDATE em `evolution_log`**.

**Pattern**:
```sql
-- Lock acquisition (start of distillation):
INSERT INTO evolution_log
  (id, feature_slug, event_type, target_type, start_at, end_at, actor, payload_json)
  VALUES (?, ?, 'auto_distillation', 'feature', datetime('now'), NULL, 'auto',
          json('{"state":"in_progress"}'))
WHERE NOT EXISTS (
  SELECT 1 FROM evolution_log
  WHERE feature_slug = ?
    AND event_type = 'auto_distillation'
    AND end_at IS NULL
);

-- Check insertion succeeded (rowsAffected > 0); if 0 → no-op (another process holds lock).

-- Lock release (end of distillation):
UPDATE evolution_log
  SET end_at = datetime('now'),
      payload_json = json('{"state":"complete","promoted":?,"review":?,"merge":?,"duration_ms":?}')
WHERE feature_slug = ?
  AND event_type = 'auto_distillation'
  AND end_at IS NULL;
```

**Why this option**:
- Atomic: SQLite handles row-level locking automatically em WAL mode.
- Portable: zero filesystem flock quirks (Windows shares vs Unix locks).
- No external deps: pure SQLite via better-sqlite3.
- Auditable: lock acquisition + release are evolution_log rows (full history).
- Consistent: same primitive used em archive (BR-ALL-02 append-only).

**Race window**: SELECT-then-INSERT has microsecond window. Mitigated via:
- Option 1 (preferred): wrap em `BEGIN IMMEDIATE` transaction. Lock acquired imediatamente em SQLite até COMMIT.
- Option 2 (fallback): `INSERT OR IGNORE` + `UNIQUE` constraint emulation via partial index `CREATE UNIQUE INDEX idx_evolution_log_active_distillation ON evolution_log(feature_slug, event_type) WHERE event_type='auto_distillation' AND end_at IS NULL`.

@dev escolhe entre opções durante implementação Phase 5; test fixture com 100 concurrent invocations valida zero duplicates.

**Stuck row handling**: crash mid-distillation leaves `end_at=NULL`. V1: documented limitation. V2: doctor check `distillation_stuck` (start_at > 24h ago AND end_at IS NULL) + `aioson memory:unlock --feature=<slug>` command.

**Trade-offs accepted**:
- Stuck rows survive crashes; manual cleanup needed em V1.
- Distillation history grows monotonically (no archive of distillation rows themselves).

**Full reasoning**: see `.aioson/context/architecture-active-learning-loop.md § Lock primitive sequence`.
