---
feature: active-learning-loop
classification: MEDIUM
generated_by: analyst
generated_at: 2026-05-14
prd: .aioson/context/prd-active-learning-loop.md
plan: .aioson/plans/active-learning-loop/manifest.md
sheldon_enrichment: .aioson/context/sheldon-enrichment-active-learning-loop.md
---

# Requirements — Active Learning Loop

## Feature summary

Fechar o loop entre os primitivos de aprendizado já existentes (`learning`, `pattern:detect`, brains, `evolution_log`) e o ciclo de `feature:close`, com telemetria de uso de rules/brains, busca FTS5, archive tier-2 com validity-window, e doctor proativo. Implementação 100% local, sem LLM no loop logic, inception-mirrored.

---

## New entities and fields

### E1. Virtual table `project_learnings_fts` (FTS5)

Virtual table para busca full-text sobre `project_learnings`. **NÃO é tabela real** — usa `content='project_learnings'` para evitar duplicação de storage; o conteúdo é lido via rowid sync.

| Coluna | Tipo | Nullable | Constraint / Nota |
|--------|------|----------|-------------------|
| title | TEXT | no | indexado FTS5 (peso default) |
| evidence | TEXT | yes | indexado FTS5 (peso default) |
| rowid | INTEGER | no | implícito; sync com `project_learnings.rowid` via triggers |

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS project_learnings_fts USING fts5(
  title,
  evidence,
  content='project_learnings',
  content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);
```

**Triggers de sync obrigatórios** (idempotentes via `IF NOT EXISTS`):
```sql
CREATE TRIGGER project_learnings_ai AFTER INSERT ON project_learnings BEGIN
  INSERT INTO project_learnings_fts(rowid, title, evidence)
  VALUES (new.rowid, new.title, new.evidence);
END;

CREATE TRIGGER project_learnings_ad AFTER DELETE ON project_learnings BEGIN
  INSERT INTO project_learnings_fts(project_learnings_fts, rowid, title, evidence)
  VALUES ('delete', old.rowid, old.title, old.evidence);
END;

CREATE TRIGGER project_learnings_au AFTER UPDATE ON project_learnings BEGIN
  INSERT INTO project_learnings_fts(project_learnings_fts, rowid, title, evidence)
  VALUES ('delete', old.rowid, old.title, old.evidence);
  INSERT INTO project_learnings_fts(rowid, title, evidence)
  VALUES (new.rowid, new.title, new.evidence);
END;
```

**Backfill obrigatório no primeiro init** (idempotente — só roda se FTS5 está vazia):
```sql
INSERT INTO project_learnings_fts(rowid, title, evidence)
  SELECT rowid, title, evidence FROM project_learnings
  WHERE NOT EXISTS (SELECT 1 FROM project_learnings_fts LIMIT 1);
```

### E2. Filesystem entity — `.aioson/config/learning-loop.json`

JSON config copiado pelo `installer.js` do template para projetos novos. Override por-projeto.

| Campo | Tipo | Default | Constraint |
|-------|------|---------|------------|
| `$schema` | string | `https://aioson.dev/schemas/learning-loop.v1.json` | URI |
| `enabled` | boolean | `true` | feature flag global |
| `skip_on_classification` | string[] | `["MICRO"]` | enum: MICRO/SMALL/MEDIUM |
| `execution_mode` | string | `background` | enum: foreground/background (DD-2) |
| `lock_strategy` | string | `sqlite-row` | enum: sqlite-row/flock/advisory (DD-3) |
| `auto_promote_threshold` | integer | `3` | min 1; frequency mínimo para promote |
| `staleness_window_features_min` | integer | `5` | min 1; piso do `N` na formula M3 |

### E3. Filesystem entities — Archive folders

Criados on-demand pelo `memory:archive` (não existem no template inicial). `.gitkeep` em `template/.aioson/context/_archived/` para garantir mirror.

| Path | Conteúdo |
|------|----------|
| `.aioson/rules/_archived/{YYYY-MM-DD}/<rule-slug>.md` | Arquivo rule movido na íntegra |
| `.aioson/brains/_archived/{YYYY-MM-DD}/<brain-id>.brain.json` | Brain node JSON movido na íntegra |
| `.aioson/context/_archived/{YYYY-MM-DD}/<learning-id>.json` | Snapshot JSON de project_learnings row arquivada |

**Convenção de data**: `YYYY-MM-DD` (UTC, do CLI host). Granularidade de dia é suficiente — collisions intra-dia adicionam sufixo `-{seq}` (ex: `2026-05-14-2`).

---

## Changes to existing entities

### M1. `evolution_log` — ALTER TABLE add columns

Tabela existente tem schema squad-focado (`id, applied_at, deltas_count, squad_slug, files_json, source_learning_ids_json` — `src/runtime-store.js:766-773`). Adicionar 9 colunas via ALTER TABLE (compatíveis com legacy rows = NULL).

| Coluna nova | Tipo | Nullable | Constraint / Nota |
|-------------|------|----------|-------------------|
| `event_type` | TEXT | yes (legacy=NULL) | CHECK: NULL OR IN ('legacy_squad', 'promoted', 'archived', 'restored', 'auto_distillation', 'distillation_failed') |
| `target_type` | TEXT | yes | CHECK: NULL OR IN ('rule', 'learning', 'brain') |
| `target_id` | TEXT | yes | identificador estável: rule-slug, learning_id, ou brain node id |
| `start_at` | TEXT | yes | ISO 8601 UTC, populated em promote/restore/distillation |
| `end_at` | TEXT | yes | ISO 8601 UTC, populated em archive/supersede; NULL = entry ativa |
| `reason` | TEXT | yes | free-text humano (archive) ou auto-gerado (distillation) |
| `actor` | TEXT | yes | CHECK: NULL OR IN ('human', 'auto') OR matches `agent:.+` regex |
| `feature_slug` | TEXT | yes | referencia features.md row (não FK — filesystem) |
| `payload_json` | TEXT | yes | JSON extras conforme event_type (ver F2 abaixo) |

**Migration commands** (executados em ordem via `runtime-store.js` initSchema, com check de coluna existente):
```sql
ALTER TABLE evolution_log ADD COLUMN event_type TEXT;
ALTER TABLE evolution_log ADD COLUMN target_type TEXT;
ALTER TABLE evolution_log ADD COLUMN target_id TEXT;
ALTER TABLE evolution_log ADD COLUMN start_at TEXT;
ALTER TABLE evolution_log ADD COLUMN end_at TEXT;
ALTER TABLE evolution_log ADD COLUMN reason TEXT;
ALTER TABLE evolution_log ADD COLUMN actor TEXT;
ALTER TABLE evolution_log ADD COLUMN feature_slug TEXT;
ALTER TABLE evolution_log ADD COLUMN payload_json TEXT;
```

**Note**: SQLite não suporta `ALTER TABLE ADD CONSTRAINT`. Os CHECKs são enforced em código aplicativo (`runtime-store.js` insert wrappers), não no schema. Legacy rows ficam com `event_type=NULL` e são tratadas como `'legacy_squad'` por convenção.

### M2. `execution_events` — extensão de tipo (sem schema change)

Adicionar 2 novos valores ao enum lógico de `event_type` (já é TEXT livre):
- `rule_loaded` — emitido quando agente carrega uma rule
- `brain_loaded` — emitido quando agente consulta brain node via `query.js`

**payload_json schema obrigatório** para esses tipos:
```json
{
  "target_slug": "agent-language-policy",
  "target_path": ".aioson/rules/agent-language-policy.md",
  "loader_agent": "dev",
  "feature_slug": "active-learning-loop",
  "classification": "MEDIUM",
  "ts_iso": "2026-05-14T03:21:45.123Z"
}
```

**Sem migration**. Tabela `execution_events` aceita qualquer string em `event_type`.

### M3. `project_learnings` — sem schema change, novas business rules

Schema atual (`src/runtime-store.js:473-489`) é suficiente. Mudanças são comportamentais (ver BR-ALL-03 abaixo).

---

## New indexes (production query support)

| Index | Tabela | Colunas | WHERE | Justificativa |
|-------|--------|---------|-------|---------------|
| `idx_execution_events_context_load` | execution_events | (event_type, agent_name) | `event_type IN ('rule_loaded', 'brain_loaded')` | Doctor `rule_staleness` query: scan parcial sobre eventos de load. Sem este, scan O(events). |
| `idx_evolution_log_target` | evolution_log | (target_type, target_id) | — | Lookup de history por artefato (ex: `memory:why --id=X`). |
| `idx_evolution_log_active` | evolution_log | (target_type, target_id, end_at) | `end_at IS NULL` | Validity-window query: encontrar entry ativa atual. Parcial reduz tamanho. |
| `idx_evolution_log_feature` | evolution_log | (feature_slug, event_type) | — | Distillation lag query: contar `auto_distillation` por feature. |

---

## Relationships

```
project_learnings (existing)
  ├── 1:N evolution_log (target_type='learning', target_id=learning_id) — soft ref
  └── 1:1 project_learnings_fts (via rowid sync) — virtual

evolution_log (extended)
  ├── 1:N execution_events (payload_json.target_slug matches target_id) — JSON ref
  ├── N:1 features.md row (feature_slug, filesystem ref)
  └── 1:N filesystem (rule/brain/learning archived under _archived/{date}/)

execution_events (existing)
  ├── N:1 agent_runs (run_key FK)
  └── reads target identification from payload_json.target_slug
```

Nenhuma FK constraint nova — todos os refs cruzam fronteira filesystem/DB.

---

## Migration order

Executado pelo `runtime-store.js#initSchema` em sequência idempotente. Cada step verifica existência antes de aplicar.

1. **ALTER TABLE evolution_log** — adiciona 9 colunas (one ALTER per column, skip if column exists via `PRAGMA table_info`).
2. **CREATE INDEX idx_evolution_log_target** (D2).
3. **CREATE INDEX idx_evolution_log_active** (D3).
4. **CREATE INDEX idx_evolution_log_feature** (D4).
5. **CREATE VIRTUAL TABLE project_learnings_fts** (E1) — FTS5.
6. **CREATE TRIGGERS** project_learnings_ai, _au, _ad — sync.
7. **Backfill FTS5** — INSERT INTO project_learnings_fts SELECT FROM project_learnings (one-time, guarded por count check).
8. **CREATE INDEX idx_execution_events_context_load** (D1).

**Nenhum step requer downtime**. Schemas legacy continuam funcionando após cada step. Rollback: drop new columns/indexes/virtual table (manual, não automatizado em V1).

---

## Business rules

### BR-ALL-01 — Actor enforcement em `memory:archive` / `memory:restore`
Esses comandos só aceitam invocação direta de humano. Bloqueio: detectar `process.env.AIOSON_RUNTIME_HOOK === '1'` ou ausência de TTY (`process.stdout.isTTY === false`) → exit non-zero com mensagem "memory:archive requires human invocation (tier 2)". Hook code paths setam `actor='auto'` apenas para `event_type='auto_distillation'` ou `'distillation_failed'`, nunca para archive.

### BR-ALL-02 — `evolution_log` é append-only
Nenhuma UPDATE pode mutar `start_at`, `reason`, `payload_json` de entry existente. Único UPDATE permitido: setar `end_at` quando target é arquivado/superseded (WHERE end_at IS NULL). Enforce em código (runtime-store.js wrappers); SQL puro pode burlar mas não é caminho suportado.

### BR-ALL-03 — Transição de status em `project_learnings` exige evolution_log entry
Quando `project_learnings.status` muda para `'promoted'` ou `'archived'`, o code path responsável (`learning-auto-promote.js`, `memory-archive.js`) DEVE inserir entry em `evolution_log` com:
- `event_type` correspondente
- `target_type='learning'`, `target_id=learning_id`
- `start_at=now()` (promoted) ou `end_at=now()` em entry ativa anterior (archived)
- `actor='auto'` ou `'human'`

Transição sem evolution_log entry é bug — detectado em `tests/evolution-log-coverage.test.js`.

### BR-ALL-04 — Feature classification source
`feature:close --slug=X` lê classification de `.aioson/context/prd-X.md` frontmatter `classification:` field. Se ausente, fallback para `MEDIUM` (conservativo). Cached no payload_json do `auto_distillation` event para auditoria.

### BR-ALL-05 — Distillation hook é best-effort
Falha em qualquer sub-step (`pattern:detect`, `learning:auto-promote`, write-back) não causa exit non-zero em `feature:close`. Falha registrada em `evolution_log` com `event_type='distillation_failed'` e `payload_json.error_phase`. Article: Living Memory reflection never blocks workflows.

### BR-ALL-06 — Tier-2 notify obrigatório em archive/restore
Antes de qualquer mutação (filesystem move + DB write), comando emite `aioson notify --level=warn --topic=memory --message="archiving rule X: reason Y"`. Notify é informativo (não bloqueante por design v1.1), mas exit non-zero do notify aborta o comando (defense em depth).

### BR-ALL-07 — Triggers FTS5 são transacionais
better-sqlite3 default em mode WAL + autocommit; INSERT/UPDATE/DELETE em `project_learnings` + trigger fire em `project_learnings_fts` são atomic. Crash mid-transaction = rollback ambos.

### BR-ALL-08 — payload_json size cap
Eventos `rule_loaded` / `brain_loaded` têm `payload_json` ≤4KB. Truncar `evidence`-like fields antes de insert; adicionar `"_truncated": true` marker. Previne log bloat em workspaces grandes.

### BR-ALL-09 — `memory:search` default filter
Query default: `WHERE end_at IS NULL` (apenas active entries). Flag `--include-archived` remove filtro. Resultados marcados com `archived: true` quando aplicável.

### BR-ALL-10 — Inception test isolation
Fixtures de Phase 6 (`tests/active-learning-loop-inception.test.js` e `inception-parity-active-learning-loop.test.js`) operam em `os.tmpdir()/aioson-test-{rand}/` único por test run. Nunca tocam `.aioson/runtime/aios.sqlite` real. Cleanup em afterEach.

### BR-ALL-11 — MICRO opt-out total
Quando feature classification é `MICRO` (PMD-5):
- Hook `feature:close` NÃO dispara distillation (zero evolution_log entries para MICRO features).
- Doctor checks `rule_staleness`, `learning_orphans`, `distillation_lag` retornam `skipped: true` com hint "feature is MICRO; classification gates exempt this from loop checks".
- `memory:search` e `memory:archive` permanecem disponíveis (são úteis em qualquer classificação).

### BR-ALL-12 — Feature status `abandoned` skip
Hook só dispara para features com `features.md` status transitioning `in_progress → done`. Status `abandoned` produz zero evolution_log entries.

---

## Edge cases

### EC-ALL-01 — Rule renomeada/movida
Cenário: rule estava em `.aioson/rules/A.md`, agora em `.aioson/rules/B.md`. Telemetria pré-rename tem `payload_json.target_path` apontando para A.
**Resolução**: doctor staleness queries agrupam por `payload_json.target_slug` (basename sem extensão), não `target_path`. Renames preservam slug = telemetria continua. Renames que mudam slug = histórico fica órfão; documentado como known limitation.

### EC-ALL-02 — `feature_slug` NULL no context_load
Cenário: agente carrega rule fora de uma feature ativa (ex: `aioson workflow:status`).
**Resolução**: `feature_slug` no payload_json é opcional. Doctor staleness queries usam DISTINCT(target_slug, feature_slug) e contam eventos com `feature_slug IS NOT NULL` para "loaded in last N features"; eventos com NULL contam para "loaded at all" (suaviza false-positives).

### EC-ALL-03 — Concurrent `feature:close --slug=X` (mesma feature)
Cenário: dois processos chamam `feature:close --slug=user-auth` simultaneamente.
**Resolução**: DD-3 mechanism (@architect picks). Spec require: segunda invocação detecta active distillation (via SQLite SELECT em evolution_log com event_type='auto_distillation' AND start_at < now AND payload_json.completed IS NULL) e retorna no-op com `aioson notify --level=info --message="distillation already in progress for slug X"`.

### EC-ALL-04 — `memory:archive` de target já archived
Cenário: rule já está em `_archived/2026-05-10/`, usuário roda `memory:archive --id=rule-X` novamente.
**Resolução**: idempotent no-op. Detect via `evolution_log` query `WHERE target_id=X AND target_type='rule' AND end_at IS NULL` retorna 0 rows → mensagem "already archived, no-op" em stderr, exit 0. Nenhuma row nova inserida.

### EC-ALL-05 — Schema migration em aios.sqlite v1.x existente
Cenário: usuário tem AIOSON v1.7.x em uso, atualiza para versão com active-learning-loop.
**Resolução**: `runtime-store.js#initSchema` é idempotente. Cada ALTER TABLE verifica `PRAGMA table_info(evolution_log)` antes de adicionar coluna. Nenhuma migration tool externa; tudo on-startup. Legacy rows mantém `event_type=NULL` (interpretado como `'legacy_squad'`).

### EC-ALL-06 — MICRO project com loop instalado
Cenário: usuário cria projeto MICRO, template inclui `learning-loop.json` com `enabled: true`.
**Resolução**: BR-ALL-11. Hook fires mas detecta classification MICRO e short-circuits. Doctor checks retornam `skipped` ao invés de `ok=true|false`. Zero overhead em projetos MICRO.

### EC-ALL-07 — `memory:restore` após schema change
Cenário: rule arquivada em V1 (formato schema A), restaurada após upgrade para V2 (schema B).
**Resolução**: restore copia file content as-is do `_archived/{date}/`. Se schema mudou e content é inválido para V2, agentes carregam mas podem ignorar campos novos. Documentado em hint: "restored content may need manual update if schema changed since archive date".

### EC-ALL-08 — `memory:search` com special chars / SQL injection
Cenário: usuário roda `aioson memory:search "DROP TABLE; --"`.
**Resolução**: better-sqlite3 parameter binding (`db.prepare(...).all(query)`) — query string nunca interpolada em SQL. FTS5 query syntax aceita NEAR/AND/OR/NOT como operators; chars perigosos como `'` são escaped automaticamente. Adicionalmente: query >500 chars → error "query too long".

### EC-ALL-09 — payload_json oversize em load events
Cenário: `evidence`-like field em payload causa load_event >4KB.
**Resolução**: BR-ALL-08. Truncate via `JSON.stringify(payload).slice(0, 4096)` + flag `_truncated: true`. Doctor queries ignoram payload truncado mas count event para frequency.

### EC-ALL-10 — Múltiplos agentes carregando mesma rule
Cenário: `@dev` e `@qa` carregam `.aioson/rules/security-baseline.md` na mesma feature.
**Resolução**: cada agente emite seu próprio event. Doctor queries usam DISTINCT(target_slug, feature_slug) para staleness — rule "carregada em features X, Y" mesmo se múltiplos agentes carregaram. `payload_json.loader_agent` preservado para análise futura.

### EC-ALL-11 — Fresh install, zero history
Cenário: usuário roda `aioson doctor` em projeto AIOSON recém-setup, sem features fechadas.
**Resolução**: doctor checks retornam `ok=true` (nenhum candidate). distillation_lag suprimido até primeira feature fechar. `living-memory:learning_orphans` retorna `ok=true` (nenhum promoted ainda).

### EC-ALL-12 — Feature aborted, hook não dispara
Cenário: usuário roda `aioson feature:close --slug=X --abandon`.
**Resolução**: BR-ALL-12. Hook checa final status na features.md — se `abandoned`, zero evolution_log entries. Feature pode ser reopened mais tarde sem trigger automático.

### EC-ALL-13 — Cross-platform path separator (Windows vs Unix)
Cenário: `payload_json.target_path` é `.aioson\\rules\\X.md` no Windows.
**Resolução**: `runtime-store.js` insert wrappers normalizam paths para forward-slash via `path.posix.join`. Queries no doctor comparam paths normalizados. Filesystem operations usam `path.join` (OS-native).

### EC-ALL-14 — Locked DB (concurrent better-sqlite3 connections)
Cenário: `aioson feature:close` e `aioson memory:search` rodam simultaneamente.
**Resolução**: SQLite WAL mode (já configurado em `runtime-store.js#initSchema`) permite leituras concorrentes durante escrita. Locks são acquired per-statement, liberados em microsegundos. Risco residual: long-running queries durante distillation. Mitigation: distillation usa transações curtas.

### EC-ALL-15 — `learning-loop.json` malformado ou ausente
Cenário: usuário edita `learning-loop.json` manualmente e gera JSON inválido.
**Resolução**: load function retorna defaults + warning via `aioson notify --level=warn --topic=config --message="learning-loop.json malformed, using defaults"`. Loop continua funcional. Arquivo ausente = defaults silenciosos.

---

## Out of scope for this feature

Herdado do PRD (referência cruzada apenas):
- Auto-archive sem aprovação humana
- Auto-merge de brains (S1 vira proposta-only)
- LLM-driven clustering / semantic embedding
- Cross-projeto / `~/.aioson/global/`
- Skill consolidation em `.aioson/installed-skills/`
- FTS5 sobre brains (apenas project_learnings em V1)
- Multi-channel gateway (Telegram/Discord/Slack)
- Auto-distillation em `agent:done`
- Vector retrieval (sqlite-vec) — V2
- Per-category half-life — V2
- Squad-aware loop (squad_learnings consolidation) — feature futura
- Atropos-style RL trajectory export — permanente fora
- Loop em projetos MICRO

Adicionais identificados por @analyst durante mapeamento:
- **CLI verb `aioson migrate`** — migrations são idempotent at-startup via `runtime-store.js#initSchema`; nenhum verb externo necessário.
- **Backup/restore de `evolution_log`** — relies on user backing up `aios.sqlite` por outros meios; specific backup tool deferred.
- **Encryption at rest** para `evolution_log.reason` — `reason` é free-text humano e pode conter contexto sensível. V1 não criptografa; usuários sensíveis usam disk encryption.
- **Real-time dashboard updates** — dashboard externa lê SQLite; refresh é pull-based, não push. Active-learning-loop não adiciona event subscription.
- **LLM-based query rewriting** em `memory:search` — pure FTS5 + tokens user-supplied. Sem reranking semântico em V1.
- **CLI verb `learning-loop:run --feature=X` manual** — útil para replay/debugging mas não MVP. Hook automático cobre 100% do caso normal.
- **Per-rule configurable staleness window** — V1 usa formula global; per-rule override é V2 se houver dado de uso indicando necessidade.

---

## Acceptance criteria mapping (binary, harness-ready)

Os ACs já estão definidos por phase no plano de Sheldon. Esta seção é o **mapping requirements ↔ ACs** para consumo do `@architect` ao popular `harness-contract.json`:

| Phase | Phase slug | ACs | Requirements seções afetadas |
|-------|------------|-----|-------------------------------|
| 1 | telemetry-foundation | AC-ALL-101..105 | E1 backfill, M2 (execution_events), D1 (idx), BR-08, EC-09, EC-13 |
| 2 | memory-search-fts5 | AC-ALL-201..205 | E1 (FTS5 + triggers), BR-07, BR-09, EC-08, EC-14 |
| 3 | memory-archive-with-evolution-log | AC-ALL-301..306 | M1 (ALTER TABLE), E3 (archive folders), D2/D3/D4 (idx), BR-01, BR-02, BR-03, BR-06, EC-04, EC-05, EC-07 |
| 4 | doctor-curation-checks | AC-ALL-401..406 | BR-11 (MICRO skip), EC-01, EC-02, EC-10, EC-11; formula threshold lives in doctor.js |
| 5 | feature-close-distillation-hook | AC-ALL-501..506 | BR-04, BR-05, BR-11, BR-12, EC-03, EC-06, EC-12, E2 (config) |
| 6 | inception-mirror-parity | AC-ALL-601..605 | BR-10, todos os mirrors src/ ↔ template/ |

---

## Risks identified

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Triggers FTS5 quebram em SQLite versões antigas (<3.20) | Médio — desabilita search | better-sqlite3 ≥7.x bundles SQLite ≥3.40; package.json já enforces. Doctor check em Phase 6 valida runtime version. |
| ALTER TABLE em produção pode reescrever tabela inteira em SQLite pre-3.25 | Baixo — runtime version já moderna | Não aplicável; SQLite atual usa rowmap optimization. Documented as no-op risk. |
| Telemetria de rule load em alta frequência infla SQLite | Médio — bloat em workspaces longos | BR-ALL-08 (payload cap 4KB) + futuro pruning de execution_events velhos (V2). |
| Concurrency lock primitive escolhido em DD-3 não funciona cross-platform | Alto — distillation duplica | @architect deve testar em Windows + macOS + Linux antes de finalizar DD-3. Phase 6 fixtures asserts cross-platform. |
| Migração de evolution_log em DB grande (>100MB) demora | Baixo — DB do AIOSON pequeno | ALTER TABLE ADD COLUMN é O(1) em SQLite moderno (não rewrite). |
| FTS5 backfill em projeto com milhares de learnings demora startup | Baixo — backfill é one-shot | Guard via count check; só roda uma vez. Documentado. |
| `learning-loop.json` divergência entre projetos cliente após upgrade | Médio — config drift | `aioson update` aplica merge inteligente (preserve user overrides); doctor Phase 6 valida schema. |

---

## Notes for @architect (next agent)

### Decisions a fechar antes de @dev iniciar:
- **DD-1** (Phase 1): instrumentação rule-load mechanism — (a) per-agent inline / (b) `aioson context:load` CLI verb / (c) `rule-loader` skill central. **Recomendação @analyst**: (b) — match com brain `sheldon-005` (CLI over direct write); permite test isolation; single source of instrumentation logic.
- **DD-2** (Phase 5): foreground vs background execution. **Recomendação**: background com `child_process.spawn(detached)` para resilience em CI. Foreground complica testing de Phase 6.
- **DD-3** (Phase 5): lock primitive. **Recomendação**: SQLite row-level (`INSERT INTO evolution_log (...) VALUES (..., 'in_progress')` antes da work + UPDATE para 'completed' depois). Atomic, portable, sem deps externas.
- **DD-4** (Phase 2): FTS5 ranking. **Recomendação**: BM25 default (`ORDER BY rank`). Custom weighting só se Phase 2 retrospective mostrar precision <0.7.
- **DD-5** (Phase 4): Brain merge S1 — recomendo deferral para follow-up MICRO feature; mantém Phase 4 focado em doctor checks.

### Arquitetural concerns a validar:
- Padrão de extension via ALTER TABLE preserva backward-compat — confirmar em arquitetura final.
- FTS5 virtual table com `content='project_learnings'` exige rowid sync; documentar pattern em `.aioson/design-docs/` se reusable.
- Hook em `feature:close` é o primeiro hook que invoca multi-step engine — pattern reusable para futuras features (deyvin-density, secure-by-default já fizeram hooks simpler).

---

## Pendências (resolvidas)

Nenhuma pendência aberta para o @analyst. Todas as decisões pendentes (DD-1..DD-5) estão no escopo do @architect, com recomendações documentadas acima.
