---
slug: agent-execution-model-resolution
classification: SMALL
verdict: ready
status: approved
---

# Readiness — Agent Execution Model Resolution

**Verdict: ready.** Escopo, matching, falhas, caminhos e Gates A/B/C estão fechados; não há decisão humana bloqueante.

## Reuso obrigatório
`src/agent-execution/{schema,manifest,capabilities,dispatcher,reports,telemetry-bridge}.js`, base/Codex adapters, `src/runtime-store.js`, CLI `agent:execution:*`, testes Agent Execution e paridade template/workspace.

## Criar
- `src/agent-execution/model-catalog.js` — I/O read-only e validação bounded do catálogo.
- `src/agent-execution/model-resolver.js` — matching puro e diagnósticos limitados.
- `tests/agent-execution-model-catalog.test.js` e `tests/agent-execution-model-resolver.test.js`.

## Restrições
Sem rede, sem mutação do config/perfil do host, sem fallback implícito, sem downgrade de esforço, sem reescrever manifesto durante run e sem shell interpolation. Não ler o catálogo real em testes.

## Primeiro slice
Contrato/schema + resolver puro com fixtures temporárias. Integrar dispatcher/telemetria somente depois de exact/normalized/alias/fuzzy/ambiguous/unavailable passarem.
