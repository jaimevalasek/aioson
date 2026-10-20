---
title: "Toda chamada do CLI pagava os 215 módulos de comando — e a memória do operador custava 55 mil tokens por ativação"
scope: [cli, performance, startup, hooks, operator-memory, token-economy, session-start]
kind: gotcha
captured: 2026-10-20
src: "AIOSON supervised session: end-to-end probe of the 80/20 feature cycle"
---

## O que se sentiu

Cada agente do ciclo roda ~60 chamadas do CLI por feature, e todo hook (`hooks:emit` a cada uso de ferramenta) é uma chamada: ~0,6–0,9 s cada, com o cabeçalho do `hooks-emit.js` prometendo "< 50 ms". No início de toda sessão, `op:list --json --titles-only` devolvia 522 decisões em 193 KB (~55k tokens).

## Por que passava

- `src/cli.js` fazia `require` de todos os 215 módulos no topo: 697 de 796 ms de um `hooks:emit` eram carregar o CLI inteiro.
- O formato de recall de início de sessão imprimia JSON indentado com campos sempre nulos — o custo crescia com a memória do operador, sem teto e sem ninguém medir.

## O que impede agora

- Cada binding vira `lazy(() => { const { runX } = require('./commands/x'); return { runX }; })`: o módulo carrega na primeira chamada e a destruturação no `require` deixa o fallow e o `audit:code` verem quais exports estão em uso — a primeira forma, `lazy(() => require(x), [names])`, lia como "todos os exports usados" e escondeu 104 exports mortos do gate estático (revisão do mesmo dia). `quality.js` também carrega cada módulo só na própria chamada: `isQualityCommand` roda para 237 comandos. Medido: `--version` 601 → 159 ms, `context:validate` 482 → 80 ms.
- `op:list --titles-only` sai compacto, sem campos vazios, datas em dia: −36,7% (522 itens: 180 → 114 KB).

## Regra de bolso

Comando novo entra no `cli.js` pelo `lazy(...)` com destruturação no `require`, nunca por `require` no topo nem por `() => require(x)` nu; `tests/cli-lazy-command-modules.test.js` pina o que `--version` e `observation:list` carregam. Saída que todo agente lê no início da sessão é orçamento: meça bytes no store real (não no de teste) e trate crescimento sem teto como bug — o recall virou uma cabeça de 40 (este projeto, proibições antes de permissões, frescor), com `total`/`omitted` e `--match` para o resto.
