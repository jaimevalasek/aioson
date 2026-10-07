---
title: "Todo agente lia todas as seções de um documento compartilhado"
scope: [context-brief, agent-activation, rules, docs, rule-new, doc-new, lens]
paths:
  - src/lib/agent-lens.js
  - src/context-brief.js
  - src/lib/rule-scaffold.js
discovered_at: 2026-10-07
src: "AIOSON supervised session: inteligência contextual por agente — regra única para PLANNER e DEV com 'aplicação no planejamento' e 'aplicação na implementação'"
status: corrigido no framework
---

# Todo agente lia todas as seções de um documento compartilhado

## O que se sentia

Uma regra válida para planner e dev, com uma parte para o plano e outra para o código, chegava inteira aos dois. Restavam duas saídas, ambas ruins: duplicar a regra por agente (e deixar as cópias divergirem) ou fazer cada agente ler o que foi escrito para o outro.

## O que impede agora

- Uma seção pode ser endereçada no título: `## Planning <!-- agents: planner -->`. O agente lê o preâmbulo, as seções sem endereço e as suas; as endereçadas só a outros são puladas. Uma H3 herda o endereço da H2.
- O `context:brief` (`must_load` e `should_load`) e a ativação do agente entregam `your lens: read lines …`, junto com o que pular. Um documento sem marcação continua sendo lido inteiro: a lente só remove o que foi escrito explicitamente para outro agente.
- Com dois ou mais agentes, `rule:new`/`doc:new` já geram uma seção por agente. O texto de exemplo é cobrado pelo `verify:artifact --kind=rule` até ser preenchido.

## Receita

Uma fonte de verdade com uma visão por agente vence cópias por agente; para separar o que cada agente aplica, endereçar a seção é melhor do que dividir o arquivo.
