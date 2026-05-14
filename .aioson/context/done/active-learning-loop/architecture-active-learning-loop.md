---
feature: active-learning-loop
classification: MEDIUM
generated_by: architect
generated_at: 2026-05-14
prd: .aioson/context/prd-active-learning-loop.md
requirements: .aioson/context/requirements-active-learning-loop.md
spec: .aioson/context/spec-active-learning-loop.md
plan: .aioson/plans/active-learning-loop/manifest.md
---

# Architecture — Active Learning Loop

## Architecture overview

Implementação 100% local em Node.js, sobre primitivas existentes (`better-sqlite3` em modo WAL, `src/runtime-store.js`, `src/commands/`, hooks system). Nenhuma dependência nova. Padrão é **extensão incremental do motor**: ALTER TABLE em `evolution_log`, virtual table FTS5 sobre `project_learnings`, novo módulo `src/learning-loop-engine.js` orquestrando primitivos existentes (`learning:auto-promote`, `pattern:detect`, `runtime:emit`). Hook em `feature:close` foreground com timeout 5s; mirroring obrigatório `src/` ↔ `template/src/`.

## DD-1..DD-5 resolutions

| Decision | Resolved choice | Reason |
|----------|-----------------|--------|
| **DD-1 — Instrumentação rule/brain load** | **(b) CLI verb `aioson context:load --target=<rule\|brain>:<slug> --agent=<name> [--batch]`** | Brain `sheldon-005` (CLI over direct write). Single source of instrumentation logic, testável em isolation, harness-agnostic (qualquer agente em qualquer harness chama o mesmo verb). Suporta `--batch` para minimizar overhead (agente que carrega 5 rules emite 1 call ao invés de 5). |
| **DD-2 — Distillation execution mode** | **Foreground com timeout 5s** (não background) | Simpler: zero lock complexity, zero detached process management cross-platform, exit code preservado para CI. 2s é UX aceitável; >5s = kill + `distillation_failed`. Background fica como V2 se telemetria mostrar duration p95 > 3s. **Override sobre recomendação @analyst** (background) baseado em: AIOSON foreground pattern já estabelecido em outros hooks (memory:reflect-commit), Article VI Simplicity. |
| **DD-3 — Concurrency lock primitive** | **SQLite row-level via INSERT + UPDATE em `evolution_log`** | Mesmo com foreground (DD-2), dois terminais podem invocar `feature:close --slug=X` simultâneos. Pattern: INSERT row com `event_type='auto_distillation', end_at=NULL` no início (marker "in progress"); UPDATE setando `end_at=now()` ao final. Segunda invocação detecta via `SELECT 1 FROM evolution_log WHERE feature_slug=X AND event_type='auto_distillation' AND end_at IS NULL` → no-op. Atomic via SQLite default transactions. Doctor check `distillation_stuck` (V2) detecta rows com `start_at > 24h ago AND end_at IS NULL`. |
| **DD-4 — FTS5 search ranking** | **BM25 default** (`ORDER BY rank`) | Zero config; V1 dataset pequeno (5-100 entries por projeto). Custom column weighting fica como V2 se Phase 2 retrospective mostrar precision <0.7 nas 10 queries do fixture. |
| **DD-5 — Brain merge proposal (S1)** | **Defer para follow-up MICRO feature `brain-curation`** | Phase 4 fica focado em 3 doctor checks (staleness, orphans, lag); brain overlap heuristic é independent surface. Follow-up scope-clean. |

**Note**: DD-2 overrides @analyst's recommendation. Reasoning: AIOSON's existing pattern is foreground hooks with `notify` for status (memory:reflect-commit, dossier:* commands all foreground). Background would introduce a new lifecycle paradigm that the codebase doesn't yet have. Simpler beats clever per Article VI.

---

## Folder/module structure

Stack: Node.js CLI. AIOSON convenção (per `design-doc.md` + `discovery.md` + precedent de `deyvin-subtask-scout`): domain engine modules ao **root de `src/`** com prefixo de domínio. Commands em `src/commands/`. Tests em `tests/`. i18n keys appended em `src/i18n/messages/{en,pt-BR,es,fr}.js`.

### New files (created in both `src/` AND `template/src/`)

```
src/
├── learning-loop-engine.js         ← orquestrador principal (runDistillation, runHookOnFeatureClose)
├── learning-loop-schemas.js        ← JSON schemas + validators (payload_json, learning-loop.json, evolution_log row)
├── learning-loop-migration.js      ← ALTER TABLE steps idempotentes + FTS5 creation + triggers + backfill
├── learning-loop-fts5.js           ← FTS5 query helpers (search, escape, snippet generation)
└── learning-loop-archive.js        ← filesystem ops para _archived/{date}/, evolution_log integration

src/commands/
├── memory-search.js                ← Phase 2
├── memory-archive.js               ← Phase 3
├── memory-restore.js               ← Phase 3
└── context-load.js                 ← Phase 1 (DD-1 = b)
```

### Modified files

```
src/
├── runtime-store.js                ← initSchema(): chama learning-loop-migration.runMigration() (idempotent)
├── doctor.js                       ← +3 check functions: assessRuleStaleness, assessLearningOrphans, assessDistillationLag
├── cli.js                          ← registra 4 novos commands
└── i18n/messages/{en,pt-BR,es,fr}.js  ← novas i18n keys (~15 keys × 4 idiomas)

src/commands/
└── feature-close.js                ← adiciona learning-loop-engine.runHookOnFeatureClose() invocation pós-dossier finalize

template/
└── .aioson/config/learning-loop.json   ← novo config padrão; copiado para projetos via installer.js
```

### Filesystem additions in `template/`

```
template/
├── .aioson/
│   ├── config/learning-loop.json
│   ├── rules/_archived/.gitkeep
│   ├── brains/_archived/.gitkeep
│   └── context/_archived/.gitkeep
└── src/  (mirror dos 9 files acima)
```

### Test files

```
tests/
├── telemetry-foundation.test.js
├── memory-search.test.js
├── memory-archive.test.js
├── doctor-curation-checks.test.js
├── feature-close-distillation.test.js
├── active-learning-loop-inception.test.js     ← AC-ALL-601
├── inception-parity-active-learning-loop.test.js  ← AC-ALL-602
└── fixtures/memory-search-queries.json
```

### File size discipline (per design-doc.md REQ-DISC-05)

Estimated sizes (alvo <300 linhas, alerta em 500):

| File | Estimated lines | Strategy se > 500 |
|------|-----------------|-------------------|
| learning-loop-engine.js | 250–350 | Split em `learning-loop-orchestrator.js` + `learning-loop-result.js` |
| learning-loop-migration.js | 150–200 | OK |
| learning-loop-fts5.js | 100–150 | OK |
| learning-loop-archive.js | 200–250 | OK |
| learning-loop-schemas.js | 100–150 | OK |
| Each new command in src/commands/ | 80–150 | OK |
| doctor.js (after extension) | +200 (existing ~600) | Considerar split de doctor checks em `src/doctor-checks/learning-loop.js` se ultrapassar 800 |

---

## Migration order

**Consume from `requirements-active-learning-loop.md § Migration order`** — não redesign. Implementado em `src/learning-loop-migration.js#runMigration(db)`, invocado dentro de `runtime-store.js#initSchema()` (pattern existente). 8 steps idempotentes:

1. ALTER TABLE evolution_log ADD COLUMN (× 9) — guard via `PRAGMA table_info(evolution_log)`
2. CREATE INDEX idx_evolution_log_target
3. CREATE INDEX idx_evolution_log_active (partial)
4. CREATE INDEX idx_evolution_log_feature
5. CREATE VIRTUAL TABLE project_learnings_fts USING fts5(...)
6. CREATE TRIGGER project_learnings_ai/au/ad
7. Backfill INSERT INTO project_learnings_fts (guard via COUNT(*) check)
8. CREATE INDEX idx_execution_events_context_load (partial)

Rollback manual (drop new columns/indexes/virtual table) — não automatizado V1. Documented limitation.

---

## Models and relationships

**Reference `requirements-active-learning-loop.md § New entities` and `§ Changes to existing entities`** — consumed as-is. Highlights for architectural reasoning:

- `evolution_log` é o **hub central** de auditoria — toda mutação em rule/learning/brain produz row aqui (BR-ALL-03).
- `project_learnings_fts` é **view virtual** sobre `project_learnings` — sync transacional via triggers (BR-ALL-07). Não duplica storage.
- `execution_events` recebe **2 novos event types** sem schema change (PMD-1). Filter parcial via index D1 evita full scan.
- **Validity-window**: `(start_at, end_at)` em `evolution_log` é o padrão Zep (PMD-6). `end_at IS NULL` = entry ativa. Append-only enforced em código (BR-ALL-02).

Relationship graph (soft refs, no FK cross-boundary):

```
project_learnings.rowid ──(sync via triggers)──> project_learnings_fts.rowid
project_learnings.learning_id ──(target_id when target_type='learning')──> evolution_log
.aioson/rules/{slug}.md ──(target_id when target_type='rule')──> evolution_log
.aioson/brains/.../{id} ──(target_id when target_type='brain')──> evolution_log
execution_events.payload_json.target_slug ──(matches target_id)──> evolution_log [JSON join]
features.md row.slug ──(feature_slug)──> evolution_log [filesystem join]
agent_runs.run_key ──(run_key FK)──> execution_events (existing)
```

---

## Integration architecture

**Zero new external integrations.** All work happens within:

- `aios.sqlite` (existing better-sqlite3 WAL mode)
- Local filesystem (`.aioson/` tree)
- AIOSON CLI subcommand invocation (intra-process, no IPC except for `child_process` if DD-2 had picked background; we picked foreground so even that is moot)

Internal "integration points":
- `learning-loop-engine.runDistillation()` chama internalmente:
  - `pattern-detect.js#runDetection()` (existing module)
  - `learning-auto-promote.js#runAutoPromote()` (existing module)
  - `runtime-store.js#appendRunEvent()` (existing helper)
  - `notify.js#emitNotify()` (existing helper)
- `memory-archive.js` chama:
  - `learning-loop-archive.js#archiveTarget()` (new)
  - `notify.js#emitNotify()` antes da mutation (BR-ALL-06)
- `doctor.js` checks chamam:
  - SQLite queries directly via better-sqlite3
  - `learning-loop-engine.computeStalenessThreshold()` (pure function, testável isolada)

---

## Cross-cutting concerns

### Telemetria (Article III)
Toda operação não-trivial emite `runtime:emit`:
- `feature:close` hook start → `event_type='auto_distillation', payload.state='start'`
- `feature:close` hook end → UPDATE same row, `payload.state='complete'`, `end_at` set
- `memory:archive` start/end → `event_type='archived'` row
- `memory:restore` → `event_type='restored'` row
- Doctor check fires → optional `event_type='doctor_finding'` (low priority; defer V2)

**Tier-1 silent**: `rule_loaded`, `brain_loaded` (high volume; payload cap 4KB per BR-ALL-08).
**Tier-2 notified**: `memory:archive`, `memory:restore` (mutation visible — notify ⚠ before action).
**Distillation result**: single `notify --level=info` summary post-hook (BR-ALL-05).

### Error handling
- **Best-effort silent failure**: distillation hook never throws back to `feature:close` (BR-ALL-05). Wrap em `try/catch` ao redor de `runDistillation()`; catch logs to `evolution_log event_type='distillation_failed'` with `payload_json.error_phase + error_message`, swallows exception.
- **Tier-2 commands** (`memory:archive`, `memory:restore`): fail loud com exit code não-zero e mensagem em stderr. Notify pre-mutation aborts se notify retornar não-zero.
- **FTS5 sync failures**: triggers transacionais — INSERT/UPDATE/DELETE em `project_learnings` rolls back se trigger falha (default SQLite). Detect via `tests/memory-search.test.js` stress test.
- **Migration failures**: `runMigration()` é idempotent — re-running é safe. If step N fails, step N-1 já committed (per-statement autocommit). User can retry; doctor flags incomplete migration.

### i18n
~15 novas keys distribuídas em 4 arquivos (`en.js`, `pt-BR.js`, `es.js`, `fr.js`):
- `learning_loop.distillation_started`, `distillation_complete`, `distillation_failed_silent`, `skipped_micro`, `skipped_abandoned`
- `memory_search.no_results`, `results_header`, `snippet_truncated`, `query_too_long`
- `memory_archive.confirming_tier2`, `already_archived_noop`, `target_not_found`
- `memory_restore.restored`, `cannot_restore_active`
- `doctor.living_memory.rule_staleness`, `rule_staleness_hint`, `learning_orphans`, `learning_orphans_hint`, `distillation_lag`, `distillation_lag_hint`

Pattern: pt-BR é canônico; es/fr podem ser leaner mas devem cobrir messages user-facing.

### Autonomy contract (per `.aioson/docs/autonomy-protocol.md`)
- `aioson context:load`, `aioson memory:search`, `aioson doctor` → **tier1_silent** (read/telemetry)
- `aioson feature:close` (com hook ativo) → **tier2_notified** (muta `evolution_log`, `_archived/`)
- `aioson memory:archive`, `aioson memory:restore` → **tier2_notified** (já mutates filesystem + DB)
- **No tier3** new commands.

Update needed em `template/.aioson/config/autonomy-protocol.json`:
```jsonc
{
  "tiers": {
    "tier1_silent": {
      "aioson_commands": ["context:load", "memory:search", ...existing]
    },
    "tier2_notified": {
      "aioson_commands": ["memory:archive", "memory:restore", ...existing]
    }
  }
}
```

`permissions-generator.js` rederive automaticamente para 4 harnesses; nenhum manual change necessário em `.claude/settings.json` etc.

### Validation
- Schemas em `learning-loop-schemas.js`: AJV ou hand-rolled validators (consistency com codebase existente — TBD em @dev preflight).
- CLI args validation: pattern existente em outros commands (`.option().conflicts().required()`).
- JSON schemas published em `learning-loop-schemas.js` para reuso em fixtures.

---

## Per-phase architectural concerns (Sheldon plan section)

| Phase | Slug | Architectural concerns |
|-------|------|------------------------|
| 1 | telemetry-foundation | DD-1 resolution (CLI verb `context:load`). Index strategy (partial WHERE clauses to limit scan). payload_json cap 4KB enforcement. Path normalization cross-platform (EC-13). |
| 2 | memory-search-fts5 | FTS5 virtual table + 3 triggers (transactional sync). Backfill guard pattern. BM25 default (DD-4). Query escaping for FTS5 syntax + SQL injection guards (EC-08). |
| 3 | memory-archive-with-evolution-log | ALTER TABLE idempotency (PRAGMA table_info guard). Validity-window pattern enforcement em code (BR-ALL-02). Filesystem atomic move + DB transaction wrapping (rollback on partial failure). Archive folder convention (`YYYY-MM-DD` granularity, collision suffix `-{seq}`). |
| 4 | doctor-curation-checks | Pure function `computeStalenessThreshold(featureCloseDates)` em `learning-loop-engine.js` para testability. Doctor check pattern reuse (`severity='warning'`). i18n key registration. MICRO opt-out (BR-ALL-11). |
| 5 | feature-close-distillation-hook | DD-2 (foreground), DD-3 (SQLite lock via INSERT+UPDATE). Best-effort try/catch wrapping (BR-ALL-05). Timeout 5s via `setTimeout` + `AbortController` para sub-process calls. Single tier-2 notify post-hook. |
| 6 | inception-mirror-parity | Two fixtures (tmpdir isolation per BR-ALL-10). Extend `sync-agents-preflight.js` `checkParity()` for new files. Wiring audit checklist per brain `sheldon-006`. Cross-platform tests (Windows + macOS + Linux). |

---

## Implementation sequence for @dev

Strict ordering (cada step só inicia quando o anterior completo + validado):

1. **Phase 1 prep**: Write `learning-loop-migration.js` com ALTER TABLE steps + index creation. **Não roda ainda** — apenas código. Validate idempotency via fixture.
2. **Phase 1 commit**: Wire `runtime-store.js#initSchema()` para chamar `runMigration()`. Run em fixture DB pre/post → assert no schema change second run.
3. **Phase 1 finish**: Implement `src/commands/context-load.js` (DD-1=b). Mirror para `template/src/`. Test: AC-ALL-101..105.
4. **Phase 2**: FTS5 virtual table + triggers via Migration step 5-7 (já no `runMigration()`). Implement `src/commands/memory-search.js` + `learning-loop-fts5.js` helpers. Mirror. Test: AC-ALL-201..205.
5. **Phase 3**: `src/learning-loop-archive.js` + `memory-archive.js` + `memory-restore.js`. Validity-window enforcement em wrapper functions. Mirror. Test: AC-ALL-301..306.
6. **Phase 4**: 3 check functions em `src/doctor.js` + threshold formula em `learning-loop-engine.js`. i18n keys. Mirror. Test: AC-ALL-401..406.
7. **Phase 5**: `learning-loop-engine.js#runHookOnFeatureClose()` + integration em `src/commands/feature-close.js`. DD-3 lock pattern. Foreground com timeout 5s. Tier-2 notify. Mirror. Test: AC-ALL-501..506.
8. **Phase 6**: 2 fixture tests + extend `sync-agents-preflight.js`. Wiring audit per brain sheldon-006. Cross-platform CI. Test: AC-ALL-601..605.

**Each phase ends with**: (a) commit, (b) `npm run sync:agents:preflight` validation, (c) `npm test -- <phase-test>` pass, (d) update `.aioson/plans/active-learning-loop/manifest.md` phase status.

---

## Hook execution flow (Phase 5, foreground)

```
aioson feature:close --slug=X
  │
  ├── existing flow: gate validation, dossier finalize, features.md update
  │
  └── NEW: post-finalize hook
        │
        ├── Read .aioson/context/prd-X.md classification frontmatter
        │   └── if MICRO: emit notify --level=info "skipped MICRO" → exit 0
        │
        ├── Read features.md status of X
        │   └── if 'abandoned': skip hook → exit 0
        │
        ├── Acquire lock via INSERT INTO evolution_log
        │   (feature_slug=X, event_type='auto_distillation',
        │    start_at=now(), end_at=NULL, actor='auto', payload.state='start')
        │   └── if INSERT fails (duplicate active row): emit notify "already in progress" → exit 0
        │
        ├── Start setTimeout(5000) -> AbortController.abort()
        │
        ├── try {
        │     runDistillation(X):
        │       1. pattern:detect --feature=X → patterns[]
        │       2. learning:auto-promote --feature=X → {promoted, for_review}
        │       3. brain merge candidates (if S1 ever ships; V1 skip)
        │       returns DistillationResult
        │   }
        ├── catch (err) {
        │     UPDATE evolution_log SET event_type='distillation_failed',
        │       end_at=now(), payload_json={...error info}
        │     WHERE rowid=lock_row
        │     // do not rethrow — best-effort silent (BR-ALL-05)
        │   }
        │
        ├── UPDATE evolution_log SET end_at=now(),
        │     payload_json={state:'complete', promoted:N, review:M, merge:K, duration_ms:D}
        │   WHERE rowid=lock_row
        │
        ├── aioson notify --level=info --topic=learning-loop
        │     --message="distillation: N promoted, M for review, K merge candidates"
        │
        └── exit 0
```

## Lock primitive sequence (DD-3)

```
Process A: feature:close --slug=X        Process B: feature:close --slug=X
─────────────────                         ─────────────────
SELECT 1 FROM evolution_log
  WHERE feature_slug=X
    AND event_type='auto_distillation'
    AND end_at IS NULL
  → 0 rows

INSERT row (end_at=NULL)
  → rowid=42 committed
                                          SELECT 1 FROM evolution_log
                                            WHERE feature_slug=X
                                              AND event_type='auto_distillation'
                                              AND end_at IS NULL
                                            → 1 row (rowid=42)

(run distillation 3s)                     emit notify "already in progress"
                                          → exit 0

UPDATE rowid=42 SET end_at=now()
emit notify "complete"
→ exit 0
```

**SQLite atomicity**: better-sqlite3 statements são autocommit unless wrapped em transaction. SELECT then INSERT em sequência: race window microscópico (microseconds). Para fechá-lo: usar `INSERT INTO evolution_log ... WHERE NOT EXISTS (SELECT ...)` em single statement OR usar `BEGIN IMMEDIATE` transaction. @dev decide com base em testing (testar com 100 concurrent invocations em fixture).

**Stuck row mitigation**: doctor V2 check `distillation_stuck` detecta `start_at > 24h ago AND end_at IS NULL` → propõe `aioson memory:unlock --feature=X` para release. V1: documentar como known limitation; manual cleanup via `UPDATE evolution_log SET end_at=...`.

---

## Inception mirror parity verification (Phase 6)

Brain `sheldon-001`: every `src/` edit MUST mirror to `template/src/`. Brain `sheldon-006`: design-complete ≠ execution-complete — wiring audit obrigatório.

**Verification points** (each is an AC sub-step in Phase 6):

1. **File parity**: `diff -r src/ template/src/ | grep -v node_modules` returns only known divergences (none for new files).
2. **Config parity**: `.aioson/config/learning-loop.json` exists in both `.aioson/config/` (workspace) AND `template/.aioson/config/` (template), with same default values.
3. **Command registration**: `src/cli.js` and `template/src/cli.js` both register `memory:search`, `memory:archive`, `memory:restore`, `context:load`.
4. **Doctor wiring**: `src/doctor.js` and template version both invoke the 3 new check functions in `runDoctor()`.
5. **Hook wiring**: `src/commands/feature-close.js` and template both call `learning-loop-engine.runHookOnFeatureClose()` post-finalize.
6. **i18n parity**: All 4 message files have the same set of new keys (no missing translations even if minimal).
7. **Autonomy protocol**: `template/.aioson/config/autonomy-protocol.json` lists new commands in tier1/tier2.
8. **Permission generation**: After `aioson update .` em test fixture, all 4 native permission files (.claude/, .codex/, .gemini/, .opencode/) reflect new commands.

`sync-agents-preflight.js` extension (Phase 6 implementation):
```javascript
const NEW_PARITY_TARGETS = [
  'src/learning-loop-engine.js',
  'src/learning-loop-schemas.js',
  'src/learning-loop-migration.js',
  'src/learning-loop-fts5.js',
  'src/learning-loop-archive.js',
  'src/commands/memory-search.js',
  'src/commands/memory-archive.js',
  'src/commands/memory-restore.js',
  'src/commands/context-load.js',
  '.aioson/config/learning-loop.json',
];
// for each: check existence + checksum em src/ vs template/src/
```

---

## Risk-driven decisions

Risks da `requirements § Risks identified` que justificam decisões aqui:

| Risk | Decision aqui |
|------|---------------|
| Concurrency lock cross-platform | DD-3: SQLite row-level (portable, atomic) — não filesystem flock |
| Migration grande em DB grande | ALTER TABLE em SQLite moderno é O(1) — confirmed via runtime version check |
| FTS5 backfill demora | Guard via COUNT(*) check — só roda uma vez no first init |
| learning-loop.json drift entre projetos | `installer.js` merge-aware copy (preserves user overrides) — pattern existing |
| Stuck distillation row (crash mid-hook) | Documentado V1 limitation; V2 doctor check `distillation_stuck` + `memory:unlock` |

---

## Handoff section for `@ux-ui`

**Não aplicável.** Active-learning-loop é CLI-only feature, sem componentes visuais. `project_type=script`, `design_skill=""`.

---

## Explicit non-goals/deferred items

Herdado consolidado (PRD + requirements):

- ❌ Auto-archive sem aprovação humana
- ❌ Auto-merge de brains (DD-5 = follow-up `brain-curation`)
- ❌ LLM-driven clustering / semantic embedding (PMD-3)
- ❌ Cross-projeto memory federation
- ❌ Skill consolidation em `.aioson/installed-skills/`
- ❌ FTS5 sobre brains (V1 only project_learnings)
- ❌ Multi-channel gateway
- ❌ Auto-distillation em `agent:done` (apenas em `feature:close`)
- ❌ Vector retrieval (sqlite-vec) — V2 trajectory
- ❌ Per-category half-life — V2
- ❌ Squad-aware loop — feature futura
- ❌ Atropos-style RL trajectory export — permanente fora
- ❌ Loop em projetos MICRO (PMD-5)
- ❌ Background execution mode (DD-2 = foreground; V2 if needed)
- ❌ Doctor check `distillation_stuck` (V2)
- ❌ `aioson memory:unlock` command (V2 — manual SQL until then)
- ❌ Brain overlap proposal `brain_overlap_candidate` (DD-5)

---

## Notes for @dev

### Pattern reuse (per brain sheldon-005 + design-doc reuse hierarchy)
- Reuse `src/utils.js` functions where applicable.
- For SQL helpers: extend `src/runtime-store.js` if helper is widely usable; else inline em `learning-loop-*.js`.
- For path operations: use `path.posix.join` for normalization in JSON storage; `path.join` for filesystem operations.
- For event emission: reuse `runtime-store.js#appendRunEvent()`.
- For notify: reuse `src/commands/notify.js` invocation pattern.

### Test strategy
- Each phase has dedicated test file. Each test file ≤300 lines (per design-doc).
- Use `os.tmpdir()` + `crypto.randomBytes(8)` for unique test dirs.
- `afterEach()` cleanup mandatory.
- Cross-platform: validate on Windows (path separators), macOS, Linux.

### Code organization
- One file = one responsibility (per design-doc).
- Pure functions (`computeStalenessThreshold`, `validatePayload`) isolated em `learning-loop-schemas.js` ou `learning-loop-engine.js` for testability.
- Side-effect functions (filesystem move, DB write) clearly marked + traced.

### Validation gates before commit
After each phase:
1. `npm test -- <phase-test>` passes
2. `npm run sync:agents:preflight` shows zero drift
3. `node bin/aioson.js doctor` shows zero new warnings (or only expected ones)
4. File size discipline: warn em >500 lines (per design-doc REQ-DISC-05)
5. Update plan phase status to `done` em manifest

---

> **Gate B:** Architecture approved — @dev can proceed.
