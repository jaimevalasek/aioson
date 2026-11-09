---
title: "A economia cortou uma leitura, e ninguém conferiu quem ainda dependia dela"
scope: src/context-guard.js, src/lib/phase-capsule.js, src/commands/phase-next.js, src/lib/session-digest.js, src/dossier/store.js, template/.aioson/agents, template/.aioson/docs
src: "AIOSON supervised session: five independent reviews of a 17-commit token-economy wave (session-start digest, phase boundary, kernel diet), each finding reproduced before the fix (2026-11-09)"
---

# A economia cortou uma leitura, e ninguém conferiu quem ainda dependia dela

## O que aconteceu

A onda reduziu o que cada sessão lê ao começar e a cada troca de fase. Os números de bytes melhoraram e a suíte ficou verde. A revisão achou o mesmo defeito em cinco lugares, sempre com a mesma forma: algo deixou de ser lido ou dito, e quem dependia daquilo não foi conferido.

- O aviso de regra "já dita nesta sessão" era guardado por sessão. Um subagente compartilha a sessão do pai e nunca ouvia a regra. Uma regra editada no meio da sessão também não era repetida.
- `phase:next` gravava as decisões fora do disco na trilha do dossiê. A cápsula da fase seguinte não lia a trilha, então a nota existia e ninguém a recebia.
- O digest de início cortava os aprendizados na ordem do índice. Com mais de seis casando, os que mais casavam ficavam de fora, e as descrições gastavam 4,5 KB.
- Três frases de instrução saíram dos kernels e dos docs roteados na dieta. O teste de retenção só fixava as restrições rígidas e os comandos.
- Duas escritas simultâneas no dossiê perdiam uma das duas, porque o ciclo ler, alterar e gravar não era coberto pela trava inteira.

## A regra

Antes de cortar uma leitura para economizar, liste quem lê aquilo hoje e prove que cada leitor continua servido. Estado do tipo "já foi dito" leva na chave quem ouviu (o agente, e não só a sessão) e o que foi dito (o hash do texto). Uma nota gravada só conta quando um teste a lê pelo caminho do leitor seguinte, do comando que grava até o comando que entrega.

Quando o corte é por limite de quantidade, ordene por relevância antes de cortar. A ordem do arquivo não diz qual item importa para a tarefa.

Numa dieta de kernel, fixe em teste toda frase de instrução que precisa sobreviver, mesmo fora das restrições rígidas. O que não está fixado sai sem ninguém notar.

## Como conferir

- `tests/context-guard-session-reminders.test.js`: subagente ouve a regra uma vez, regra editada volta a ser dita.
- `tests/phase-capsule-notes.test.js`: a nota escrita por `phase:next` chega à cápsula das fases seguintes, inclusive depois de arquivada.
- `tests/context-digest.test.js`: aprendizados ordenados pelo número de palavras em comum, digest dentro de 3 KB.
- `tests/dossier/dossier-parallel-writers.test.js`: escritas paralelas ficam todas no arquivo.
- `tests/template-docs-mirror.test.js`: toda cópia de doc ou agente no workspace é igual ao template.
