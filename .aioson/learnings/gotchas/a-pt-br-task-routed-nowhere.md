---
title: "Uma tarefa do ciclo escrita em pt-BR quase nunca chegava ao doc certo — o lookup só conhecia inglês"
scope: [context-selector, routing, i18n, pt-br, evals, feature-cycle]
kind: gotcha
captured: 2026-10-20
src: "AIOSON supervised session: review of the context-search stop-word change against the 80/20 cycle"
---

## O que se sentiu

As mesmas dez tarefas do ciclo (briefing → quality) chegavam ao doc esperado 6 vezes em inglês e 1 em pt-BR. @dev, @qa, @tester e @pentester preenchem `--task` com palavras do domínio — em pt-BR nos projetos do dono. O corpus de evals passava 100%: quase não tinha tarefa em pt-BR.

## Por que passava

Os docs roteados declaram `task_types`/triggers em inglês e o lookup de palavras-chave lê a tarefa como escrita: "revisar o PRD" nunca casava `task_types: [review]`. O caminho semântico não salvava — doc exige 4 termos casados.

## O que impede agora

- `PT_CYCLE_TERMS` (context-selector.js): glossário pt-BR → en do vocabulário do ciclo, plural chega ao singular; o lookup ganha o termo inglês de cada palavra conhecida. Tarefa em inglês intacta. Medido: pt-BR 1/10 → 5/10 (inglês 6/10).
- `cycle-pt-br.evals.json` prova cinco docs do ciclo em pt-BR e uma negativa.

## Regra de bolso

Expansão de idioma entra só no lookup, nunca como termo semântico: como termo ela contava duas vezes para o mínimo do doc e acordou regras que nenhuma tarefa em inglês acorda — os negativos do corpus pegaram (play, pentester, quatro regras de UI). Palavra que é intenção de recuperação (`planning`) nunca entra como tradução. Mude o seletor só com o corpus de evals rodando.
