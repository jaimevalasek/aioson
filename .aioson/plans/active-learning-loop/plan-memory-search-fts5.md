---
phase: 2
slug: memory-search-fts5
manifest: .aioson/plans/active-learning-loop/manifest.md
depends_on: [telemetry-foundation]
status: done
completed_at: 2026-05-14
completed_by: dev
---

# Phase 2 — Memory Search (FTS5)

## Scope

Tornar a memória curada (`project_learnings` + rules promovidas) buscável por texto natural via `aioson memory:search "<query>"`. Sem busca, a curadoria não recompensa o uso — artefatos curados viram `.md` mortos. Validado por `researchs/agent-memory-backends-2026/` (SQLite+FTS5 é padrão de produção).

## New or modified entities

- **Virtual table FTS5** `project_learnings_fts`:
  ```sql
  CREATE VIRTUAL TABLE project_learnings_fts USING fts5(
    title, evidence, target_type, target_id, feature_slug, status,
    content='project_learnings', content_rowid='rowid'
  );
  ```
- **Triggers de sync** (INSERT/UPDATE/DELETE em `project_learnings`):
  - `project_learnings_ai` (after insert)
  - `project_learnings_au` (after update)
  - `project_learnings_ad` (after delete)
- **Comando CLI** `src/commands/memory-search.js`:
  ```bash
  aioson memory:search "<query>" [--limit=5] [--include-archived] [--surface=rules|learnings|all] [--json]
  ```
- **i18n keys**: `memory_search.no_results`, `memory_search.results_header`, `memory_search.snippet_truncated` em `src/i18n/messages/{en,pt-BR,es,fr}.js`.

## User flows covered

PRD § "Searching curated memory across features" (3 steps, todos cobertos por esta phase).

## Acceptance criteria

- **AC-ALL-201** (binary): `aioson memory:search "<query>"` retorna top 5 hits (configurável via `--limit`) com `target_type, target_id, snippet, score (BM25), feature_slug, status`.
- **AC-ALL-202** (binary): Search cobre rules promovidas (via target_type='rule') + active learnings (status='active' OR 'promoted'). Brains ficam fora em V1 (`query.js` por tags).
- **AC-ALL-203** (binary): Triggers mantêm sync FTS5 quando `project_learnings` recebe INSERT/UPDATE/DELETE. Fixture validate post-mutation queries.
- **AC-ALL-204** (binary): Entries com `end_at` populado (Phase 3) são excluídas por padrão; `--include-archived` flag opt-in.
- **AC-ALL-205** (binary): Fixture `tests/fixtures/memory-search-queries.json` define 10 queries de teste; em projeto teste com 5 features, ≥8 retornam ≥1 hit relevante (success metric do PRD).

## Implementation sequence

1. **@architect resolve DD-4** (BM25 default vs custom weighting), grava em `decision-search-ranking.md`.
2. **@analyst** confirma schema FTS5 (single virtual table vs joined views) em `requirements-active-learning-loop.md`.
3. **@dev** adiciona virtual table + triggers via `runtime-store.js` migration helper (idempotent).
4. **@dev** implementa `src/commands/memory-search.js` com flags + JSON output.
5. **@dev** i18n keys.
6. **@dev** mirror para `template/`.
7. **@dev** populate `tests/fixtures/memory-search-queries.json` + integration test.
8. **@qa** valida precision metric em fixture.

## External dependencies

Nenhuma. FTS5 vem built-in com `better-sqlite3` (precompilado com `--enable-fts5`).

## Notes para @dev

- `runtime-store.js` migration helper: virtual tables são DDL — usar `db.exec()` dentro de `IF NOT EXISTS` check.
- Brain `sheldon-005`: este é um CLI command novo, prefere via `src/cli.js` registration, NÃO via direct file write.
- BM25 é default do FTS5; se DD-4 escolher custom weighting, usar `bm25(project_learnings_fts, 5.0, 2.0, 1.0, 1.0, 0.5, 0.5)` (column weights).
- Output JSON inclui `query`, `result_count`, `results[]` (para dashboard consumir).

## Notes para @qa

- Precision metric: query "prisma migration" deve retornar rule sobre Prisma se foi promovida; query "react component reuse" deve retornar brain de site-forge se promovido.
- Stress test: 1000 entries em `project_learnings`, query latency p99 ≤50ms.
- Test edge cases: query vazia, query com SQL injection chars, query >500 chars.

## Reference sources

- `researchs/agent-memory-backends-2026/` — SQLite+FTS5 production pattern
- `researchs/hermes-agent-architecture-2026/` — Hermes uses FTS5 over conversation summaries
- Internal sweep §5 — runtime-store.js tables (no FTS5 exists today)
