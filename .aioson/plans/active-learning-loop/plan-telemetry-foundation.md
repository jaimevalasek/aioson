---
phase: 1
slug: telemetry-foundation
manifest: .aioson/plans/active-learning-loop/manifest.md
depends_on: []
status: qa_approved
completed_at: 2026-05-14
completed_by: dev
qa_approved_at: 2026-05-14
qa_approved_by: qa
qa_verdict: PASS
qa_findings: 0 critical / 0 high / 2 medium / 1 low
corrections_plan: .aioson/plans/active-learning-loop/corrections-2026-05-14.md
---

# Phase 1 — Telemetry Foundation

## Scope

Instrumentar todo carregamento de rule (`.aioson/rules/*.md` via frontmatter match) e brain node (consulta via `query.js`) para que cada load emita um evento `runtime:emit` persistido em `execution_events`. Sem essa telemetria, nenhum check de staleness (Phase 4) ou loop de distillation (Phase 5) tem sinal real.

Phase 1 também **fecha DD-1** — decisão de @architect sobre o mecanismo de instrumentação — antes de qualquer código ser escrito.

## New or modified entities

- **`execution_events` (extensão de tipo, NÃO de schema)**:
  - Novos valores de `event_type`: `rule_loaded`, `brain_loaded`
  - `payload_json` (JSON1, já existente): `{ target_slug: string, target_path: string, agent_name: string, feature_slug?: string, classification?: string }`
- **Índice parcial**:
  - `CREATE INDEX IF NOT EXISTS idx_execution_events_context_load ON execution_events(event_type, agent_name) WHERE event_type IN ('rule_loaded', 'brain_loaded')`
- **Instrumentation entry point** (decided in DD-1, one of):
  - (a) Per-agente inline em `.aioson/agents/*.md` preflight
  - (b) `src/commands/context-load.js` + `aioson context:load --target=rule:<slug> --agent=<name>`
  - (c) `src/rule-loader.js` skill centralizado

## User flows covered

Pré-requisito de:
- Closing a feature with active distillation (PRD, steps 3-4)
- Stale rule surfacing (PRD, step 2)
- Searching curated memory across features (PRD, step 3)

Nenhum flow direto exposto ao usuário nesta phase. É infraestrutura.

## Acceptance criteria

- **AC-ALL-101** (binary): Quando um agente carrega uma rule, exatamente 1 linha em `execution_events` é gravada com `event_type='rule_loaded'` em ≤100ms (medido em fixture).
- **AC-ALL-102** (binary): `payload_json` contém `target_slug`, `target_path`, `agent_name`. Inclui `feature_slug` quando disponível no contexto.
- **AC-ALL-103** (binary): Instalações existentes com `aios.sqlite` v1.x funcionam sem migração de schema (apenas extensão de enum de tipo).
- **AC-ALL-104** (binary): Brain queries via `.aioson/brains/scripts/query.js` emitem `event_type='brain_loaded'` com mesmo schema.
- **AC-ALL-105** (binary): DD-1 documentada em `.aioson/plans/active-learning-loop/decision-instrumentation.md` antes de qualquer commit de implementação.

## Implementation sequence

1. **@architect resolve DD-1**, grava decisão em `decision-instrumentation.md`.
2. **@dev** estende `src/runtime-store.js` com event_type enum + índice parcial (idempotent CREATE IF NOT EXISTS).
3. **@dev** implementa mecanismo escolhido (a/b/c) em `src/`.
4. **@dev** mirror para `template/` (M6 / brain `sheldon-001`).
5. **@dev** adiciona fixture `tests/telemetry-foundation.test.js` cobrindo AC-101..104.
6. **@qa** valida stress test (≥100 loads/sec sem perf regression em agent startup).

## External dependencies

Nenhuma. Tudo via `better-sqlite3` já existente.

## Notes para @dev

- Article III: events são **tier 1 silent** — sem notify, sem stdout output. Apenas SQLite + `events.ndjson` (hot path).
- Brain `sheldon-005`: instrumentação prefere CLI verb (opção b) se DD-1 escolher central, ou skill (c). Direct file edit em agent prompts (opção a) tem 13+ pontos de drift.
- Performance budget: ≤50ms hot path (mesmo SLA de `hooks:emit` existente).
- Reuso máximo: `appendRunEvent()` em `runtime-store.js:833-880` já tem o shape correto.

## Notes para @qa

- Stress test: 100 rule loads/sec por 60s em fixture com agent simulado. Asserts: nenhum drop, nenhum lock contention, latência p99 ≤100ms.
- Validar que `event_type` não vaza pra UI de dashboard como "evento misterioso" — confirmar que dashboard renderer trata graceful.
- Regression test: agentes legados (sem instrumentação) continuam funcionando.

## Reference sources

- `researchs/agent-memory-backends-2026/` — schema patterns
- `.aioson/brains/sheldon/architecture-decisions.brain.json` nodes 005 (CLI over direct write), 001 (template parity)
- Internal sweep §5 — `runtime-store.js` tables and `appendRunEvent()` reuse
