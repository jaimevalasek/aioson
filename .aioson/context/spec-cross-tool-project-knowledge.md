---
feature: cross-tool-project-knowledge
status: in_progress
started: 2026-05-30
classification: SMALL
extends: active-learning-loop
gate_requirements: approved
---

# Spec — Cross-tool Project Knowledge Memory

## What was built

**Slice 1 — schema + M1 capture (LANDED 2026-05-30):**
- `src/runtime-store.js`: `project_learnings` base `CREATE TABLE` gains `kind TEXT` (last column, fresh installs).
- `src/learning-loop-migration.js`: **Phase 4** — idempotent `ALTER TABLE project_learnings ADD COLUMN kind` (guarded by `listColumns`); `SCHEMA_VERSION` bumped `3 → 4` so existing DBs re-run instead of taking the fast-path. FTS5/rowids untouched (no rebuild).
- `src/commands/devlog-process.js`: `extractTaggedLearnings` recognizes `[gotcha]`/`[resolution]` → `{type:'quality', kind}`; the 4 base tags keep `kind=null` (backward compat). `upsertProjectLearning` persists `kind` with an **app-level allow-list** (`normalizeKind`, NULL for unknown) + re-tag enrichment that never clobbers an existing classification. `extractTaggedLearnings` + `upsertProjectLearning` now exported.
- `template/agents/_shared/learning-capture-directive.md` (new): 2 signals (`gotcha`, `resolution`), devlog `## Learnings` tag format, PII/committed warning. Distinct from operator-memory's `memory-capture-directive.md`.
- `tests/cross-tool-project-knowledge.test.js` (9 tests, all green): parser, Phase-4 migration (legacy v3→v4 + idempotent), kind allow-list + enrichment, e2e devlog round-trip.
- Regression: 30 affected suites pass; only `AC-P1-07` (pre-existing operator-memory) fails — confirmed via stash that it fails without these changes too. Zero new regressions.

**Slice 2 — M2 materialization + M3 INDEX (LANDED 2026-05-30):**
- `src/learning-materialize.js` (new): `materializeLearnings({db, targetDir})` — queries `WHERE status='active' AND kind IN ('gotcha','resolution')`, writes `.aioson/learnings/{gotchas,recipes}/{slug}.md` (frontmatter `type=kind`, `category`, `cited_files` parsed from evidence body), regenerates `INDEX.md` (category ASC → updated_at DESC, line ≤200 chars). Idempotent (rewrite only if `row.updated_at` newer — BR-CTPK-03); in-run slug collision disambiguated by feature_slug (EC-CTPK-05); orphan cleanup of DB-managed files when a learning leaves `active` (EC-CTPK-09) while leaving hand-authored files (no `learning_id`) untouched; true no-op when nothing active and no dir (EC-CTPK-02). Sync fs, no new dep.
- `src/learning-loop-engine.js`: `runDistillation` calls `materializeLearnings` after auto-promote/lock-release, wrapped best-effort (never breaks `feature:close` — BR-CTPK-02); result exposed as `materialized` in the return. `feature-close.js:493` already passes `targetDir`.
- Tests: +5 in `tests/cross-tool-project-knowledge.test.js` (14 total green): category routing + frontmatter + INDEX ordering, idempotency skip, rewrite-on-newer, EC-CTPK-02 no-op, EC-CTPK-09 orphan cleanup + user-file safety.
- Regression: 13 learning/feature-close/distillation suites (118 tests) pass, 0 fail. Full suite run pending.

**Remaining slices (not yet built):** M4 universal loading directive (`CLAUDE.md`/`AGENTS.md`/`OPENCODE.md`, NOT `.gemini/`), M5 `learning --sub=import-from-claude`, M6 inception-parity test + `.gitkeep` placeholders.

[current-state.md hot-log entry deferred until the feature lands — avoids churn for an in-progress multi-slice feature.]

## Entities added / changed
- **`project_learnings.kind`** (TEXT, nullable) — nova coluna via `ALTER TABLE ADD COLUMN` (idempotente). `kind ∈ {NULL, 'gotcha', 'resolution'}`; project-knowledge learnings = `type='quality'` + `kind`. Allow-list validada em app code. FTS5/rowids intactos (sem recreate).
- **Disk artifacts (não-DB):** `.aioson/learnings/{gotchas,recipes}/{slug}.md` (frontmatter + evidence body) + `.aioson/learnings/INDEX.md` (1 linha/learning, `category > updated_at DESC`).

## Key decisions
- **2026-05-30** Q-CTPK-01: `ADD COLUMN kind` (não recreate) — FTS5 external-content acoplado por rowid torna recreate arriscado; ADD COLUMN é a primitiva segura da convenção do repo (`learning-loop-migration.js:18-19`). Mapeamento `type='quality'` + `kind`.
- **2026-05-30** Q-CTPK-02: materialização só em `feature:close` (hook em `runDistillation`, após auto-promote, sob o lock existente).
- **2026-05-30** Q-CTPK-03: PII trust-user V1 + aviso no capture directive.
- **2026-05-30** Correção @analyst: captura é via pipeline de **devlog** (`upsertProjectLearning`), não via verbo `learning capture` (inexistente). M1 cria `learning-capture-directive.md` (irmão do `memory-capture-directive.md` da operator-memory).
- **2026-05-30** Q-CTPK-04/05/06 deferidas a V2 (defaults V1: sem paginação, sem profile-aware, lock reusado do distillation).

## Edge cases handled
Ver `requirements-cross-tool-project-knowledge.md` § 8 (EC-CTPK-01..10). Críticos:
- EC-CTPK-01: M2 cria `.aioson/learnings/{gotchas,recipes}/` no 1º run.
- EC-CTPK-03: migration idempotente (guard de coluna existente).
- EC-CTPK-09: learning archived → arquivo on-disk omitido do INDEX (status≠active) + cleanup best-effort.

## Dependencies
- **Reads:** `project_learnings` (+FTS5), `~/.claude/projects/{hash}/memory/` (M5 import), `CLAUDE.md`/`AGENTS.md`/`OPENCODE.md` (M4 entry-points).
- **Writes:** `project_learnings.kind` (migration), `.aioson/learnings/**` (M2/M3), `src/learning-materialize.js` (novo), `src/commands/devlog-process.js` (M1 mapping), `src/commands/learning.js` (M5 dispatch), `template/agents/_shared/learning-capture-directive.md` (novo), `runtime-store.js` (base schema), `src/learning-loop-engine.js` (M2 hook).

## Notes
- **NÃO** tocar `template/.gemini/GEMINI.md` com a diretiva (Q-CTPK-08 / gemini-phaseout coupling).
- **Inception parity obrigatória** (src + template em paralelo; parity test no QA — BR-CTPK-09).
- **Zero regressão sobre active-learning-loop** (BR-CTPK-10) — rodar a suite de active-learning-loop + os 5 metrics.
- Schema change é **só** `kind` — não adicionar `cited_files` como coluna (derivar do evidence body).
- SMALL → próximo agente é **@dev** (pula @architect).

## QA sign-off
[To be filled by @qa after implementation]
