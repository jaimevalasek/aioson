# Diagrams — Sub-task Scout

---

## Full dispatch flow

```
User asks @deyvin something that triggers rubric line 111
(survey of >5 files or runtime flow tracing)
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  aioson scout:prep                                          │
│  ─────────────────                                          │
│  1. Validates inputs (question, scope, excerpt required)   │
│  2. Resolves scope_paths → absolute paths                   │
│  3. Checks caps: scouts_in_session < max (3) ?             │
│                  scope_size < max_files (20) ?              │
│  4. Increments scouts_in_session in state file             │
│  5. Generates prompt with tool whitelist [Read, Grep]      │
│  6. Returns { id, prompt, output_path, cap_remaining }     │
└──────────────────────────────┬──────────────────────────────┘
                               │ exit 0
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  harness.sub-agent(prompt)    ← ISOLATED CONTEXT           │
│  ────────────────────────                                   │
│  tools: [Read, Grep] ONLY                                   │
│  disallowed: [Bash, Edit, Write]  ← Nautilus pattern       │
│                                                             │
│  sub-agent inspects scope_paths                             │
│  writes JSON to output_path                                 │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  aioson scout:validate --input=<output_path>                │
│  ───────────────────────────────────────────                │
│  validates against OUTPUT_SCHEMA                            │
│  updates retries_by_id in state                             │
└──────────┬───────────────────────────────┬──────────────────┘
           │ PASS (exit 0)                 │ FAIL (exit 2)
           ▼                               ▼
┌──────────────────────────┐   ┌───────────────────────────────┐
│ aioson scout:commit      │   │ retry_remaining > 0?          │
│ ────────────────────     │   │  yes → @deyvin re-prompts     │
│ persists scout JSON      │   │  no → retry_exhausted         │
│ decrements cap           │   │        status: "error"        │
│ emits telemetry          │   │        @deyvin informs user   │
└──────────┬───────────────┘   └───────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────┐
│ @deyvin reads findings, confidence, recommendation           │
│ folds into user-facing reply                                 │
│                                                              │
│ parent context grew: ~500 tokens (report)                   │
│ vs inline survey:    ~10k+ tokens (raw files)               │
└──────────────────────────────────────────────────────────────┘
```

---

## Archival on feature:close

```
aioson feature:close --slug=<s> --verdict=PASS
         │
         ▼
 (hook in feature:close Phase 5)
         │
         ├─ scans .aioson/runtime/scouts/ for files with feature_slug=<s>
         │
         ├─ for each matching scout:
         │    ├─ copies to .aioson/context/features/<s>/scouts/{id}.json
         │    └─ appends bullet to dossier.md > ## Sub-task scouts (idempotent)
         │
         └─ emits telemetry type=sub_task action=archived_on_close
         
 (runtime copies remain in .aioson/runtime/scouts/ — pruned by doctor)
```

---

## Pruning by doctor

```
aioson doctor . [--fix]
         │
         ├─ check: scouts_directory_pruning
         │    ├─ reads .aioson/config/scout-engine.json → prune_unattached_after_days (default: 90)
         │    ├─ lists .aioson/runtime/scouts/*.json
         │    │    ├─ has feature_slug? → NEVER prune (cold-load memory)
         │    │    └─ no feature_slug + age > threshold? → candidate
         │    └─ without --fix: reports count as advisory WARN
         │       with --fix: deletes candidates
```

---

## State file and file-lock

```
.aioson/runtime/scouts/.state.json
{
  "sessions": {
    "sess-abc123": {
      "scouts_in_session": 2,      ← incremented on prep, decremented on commit
      "retries_by_id": {
        "scout-2026-05-14-a3b7c1": 0
      },
      "committed_ids": {
        "scout-2026-05-14-a3b7c1": true
      }
    }
  }
}

Lock: .aioson/runtime/scouts/.state.json.lock
  ├─ content: { pid, lockedAt (ISO) }
  ├─ stale if age > 30s
  ├─ retry every 100ms, deadline 30s
  └─ created on prep/commit/validate; removed after operation
```
