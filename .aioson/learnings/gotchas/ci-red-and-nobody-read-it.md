---
title: "O CI falhou 30 vezes seguidas e nenhum portão leu o veredito — a suíte só era verde onde os espelhos ignorados existiam"
scope: [ci, release-gate, tests, workspace-mirrors, console-output, posix]
kind: gotcha
captured: 2026-09-10
src: "AIOSON supervised session: two-week regression review with a faithful CI replay"
---

## O que se sentiu

Nada — e esse era o problema. Todo push de `main` e todo workflow de Release falharam no GitHub de 2026-08-19 a 2026-09-10 (30 runs seguidos, v1.58.0 a v1.65.0 cortadas e publicadas em cima). Localmente a suíte fechava 0 falhas. Por baixo, dois bugs de produto que só existem fora do Windows estavam sendo acusados todo dia, sem ninguém olhando.

## Por que o framework deixou passar

- **Suíte verde só nesta máquina.** Seis testes liam cópias do workspace que o `.gitignore` exclui (`.aioson/skills/`, `.aioson/schemas/`) — existem só onde `sync:agents` rodou. Checkout limpo (CI) = ENOENT. A onda seguinte repetiu o padrão em mais dois testes: sem regra escrita, o molde se copia.
- **Ninguém consumia o veredito.** O release-flow.md tinha a precondição "main verde no CI" em prosa; o `verify:release:quick` do ritual de release não olhava o CI. Prosa perde para o hábito.
- **O que o replay achou de produto:** (1) `writeThrough` lê `process.stdout.isTTY`, o que cria o stream; o libuv põe o fd do pipe em `O_NONBLOCK`, e o `fs.writeSync` cru passa a lançar `EAGAIN` com leitor lento (`--help` cortado na linha 163 dentro da suíte) ou a entregar só o prefixo — `--json` de 1,2 MB chegou com 64 KB e sem erro. (2) ENOTDIR (POSIX) tratado como "presente mas ilegível" fazia `execution:seed` responder `already_present` sobre um caminho bloqueado.
- **Teste de latência dentro de suíte paralela** mede contenção, não código: p99 183–331 ms em Linux sob a suíte, pelo mesmo motivo que já o tinha tirado do Windows.

## O que impede agora

- `tests/helpers/workspace-mirror.js`: espelho **rastreado** precisa existir e bater; espelho **local-only** (decidido pelo próprio `.gitignore` via `ignore`) só é comparado onde existe. Registro de skills é lido do `template/`, que é o que embarca.
- `writeAllSync` escreve até o fim e espera o leitor no `EAGAIN`; teste com leitor pausado falha no HEAD em Linux e passa com a correção.
- `release-readiness.js` lê os runs do workflow CI na branch: vermelho bloqueia (`--allow-red-ci` é a exceção consciente), API inalcançável vira `unknown` e nunca bloqueia, dentro do GitHub Actions a leitura é pulada.
- QA-PERF-01: o limite de 100 ms vira perfil (`AIOSON_PERF=1`); o sem-perda de eventos roda sempre.

## Regra de bolso

- Teste que lê `.aioson/<algo>` da raiz do repo: se o caminho é ignorado pelo git, use `readWorkspaceMirror` ou leia do `template/`.
- Replay fiel do CI antes de dizer "suíte verde": `git archive <sha>` → container `node:20-bookworm-slim` + `apt-get install git` + `CI=true` → `node --test --test-reporter=tap`. A imagem slim não traz git (166 falhas falsas) nem Python (better-sqlite3 sem prebuild compila do fonte); root no container ignora permissão de arquivo; `tar` do Git Bash precisa de `--force-local` com `C:`.
- Sem `gh`: a API pública do GitHub dá runs e jobs sem token, mas não os logs (403).
