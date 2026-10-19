---
title: "A compactação levava embora o estado para continuar"
scope: [hooks-install, hooks-emit, hooks-recap, live, compaction, continuity]
paths:
  - src/lib/compaction-recap.js
  - src/commands/hooks-recap.js
  - src/commands/hooks-emit.js
  - src/commands/hooks-install.js
discovered_at: 2026-10-19
src: "AIOSON supervised session: revisão de técnicas de memória de longo prazo para agentes — continuidade depois do /compact"
status: corrigido no framework
---

# A compactação levava embora o estado para continuar

## O que se sentia

Depois de um `/compact` (manual ou automático) o agente recomeçava com um resumo escrito por ele mesmo. Os detalhes de que mais precisava (arquivos tocados, comando que ainda falhava, onde o plano parou) eram justamente os que um resumo perde.

## Por que passou

A única proteção era prosa: o kernel dizia que `mappings/{slug}/continuity.md` "pode guardar contexto" antes da compactação. Depender de o agente lembrar de escrever perde para a vontade de seguir trabalhando, e o hook de PreCompact nem era instalado. Os fatos já estavam gravados pelos hooks (`artifact`, `step_done` com `outcome`/`result`, `plan_updated`, `agent_reply`), mas ninguém os devolvia.

## O que impede agora

- `hooks:install` adiciona `PreCompact` → `hooks:emit` (marcador `compaction`) e `SessionStart` com matcher `compact` → `hooks:recap`.
- `hooks:recap` remonta o checkpoint dos eventos desde a compactação anterior: agente, feature/fase/próximo passo registrados, arquivos do projeto alterados (os de fora só contados), comandos cuja última execução falhou (um passe posterior limpa), último resultado de teste, plano, continuity mapping se existir, última fala do agente rotulada como alegação dele. No máximo 2.000 caracteres, só linhas inteiras, rotulado como dado gravado; qualquer outro início de sessão responde `{}`.
- Nenhum modelo escreve nada: a perna determinística substitui a instrução em prosa. O live-fire numa sessão real mostrou arquivos de rascunho fora do projeto gastando o orçamento — agora são contados, não listados.
- Rodar a suíte de dentro de uma sessão aberta pelo `live:start` herda `AIOSON_LIVE_SESSION` além de `AIOSON_LIVE_SESSION_KEY`: teste de hook que isola sessão precisa limpar as duas.
