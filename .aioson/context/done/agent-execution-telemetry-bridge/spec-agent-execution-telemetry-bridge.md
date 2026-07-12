---
slug: agent-execution-telemetry-bridge
classification: MEDIUM
status: implemented
spec_version: 1
gate_requirements: approved
gate_design: approved
gate_plan: approved
gate_execution: approved
last_checkpoint: dev_implementation_complete
---
# Spec — Agent Execution Telemetry Bridge

## Objetivo
Tornar spawns externos do agent-execution observáveis, seguros e recuperáveis no runtime existente, sem depender da UI nativa do host.

## Autoridades
- Escopo: `prd-agent-execution-telemetry-bridge.md`.
- Comportamento/AC: `requirements-agent-execution-telemetry-bridge.md`.
- Estrutura e segurança: `design-doc-agent-execution-telemetry-bridge.md`.
- Sequência: `implementation-plan-agent-execution-telemetry-bridge.md`.

## Decisões fechadas
1. SQLite/runtime-store é a única fonte de telemetria; JSON continua checkpoint.
2. Instrumentação é API interna, nunca subprocesso `runtime:emit`/`live:*`.
3. Polling incremental é o contrato MVP para Play/dashboard; UI e push estão fora.
4. Redação e bounds precedem persistência; correlação forte precede aceitação de relatório.
5. Recovery privilegia não duplicar execução; processo destacado pausa.

## Rastreabilidade
REQ-01/02/03 → AC-01/02/03/08; REQ-04/08/09 → AC-04/05/11; REQ-05 → AC-06; REQ-06 → AC-10; REQ-07 → AC-09; REQ-10 → AC-07/12.

## Gate D
Implementação @dev concluída em 2026-07-10. AC audit 12/12; 13/14 critérios do harness passam. O único critério pendente é `npm test`, que excede o timeout global do harness (~106s/120s em execuções observadas), sem falha focada atribuída à feature. QA/pentest permanecem pendentes.

## Decisões de implementação
- Tabelas aditivas `agent_execution_runs/events` residem no runtime SQLite existente.
- `telemetry-bridge.js` redige e limita streams antes de persistir; adapters expõem callbacks sem alterar argv/shell.
- Dispatcher correlaciona feature/agente/run/attempt/model/PID e só aceita relatório fortemente vinculado.
- Leitores `agent:execution:status/events` usam snapshot e cursor incremental; recovery pausa processo destacado.
- SEC-SBD-07: conteúdo de streams, summaries, reasons e payloads recursivos é redigido e limitado antes do SQLite; testes adversariais cobrem segredo dividido, linha longa, profundidade e retenção.
- Tester cycle 1: buffers incrementais são isolados por stdout/stderr; paginação consulta `limit + 1`; retenção exclui invariavelmente estados ativos e remove apenas terminal/paused.
## QA sign-off

- Date: 2026-07-10
- Verdict: PASS
- AC coverage: 12/12 fully covered
- Evidence: focused 98/98; full suite 3690 passed, 0 failed, 1 skipped; harness 14/14
- Residual risks: `security:audit` mixed-finding formatter crash; one Medium documentation gap for formal Attack Surface Map; external CLI event-format variability fails closed.
- Tester cycle 1 re-verification: PASS — 3/3 boundary regressions, 24/24 focused compatibility, 22/22 proportional adversarial, AC 12/12; stream isolation, exact-page cursor metadata and active-run-safe retention verified.

## QA Sign-off

- **Date:** 2026-07-10
- **Verdict:** PASS
- **Gate D (execution):** approved
