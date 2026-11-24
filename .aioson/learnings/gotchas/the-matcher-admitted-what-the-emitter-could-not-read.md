---
title: "O matcher admitia ferramentas que o emissor não sabia ler — o evento existia, vazio"
scope: [hooks-install, hooks-emit, codex, telemetry, hook-trust]
paths:
  - src/commands/hooks-install.js
  - src/commands/hooks-emit.js
  - src/lib/hook-trust.js
  - tests/hooks-codex.test.js
  - docs/pt/5-referencia/hooks-session-guard.md
discovered_at: 2026-11-24
src: "AIOSON supervised session: revisão dos commits depois do v1.83.0 — o matcher do hook do Codex ganhou nomes de ferramenta, o emissor não"
status: corrigido no framework
---

# O matcher admitia ferramentas que o emissor não sabia ler — o evento existia, vazio

## O que se sentia

Um commit disse "exec tool uses are recorded": o matcher do `PostToolUse` do Codex passou a admitir `exec`, `exec_command` e `shell`. Os testes passaram, a mensagem do commit estava certa sobre o que o *matcher* faz. Só que o `hooks:emit`, que lê o que o hook entrega, não conhecia nenhum dos três: cada chamada virava uma nota `[codex] exec` — sem comando, sem veredito, sem a marca de leitura de credencial. O Codex 0.171 faz a maior parte do trabalho por `exec` (95 mil das ~165 mil chamadas de ferramenta, 58%, nos rollouts desta máquina), então a telemetria dessas sessões ficava cheia de eventos que não diziam nada.

## Medido

- `buildEventFromPayload` com `Bash` e `{command:'npm test'}` → `step_done`, `$ npm test`, `outcome: failed`. Com `exec_command`, `shell` e `exec` → `note`, `[codex] <nome>`, `extra: {}`.
- O argv do `shell` (`['bash','-lc','cat .env']`) virava `$ bash,-lc,cat .env`: o `commandDetails` usava `String()` onde o `shellLine` já sabia juntar com espaços.
- Nos `events.ndjson` de hook do Codex gravados nos dois checkouts desta máquina, só existia `$ <comando>`: nenhum `apply_patch:` e nenhum `[codex] exec`. O formato do payload de `exec` no hook nunca foi medido, só o que o modelo chama (texto livre).

## Por que tudo ficou verde

**Superfície descoberta.** O teste do matcher comparava a *string* do matcher (`assert.equal(matcher, '…|exec|exec_command|shell')`), e o teste do emissor nunca recebeu um nome novo: duas metades de um contrato, cada uma testada sozinha, nenhuma testando que se encaixam. A receita do repositório já dizia que a diferença de payload entra no `hooks:emit` — o commit mexeu só no lado do matcher.

## O que impede agora

- `tests/hooks-codex.test.js` deriva a lista do próprio `buildCodexHooks('dev')` e exige, para cada nome do matcher, um payload de exemplo **e** um evento que não seja a nota opaca: ampliar o matcher sem ensinar o emissor falha o teste.
- `hooks-emit.js` lê `exec_command` e `shell` como `Bash` (linha, veredito, marca de credencial; argv como uma linha) e `exec` como um passo `exec: <200 primeiros caracteres>`. O script fica **sem veredito** de propósito: o recap só limpa uma falha quando o mesmo texto de comando passa depois, e um script não se repete — o veredito ficaria preso como "ainda falhando" depois do `/compact`.
- Limite honesto, registrado como observação: os arquivos que um script `exec` edita não são listados, e o formato do `tool_input` de `exec` no hook segue sem medida — só o que o modelo chama.

## Para o consumidor

`aioson update` e `aioson hooks:install --tool=codex`; depois, uma revisão no `/hooks` do Codex (o matcher faz parte da definição que ele confia). Lançamentos desassistidos pelo AIOSON passam `--dangerously-bypass-hook-trust` sozinhos, agora também em homes que já confiaram em algum hook.
