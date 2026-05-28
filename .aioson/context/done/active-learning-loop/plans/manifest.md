---
target_prd: .aioson/context/prd-active-learning-loop.md
sheldon_version: 1.7.2
created_at: 2026-05-14
status: pending
sizing_score: 15
sizing_decision: path-b-external-phased
classification: MEDIUM
---

# Plan — Active Learning Loop

## Overview

6 fases independentemente implementáveis que fecham o loop entre os primitivos de aprendizado existentes (`learning`, `pattern:detect`, brains, `evolution_log`) e o ciclo real de `feature:close`, com telemetria de uso, busca FTS5, archive humano-aprovado, e doctor proativo.

**Pacote final**: 1 hook em `feature:close`, 1 schema validity-window em `evolution_log`, 1 virtual table FTS5, 2 novos comandos CLI (`memory:search`, `memory:archive`), 3 novos doctor checks, 2 fixture tests de inception.

## Phase table

| # | Slug | Dependências | Saída principal | ACs |
|---|------|--------------|-----------------|-----|
| 1 | `telemetry-foundation` ✓ qa_approved | — | `execution_events` instrumentado, DD-1 fechada (done 2026-05-14; QA PASS 2026-05-14) | AC-ALL-101..105 |
| 2 | `memory-search-fts5` ✓ | Phase 1 | virtual table `learnings_fts`, `aioson memory:search` (done 2026-05-14, awaiting @qa) | AC-ALL-201..205 |
| 3 | `memory-archive-with-evolution-log` ✓ qa_approved | Phase 1 | schema validity-window, `aioson memory:archive`/`memory:restore` (done 2026-05-14; QA PASS 2026-05-14) | AC-ALL-301..306 |
| 4 | `doctor-curation-checks` ✓ qa_approved | Phases 1+3 | 3 checks novos com threshold flexível (done 2026-05-14; QA PASS 2026-05-14) | AC-ALL-401..406 |
| 5 | `feature-close-distillation-hook` ✓ qa_approved | Phases 1+3+4 | hook em `feature:close`, tier-2 notify (done 2026-05-14; QA PASS 2026-05-14) | AC-ALL-501..506 |
| 6 | `inception-mirror-parity` ✓ qa_approved | todas | fixture tests + extensão sync:agents preflight (done 2026-05-14; QA PASS 2026-05-14 — AC-ALL-604 deferred to docs pass) | AC-ALL-601..605 |

## Pre-made decisions

- **PMD-1**: Reuso `execution_events` com `event_type IN ('rule_loaded', 'brain_loaded')` — NÃO criar `context_load_events`. Reason: zero migration para instalações existentes; Article VI (Simplicity).
- **PMD-2**: Cadência = `feature:close`. NÃO usar tool-call count (Hermes), time-window (Auto Dream) ou on-demand (Dreaming). Reason: SDD-aligned, Article III (Observable Work).
- **PMD-3**: Heurística determinística no loop. NO-LLM in loop logic. Reason: barato, determinístico, offline-capable, auditável.
- **PMD-4**: Tier-2 obrigatório em `memory:archive`. NÃO auto-archive. Reason: Article VII (Zero Trust); autonomy-protocol v1.1.
- **PMD-5**: MICRO classification pula o loop inteiro. Reason: brain `sheldon-002` (classification gates scale process depth).
- **PMD-6**: `evolution_log` usa Zep-style validity-window (`start_at`/`end_at` por entry). Append-only. Reason: audit trail permanente, reversibilidade.
- **PMD-7**: FTS5 only V1. Vector retrieval (`sqlite-vec`) deferred V2. Reason: dependência nativa + LLM-call para embeddings = overengineering antes de uso real.
- **PMD-8**: Per-layer size budget fold em `agent:audit` existente. NÃO novo check. Reason: Article VI; reuso de superfície existente.
- **PMD-9**: 4 surfaces de memória cobertas em V1 = rules, learnings, (read-only) brains. Skills (`.aioson/installed-skills/`) e cross-projeto fora.
- **PMD-10**: `memory:restore` complementa `memory:archive` — não muta entries, cria novo `start_at`. Reason: PMD-6 consistency.

## Deferred decisions

- **DD-1 (Phase 1)**: Mecanismo de instrumentação para rule/brain loading.
  - Owner: `@architect`
  - Options:
    - (a) Per-agente inline — cada `.aioson/agents/*.md` chama `aioson runtime:emit` no preflight
    - (b) CLI verb central `aioson context:load --target=rule:X --agent=Y` que agentes invocam
    - (c) Skill central `rule-loader` que centraliza match + emit
  - Trade-offs: (a) zero novo código mas 13+ pontos de drift; (b) novo CLI verb, single-source-of-truth; (c) mais invasivo, mas testável isoladamente
  - Decision deadline: antes de iniciar Phase 1
  - Recorded at: `.aioson/plans/active-learning-loop/decision-instrumentation.md`

- **DD-2 (Phase 5)**: `feature:close` distillation — foreground (~2s block) vs background (return immediately + notify on completion).
  - Owner: `@architect` + `@ux-ui`
  - Trade-offs: foreground = simpler, testable, deterministic exit code; background = better UX in CI/automated contexts mas precisa lock e completion tracking
  - Decision deadline: antes de iniciar Phase 5

- **DD-3 (Phase 5)**: Concurrency lock primitive para `feature:close` simultâneos.
  - Owner: `@architect`
  - Options: SQLite row-level INSERT OR ROLLBACK / filesystem flock (.aioson/runtime/learning-loop.lock) / sqlite advisory function
  - Trade-offs: SQLite row = portable, atomic, mas couples to schema; flock = OS-level, portable mas Windows quirks; advisory = sqlite-native mas raro
  - Decision deadline: antes de iniciar Phase 5

- **DD-4 (Phase 2)**: `memory:search` retrieval ranking.
  - Owner: `@architect`
  - Options: FTS5 BM25 default / custom weighting por surface (rule > learning > brain)
  - Trade-offs: BM25 = zero config; custom = melhor precision mas exige calibração
  - Decision deadline: antes de iniciar Phase 2

- **DD-5 (Phase 4)**: Brain merge (S1) — ship em Phase 4 ou follow-up MICRO feature?
  - Owner: `@product` + `@architect`
  - Trade-offs: Phase 4 = consolidação coerente; MICRO follow-up = scope mais limpo
  - Decision deadline: ao final de Phase 4 retrospective

## Reference sources

**Research:**
- `researchs/anthropic-dreaming-2026/` (verdict: has-alternatives) — Dreaming shipou 6-mai-2026, recalibra differentiation
- `researchs/hermes-agent-architecture-2026/` (verdict: has-alternatives) — confirma SQLite+FTS5, valida feature:close edge
- `researchs/agent-memory-backends-2026/` (verdict: confirmed) — FTS5 baseline, V2 trajectory sqlite-vec
- `researchs/skill-consolidation-patterns-2026/` (verdict: has-alternatives) — Auto Dream cadence, per-file budget
- `researchs/multi-agent-token-budget-2026/` (verdict: confirmed) — efficiency baseline
- `researchs/sub-agent-patterns-2026/` (verdict: confirmed) — cross-LLM orchestration valida harness-agnostic

**Brains (q:5):**
- `.aioson/brains/sheldon/architecture-decisions.brain.json` nodes 001-006 (todos aplicáveis)

**Constitution articles:** II (Right-Sized Process), III (Observable Work), IV (Testable Behavior), V (Clean Handoffs), VI (Simplicity Over Ceremony), VII (Zero Trust)

**Docs:**
- `.aioson/docs/autonomy-protocol.md` — tier-2 contract
- `.aioson/docs/LAYERS.md` — layer ownership
- `.aioson/context/architecture-living-memory.md` — pipeline existente
