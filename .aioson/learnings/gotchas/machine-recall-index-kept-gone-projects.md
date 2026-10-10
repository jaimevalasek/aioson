---
title: "O índice de recall da máquina guardava projetos que não existiam mais"
scope: [context-search, context-brief, storage-triage, neo]
paths:
  - src/context-search.js
  - src/lib/storage-footprint.js
  - src/context-brief.js
  - src/commands/context-search.js
  - template/.aioson/docs/neo/runtime-storage.md
discovered_at: 2026-10-10
src: "AIOSON supervised session: índice de recall de uma máquina de operador medido numa cópia (112 partições, 47 projetos ainda no disco)"
status: corrigido no framework
---

# O índice de recall da máquina guardava projetos que não existiam mais

## O que o operador sentiu

Medido numa cópia de `~/.aioson/search/context-search.sqlite` (328 MB):

- 112 partições, 65 delas de pastas que não existem mais (a maioria fixtures de teste da pasta
  temporária), mais uma partição com a chave antiga sem dobra de caixa (`C:\…` contra `c:\…`) que
  nenhuma busca alcançava desde a dobra;
- lentidão invisível: todos os projetos dividiam a mesma tabela FTS5, então apagar a linha de um
  arquivo alterado varria os 28.559 documentos — 192 ms por arquivo, em toda reindexação de
  qualquer projeto, crescendo a cada projeto que a máquina já indexou.

## Por que nada pegou

- **Heurística errada na arquitetura:** um cache derivado dos arquivos do projeto morava fora do
  projeto, numa loja da máquina chaveada por caminho. Nada ligava a vida da partição à da pasta.
- Nenhum leitor buscava entre projetos (toda busca filtra por `project_dir`): o índice global não
  comprava nada e cobrava disco e tempo.

## O que agora impede

- Cada projeto AIOSON tem o seu índice em `.aioson/runtime/context-search.sqlite` (fora do git):
  apagar o projeto apaga o índice; projeto movido ou copiado descarta as linhas do caminho antigo ao
  abrir; pasta que não é projeto AIOSON indexa só em memória.
- Abrir o índice de um projeto aposenta o arquivo compartilhado (`retireLegacyRecallIndex`); uma
  fixture na pasta temporária nunca toca a loja padrão. `storage:triage --global` reporta
  `legacy_recall_index` como mecânico; um arquivo que o aioson não escreveu ali segue decisão do dono.
- Medido no maior projeto: 5,5 s e 18,7 MB para 1.579 documentos na primeira montagem, 0,8 s sem
  mudanças, 7,9 ms por arquivo alterado (antes 192 ms).

## Receita

Cache derivado dos arquivos de um projeto mora dentro do projeto, na pasta de runtime que o git
ignora, para morrer com ele. Loja da máquina chaveada por caminho só se justifica quando algo lê
entre projetos — e aí precisa de coletor de lixo desde o primeiro dia.
