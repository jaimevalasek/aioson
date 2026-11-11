---
title: "A sessão compactava a cada poucos minutos e nada dizia se era o harness ou o projeto"
scope: [hooks-emit, hooks-recap, compaction, context-window, host, harness-version]
paths:
  - src/lib/compaction-pressure.js
  - src/commands/hooks-emit.js
  - src/commands/hooks-recap.js
  - src/lib/compaction-recap.js
kind: gotcha
captured: 2026-11-10
src: "AIOSON supervised session: a session on a newly released model compacted at ~167k tokens every 3 to 30 minutes while other models on the same machine ran to ~967k"
---

## O que se sentiu

Com um modelo recém-lançado, a janela parecia ter ~160 mil tokens e a conversa compactava a todo momento. A pergunta foi: é do modelo ou algo mudou no framework?

## O que era

Nenhum dos dois. O harness instalado era mais antigo que o modelo: não reconhecia o id, assumia a menor janela (200 mil) e compactava em ~167 mil (janela menos a reserva). Na mesma máquina, no mesmo dia, com a mesma versão do framework e os mesmos hooks, os modelos que aquele harness conhecia iam a ~967 mil. Nenhuma variável de ambiente nem configuração limitava a janela; hook e arquivo de instruções não mudam o tamanho da janela, só a ocupam.

## Por que passava

Os hooks viam toda compactação (o `PreCompact` grava o marcador), mas gravavam só o gatilho: nem quanto contexto havia, nem há quanto tempo tinha sido a anterior. Sem número, a pessoa só via o trabalho parando para se resumir, e a suspeita caía no que ela tinha mudado por último.

## O que impede agora

- O marcador `compaction` guarda `context_tokens`, lido do fim da transcrição do próprio harness (no Codex também `window_tokens`). Sem transcrição legível, o marcador é gravado sem o número.
- O `hooks:recap` mede o intervalo entre as compactações automáticas **da mesma sessão**. Duas a menos de 45 minutos viram uma linha do checkpoint e, no Claude Code, um `systemMessage` para a pessoa dizendo onde olhar (versão do harness, relatório de contexto).
- Não há tabela de modelos nem de janelas: só números medidos. Modelo novo ou harness novo não pede atualização.
- Replay somente leitura sobre 21 compactações reais: avisou em 7 das 10 da janela pequena (as outras 3 são a primeira de cada sessão) e ficou calado nas 11 de janela grande.

## Como diagnosticar da próxima vez

1. Compare o `preTokens` dos `compact_boundary` da transcrição entre modelos, na mesma máquina. Um modelo sempre perto do mesmo número baixo e os outros muito acima = o harness não conhece aquele modelo.
2. Versão do harness contra a versão mínima que o modelo exige. O canal `stable` do instalador pode estar atrás do mínimo.
3. Só depois meça o que o framework ocupa. O custo de ativação não mudou; numa janela pequena ele passa a ser um terço dela.

## Armadilhas

- O `PreCompact` do Claude Code descarta `systemMessage`, e o que o hook imprime no stdout vira instrução do resumo. O aviso sai no `SessionStart`.
- O payload de nenhum hook traz contagem de tokens no início pós-compactação; o formato da transcrição não é contrato documentado. Por isso a leitura é melhor-esforço e nunca falha o hook.
- Contar marcadores pela janela de eventos do recap (2.000 linhas) subcontaria justamente a sessão que mais compacta: a contagem tem leitura própria.
