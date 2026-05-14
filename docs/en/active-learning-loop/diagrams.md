# Diagrams — Active Learning Loop in ASCII

> Canonical flows for the feature. ASCII because it renders in any terminal, any Markdown viewer, and any diff.

---

## 1. `feature:close` → distillation → `evolution_log` → `doctor`

```
aioson feature:close --slug=my-feature --verdict=PASS
  │
  ├── [existing] gate validation
  ├── [existing] dossier finalize
  ├── [existing] features.md update
  │
  └── [NEW] runHookOnFeatureClose()
        │
        ├── Read PRD frontmatter classification
        │   └── MICRO? → notify "skipped: MICRO classification" → exit 0
        │
        ├── Read features.md status
        │   └── abandoned? → silent skip → exit 0
        │
        ├── --no-distill passed? → skip → exit 0
        │
        ├── Attempt to acquire lock:
        │   INSERT INTO evolution_log
        │     (feature_slug='my-feature', event_type='auto_distillation',
        │      start_at=now(), end_at=NULL, actor='auto', payload='{"state":"start"}')
        │   └── active row already exists? → notify "already in progress" → exit 0
        │
        ├── setTimeout(5000ms) → AbortController.abort()
        │
        ├── try {
        │     learning:auto-promote --feature=my-feature
        │       └── returns { promoted: N, for_review: M }
        │   }
        │   catch (err) {
        │     UPDATE evolution_log SET event_type='distillation_failed',
        │       end_at=now(), payload='{"error":"...", "phase":"auto-promote"}'
        │     // swallow exception — do not rethrow
        │   }
        │
        ├── UPDATE evolution_log SET end_at=now(),
        │     payload='{"state":"complete","promoted":N,"review":M,"merge":0,"duration_ms":D}'
        │
        ├── aioson notify --level=info --topic=learning-loop
        │     --message="distillation: N promoted, M for review, 0 merge candidates"
        │
        └── exit 0  ← always 0, regardless of distillation failure
```

---

## 2. Lock pattern (DD-3 — two simultaneous terminals)

```
Terminal A                              Terminal B
──────────────────────────────────      ──────────────────────────────────
feature:close --slug=X                  feature:close --slug=X (simultaneous)

SELECT 1 FROM evolution_log
  WHERE feature_slug='X'
    AND event_type='auto_distillation'
    AND end_at IS NULL
  → 0 rows

INSERT row (end_at=NULL) → rowid=42
                                        SELECT 1 ... → 1 row (rowid=42)
                                        notify "already in progress" → exit 0

(distillation runs ~2-3s)

UPDATE rowid=42 SET end_at=now()
notify "N promoted, M for review"
exit 0
```

---

## 3. `memory:archive` — atomic operation with rollback

```
aioson memory:archive --id=rule:authn --reason="obsolete after OAuth"
  │
  ├── Check AIOSON_RUNTIME_HOOK=1 → refuse (tier-2 human-only)
  │
  ├── Resolve path: .aioson/rules/authn.md
  │   └── not found? → error: "target not found"
  │
  ├── Already archived? → noop (idempotent)
  │
  ├── aioson notify --level=warn --topic=memory-archive
  │     --message="archiving rule:authn — authn.md"
  │
  ├── BEGIN TRANSACTION (SQLite)
  │
  ├── physical move:
  │   .aioson/rules/authn.md
  │     → .aioson/rules/_archived/2026-05-14/authn.md
  │   └── move error → ROLLBACK → exit 1
  │
  ├── INSERT evolution_log (event_type='archived', start_at=now(), end_at=NULL,
  │     target_type='rule', target_id='authn', reason='obsolete after OAuth',
  │     actor='human', feature_slug=<--feature if passed>)
  │
  ├── UPDATE evolution_log SET end_at=now()
  │     WHERE target_id='authn' AND end_at IS NULL AND event_type != 'archived'
  │   (closes previous active entry)
  │
  ├── COMMIT
  │   └── COMMIT error → attempt to reverse physical move → exit 1
  │
  └── { ok: true, path: "_archived/2026-05-14/authn.md" }
```

---

## 4. `doctor` cycle with the new checks

```
$ aioson doctor .
        │
        ▼
┌──────────────────────────────────────────────────────────────────┐
│ runDoctor(targetDir)                                             │
│  └─ checks[]                                                     │
│      ├─ ... [existing checks severity='error'] ...               │
│      ├─ living-memory:bootstrap_coverage   [severity: warning]   │
│      ├─ living-memory:features_dir         [severity: warning]   │
│      ├─ living-memory:claude_commands      [severity: warning]   │
│      ├─ living-memory:version_drift        [severity: warning]   │
│      ├─ living-memory:permissions_in_sync  [severity: warning]   │
│      │                                                           │
│      ├─ [NEW] living-memory:rule_staleness   [severity: warning] │
│      │    └─ query: execution_events WHERE event_type='rule_loaded'
│      │           AND context LIKE 'feature=%' GROUP BY slug
│      │           → stale if no hit in last N features            │
│      │                                                           │
│      ├─ [NEW] living-memory:learning_orphans [severity: warning] │
│      │    └─ query: project_learnings WHERE status='promoted'    │
│      │           LEFT JOIN execution_events (rule_loaded, after  │
│      │           promoted_at) → orphan if join returns NULL      │
│      │                                                           │
│      └─ [NEW] living-memory:distillation_lag [severity: warning] │
│           └─ count(closed features) vs count(auto_distillation   │
│              in evolution_log) → lag if closed > distillations   │
│                                                                  │
│  report.ok = errorCount === 0                                    │
│  (warnings count in failedCount but do not affect ok)            │
└──────────────────────────────────────────────────────────────────┘
```

---

## 5. Validity-window in `evolution_log`

```
Initial state (active rule):
─────────────────────────────────────────────────────────────────
 rowid | target_type | target_id | event_type | start_at   | end_at
   1   |   'rule'    |  'authn'  |  'created' | 2026-01-10 | NULL   ← active

memory:archive runs:
─────────────────────────────────────────────────────────────────
 rowid | target_type | target_id | event_type | start_at   | end_at
   1   |   'rule'    |  'authn'  |  'created' | 2026-01-10 | 2026-05-14  ← closed
   2   |   'rule'    |  'authn'  |  'archived'| 2026-05-14 | NULL        ← active

memory:restore runs:
─────────────────────────────────────────────────────────────────
 rowid | target_type | target_id | event_type | start_at   | end_at
   1   |   'rule'    |  'authn'  |  'created' | 2026-01-10 | 2026-05-14
   2   |   'rule'    |  'authn'  |  'archived'| 2026-05-14 | 2026-05-14  ← closed
   3   |   'rule'    |  'authn'  |  'restored'| 2026-05-14 | NULL        ← active

Invariant: start_at and reason never change after INSERT.
           Only end_at is updated, and only once.
```

---

## 6. FTS5 — sync flow and search

```
project_learnings (normal table)
        │
        │ SQL triggers (INSERT, UPDATE, DELETE)
        ▼
project_learnings_fts (FTS5 virtual table)
   indexed columns: title, evidence
   ranking: BM25 (default)
        │
        │ aioson memory:search "JWT authentication"
        ▼
  Query sanitization:
    input:  "JWT authentication"
    tokens: ["JWT", "authentication"]
    FTS5:   '"JWT" "authentication"'  ← token-AND, each token is a literal phrase
        │
        ▼
  SELECT l.*, fts.rank
  FROM project_learnings_fts fts
  JOIN project_learnings l ON l.rowid = fts.rowid
  WHERE fts MATCH '"JWT" "authentication"'
    AND l.status != 'archived'   ← excluded by default
  ORDER BY fts.rank              ← BM25 (lower = more relevant)
  LIMIT 5
        │
        ▼
  Result:
  [1] jwt-refresh-token-ttl (score: -2.14)
      "Refresh JWT tokens must have a 7-day TTL..."
  [2] jwt-audience-validation (score: -1.87)
      ...
```

---

## Continue reading

- [What is the Active Learning Loop](./active-learning-loop.md) — concept and phases
- [How to use](./how-to-use.md) — concrete examples
- [Doctor checks](./doctor-checks.md) — what the checks mean
- [Troubleshooting](./troubleshooting.md) — known issues
