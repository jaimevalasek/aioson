---
prd: prd-harness-driven-aioson.md
last_enriched: 2026-05-07
enrichment_rounds: 2
plan_path: .aioson/plans/harness-driven-aioson/manifest.md
sizing_score: 10
sizing_decision: phased_external
readiness: ready_for_downstream
readiness_notes: "Round 2 fechou gaps de execução descobertos pós-design. @dev pode iniciar Tarefa T4 → T1 → T3 → T2 → T5 → T6 da Fase 3 do plano."
gray_areas_extracted: true
gray_areas_decided: 4
---

# Sheldon Enrichment Log — Harness-Driven AIOSON

## Rodada 1 — 2026-04-10

### MERs utilizados
Nenhum MER disponível.

### Fontes usadas
- [arquivo] plans/Harness-Driven/Evolução-AIOSON-Do-Spec-Driven-ao-Harness-Driven.txt
- [arquivo] plans/Harness-Driven/Harness-Engineering-resumo.txt
- [briefing] .aioson/briefings/harness-driven-aioson/briefings.md
- [cache] researchs/harness-engineering-2026/summary.md (agent: cypher, 2026-04-10, confirmed)
- [web] researchs/validator-architecture-2026/summary.md (2026-04-10, confirmed)
- [web] researchs/ai-agent-governor-safety/summary.md (2026-04-10, confirmed)
- [web] researchs/harness-contract-schema-2026/summary.md (2026-04-10, confirmed)
- [web] researchs/realtime-code-analysis-gateway-2026/summary.md (2026-04-10, confirmed)

### Melhorias aplicadas
- [ACs verificáveis] — seção "Acceptance Criteria" adicionada ao PRD com 12 ACs por fase
- [Regra de classificação] — seção "Regra de ativação por classificação" adicionada (MICRO/SMALL/MEDIUM)
- [Schema progress.json] — schema mínimo obrigatório documentado no PRD
- [Schema harness-contract.json] — estrutura COINE 2026 com {id, description, assertion, binary} documentada
- [Fluxo de Falha] — seção "Fluxo de Falha" com circuit breaker states adicionada
- [Integração SDD] — seção "Integração com SDD existente" com O que não muda + ponto de integração
- [Papel @sheldon expandido] — seção "Papel expandido do @sheldon" como Harness Engineer
- [Fontes de referência] — seção final com todas as fontes listadas

### Melhorias descartadas pelo usuario
- Nenhuma

### Decisão de sizing
Score: 10 → phased_external
Justificativa: 3 fases distintas do roadmap + 7 entidades + 3 integrações externas (linters, type-checkers, pre-commit hooks).

## Rodada 2 — 2026-05-07

### Trigger da rodada
Auditoria solicitada pelo usuário após observar que `@validator` nunca rodou em features implementadas, embora documentado. Investigação revelou: feature marcada `done` em 2026-04-10 com apenas design completo; nenhuma das 3 fases de execução foi rodada; agente está órfão. Usuário escolheu **opção (A) reabrir** (mudou `features.md` de `done` → `in-progress`) para destravar enrichment.

### Fontes usadas
- [diagnóstico] Auditoria interna do código atual (2026-05-07) — sem fontes externas
- [evidência] `grep` em `src/commands/workflow-next.js`, `src/commands/harness.js`, `.aioson/agents/qa.md` — comprovou ausência de wiring
- [evidência] `find . -name harness-contract.json` → zero ocorrências em features reais
- [brain] sheldon-001 (workspace/template parity), sheldon-003 (validator sandbox), sheldon-005 (CLI integration) — confirmaram desenho do agente; gap é wiring, não conceito

### Gaps descobertos (categorizados — quality lens)

**Critical (bloqueiam @validator de operar):**
- G1: AC ausente para handoff `@qa → @validator`
- G2: AC ausente para routing em `aioson workflow:next`
- G3: AC ausente para tradutor `validator output → progress.json.last_error`
- G4: AC-HD-06 não foi propagado para `.aioson/agents/sheldon.md` (gap de propagação, AC já existe)

**Important:**
- G5: AC-HD-11 conceitual sem assertion executável em `feature:close`

**Refinement:**
- G6: `plan-multi-agent-validation-loop.md` sem sequência concreta de tarefas para @dev

### Melhorias aplicadas
- [AC-HD-11 refinado] — assertion executável adicionada ("`feature:close` lê `progress.json.ready_for_done_gate`")
- [AC-HD-13 novo] — handoff `@qa → @validator` em features com contrato
- [AC-HD-14 novo] — routing em `workflow:next` quando `progress.status == waiting_validation`
- [AC-HD-15 novo] — tradutor `results[].reason → progress.last_error` em `harness:validate`
- [plan-multi-agent T1-T6] — 6 tarefas residuais com paths de arquivo concretos, ordem de execução sugerida (T4→T1→T3→T2→T5→T6)
- [brain sheldon-006] — nova lição: "PRD design-complete não significa execution-complete; auditar gaps de wiring antes de marcar feature done"

### Melhorias descartadas pelo usuário
- Nenhuma — todas as 4 categorias de melhoria foram aprovadas em uma rodada de seleção.

### Decisão de sizing
Score mantido: 10 → phased_external (não muda — as 3 fases existentes absorvem os novos ACs).

### Fontes não consultadas (justificativa)
Esta rodada não usou pesquisas externas porque os gaps emergiram do diff entre PRD e código atual — não há incerteza tecnológica a validar. Brain procedural já endossa o desenho (sheldon-003 q=5 EXCELLENT). Trazer fontes externas adicionaria ruído sem evidência incremental.

## Decisões tomadas

> Decisões de gray areas confirmadas pelo usuário. Downstream agents devem respeitar estas decisões sem re-perguntar.

| # | Gray Area | Decisão | Razão |
|---|-----------|---------|-------|
| 0 | Backward compatibility | Harness opt-in por classificação: MEDIUM obrigatório, SMALL apenas progress.json, MICRO SDD puro | Usuário confirmou explicitamente — "implementações que venham somar com o que temos hoje" |
| 1 | Interface do Validador | Hybrid faseado: skill harness-validate (Fase 2) + agente @validator isolado (Fase 3) | Não bloqueante; cada fase entrega valor standalone; isolamento de contexto obrigatório |
| 2 | Scope do @governor no MVP | Circuit breaker como middleware em execution-gateway.js; policies em harness-contract.json | Non-blocking, additive; Microsoft AGT pattern; sem novo agente |
| 3 | Formato harness-contract.json | JSON único com {id, description, assertion, binary} por critério (COINE 2026) | Industry consensus 2026; legível em PR review; parseável por máquina |
| 4 | Scope harness:init | Minimal MVP: cria harness-contract.json + progress.json; bootstrap.sh + smoke-tests/ na Fase 3 | Começo-meio-fim sem pontas soltas; Fase 2 é completa por si só |
| 5 | Feature reaberta vs nova PRD | Reabrir `harness-driven-aioson` (in-progress) ao invés de criar PRD-filha | Usuário escolheu opção (A) na sessão de 2026-05-07 — preserva continuidade do plano de 3 fases |
