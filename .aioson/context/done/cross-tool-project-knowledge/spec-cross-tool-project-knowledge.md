---
gate_execution: approved
feature: cross-tool-project-knowledge
status: in_progress
started: 2026-05-30
classification: SMALL
extends: active-learning-loop
gate_requirements: approved
gate_design: approved
gate_plan: approved
phase_gates:
  requirements: approved
  design: approved
  plan: approved
last_agent: dev
last_session: 2026-05-30T17:22:27-03:00
session_result: completed
last_checkpoint: "execution: M4-M6 complete and focused tests pass — next: @qa Gate D verification"
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

**Remaining implementation slices:** none. Feature is ready for @qa Gate D verification.

**Slice 3 — M4 universal loading directive (LANDED 2026-05-30):**
- `AGENTS.md`, `CLAUDE.md`, `OPENCODE.md`: canonical `## Project knowledge` block added near boot instructions.
- `template/AGENTS.md`, `template/CLAUDE.md`, `template/OPENCODE.md`: same canonical block mirrored for new installs/update-managed entry-points.
- `.gemini/GEMINI.md` and `template/.gemini/GEMINI.md` intentionally untouched per Q-CTPK-08 / BR-CTPK-06.
- Verification: textual scan confirms exactly the six expected entry-points contain the directive and `.gemini` has zero hits.

**Slice 4 — M5 import-from-claude (LANDED 2026-05-30):**
- `src/learning-import-claude.js` (new): safe Claude memory reader for `~/.claude/projects/{hash}/memory/MEMORY.md` + linked files, deterministic project-hash default, path containment, technical classification (`gotcha` / `resolution` / `operator-preference` / `unknown`), and explicit selection parsing.
- `src/commands/learning.js`: adds `import-from-claude` subcommand with `--project-hash`, `--dry-run`, and `--select=<n[,n]|all>`. Dry-run lists candidates with zero DB/filesystem mutation; selected technical candidates promote through `upsertProjectLearning` using `type='quality'` + `kind`.
- `src/cli.js`: fixes `aioson learning . --sub=<name>` dispatch so documented `--sub` syntax works, including the new M5 command.
- i18n help lines updated in 4 locales.
- Tests: +2 in `tests/cross-tool-project-knowledge.test.js` cover dry-run no mutation and selected import with operator-preference filtering.

**Slice 5 — M6 inception parity (LANDED 2026-05-30):**
- `template/.aioson/learnings/gotchas/.gitkeep` + `template/.aioson/learnings/recipes/.gitkeep`: greenfield setup now ships learnings directories because installer copies files, not empty directories.
- `.aioson/learnings/gotchas/.gitkeep` + `.aioson/learnings/recipes/.gitkeep`: workspace mirror for inception parity and committed project-memory structure.
- `tests/inception-parity-cross-tool-project-knowledge.test.js` (new): validates greenfield `installTemplate` placeholders, universal directive in `AGENTS.md`/`CLAUDE.md`/`OPENCODE.md`, intentional Gemini exclusion, template parity, and CLI wiring for `learning --sub=import-from-claude`.
- Verification: new M6 suite 4/4 green; focused feature suite 16/16 green; active-learning-loop inception parity 4/4 green; `.gemini` textual scan has zero project-knowledge hits.

**Gate C — PM plan (APPROVED 2026-05-30):**
- `.aioson/context/implementation-plan-cross-tool-project-knowledge.md` sequences the remaining work as M4, M5, M6, stabilization.
- Project preflight runs as MEDIUM even though this feature's artifacts classify the slice as SMALL; the plan exists to satisfy the MEDIUM executor gate.
- `gate:check B` passed because `architecture.md` exists; Gate B status was stale and was approved before Gate C.

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
- **Writes:** `project_learnings.kind` (migration), `.aioson/learnings/**` (M2/M3), `src/learning-materialize.js` (novo), `src/learning-import-claude.js` (novo), `src/commands/devlog-process.js` (M1 mapping), `src/commands/learning.js` (M5 dispatch), `src/cli.js` (`--sub` dispatch), `template/agents/_shared/learning-capture-directive.md` (novo), `runtime-store.js` (base schema), `src/learning-loop-engine.js` (M2 hook), `AGENTS.md`/`CLAUDE.md`/`OPENCODE.md` + template mirrors (M4).

## Notes
- **NÃO** tocar `template/.gemini/GEMINI.md` com a diretiva (Q-CTPK-08 / gemini-phaseout coupling).
- **Inception parity obrigatória** (src + template em paralelo; parity test no QA — BR-CTPK-09).
- **Zero regressão sobre active-learning-loop** (BR-CTPK-10) — rodar a suite de active-learning-loop + os 5 metrics.
- Schema change é **só** `kind` — não adicionar `cited_files` como coluna (derivar do evidence body).
- SMALL → próximo agente é **@dev** (pula @architect).

## QA sign-off
[To be filled by @qa after implementation]

## Session close — 2026-05-30
Agent: @dev
Result: completed
Next: @qa Gate D verification for cross-tool-project-knowledge.

## QA Sign-off

- **Date:** 2026-05-30
- **Verdict:** PASS
- **Residual:** Full repository npm test not rerun; scoped feature and active-learning-loop parity suites passed.
- **Gate D (execution):** approved
