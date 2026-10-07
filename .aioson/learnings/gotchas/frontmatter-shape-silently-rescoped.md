---
title: "A forma do frontmatter mudava quem recebia a regra — sem um aviso"
scope: [context-select, context-search, context-brief, context-guard, rules-lint, frontmatter, rules, docs, skills]
paths:
  - src/preflight-engine.js
  - src/context-selector.js
  - src/context-search.js
  - src/commands/rules-lint.js
  - src/agent-context-activation.js
  - src/context-guard.js
discovered_at: 2026-10-07
src: "AIOSON supervised session: auditoria da inteligência contextual por agente — regras, docs e skills chegando ao agente certo"
status: corrigido no framework
---

# A forma do frontmatter mudava quem recebia a regra

## O que se sentia

Uma regra escrita para um agente chegava a todos, ou não chegava a ninguém, dependendo só do jeito de escrever a lista:

| Escrito | Lido pelo parser | Efeito |
|---|---|---|
| `agents: [dev]` | `["dev"]` | certo |
| `agents:` + `  - dev` | `[]` | falha **aberta**: todos os agentes |
| `agents: [planner, dev] # só estes` | `["[planner", "dev] # só estes"]` | falha **fechada**: nenhum dos dois |

O exemplo comentado do próprio README de regras caía no terceiro caso. O lint avisava da `priority` contaminada e calava sobre `agents`. Os 4 learnings deste repo com `paths:` em bloco eram cegos ao roteamento por caminho. A ativação do agente descartava a seção `skills` do brief (7 de 63 briefs tinham skill casada). Num `.md` de planejamento, o guard injetava uma regra de modal de UI, duas vezes no mesmo evento (hook instalado no nível do usuário e do projeto).

## Por que passou

Uma heurística errada, que estruturalmente não via essa forma: o parser compartilhado (`parseFrontmatter`) só conhecia `chave: valor` numa linha, e `parseListValue` dividia por toda vírgula, até dentro de aspas. Nenhum teste comparava o exemplo documentado com o roteamento real. A superfície "ui" do guard contava qualquer `.md` como documento de produto, e nada impedia duas cópias do hook de responder ao mesmo evento.

## O que impede agora

- Parser: lista em bloco ≡ lista inline; comentário YAML fora do valor (inclusive em escalares: `status: resolved # ...` → `resolved`); vírgula entre aspas pertence ao item; formas não modeladas (lista de mapas) mantêm a leitura antiga. Medido em 1.146 arquivos com frontmatter: 40 mudaram, todos para o valor correto.
- `rules:lint`: `agents:` sem valor (vai a TODOS), id de agente quase igual a um real (`plannner` → "did you mean planner?"), modo fora de `planning`/`executing`, `load_tier` desconhecido. Zero falso positivo em 516 arquivos (template, workspace, consumidor).
- A ativação entrega `Skills matching this task`.
- Guard: notas em `plans/`, `research/` e `researchs/` (fora de `.aioson/plans/`) não são superfície de UI, e a classificação usa o caminho relativo ao projeto; um evento com sessão é respondido uma vez (claim exclusivo em tmp, TTL de 10 min).
- `tests/frontmatter-authoring-parity.test.js` copia o exemplo do README literalmente e prova o roteamento para dev/planner e a exclusão de qa.

## Receita

Ao documentar um exemplo de frontmatter, prove o exemplo pelo CLI real (seleção positiva + negativa por agente), nunca só o lint. Ao mudar o parser compartilhado, compare a saída antiga e a nova em todo `.md` com frontmatter do repo antes de rodar a suíte. A diferença é a medida do impacto.
