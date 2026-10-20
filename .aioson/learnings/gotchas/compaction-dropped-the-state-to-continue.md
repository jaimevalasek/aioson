---
title: "A compactação levava embora o estado para continuar"
scope: [hooks-install, hooks-emit, hooks-recap, live, compaction, continuity]
paths:
  - src/lib/compaction-recap.js
  - src/commands/hooks-recap.js
  - src/commands/hooks-emit.js
  - src/commands/hooks-install.js
  - src/lib/opencode-plugin.mjs
  - src/lib/opencode-plugin.js
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
- O instalador dizia que o Codex não tinha hooks e escrevia um wrapper shell; o Codex 0.16x tem hooks nativos no formato do Claude Code (`codex features list` → `hooks stable true`; `~/.codex/hooks.json`; confiança por hash via `/hooks`). Agora `hooks:install --tool=codex` escreve `PreCompact` + `SessionStart(compact)` + `SessionEnd`, com `commandWindows` para Windows, e o `hooks:emit` lê `apply_patch` (arquivos pelos cabeçalhos `*** Add/Update File:`, o destino de um `*** Move to:`; um `*** Delete File:` não é alteração), `update_plan` e o veredito de um comando pelo texto da saída — o Codex manda o `tool_response` como o texto que o modelo vê, sem código de saída (`codex-rs/core/src/tools/context.rs`); a primeira versão supôs o código ali e "ainda falhando" nunca aparecia no Codex.
- O OpenCode não tem hook de shell, mas tem API de plugin: `hooks:install --tool=opencode` grava `src/lib/opencode-plugin.mjs` em `$XDG_CONFIG_HOME/opencode/plugins/aioson.js` (padrão `~/.config/opencode`), que chama `hooks:emit` em `tool.execute.after` (inclusive `apply_patch`, a edição dos modelos GPT)/`chat.message`/`experimental.text.complete` — numa fila que o OpenCode não espera — e `hooks:recap --when=always --session=<id> --json` em `experimental.session.compacting` (prompt do resumo, depois de esvaziar a fila) e em `experimental.chat.system.transform` no primeiro turno depois de `session.compacted`. Só age em projeto AIOSON (`.aioson/config.md` etc.; `~/.aioson` do operador não conta), 15 s por chamada, nunca lança.
- A sessão de hooks por agente é compartilhada por toda janela, lane e dia no projeto, e o checkpoint a lia inteira: uma sessão nova recebia os arquivos e a última fala da de ontem ("falta rodar o seed de produção"), a compactação de um lane cortava a janela do outro, e a segunda compactação perdia o agente, o plano e um teste que não rodou de novo. Agora todo evento leva o `session_id` do harness e o `hooks:recap` lê só aquela sessão; agente, plano e o que ainda falha valem sobre a sessão inteira, arquivos e última fala sobre o trecho. O `hooks:emit` grava o arquivo de sessão como o `agent:done` o lê (`@dev`), um lane worker nasce sem o `AIOSON_LIVE_SESSION` de quem o abriu, a ativação de um agente fica registrada mesmo sem `live:start`, e o próximo passo do `dev-state.md` só vai para o @dev (os outros recebem o estágio do workflow e o artefato do contrato).
- Sem hook instalado, os kernels `AGENTS.md`/`OPENCODE.md` mandam rodar `aioson hooks:recap . --when=always` logo depois do `/compact` — mesma remontagem, em texto (`--source=opencode --json` devolve `{"additionalContext"}` sem o envelope do Claude).
- O `hooks:recap` usa o mesmo predicado de sessão do `hooks:emit` (`source: 'live'`): a run própria de um agente oficial (`runtime:emit` sem launcher) nunca é lida como sessão de hooks, senão o checkpoint vinha vazio ou de outra run.
