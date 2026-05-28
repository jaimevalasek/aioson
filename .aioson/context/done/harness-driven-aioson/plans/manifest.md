---
prd: prd-harness-driven-aioson.md
sheldon-version: 1
created: 2026-04-10
status: ready
---

# Plano de Execução — Harness-Driven AIOSON

## Visão geral
Evolução additive do SDD em 3 fases independentes. Cada fase entrega valor standalone. MEDIUM obrigatório; SMALL recebe apenas `progress.json`; MICRO inalterado. Nenhum workflow existente é quebrado.

## Fases

| Fase | Arquivo | Escopo | Status | Dependências |
|------|---------|--------|--------|-------------|
| 1 | plan-gateway-ativo.md | `execution-gateway.js` upgrade + circuit breaker configurável | pending | — |
| 2 | plan-contractual-handshake.md | `harness:init` + `harness-contract.json` + `progress.json` + `@sheldon` como Harness Engineer + `harness-validate` skill | pending | Fase 1 |
| 3 | plan-multi-agent-validation-loop.md | Agente `@validator` isolado + loop Nautilus completo + done gate | pending | Fase 1 + Fase 2 |

## Decisões pré-tomadas
- **Harness opt-in por classificação:** MEDIUM obrigatório, SMALL apenas `progress.json`, MICRO SDD puro — zero alteração
- **@governor como middleware:** circuit breaker implementado em `execution-gateway.js`, não como agente separado; policies configuradas em `harness-contract.json`
- **Formato do contrato:** JSON único com `{id, description, assertion, binary}` por critério (COINE 2026 pattern); `contract_mode` mapeado para classificação
- **Validator faseado:** Fase 2 → skill `harness-validate` (rápida, schema/lint, zero LLM cost); Fase 3 → agente `@validator` com contexto isolado para validação semântica
- **`harness:init` minimal no MVP:** cria `harness-contract.json` + `progress.json` apenas; `bootstrap.sh` e `smoke-tests/` entram na Fase 3
- **Backward compatibility garantida:** `execution-gateway.js` detecta presença do contrato — sem contrato = comportamento atual exato

## Decisões adiadas
- `smoke-tests/`: formato, runner e convenção de nomes a definir pelo @dev na Fase 3
- `bootstrap.sh`: conteúdo exato a definir na Fase 3 com base no estado real do projeto na época
- Modo `URGENT` vs `BALANCED`: @dev pode ajustar `contract_mode` por feature conforme necessidade

## Fontes de referência
> Links e documentos analisados durante o enriquecimento. Consulte para aprofundar contexto.

- [arquivo] Roadmap HD — `plans/Harness-Driven/Evolução-AIOSON-Do-Spec-Driven-ao-Harness-Driven.txt`
- [arquivo] Executive summary HD — `plans/Harness-Driven/Harness-Engineering-resumo.txt`
- [briefing] Contexto pré-produção — `.aioson/briefings/harness-driven-aioson/briefings.md`
- [pesquisa] Validator architecture 2026 — `researchs/validator-architecture-2026/summary.md`
- [pesquisa] Governor safety & circuit breaker — `researchs/ai-agent-governor-safety/summary.md`
- [pesquisa] Harness contract schema COINE 2026 — `researchs/harness-contract-schema-2026/summary.md`
- [pesquisa] Gateway & PreToolUse hooks 2026 — `researchs/realtime-code-analysis-gateway-2026/summary.md`
