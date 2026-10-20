---
title: "Uma revisão escrevia ao lado da unidade que o agendador acabava de admitir — o lock só valia depois de um await"
scope: [execution, orchestration, lanes, write-lock, scheduler, concurrency]
kind: gotcha
captured: 2026-10-20
src: "AIOSON supervised session: CI replay under CI-like load (4 CPUs) of the v1.73.0 wave"
---

## O que se sentiu

"cross-wave reuse waits for the previous reviewer" falhava em 10 de 12 execuções sob carga e passava sozinho — parecia flake de tempo. Era um DEV e uma revisão escrevendo o mesmo arquivo ao mesmo tempo.

## Por que passava

- Depois que o DEV de uma unidade passava, a revisão dela só contava como escritora quando reivindicava o slot — e antes disso vinham `persist`, a ordem de revisão (talvez uma chamada ao Jev) e a configuração do papel. Nessa janela o agendador admitia o próximo implementador do mesmo arquivo.
- Uma unidade escolhida pelo agendador só entrava em `running` depois do `await gitBaseline()` compartilhado; uma revisão que reivindicasse o slot nesse meio não a via.
- Máquina rápida fecha as duas janelas antes do agendador olhar; runner de 4 CPUs não.

## O que impede agora

- Revisão com DEV aprovado é escritora até reivindicar o slot ou estacionar (`waiting`) — estacionada continua liberando, como exige a regra de que revisão na fila não é escritora.
- `launching`: unidade admitida é escritora desde a escolha; `writersSharing()` olha `running` e `launching`.
- Plano sem arquivo compartilhado agenda igual a antes; a regra só acrescenta esperas.

## Regra de bolso

Coordenação de escrita acontece na admissão, antes do primeiro `await` — todo `await` entre "decidi" e "registrei" é uma janela. Teste de sobreposição prova por evento (`until`), nunca por atraso fixo. Antes de chamar de flaky, rode a mesma carga no código original e compare teste a teste.
