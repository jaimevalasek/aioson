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

- Cada binding vira `lazy(() => require('./commands/x'), [names])`: o módulo carrega na primeira chamada. O `require` literal fica (o grafo da análise estática e os testes que leem o `cli.js` continuam vendo). Medido: `--version` 601 → 159 ms, `context:validate` 482 → 80 ms.
- `op:list --titles-only` sai compacto, sem campos vazios, datas em dia: −36,7% (522 itens: 180 → 114 KB).

## Regra de bolso

Comando novo entra no `cli.js` pelo `lazy(...)`, nunca por `require` no topo. Saída que todo agente lê no início da sessão é orçamento: meça bytes no store real (não no de teste) e trate crescimento sem teto como bug. Ainda aberto (decisão do dono): limitar quantas decisões o recall de início de sessão lista.
