---
decision: DD-4
phase: 2
slug: memory-search-fts5
resolved_by: architect
resolved_at: 2026-05-14
status: closed
---

# DD-4 — `memory:search` FTS5 ranking strategy

**Resolution**: **BM25 default** (`ORDER BY rank`).

**Behavior**:
- Query plan: `SELECT *, rank FROM project_learnings_fts WHERE project_learnings_fts MATCH ? ORDER BY rank LIMIT ?`.
- Default `LIMIT 5`; configurable via `--limit`.
- Snippet generation via FTS5 `snippet()` function: `snippet(project_learnings_fts, -1, '<b>', '</b>', '...', 32)` for 32-token surrounding context with bold highlight markers (text mode strips them, JSON preserves).

**Why BM25 default**:
- FTS5 built-in; zero configuration.
- V1 dataset small (5-100 entries por projeto). BM25 outperforms uniform IDF em datasets pequenos.
- AIOSON priority: working baseline > optimal-tuned-but-complex.
- Test fixture in Phase 2 measures precision: ≥8/10 queries return relevant hit.

**V2 trajectory** (if Phase 2 retrospective shows precision <0.7):
- Custom column weighting via `bm25(project_learnings_fts, title_weight, evidence_weight)`. Likely values: title weight 2.0, evidence 1.0 (title is curated, evidence is free-text).
- Cross-surface ranking: rule (status=promoted) > learning (status=active) > brain (read-only). Implementação via post-query boost ou separate queries per surface + merge.
- Reciprocal rank fusion if vector retrieval entered V2 (out of scope V1 per PMD-7).

**Trade-offs accepted**:
- No surface-aware ranking V1 — rules and learnings ranked uniformly via BM25.
- No semantic similarity (purely lexical match).

---

## Implementation guardrails for @dev (Phase 2)

Não-negociáveis ao implementar `src/commands/memory-search.js` e `src/learning-loop-fts5.js`:

1. **Bind parameters apenas** (EC-ALL-08, SQL injection guard).
   `db.prepare(...).all({ query, limit, ... })` — NUNCA `db.prepare(\`... ${query} ...\`)`. Mesmo o `MATCH` recebe a string via binding: `WHERE project_learnings_fts MATCH :query`.

2. **Query sanitization antes do MATCH** (EC-ALL-08, special-char handling).
   FTS5 reserva `"`, `*`, `(`, `)`, `NEAR`, `AND`, `OR`, `NOT` como operadores. Default V1: trate o input como **phrase query** — escape `"` e wrap em aspas: `const fts = '"' + raw.replace(/"/g, '""').trim() + '"'`. Operadores FTS5 ficam opt-in via flag futura `--fts-syntax` (não em V1).

3. **Length cap** (EC-ALL-08).
   `if (query.length > 500)` → retornar i18n key `memory_search.query_too_long` + exit não-zero (CLI) ou `{ ok: false, reason: 'query_too_long' }` (JSON). Cap antes de qualquer processamento.

4. **Empty / whitespace query**.
   `if (!query.trim())` → mesmo erro que length cap, mensagem distinta (`memory_search.query_empty`). Não execute SQL.

5. **`ORDER BY rank` é mandatório** — `LIMIT` sem `ORDER BY` retorna ordem física, não relevância. Test asserts que primeiro hit tem `rank` ≤ segundo.

6. **Default filtro `end_at IS NULL`** (BR-ALL-09). Phase 2 ainda não tem coluna `end_at` em `project_learnings_fts` (entra em Phase 3 via ALTER da view source `project_learnings`). Implementação V1 antes de Phase 3: skip o filtro, return all matches; quando Phase 3 ALTER aterrissar, o WHERE clause já está pronto e funciona sem mudança de code. Documentar como TODO comentado.

7. **Snippet config** — usar `snippet(project_learnings_fts, -1, ...)` (coluna -1 = melhor coluna match). Field index 1 (`evidence`) fixo serve mas perde matches que casaram em `title`.

8. **Search é silent** — NÃO emita `runtime:emit` para queries de search. Não é `context_load` event. Se quiser instrumentar uso futuro, abrir feature separada (`memory_searched` event_type novo) em V2.

9. **JSON output schema fixo** (downstream dashboard reads this):
   ```json
   { "ok": true, "query": "...", "result_count": N,
     "results": [
       { "target_type": "rule", "target_id": "...", "feature_slug": "...",
         "status": "promoted", "snippet": "...", "score": <rank value> }
     ] }
   ```

10. **i18n keys novas** (`memory_search.*`): `no_results`, `results_header`, `snippet_truncated`, `query_too_long`, `query_empty`. 4 locales (en, pt-BR, es, fr) obrigatórios — pattern já estabelecido em `context_load.*` (Phase 1).

## Cross-cutting com outras DDs

- **DD-1 (Phase 1, closed)**: `context:load` instrumenta carga de rules/brains em `execution_events`. Search **NÃO** consome esses eventos; quem consome é Phase 4 doctor (`living-memory:learning_orphans`). Manter essa boundary clara evita acoplamento desnecessário entre `memory:search` e telemetria.
- **DD-2 / DD-3 (Phase 5)**: distillation hook insere/promove rows em `project_learnings` → triggers FTS5 (deliverable desta Phase 2) sincronizam para `project_learnings_fts` automaticamente. Não há work extra em Phase 5 para search.
- **DD-5 (deferido)**: brain merge não entra em search V1 (PMD-9 — brains read-only). Se o follow-up `brain-curation` shippar, ainda assim brains permanecem fora do FTS5 — `query.js` por tags é o entry point.

## Metric trigger para reabrir DD-4 em V2

- Suite `tests/fixtures/memory-search-queries.json` (criada em Phase 2) define ≥10 queries representativas.
- **Sucesso V1**: ≥8/10 queries retornam ≥1 hit relevante em projeto teste com 5+ features fechadas.
- **Se ≤7/10**, reabrir DD-4. Sequência V2 (em ordem de custo crescente):
  1. Column weights custom: `bm25(project_learnings_fts, w_title, w_evidence, ...)` com `w_title=2.0, w_evidence=1.0` (title é curado, evidence é livre).
  2. Pre-merge por surface: query separada por `target_type`, merge via reciprocal rank fusion.
  3. Trigger PMD-7 V2 (vector retrieval via `sqlite-vec`) — dependência nativa + LLM-call para embeddings; só vale a pena se etapas 1 e 2 ainda falharem.
- V2 fica em `decision-search-ranking-v2.md` (artefato novo, preservando esta decisão como histórico).

**Full reasoning**: see `.aioson/context/architecture-active-learning-loop.md § DD-1..DD-5 resolutions`.
