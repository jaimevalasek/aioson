---
title: "A memória do operador só reconhecia o usuário pelas mesmas palavras"
scope: [operator-memory, op-capture, op-list, memory-loading, dossier-telemetry]
paths:
  - src/operator-memory/equivalence.js
  - src/operator-memory/standing.js
  - src/operator-memory/archive.js
  - src/operator-memory/housekeeping.js
  - src/operator-memory/index-md.js
  - src/operator-memory/decision.js
  - src/commands/op-capture.js
  - src/commands/op-list.js
  - src/lib/dossier-telemetry.js
  - src/runtime-store.js
discovered_at: 2026-11-17
src: "AIOSON supervised session: análise da memória do operador num armazenamento real de quatro meses — a memória deveria conhecer o comportamento do usuário entre projetos"
status: corrigido no framework
---

# A memória do operador só reconhecia o usuário pelas mesmas palavras

## O que se sentia

Numa sessão de um projeto novo, a tarefa "ajustar a tela de login" recebia 15 títulos de memória; 1 era daquele projeto. Os outros eram regras de tela de outros apps, um banco de outro produto, uma câmera virtual de outro estúdio. A memória crescia (676 decisões, 3,5 MB) e não aprendia nada: o usuário repetia preferências e o sistema nunca percebia.

## Medido no armazenamento real

- 665 de 676 decisões nunca reforçadas; 0 decisões ampliadas para todos os projetos desde que o escopo existe; 120 de 142 confirmações paradas na 1ª detecção.
- 309 de 357 autorizações promovidas sem nenhuma marca de permanência na fala do usuário: "sim", "confirmo", "abrir a url (Recommended)", "@validador".
- 522 decisões de antes do escopo (77%) valiam em todo projeto; 456 delas sem prova nenhuma de que eram permanentes.
- O código de decaimento/arquivo existia sem nenhum chamador; `archived_count` sempre 0.
- `emitDossierEvent` chamava `logAgentEvent(db, null)`, que quebrava em `path.join(null)`; o `catch` escondia. 0 eventos de dossiê em 59 bancos de projeto.

## Por que passou

- **Heurística errada:** a identidade de uma repetição era o slug da paráfrase exata. A paráfrase é do agente e muda a cada sessão, então reforço, ampliação e promoção de confirmação estruturalmente não disparavam. Os testes repetiam o mesmo texto e ficavam verdes.
- **Autoavaliação:** só o modelo decidia o que era permanente; a diretiva com os contraexemplos ("agora pode commitar" não é permanente) só era alcançável por entrypoints legados.
- **Misfire:** decaimento, arquivo e eventos existiam no papel e nunca rodavam.

## O que impede agora

- Repetição pelo sentido (`equivalence.js`): mesmo tipo de sinal, Jaccard das palavras de conteúdo ≥ 0,4 com ≥ 3 em comum, e os mesmos identificadores (números, versões, slugs) — "fase 2" ≠ "fase 3". No armazenamento real, todo par acima do limiar era a mesma decisão reescrita.
- Prova de permanência (`standing.js`): autorização vale na 1ª vez só com marca na citação literal (pt-BR/en/es); sem ela espera a repetição e o `op:capture` diz `held: awaiting_repeat`. Exclusão e correção valem na hora (esquecer uma proibição é invisível).
- Arquivo como leitura da decisão (`archive.js`): `unproven` (sem escopo, nunca reforçada, sem marca) e `stale` (permissão sem reforço por duas meias-vidas). Proibições e `identity` nunca envelhecem. `MEMORY-archive.md` com o motivo; `op:list` conta `archived`; um reforço traz de volta.
- Topo de sessão só com o que se sabe que vale aqui: decisão sem escopo responde quando a tarefa a nomeia com 2 palavras; dita de novo, é adotada pelo projeto (`adopted: true`). Toda promoção nova grava `scope` (operator quando não há projeto), então "sem escopo" significa só "de antes do escopo".
- Limpeza diária no `op:capture`: propostas não repetidas em 90 dias vão para `history/`; decisões nunca são apagadas.
- Eventos de dossiê viram uma linha própria em `execution_events` (`source: 'dossier'`), sem task, run ou arquivo de sessão.
- Prova ao vivo, só leitura, mesma tarefa: projeto com decisões próprias 3/14 → 8/8 títulos do próprio projeto; projeto sem decisões 1/15 → 0 títulos (nada de ruído); a regra global "testes reais só com Codex ou Haiku" aparece quando a tarefa a cita.

## Para diagnosticar

Antes de mexer no ranking, conte no armazenamento real: `reinforcement_count` (quase tudo 0 = repetição não reconhecida), marcas de permanência nas `quotes` por sinal, e o que o digest de um projeto sem decisões próprias mostra. Precisão do topo é medida por projeto, não pelo total.
