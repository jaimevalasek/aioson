# Diagramas — Active Learning Loop em ASCII

> Fluxos canônicos da feature. ASCII porque renderiza em qualquer terminal, qualquer Markdown viewer, e qualquer diff.

---

## 1. `feature:close` → destilação → `evolution_log` → `doctor`

```
aioson feature:close --slug=minha-feature --verdict=PASS
  │
  ├── [existente] gate validation
  ├── [existente] dossier finalize
  ├── [existente] features.md update
  │
  └── [NOVO] runHookOnFeatureClose()
        │
        ├── Lê PRD frontmatter classification
        │   └── MICRO? → notify "skipped: MICRO classification" → exit 0
        │
        ├── Lê features.md status
        │   └── abandoned? → skip silencioso → exit 0
        │
        ├── --no-distill passado? → skip → exit 0
        │
        ├── Tenta adquirir lock:
        │   INSERT INTO evolution_log
        │     (feature_slug='minha-feature', event_type='auto_distillation',
        │      start_at=now(), end_at=NULL, actor='auto', payload='{"state":"start"}')
        │   └── row ativa já existe? → notify "already in progress" → exit 0
        │
        ├── setTimeout(5000ms) → AbortController.abort()
        │
        ├── try {
        │     learning:auto-promote --feature=minha-feature
        │       └── retorna { promoted: N, for_review: M }
        │   }
        │   catch (err) {
        │     UPDATE evolution_log SET event_type='distillation_failed',
        │       end_at=now(), payload='{"error":"...", "phase":"auto-promote"}'
        │     // engole exceção — não relança
        │   }
        │
        ├── UPDATE evolution_log SET end_at=now(),
        │     payload='{"state":"complete","promoted":N,"review":M,"merge":0,"duration_ms":D}'
        │
        ├── aioson notify --level=info --topic=learning-loop
        │     --message="distillation: N promoted, M for review, 0 merge candidates"
        │
        └── exit 0  ← sempre 0, independente de falha na destilação
```

---

## 2. Padrão de lock (DD-3 — dois terminais simultâneos)

```
Terminal A                              Terminal B
──────────────────────────────────      ──────────────────────────────────
feature:close --slug=X                  feature:close --slug=X (simultâneo)

SELECT 1 FROM evolution_log
  WHERE feature_slug='X'
    AND event_type='auto_distillation'
    AND end_at IS NULL
  → 0 rows

INSERT row (end_at=NULL) → rowid=42
                                        SELECT 1 ... → 1 row (rowid=42)
                                        notify "already in progress" → exit 0

(distillação roda ~2-3s)

UPDATE rowid=42 SET end_at=now()
notify "N promoted, M for review"
exit 0
```

---

## 3. `memory:archive` — operação atômica com rollback

```
aioson memory:archive --id=rule:authn --reason="obsoleta após OAuth"
  │
  ├── Verifica AIOSON_RUNTIME_HOOK=1 → recusa (tier-2 humano-only)
  │
  ├── Resolve path: .aioson/rules/authn.md
  │   └── não existe? → erro: "target not found"
  │
  ├── Já arquivada? → noop (idempotente)
  │
  ├── aioson notify --level=warn --topic=memory-archive
  │     --message="archiving rule:authn — authn.md"
  │
  ├── BEGIN TRANSACTION (SQLite)
  │
  ├── move físico:
  │   .aioson/rules/authn.md
  │     → .aioson/rules/_archived/2026-05-14/authn.md
  │   └── erro no move → ROLLBACK → exit 1
  │
  ├── INSERT evolution_log (event_type='archived', start_at=now(), end_at=NULL,
  │     target_type='rule', target_id='authn', reason='obsoleta após OAuth',
  │     actor='human', feature_slug=<--feature se passado>)
  │
  ├── UPDATE evolution_log SET end_at=now()
  │     WHERE target_id='authn' AND end_at IS NULL AND event_type != 'archived'
  │   (fecha entry ativo anterior)
  │
  ├── COMMIT
  │   └── erro no COMMIT → tenta reverter move físico → exit 1
  │
  └── { ok: true, path: "_archived/2026-05-14/authn.md" }
```

---

## 4. Ciclo do `doctor` com os novos checks

```
$ aioson doctor .
        │
        ▼
┌──────────────────────────────────────────────────────────────────┐
│ runDoctor(targetDir)                                             │
│  └─ checks[]                                                     │
│      ├─ ... [checks existentes severity='error'] ...             │
│      ├─ living-memory:bootstrap_coverage   [severity: warning]   │
│      ├─ living-memory:features_dir         [severity: warning]   │
│      ├─ living-memory:claude_commands      [severity: warning]   │
│      ├─ living-memory:version_drift        [severity: warning]   │
│      ├─ living-memory:permissions_in_sync  [severity: warning]   │
│      │                                                           │
│      ├─ [NOVO] living-memory:rule_staleness   [severity: warning]│
│      │    └─ query: execution_events WHERE event_type='rule_loaded'
│      │           AND context LIKE 'feature=%' GROUP BY slug
│      │           → stale se nenhum hit nas últimas N features     │
│      │                                                           │
│      ├─ [NOVO] living-memory:learning_orphans [severity: warning]│
│      │    └─ query: project_learnings WHERE status='promoted'    │
│      │           LEFT JOIN execution_events (rule_loaded, after  │
│      │           promoted_at) → orphan se join retorna NULL      │
│      │                                                           │
│      └─ [NOVO] living-memory:distillation_lag [severity: warning]│
│           └─ count(features fechadas) vs count(auto_distillation │
│              em evolution_log) → lag se fechadas > distillations │
│                                                                  │
│  report.ok = errorCount === 0                                    │
│  (warnings somam em failedCount mas não afetam ok)              │
└──────────────────────────────────────────────────────────────────┘
```

---

## 5. Validity-window no `evolution_log`

```
Estado inicial (regra ativa):
─────────────────────────────────────────────────────────────────
 rowid | target_type | target_id | event_type | start_at   | end_at
   1   |   'rule'    |  'authn'  |  'created' | 2026-01-10 | NULL   ← ativo

memory:archive roda:
─────────────────────────────────────────────────────────────────
 rowid | target_type | target_id | event_type | start_at   | end_at
   1   |   'rule'    |  'authn'  |  'created' | 2026-01-10 | 2026-05-14  ← fechado
   2   |   'rule'    |  'authn'  |  'archived'| 2026-05-14 | NULL        ← ativo

memory:restore roda:
─────────────────────────────────────────────────────────────────
 rowid | target_type | target_id | event_type | start_at   | end_at
   1   |   'rule'    |  'authn'  |  'created' | 2026-01-10 | 2026-05-14
   2   |   'rule'    |  'authn'  |  'archived'| 2026-05-14 | 2026-05-14  ← fechado
   3   |   'rule'    |  'authn'  |  'restored'| 2026-05-14 | NULL        ← ativo

Invariante: start_at e reason nunca mudam após INSERT.
           Apenas end_at é atualizado, e só uma vez.
```

---

## 6. FTS5 — fluxo de sincronização e busca

```
project_learnings (tabela normal)
        │
        │ triggers SQL (INSERT, UPDATE, DELETE)
        ▼
project_learnings_fts (virtual table FTS5)
   colunas indexadas: title, evidence
   ranking: BM25 (default)
        │
        │ aioson memory:search "autenticação JWT"
        ▼
  Sanitização da query:
    input:  "autenticação JWT"
    tokens: ["autenticação", "JWT"]
    FTS5:   '"autenticação" "JWT"'  ← token-AND, cada token é frase literal
        │
        ▼
  SELECT l.*, fts.rank
  FROM project_learnings_fts fts
  JOIN project_learnings l ON l.rowid = fts.rowid
  WHERE fts MATCH '"autenticação" "JWT"'
    AND l.status != 'archived'   ← excluídas por default
  ORDER BY fts.rank              ← BM25 (menor = mais relevante)
  LIMIT 5
        │
        ▼
  Resultado:
  [1] autenticação-jwt-refresh (score: -2.14)
      "Tokens JWT de refresh devem ter TTL de 7 dias..."
  [2] jwt-audience-validation (score: -1.87)
      ...
```

---

## Continue lendo

- [O que é o Active Learning Loop](./ativo-learning-loop.md) — conceito e fases
- [Como usar](./como-usar.md) — exemplos concretos
- [Doctor checks](./doctor-checks.md) — o que os checks significam
- [Troubleshooting](./troubleshooting.md) — problemas conhecidos
