---
phase: 1
slug: gateway-ativo
title: Gateway Ativo
depends_on: null
status: pending
---

# Fase 1 — Gateway Ativo

## Escopo desta fase
Upgrade do `execution-gateway.js` de logger passivo para camada de enforcement ativa. Adiciona:
1. Detecção de `harness-contract.json` — se ausente, comportamento atual mantido (backward-compatible)
2. Circuit breaker configurável via `governor` block do contrato
3. Enforcement em 2 layers: PreToolUse sync (fast, <50ms) + post-write async (ESLint/tsc)

Ao final desta fase: todo projeto MEDIUM com `harness-contract.json` presente ganha proteção automática. Projetos MICRO e SMALL funcionam exatamente como hoje.

## Entidades novas ou modificadas
- **`execution-gateway.js`** — arquivo existente; receberá enhancement (não reescrita)
  - Adicionar: leitura de `harness-contract.json` ao iniciar sessão de feature
  - Adicionar: `CircuitBreaker` class/module com estados CLOSED/OPEN/HALF_OPEN
  - Adicionar: escrita/leitura de `progress.json` ao abrir/fechar circuit
  - Manter: toda telemetria e logging existente inalterados
- **`progress.json`** — arquivo novo gerado pelo gateway ao abrir circuit; lido pelo @dev ao retomar sessão

## Fluxos cobertos nesta fase
- **Fluxo normal (CLOSED):** @dev escreve → gateway checa presença do contrato → se presente, valida invariantes rápidas → permite ou bloqueia (exit code 2 no PreToolUse hook)
- **Fluxo de abertura (OPEN):** N erros consecutivos OU max_steps atingido → gateway persiste estado em `progress.json` → emite warning → aguarda HITL
- **Fluxo backward-compatible:** sem `harness-contract.json` → gateway passa tudo (comportamento atual)

## Acceptance criteria desta fase
| AC | Descrição |
|---|---|
| AC-HD-01 | Dado projeto MEDIUM com `harness-contract.json` presente, quando @dev executa escrita, gateway valida invariantes declaradas antes de permitir |
| AC-HD-02 | Dado loop ativo, quando `max_steps` é atingido, gateway interrompe e registra estado em `progress.json` |
| AC-HD-03 | Dado projeto sem `harness-contract.json` (MICRO/SMALL), quando @dev opera, gateway funciona como hoje — zero mudança de comportamento |
| AC-HD-04 | Dado `error_streak_limit` configurado, quando N erros consecutivos ocorrem, gateway abre circuit breaker, loga e notifica sem crash |

## Sequência de implementação sugerida
1. Localizar `execution-gateway.js` no codebase e ler o arquivo completo antes de qualquer alteração
2. Implementar `CircuitBreaker` como módulo separado (facilita teste isolado): estados, transições, persistência em `progress.json`
3. Adicionar detecção de `harness-contract.json`: path padrão `.aioson/plans/{slug}/harness-contract.json`
4. Integrar circuit breaker no gateway: carregar policies do contrato; fallback para defaults quando contrato ausente
5. Implementar PreToolUse hook sync (<50ms): checar `circuit_state` antes de qualquer write
6. Implementar post-write async: ESLint/tsc após escrita (não bloqueia o write, apenas loga resultados)
7. Escrever/ler `progress.json` nos eventos de abertura e fechamento do circuit
8. Testar com e sem `harness-contract.json` para confirmar backward-compatibility

## Dependências externas
- ESLint e TypeScript/Biome já configurados no projeto (verificar antes de integrar)
- `harness-contract.json` não precisa existir para a fase funcionar — detecção é opcional

## Notas para @dev
- **Não reescrever** o gateway — apenas adicionar funcionalidade. Toda telemetria existente deve continuar funcionando
- `CircuitBreaker` deve ser módulo puro (sem side effects) para facilitar testes unitários
- O path de `harness-contract.json` deve ser derivado de `active_feature` em `dev-state.md` ou passado como parâmetro — não hardcoded
- `progress.json` vai junto com `harness-contract.json` em `.aioson/plans/{slug}/` — mesma pasta

## Notas para @qa
- Verificar que MICRO e SMALL features com 0 harness-contract.json produzem comportamento idêntico ao pré-Fase 1
- Testar abertura de circuit com cada condição independentemente: max_steps, cost_ceiling, error_streak
- Verificar que `progress.json` é escrito corretamente nos 3 campos obrigatórios: `circuit_state`, `last_error`, `last_updated`

## Fontes de referência desta fase
> Consulte se precisar de mais detalhes durante a implementação.

- [pesquisa] Gateway & PreToolUse hooks — `researchs/realtime-code-analysis-gateway-2026/summary.md`
- [pesquisa] Governor circuit breaker patterns — `researchs/ai-agent-governor-safety/summary.md`
- [arquivo] Roadmap técnico HD — `plans/Harness-Driven/Evolução-AIOSON-Do-Spec-Driven-ao-Harness-Driven.txt` (seção 5)
