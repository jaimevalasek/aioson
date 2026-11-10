---
title: "O update aplicou a versão da cópia do CLI que rodou, não a do global que a tela mostrava"
scope: [update, install, version, cli, host, downgrade]
kind: gotcha
captured: 2026-11-10
src: "AIOSON supervised session: a desktop host moved projects 1.75 → 1.77 with the global CLI at 1.80; follow-up review of update/install (23 defects)"
---

## O que se sentiu

Com o CLI global em 1.80, o botão "Atualizar projeto" de um app desktop levou o projeto de 1.75 para 1.77, e o painel continuou pedindo update. A pessoa suspeitou das tags de versão.

## Por que passava

Uma máquina tem várias cópias do CLI: o global, um `npm link` e a cópia que o app embarca no instalador (congelada no dia do build). O app mostrava a versão do global e rodava a embarcada. O `update` copia os templates da cópia que **rodou**, e a guarda de downgrade não vê nada errado num update de 1.75 para 1.77. A única pista era `template_git_sha: null` no `install.json` (um global linkado sempre carimba o sha).

## O que impede agora

- O `update` imprime `(was <anterior>; CLI at <caminho>)`, o `--json` traz `templateVersionBefore`, `templateVersionAfter` e `cliRoot`, e a recusa de downgrade sai como `downgrade_blocked` com `details`.
- Template mais novo que o CLI deixou de ser um `ahead` silencioso: o aviso aparece no `workflow:next`, no `preflight` e no `context:digest` (chave `template`).
- A guarda vale num clone novo (lê o `aioson_version` do `project.context.md` quando falta o `install.json`, que é gitignored), e `init --force` passou a ter a guarda.
- No app, o CLI global mais novo vence a cópia embarcada, e o painel compara o projeto com a versão que o botão vai rodar.

## Como diagnosticar da próxima vez

Leia `.aioson/install.json` de cada projeto: `template_git_sha: null` com versão abaixo do global indica uma cópia empacotada. Rode `aioson update` e leia o caminho em `CLI at`.
