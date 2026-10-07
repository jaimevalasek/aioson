---
title: "O guard sempre falava como dev"
scope: [context-guard, hooks-install, update, install, active-agent, context-select, runtime]
paths:
  - src/lib/active-agent.js
  - src/commands/context-guard.js
  - src/commands/hooks-install.js
  - src/commands/context-select.js
discovered_at: 2026-10-07
src: "AIOSON supervised session: inteligência contextual por agente — regras com agents: [planner] precisam chegar ao planner no momento da escrita"
status: corrigido no framework
---

# O guard sempre falava como dev

## O que se sentia

Uma regra escrita com `agents: [planner]` nunca chegava ao plano pelo guard. Toda execução de `aioson install` e `aioson update` reinstalava o hook com `--agent='dev'` gravado no comando, e um agente explícito na linha de comando vence qualquer outro sinal. O planner, o QA e o product eram julgados com as regras do dev em cada escrita.

## Por que passou

A identidade do agente era tratada como constante de instalação, mas é um fato de runtime. O guard até aceitava `AIOSON_AGENT` e campos do evento, só que o `--agent` gravado vinha antes de tudo.

## O que impede agora

- A instalação padrão (sem `--agent`) grava `--agent='auto'` no guard; um agente explícito continua fixo.
- `auto` (ou flag ausente) resolve nesta ordem: evento do harness → `AIOSON_AGENT` (exato, para quem lança sessão de um agente) → último `context:brief` ou `context:select` do projeto nas últimas 2 h → `dev`.
- `context:select` via CLI passa a deixar o rastro `selection_built`. Briefing, refiner e squad consultam seleção, não o brief, e agora também são reconhecidos. Os 10 agentes do ciclo principal fazem um dos dois handshakes.
- Teste ponta a ponta: uma regra só do planner fica fora sem agente ativo e entra no plano quando o planner é o último a consultar.

## Pendência consciente

`hooks:emit` (telemetria) e `agent:done` (hook `Stop`) mantêm o agente da instalação. No Claude Code o `Stop` dispara a cada resposta, não ao fim da sessão; trocar a atribuição faria rodar os done-gates de outros agentes a cada turno. Exige medição própria antes de mudar.
