---
title: "O conhecimento nascia sem prova de que chegava a alguém"
scope: [rule-new, doc-new, context-evals, rules, docs, authoring]
paths:
  - src/lib/knowledge-birth.js
  - src/lib/rule-scaffold.js
  - src/commands/rule-new.js
discovered_at: 2026-10-07
src: "AIOSON supervised session: inteligência contextual por agente — 'quero colocar inteligência só para o DEV e uma regra para PLANNER e DEV'"
status: corrigido no framework
---

# O conhecimento nascia sem prova de que chegava a alguém

## O que se sentia

Um dono de projeto escreve uma regra ou um doc para certos agentes e não tem como saber se ela chega a eles. O `rule:new` montava um frontmatter válido, e o `verify:artifact --kind=rule` provava que ele roteava em abstrato. Ninguém provava que a regra chegava ao planner no modo em que o planner trabalha, nem que ficava fora do QA. Docs (a inteligência) nem tinham scaffold.

Dois casos medidos ao nascer:
- uma regra `agents: [planner]` com `modes: [executing]` nunca alcança o planner, que só consulta em `planning`;
- um doc com gatilho "integração de clientes" não alcança o dev que escreve "integrar o cadastro de clientes".

## O que impede agora

- `rule:new` e `doc:new` (novo: `.aioson/docs/`, `--folder`, sem `priority`) provam o arquivo no ato, pelo montador de brief real:
  - **chega** a cada agente nomeado, no modo em que esse agente consulta (mapa fixado por teste contra os kernels);
  - **fica fora** do vizinho não nomeado e de uma tarefa sem relação.
- `--examples="tarefa|tarefa"` testa as palavras que os agentes realmente usam. Uma falha imprime a causa e a correção do frontmatter (o diagnóstico do `context:evals`).
- Os cenários vão para `.aioson/evals/project-knowledge.evals.json`, arquivo do projeto que o update não toca, e o `context:evals` continua provando tudo à medida que o catálogo cresce. Um re-scaffold substitui os cenários daquele arquivo, nunca duplica.

## Receita

Conhecimento novo se escreve com `aioson rule:new`/`doc:new` e `--examples` com as frases reais dos agentes; um ✗ na prova de nascimento é a correção do frontmatter, não um detalhe.
