---
target_prd: .aioson/context/prd-workflow-handoff-integrity.md
round_count: 1
last_enrichment_date: 2026-05-20
plan_path: .aioson/plans/workflow-handoff-integrity/manifest.md
sizing_score: 10
sizing_decision: phased-plan
sources_used:
  - .aioson/briefings/workflow-handoff-integrity-1-9-2/briefings.md
  - plans/workflow-handoff-integrity.md
  - .aioson/brains/sheldon/architecture-decisions.brain.json (sheldon-006 ★5, sheldon-002 ★5)
improvements_applied:
  - C1 — Wiring audit AC pré-closure (brain sheldon-006 ★5)
  - C2 — Risk/decision: progressive release strategy (PRD Open question Q10)
  - I1 — Backward-compat AC for agent:done modification (F2)
  - I2 — Telemetry impact + idempotency AC (F2)
  - R1 — Pending-state regex enumeration (F3)
  - R2 — T6 fixture maintenance (fresh-generated, not pinned)
improvements_discarded: []
contract_path: .aioson/plans/workflow-handoff-integrity/harness-contract.json
status: completed
---

# Sheldon Enrichment Log — workflow-handoff-integrity

## Summary

PRD `prd-workflow-handoff-integrity.md` já chegou ao sheldon com investigação profunda absorvida do briefing `workflow-handoff-integrity-1-9-2` (270 lines, 5 themes, 14 gaps, 16 open questions). Migração 981a8fd que motivou o cluster original foi completada via hotfix v1.9.3 (released, tagged); F4/F5 ficaram fora do escopo desta feature por design.

Enrichment focou em adicionar contratos verificáveis que o briefing não tinha capacidade de produzir (precisava da lente sheldon de "AC binária + downstream-actionable"). Sizing score 10 confirma classification MEDIUM já anotada na PRD frontmatter e justifica phased-plan externo.

Brain sheldon-006 ★5 ("audit wiring before closing — design-complete ≠ execution-complete") foi central: o cluster F2/F3/T5 nasce justamente do anti-pattern que esse brain documenta — `981a8fd` foi "design-complete" mas "execution-incomplete". O wiring audit AC adicionado (C1) é o anticorpo institucionalizado.

## Improvements applied

### C1 — Wiring audit AC pré-closure (Critical, brain sheldon-006 ★5)

**Onde aplicado:** PRD `## Success metrics`, novo bullet marcado `_(sheldon)_`.
**Conteúdo:** antes de marcar feature `done`, auditar para CADA mudança: (a) call sites grepados; (b) testes cobrem o caminho real; (c) smoke test em fixture greenfield exercita o caminho. Documento `wiring-audit-workflow-handoff-integrity.md` obrigatório.
**Por que:** sem isso, esta feature pode repetir o padrão de `@validator` orfanado, ou da migração 981a8fd parcial. Brain sheldon-006 documenta este anti-pattern com quality=5. Replicado em todas as 5 phases como AC final (`AC-Fx-08` ou `AC-Tx-10`).

### C2 — Risk/decision: progressive release strategy (Critical)

**Onde aplicado:** PRD `## Open questions`, nova Q10 marcada `_(sheldon)_`.
**Conteúdo:** decision-required entre ship único MEDIUM (v1.10.0) vs progressivo (F2 → F3 → F1 → T5 → T6 em v1.9.5+). Recomendação: progressivo. Razão: inception risk + bisect granular + cada fase valida a próxima.
**Por que:** AIOSON usa a própria cadeia para implementar. F2 broken faz a cadeia frágil para implementar F3+. Ship progressivo permite F2 estabilizar antes de F3+ entrar via cadeia que dependa de F2. Não estava no briefing porque é um trade-off pós-PRD, surface apenas com lente sheldon de "como vai ser entregue na prática".

### I1 — Backward-compat AC for `agent:done` (Important)

**Onde aplicado:** PRD `## Must-have F2`, sub-bullet `_(sheldon)_`.
**Conteúdo:** `agent:done` mantém output stdout idêntico em modo default. Auto-emit gated por (i) workflow.state.json ativo OU (ii) flag `--auto-advance`. Comportamento legacy preservado.
**Por que:** F2 modifica CLI command existente. Scripts/automations externas podem depender do output atual. Sem AC explícito, fácil quebrar consumers silently. Plan phase 1 (AC-F2-02) baseline test compara byte-a-byte com pre-mudança.

### I2 — Telemetry impact + idempotency AC (Important)

**Onde aplicado:** PRD `## Must-have F2`, sub-bullet `_(sheldon)_`.
**Conteúdo:** ordem documented (SQLite primeiro, workflow event segundo); idempotency via `last_workflow_event_at`. Consumers downstream sem dedup necessário.
**Por que:** dashboard + learning-loop consomem `agent_events` SQLite. F2 adiciona workflow events que podem aparecer também em algum consumer. Sem AC, fácil ter double-counting silently. AC-F2-05 dá idempotency guarantee testável.

### R1 — Pending-state regex enumeration (Refinement)

**Onde aplicado:** PRD `## Must-have F3`, sub-bullet `_(sheldon)_`.
**Conteúdo:** CLI guard usa regex `^pending-(.+)-decisions$` para match. Estados canônicos atuais listados; estados futuros pegam automaticamente.
**Por que:** PRD mencionava apenas `pending-architect-decisions`. Manifest pode ter outros estados `pending-product-decisions`, `pending-pm-decisions`. Regex genérico é tanto explícito quanto extensível. DD-02 deferred para `@architect` decidir se whitelist explícita é preferível.

### R2 — T6 fixture maintenance (Refinement)

**Onde aplicado:** PRD `## Must-have T6`, sub-bullet `_(sheldon)_`.
**Conteúdo:** fixture greenfield gerada fresh a cada CI run via `npm pack + aioson setup`. NÃO pinada no repo. Custo 30-60s aceitável.
**Por que:** fixture pinada gera segundo problema (drift entre source canônico e fixture). Pior cenário: fixture passa, source quebra. Fresh-gen elimina toda categoria de bug. Cost-aware: roda só em PR `release` label.

## Sizing decision justification

Score breakdown (per `.aioson/docs/sheldon/enrichment-paths.md`):

- Main entities > 3: **0** (framework-internal, sem entidades de domínio; abstrações como "workflow state", "agent contract", "dev-state" não contam como domain entities)
- Delivery phases > 1: **+8** (5 phases independentemente implementáveis: F1, F2, F3, T5, T6 — 5−1=4 × 2)
- External integrations: **0** (puramente internal CLI/framework)
- User flows > 3: **+1** (PRD tem 4 flows: cadeia ponta-a-ponta, CLI guard, stale offer, CI rejects)
- AC complexity > 10: **+1** (6 success metrics + 9 open questions na PRD original; após `@analyst` esperar ~12-15 ACs formais por phase × 5 phases ≈ 60+ ACs total)

**Total: 10 → Path B (external phased plan)**, confirmado por:
- 5 phases independentes argumentam contra single-document approach
- 5 deferred decisions para `@architect` precisam de doc dedicado por phase (manifest centraliza)
- `@pm` (per PMD-06) precisa de structure clara para escrever implementation-plan em batches independentes
- v1.10.0 release timeline beneficia de phase-by-phase visibility

## Brain insights applied

- **sheldon-006 ★5** "design-complete ≠ execution-complete" → C1 (wiring audit AC) + replicação em todas as phases (AC-Fx-08 / AC-Tx-10). Direta aplicação do anti-pattern documentado.
- **sheldon-002 ★5** "classification gates scale process depth" → confirma MEDIUM = full chain (`@analyst` → `@architect` → `@pm` → `@dev` → `@qa`). Sem skip.
- **sheldon-004 ★5** "discovery before architecture" → mínima relevância (feature framework-internal, sem domain entities a descobrir). `@analyst` precisa apenas converter ACs e populate requirements.md, não fazer discovery.md.

## Web research

**Skip com justificativa.** Feature touches no external market, no UI pattern, no vendor dependency, no compliance surface. Patterns técnicos (state machines, CI gates, prompt directives) são maduros e bem-documentados. Briefing já fez investigação interna exaustiva (5 themes, 14 gaps, sources literais do `aioson-com` 2026-05-19). Query budget preservado para features futuras com surface externa real.

## Harness contract (RF-05)

Contract gerado em `.aioson/plans/workflow-handoff-integrity/harness-contract.json`:
- `contract_mode: BALANCED` (MEDIUM default; surface NÃO é sensitive — sem auth/money/ownership/secrets/uploads/URLs externas)
- `governor`: `{ max_steps: 50, cost_ceiling_usd: 2.00, error_streak_limit: 5 }` (safe defaults BALANCED)
- `criteria[]`: populated by `@analyst` após RF/AC formalization. Stub criado com ACs em estado advisory; `@analyst` converte para binary onde aplicável.

User approva o contract após `@analyst` enrichment. Stub é additive — `@analyst` adiciona criteria binárias, sheldon não inventou critérios sem AC backing.

## Quality lens self-check

| Dimensão | Score (1-5) | Nota |
|---|---|---|
| Criticality | 5 | C1 + C2 são alto-impacto; nenhum improvement é cosmético |
| Evidence strength | 5 | Brain sheldon-006 ★5 + briefing 270 lines + dogfood evidence |
| Prioritization clarity | 5 | 2 critical + 2 important + 2 refinement, separação clara |
| Downstream usefulness | 5 | Cada improvement mapeia a AC concreta; phases independentes para `@dev` |
| Execution realism | 4 | DD-04 (mock-only harness mode) é incerteza; pode precisar trabalho de descoberta no início da phase 5 |

Nenhuma score ≤ 3.

## Handoff

`@analyst` é o próximo agente.

Inputs:
- PRD enriched: `.aioson/context/prd-workflow-handoff-integrity.md`
- Manifest: `.aioson/plans/workflow-handoff-integrity/manifest.md`
- 5 phase files em `.aioson/plans/workflow-handoff-integrity/`
- Briefing: `.aioson/briefings/workflow-handoff-integrity-1-9-2/briefings.md`
- Harness contract stub: `.aioson/plans/workflow-handoff-integrity/harness-contract.json` (criar via `aioson harness:init`)

Tarefa primary:
1. Produzir `requirements-workflow-handoff-integrity.md` com RFs/ACs/ECs/BRs por phase (5 sections — uma per phase).
2. Confirmar classification MEDIUM (esperado score=4+).
3. Popular spec skeleton.
4. Converter ACs do PRD + phase plans em criteria binárias no harness-contract.json onde aplicável.
5. Gate A: pending → approved.

Não há entidades de domínio (per brain sheldon-004) — `@analyst` pode pular discovery.md e focar em requirements + spec.
