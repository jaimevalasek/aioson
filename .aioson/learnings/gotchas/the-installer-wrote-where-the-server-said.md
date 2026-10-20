---
title: "Os instaladores da Loja gravavam onde a resposta do servidor mandasse — slug e caminho de arquivo sem contenção"
scope: [store, security, path-traversal, install, auth, tokens]
kind: gotcha
captured: 2026-10-20
src: "AIOSON supervised session: adversarial review of the v1.73.0 Store commits"
---

## O que se sentiu

Nada no uso normal. Na revisão: um slug `../../../victim` vindo do servidor moveu uma pasta vizinha e um arquivo `../../../escaped.txt` caiu três níveis acima — em `system:install`, `squad:install`, `skill:install:store` e `genome:install:store`, agora que `--base-url` aponta o comando para qualquer site.

## Por que passava

Slug e caminhos da resposta viravam `path.join` direto, e a contenção existente (`startsWith('..')`) só olhava imagens do `system.json`, recusando até `..cover.png` legítimo.

## O que impede agora

- `src/lib/store/install-containment.js`: slug validado e todo destino dentro da pasta de instalação **antes** de qualquer delete, cópia ou escrita — um helper para os quatro comandos.
- Junto: `--base-url` vazio é erro de uso (ia para produção), `http://` só em loopback/LAN, token por site sem perder o anterior, `config show --json` mascarado, `config.json` 0600.

## Regra de bolso

Todo caminho que vem da rede é dado hostil: valide o nome e prove contenção (`rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel)`) antes da primeira operação de disco, com teste de servidor falso que devolve `../x`.
