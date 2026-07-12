---
slug: agent-execution-telemetry-bridge
gate_plan: approved
status: approved
phases: 5
---
# Plano de implementação — Agent Execution Telemetry Bridge

## Fase 1 — Store e contratos
Adicionar migração, constraints, índices e APIs idempotentes de run/event/report. Testar transições, correlação e compatibilidade.
Verificação: `node --test tests/agent-execution-telemetry-store.test.js tests/runtime-store.test.js`

## Fase 2 — Bridge segura e bounded
Implementar redactor incremental, fila/backpressure, batching, truncamento e shutdown/flush. Testar segredo entre chunks, limites e falha SQLite.
Verificação: `node --test tests/agent-execution-telemetry-bridge.test.js tests/agent-execution-security.test.js`

## Fase 3 — Instrumentar adapter/dispatcher
Criar run pré-spawn, callbacks de PID/streams/exit, estados, capacity events e vínculo de relatório sem shell. Preservar adapters públicos.
Verificação: `node --test tests/agent-execution-dispatcher.test.js tests/agent-execution-capacity.test.js tests/agent-execution-reports.test.js`

## Fase 4 — Recovery e leitores
Reconciliar lease/PID/fingerprint; expor status/eventos JSON paginados e resumo para consumidores. Adicionar i18n.
Verificação: `node --test tests/agent-execution-resume.test.js tests/agent-execution-telemetry-cli.test.js`

## Fase 5 — Integração e hardening
Validar ciclo dev/verificadores, concorrência, retenção e regressões; atualizar docs/template quando contrato público exigir.
Verificação: `npm test`; `aioson spec:analyze . --feature=agent-execution-telemetry-bridge --json`; `aioson harness:check . --slug=agent-execution-telemetry-bridge --json`

## Ordem e ownership
Fases são sequenciais: schema → bridge → instrumentação → recovery/readers → integração. Não paralelizar `runtime-store.js` com instrumentação do dispatcher. Sem migração destrutiva e sem dependência de UI.
