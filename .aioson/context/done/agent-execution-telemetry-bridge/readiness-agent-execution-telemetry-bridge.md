---
slug: agent-execution-telemetry-bridge
verdict: ready
status: approved
---
# Readiness — Agent Execution Telemetry Bridge

**Verdict: ready.** Escopo sem decisões humanas abertas; Gates A/B/C aprovados.

## Reuso obrigatório
`src/agent-execution/{dispatcher,adapters/base,reports}.js`, leases/state existentes, `src/runtime-store.js`, CLI `agent:execution:*` e banco `.aioson/runtime/aios.sqlite`.

## Restrições
Sem shell snippets de telemetria; sem banco paralelo; sem UI; sem segredos/prompts brutos; migração aditiva; compatibilidade dos leitores atuais; bounds e idempotência testados antes da integração.

## Primeiro slice
Fase 1: schema e APIs do store, com testes de correlação/transição. Não instrumentar o spawn antes deste contrato passar.
