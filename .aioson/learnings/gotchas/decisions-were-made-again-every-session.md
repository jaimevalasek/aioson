---
title: "As decisões eram tomadas de novo a cada sessão"
scope: [decide, decisions, jev, docs, knowledge-birth, dev, planner]
paths:
  - src/lib/decision-precedent.js
  - src/commands/decide.js
  - template/.aioson/docs/implementation-decisions.md
discovered_at: 2026-10-07
src: "AIOSON supervised session: inteligência contextual por agente — 'o JEV poderia decidir coisas em tempo de implementação'"
status: corrigido no framework
---

# As decisões eram tomadas de novo a cada sessão

## O que se sentia

Um agente que precisava escolher entre duas bibliotecas ou abordagens decidia sozinho, e a escolha se perdia no fim da sessão. A sessão seguinte, de qualquer agente, podia escolher outra coisa. O registro existente (`decision:add`) cobre a decisão humana que bloqueia uma feature, não a memória das escolhas técnicas do projeto.

## O que impede agora

- `aioson decide` pergunta ao projeto antes de escolher:
  - **precedente**: um doc em `.aioson/docs/decisions/` casa por sinal forte, e a resposta sai sem modelo;
  - **conhecimento que governa**: regras e docs a ler primeiro;
  - **recomendação**: com JEV ativo, um Choice limitado entre as opções mais "precisa de um humano" (confiança ≥ 0,7 e probabilidade ≥ 0,6).
- O JEV recomenda e nunca grava. Gravar exige `--record --choice` explícito.
- A decisão gravada vira doc roteado, com as opções como aliases e a pergunta como exemplo de nascimento, provado ao nascer (`knowledge-birth`). Uma pergunta reformulada que compartilha os gatilhos encontra o precedente.
- O protocolo chega aos agentes sob demanda: `.aioson/docs/implementation-decisions.md` é roteado quando a tarefa é uma escolha ("which library", "decidir entre", "qual abordagem"), com cenários no corpus distribuído. Nenhum kernel cresceu.

## Receita

Para ensinar um protocolo novo aos agentes sem engordar kernels: um doc roteado com gatilhos nas palavras da tarefa, mais um cenário no corpus de evals que prova que ele chega aos agentes certos.
