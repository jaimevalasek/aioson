---
target_prd: .aioson/context/prd-active-learning-loop.md
enrichment_round: 1
last_enrichment_at: 2026-05-14
plan_path: .aioson/plans/active-learning-loop/manifest.md
sizing_score: 15
sizing_decision: path-b-external-phased
classification: MEDIUM
agent: sheldon
---

# Sheldon Enrichment — active-learning-loop

## Sources used

**Research (web, salvo em `researchs/`):**
- `anthropic-dreaming-2026/` (verdict: has-alternatives) — CRITICAL: Dreaming shipou 6-mai-2026, 7 dias antes do PRD. Recalibrou differentiation.
- `hermes-agent-architecture-2026/` (verdict: has-alternatives) — confirmou SQLite+FTS5 baseline; cadência 5-tool-calls vs feature:close.
- `agent-memory-backends-2026/` (verdict: confirmed) — validou FTS5 V1; surface V2 trajectory (sqlite-vec, per-category half-life, Zep validity-window).
- `skill-consolidation-patterns-2026/` (verdict: has-alternatives) — Auto Dream cadência + per-file size budget.
- `multi-agent-token-budget-2026/` (reused from deyvin-subtask-scout) — token efficiency baseline.
- `sub-agent-patterns-2026/` (reused) — cross-LLM orchestration valida harness-agnostic edge.

**Internal (varredura completa):**
- 8 plans históricos lidos (sdlc-process-upgrade Phase 8 + feature-dossier + agent-chain-continuity + harness-driven-aioson + cypher-agent + deyvin-density + secure-by-default + deyvin-subtask-scout)
- `src/memory-reflect-engine.js`, `src/commands/learning*.js`, `src/commands/pattern-detect.js`, `src/doctor.js`, `src/runtime-store.js` analisados
- `.aioson/brains/sheldon/architecture-decisions.brain.json` — todos 6 nodes (q:5) aplicáveis
- Constitution articles II/III/IV/V/VI/VII

## Improvements applied (14)

### 🔴 Critical (4)
1. **Differentiation section nova** no PRD — table comparativa Hermes/Dreaming/Auto Dream/AIOSON + justificativa do `feature:close` como unidade SDD-aligned + justificativa do no-LLM-in-loop.
2. **M2 reformulado** — reuso `execution_events` com `event_type IN ('rule_loaded', 'brain_loaded')` ao invés de tabela nova. Zero migration. DD-1 (mecanismo de instrumentação) deferred para @architect.
3. **M2 schema migration concern resolvida** via PMD-1 (reuso). Sem novo schema, sem upgrade necessário em instalações existentes.
4. **Success metric "5 features no AIOSON" fixture concreto** — `tests/active-learning-loop-inception.test.js` simulando 5 `feature:close` em tmpdir + `tests/fixtures/memory-search-queries.json`.

### 🟡 Important (7)
5. **Comparação de cadência** adicionada à Differentiation section.
6. **M5 evolution_log com Zep validity-window** — `start_at`/`end_at` per entry, append-only. Audit trail permanente.
7. **M3 threshold flexível** — `N = max(5, ceil(avg_days_last_5_features / 7))` ao invés de fixed 5.
8. **MICRO behavior resolvido** — loop OFF em MICRO (movido para Out of scope explícito + PMD-5).
9. **Concurrency lock** registrado como DD-3 no manifest (não cabe no PRD, é decisão @architect).
10. **Per-layer size budget** — fold em `agent:audit` existente, não novo check (PMD-8).
11. **Squad scope** explícito como out-of-scope V1.

### 🟢 Refinements (3)
12. **Out-of-scope explícito** para vector retrieval (sqlite-vec V2), per-category half-life, Atropos-style RL.
13. **Sourced anchor** Harvey 6× completion-rate como expectativa qualitativa.
14. **Inception fixture spec** concreta em Phase 6 (`tests/active-learning-loop-inception.test.js` + `tests/inception-parity-active-learning-loop.test.js`).

## Improvements discarded (0)

Nenhuma. Usuário aprovou todas as 14.

## Sizing breakdown

| Critério | Valor | Pontos |
|---|---|---|
| Entidades principais acima de 3 | 6 (rule_load events, evolution_log entries, FTS5 index, archive schema, distillation config, doctor checks) | +3 |
| Distinct delivery phases acima de 1 | 6 fases | +10 |
| External integrations | 0 | 0 |
| User flows acima de 3 | 4 (3 PRD + 1 inception self-test) | +1 |
| AC complexity acima de 10 | ~30 ACs (AC-ALL-101..605) | +1 |
| **Total** | | **15** |

→ Path B (≥7) obrigatório.

## Plan files created

- `.aioson/plans/active-learning-loop/manifest.md` — 6 phases, 10 PMDs, 5 DDs, references
- `.aioson/plans/active-learning-loop/plan-telemetry-foundation.md` — Phase 1 (AC-ALL-101..105)
- `.aioson/plans/active-learning-loop/plan-memory-search-fts5.md` — Phase 2 (AC-ALL-201..205)
- `.aioson/plans/active-learning-loop/plan-memory-archive-with-evolution-log.md` — Phase 3 (AC-ALL-301..306)
- `.aioson/plans/active-learning-loop/plan-doctor-curation-checks.md` — Phase 4 (AC-ALL-401..406)
- `.aioson/plans/active-learning-loop/plan-feature-close-distillation-hook.md` — Phase 5 (AC-ALL-501..506)
- `.aioson/plans/active-learning-loop/plan-inception-mirror-parity.md` — Phase 6 (AC-ALL-601..605)

## Code findings (já no codebase, prontos para reuso)

- `src/memory-reflect-engine.js` — pipeline determinístico Living Memory; pattern reutilizável para distillation engine
- `src/commands/learning-evolve.js`, `learning-auto-promote.js`, `pattern-detect.js` — primitivos existentes; Phase 5 apenas orquestra
- `src/runtime-store.js:454-489` — `project_learnings` table com `frequency`, `status`, `promoted_to`, `last_reinforced`
- `src/runtime-store.js:833-880` — `appendRunEvent()` reutilizável para `event_type='rule_loaded'`
- `src/doctor.js:273-363` — check pattern, `assessScoutPruning()` precedent
- `src/commands/sync-agents-preflight.js` — `checkParity()` extensível para novos files
- `.aioson/config/autonomy-protocol.json` v1.1 — tier-2 contract já materializado

## Next step

**Handoff a `@analyst`** — produzir `requirements-active-learning-loop.md` resolvendo:
- Schema final de `evolution_log` (DDL exato)
- Schema final de `learnings_fts` virtual table (column weights se DD-4 escolher custom BM25)
- Entity model: target_type taxonomy, archive folder convention
- ACs em forma binária para harness contract (Phase 5 do @architect → harness:init via `aioson harness:init`)
- Edge cases: concurrent feature:close, schema migration de installations v1.x, MICRO classification detection
