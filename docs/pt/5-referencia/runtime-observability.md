# Runtime Observability

## Objetivo

Estabelecer o runtime do projeto como autoridade unica para:

- task
- run de agente
- eventos operacionais
- enforcement de workflow

O prompt do agente nao e mais responsavel por persistir telemetria.

## Principios

1. Toda execucao relevante deve passar por um gateway oficial.
2. O SQLite em `.aioson/runtime/aios.sqlite` e a fonte primaria de runtime por projeto.
3. `execution_events` e o event store canonico.
4. `tasks` e `agent_runs` permanecem como projecoes operacionais para UI e consultas simples.
5. Workflow obrigatorio deve ser aplicado no runtime, nao em convencoes textuais de prompt.

## Tabelas

- `tasks`: unidade de trabalho visivel para o usuario
- `agent_runs`: execucao concreta de um agente
- `agent_events`: feed legado de compatibilidade
- `execution_events`: trilha canonica append-only de observabilidade

## Metadados novos em `agent_runs`

- `source`
- `workflow_id`
- `workflow_stage`
- `parent_run_key`

## Taxonomia de runtime

- `agent_kind=official`: agentes nativos do AIOS executados de forma direta ou governada
- `agent_kind=squad`: sessoes e handoffs ligados a `@squad`
- `agent_kind=workflow`: controlador de workflow e etapas de governanca

- `source=direct`: handoff direto de agente oficial
- `source=workflow`: execucao ou redirecionamento governado por workflow
- `source=orchestration`: operacoes de controle como `parallel:*` e handoff de `@orchestrator`
- `source=squad_session`: handoff direto para `@squad`

## Papel do gateway

O gateway oficial de execucao deve:

1. resolver o projeto alvo
2. garantir o runtime inicializado
3. abrir ou reutilizar a task correta
4. abrir ou reutilizar runs necessarios
5. emitir eventos canonicos
6. atualizar estado final de task e runs

## Estado atual da implementacao

- `install` e `init` agora inicializam o runtime no projeto
- `execution_events` foi adicionado ao schema do runtime
- `workflow:next` sincroniza task/run/eventos reais no SQLite via gateway
- `agent:prompt` classifica handoffs diretos de agentes oficiais e cria a task/run inicial no runtime
- `runtime:session:start|log|finish|status` oferece uma camada direta para manter sessoes de agentes oficiais abertas e visiveis no dashboard durante o trabalho iterativo
- `live:start|handoff|status|close` e `runtime:emit` formam o launcher/supervisor oficial para clientes externos, mantendo uma `session_key` viva, trocando `active_agent` por handoff e persistindo estado compacto no SQLite com historico verbose em `.aioson/runtime/live/{session_key}/`
- `runtime:status --json` agora expoe projecoes prontas para dashboard e scripts: `activeLiveSessions`, `activeMicroTasks`, `recentLiveSessions`, `recentMicroTasks` e `recentHandoffs`
- ativacao por linguagem natural direto no cliente (ex.: mencionar `@deyvin` no Codex) ainda nao passa pelo gateway e, portanto, nao garante registros em `tasks` e `agent_runs`
- `parallel:init`, `parallel:assign` e `parallel:status` registram operacoes canonicas de orquestracao
- templates novos nao instruem mais o agente a chamar `runtime-log` por shell snippet

## Proximos passos

1. instrumentar execucao de subagentes e runs filhas com `parent_run_key`
2. conectar comandos de doctor/qa/squad pipeline ao mesmo gateway operacional
3. migrar o dashboard para consumir `execution_events` como feed principal
4. adicionar spool append-only como fallback de resiliencia
