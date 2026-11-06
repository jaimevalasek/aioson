---
title: "A regra julgava uma cópia, e o arquivo recebia outra coisa"
scope: src/lib/refiner/section-writes.js, src/lib/refiner/clean-round.js, src/lib/refiner/apply-feedback.js, src/commands/briefing.js
src: "AIOSON supervised session: two independent reviews of the rule that lets a saved review apply with no second question, replayed over 11 real rounds (2026-11-06)"
---

# A regra julgava uma cópia, e o arquivo recebia outra coisa

## O que aconteceu

A regra que dispensa a segunda confirmação olhava o JSON da revisão. A escrita olhava o arquivo, achava as seções por título e sanitizava o texto. Cada diferença entre as duas leituras virou um furo que passava sem pergunta: `Map<string, User>` virava `Map` numa seção reescrita, títulos trocados escreviam uma seção em outra, e editar as duas cópias do JSON escrevia no arquivo enquanto o relatório dizia "0 mudanças".

A primeira correção mediu contra o arquivo, mas de novo por conta própria, e três furos só mudaram de lugar.

## A regra

Quando uma regra decide se algo pode ser escrito, ela julga o resultado da escrita, calculado pelo mesmo código que escreve. `planSectionWrites` é chamado pelo apply, pela regra e pelo dry-run, então os três não têm como discordar.

Antes de endurecer uma regra, meça nos casos reais o que a sugestão faria. "Toda linha precisa sobreviver" parecia certo e travaria 50 de 58 reescritas reais. Fechar uma dúvida sempre remove linha.
