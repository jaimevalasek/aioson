---
slug: agent-execution-telemetry-bridge
gate_design: approved
status: approved
---
# Design doc — Agent Execution Telemetry Bridge

## Decisão
Criar `src/agent-execution/telemetry-bridge.js` como adaptador interno entre `dispatcher.js`/adapters e `runtime-store.js`. A bridge recebe eventos estruturados em memória, redige e limita antes de chamar funções explícitas do store. `runtime:emit` e `live:*` continuam consumidores da mesma camada de persistência, mas não são subprocessos nem dependências de lifecycle do dispatcher.

## Modelo persistente
Adicionar migração compatível e tabelas aditivas:
- `agent_execution_runs`: `telemetry_run_id` PK, dispatcher_run_id, parent_run_id/correction_cycle_id, feature, agent, host, model, attempt, state, pid, process_fingerprint, report_path/digest, timestamps, reason, truncated/dropped counters; UNIQUE(feature, agent, dispatcher_run_id, attempt).
- `agent_execution_events`: run FK, monotonic sequence, type, stream, safe_summary/payload, bytes, created_at; UNIQUE(run, sequence), índices `(run,sequence)` e `(feature,updated_at)`.

Eventos permitidos: `run_created`, `process_started`, `state_changed`, `output`, `retry`, `fallback`, `timeout`, `report_attached`, `output_truncated`, `recovered`, `diagnostic`. Payloads usam allowlist e versão de schema.

## APIs internas
- `createExecutionRun(input)` — transação idempotente pré-spawn.
- `attachExecutionProcess(correlation, {pid,fingerprint})`.
- `transitionExecutionRun(correlation, next, reason)` — compare-and-set.
- `appendExecutionEvent(correlation, event)` — sequência alocada no banco.
- `attachExecutionReport(correlation, report)` — valida vínculo/digest antes do terminal.
- `reconcileExecutionRun(correlation, processProbe)`.
- `getExecutionSnapshot(filters)` e `listExecutionEvents(runId,{after,limit})` para comandos/consumidores.

## Fluxo
1. Dispatcher resolve manifest/attempt e grava state checkpoint.
2. Bridge cria run `queued`; somente então adapter executa.
3. Callback `onSpawn` liga PID/fingerprint e transiciona `running`.
4. Callbacks `onStdout/onStderr` alimentam buffer limitado; redactor stateful cobre segredos divididos entre chunks; flush em lote ≤500 ms.
5. Exit bem-sucedido transiciona `waiting_report`; relatório validado produz `passed`, `failed` ou ciclo `correcting`. Ausência/invalidade produz `paused`.
6. Capacity retry/fallback/timeout gera evento na mesma attempt; novo processo atualiza execução history sem reatribuir relatório.

## Recuperação e idempotência
O resume consulta state + run pelo correlation key sob a lease existente. `pid + fingerprint + spawn timestamp` confirma processo vivo. Caso não seja possível reanexar streams de um processo órfão, o run permanece observável mas vai a `paused: detached_process` para decisão segura; jamais abre outro processo enquanto a identidade viva for provável. Operações repetidas retornam o estado atual. Terminal não reabre.

## Segurança e resiliência
- Redaction antes de qualquer persistência/diagnóstico; payload allowlist e strings limitadas.
- Bounded queue com high-water mark; descarta chunks mais antigos e emite um único contador `output_truncated` quando recupera pressão.
- Escritas agrupadas, busy timeout curto e retry limitado; bridge não bloqueia pipe do filho.
- Paths ficam relativos e validados dentro do projeto; PID não autoriza vínculo.
- Nenhum prompt integral, env, argv sensível ou reasoning é persistido.

## Compatibilidade/consumidores
Migração somente aditiva em `runtime-store`. Comandos atuais continuam intactos. Um comando/leitor `agent:execution:status/events --json` pode expor snapshot/cursor; Play/dashboard podem fazer polling ≤2 s. Push fica fora do MVP. Campos desconhecidos são ignoráveis e há `schema_version`.

## Caminhos
- Modificar: `src/agent-execution/dispatcher.js`, `src/agent-execution/adapters/base.js`, `src/runtime-store.js`, `src/commands/agent-execution.js`, `src/cli.js`, i18n.
- Criar: `src/agent-execution/telemetry-bridge.js`, migração/coordenador de schema se necessário, testes focados.
- Reusar: leases/state/reports do dispatcher; `startRun/updateRun/appendRunEvent` apenas se seus contratos comportarem correlação sem semântica falsa; caso contrário, funções específicas no mesmo store/DB.
- Não modificar UI externa nesta feature.
