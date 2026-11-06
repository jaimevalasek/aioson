---
title: "Um plano de 21 fases rodou 18 horas, e nenhum instrumento mediu ou avisou"
scope: src/lib/plan-scale.js, src/lib/dev-progress.js, src/lib/phase-capsule.js, src/lib/duplicate-declarations.js, src/lib/plan-runtime-lint.js, src/lib/browser-walkthrough/, template/.aioson/docs/dev/phase-loop.md, template/.aioson/docs/qa/browser-walkthrough.md
src: "AIOSON supervised session: delivery of a 21-phase, 205-file plan under execution: single, measured from the transcripts of 25 Dev and QA agents (2026-11-06)"
---

# Um plano de 21 fases rodou 18 horas, e nenhum instrumento mediu ou avisou

## O que aconteceu

O dono esperava de 3 a 4 horas e soube das 18 só ao perguntar. Scripts de navegador escritos à mão rodaram 797 vezes, por 6h26, e `aioson browser:run` rodou zero. Dois QAs intermediários acharam defeitos que uma máquina poderia ter visto: tela velha até recarregar, ajudante copiado entre fases, fluxo que só quebra em `next start`.

## Por que todo gate ficou verde

- **Gatilho que não dispara:** `execution: single` registrado calava toda checagem de escala. `dev:state:write` guardava só as 5 últimas linhas, com o dia, sem a hora, então não havia como medir nada.
- **Cobertura ausente:** nada comparava declarações entre arquivos, e o Dev não tinha instrumento de navegador que passasse do login.
- **Heurística errada, na própria instrução:** `browser-walkthrough.md` mandava fazer `reload` logo depois da ação, e o `reload` reconstruía do servidor a tela que tinha ficado velha.
- **Nenhuma leitura do plano:** nenhuma gate lia qual servidor as linhas `Runtime` mandavam usar.

## O que agora impede

Tudo é aviso, e nenhuma gate muda de resultado:

- `workflow:next --complete=planner`, `execution:offer` e `workflow:execute` (`owner_notices`) avisam plano com 8 fases ou 80 arquivos, seja qual for a escolha. `dev:progress` projeta o restante a partir da própria execução, e abaixo de 2 fases medidas não dá número.
- `rules:check` tem `duplicate-declaration` (nome e corpo normalizado, sempre `LOW`), e `dev:resume-data --capsule` lista o que a branch já criou.
- Gate C avisa `runtime_on_dev_server` e `runtime_without_walkthrough`. `browser:run` avisa `reload_masks_stale_view`.
- `value_env`, `--save-state` e `--state` levam `browser:run` até depois do login em conta de teste local. Conta real continua por `--cdp`.

## Armadilhas

- Limite conhecido de `duplicate-declaration`: comparar corpo exato não pega reescrita. `useLicenseDate`, com `useMemo` em volta da mesma expressão, e `byName`, uma vez ordenando a lista e outra como comparador, têm corpos diferentes e não saem no aviso, embora o QA os tenha achado à mão. Dos 6 ajudantes do incidente, a repetição acha 4. A decisão é manter só corpo igual, sem nível de similaridade; a cápsula lista os dois para quem vai escrever o próximo.
- `{{env.NAME}}` já limpava o valor dos passos, mas não das amostras de console nem as formas codificadas. O que veio da página agora passa por `scrub` antes de sair, com o literal e as formas de URL, formulário, JSON e base64. Os nomes da própria execução ficam de fora, ou um valor como `demo` estragaria o `replay`.
- Página falsa esconde corrida. A primeira versão de `value_env` lia o endereço uma vez e digitava depois de esperar o campo, e um redirecionamento depois do `load` entregava o valor ao outro host com `ok: true`. O teste passava porque a página falsa redirecionava dentro do `goto`. Segurança de navegador se prova com navegador e servidor reais.
- Guarda de navegação não fecha a classe. Cada corrida fechada mostrava outra: 302 depois da conferência, 307 que mantém o corpo, aba nova, WebSocket, service worker. O que fecha é tirar a rede da página: com `value_env` ou `--save-state`, o navegador só alcança loopback, por um proxy local que recusa o resto.
- `--force-webrtc-ip-handling-policy` é aceita e não faz nada no Chrome e no Edge 156: medido em UDP, o `username` do TURN saía com ela ligada. Quem funciona é `--webrtc-ip-handling-policy`. Flag de navegador pode parar de valer sem aviso, então a execução prova o resultado antes da primeira página e recusa o navegador que falhar.
- O proxy também recusa o tráfego do próprio navegador (atualização, autofill, `accounts.google.com`). Só o que uma página pediu pode ser citado em passo que falhou, ou a mensagem acusa o host errado.
- `foldDiacritics` remove a crase, porque U+0060 é `\p{Diacritic}`. Não use essa função para comparar texto de doc em que a crase importa.
- Um `+++ ` só é cabeçalho de `git diff` logo depois de um `--- `. Sozinho, é linha adicionada que começa com `++`.
- Numa cópia feita por `git archive` não há `.git`: `rules:check --changed` não tem o que ler, então a repetição usa `--paths`, e a cápsula precisa de um clone.
