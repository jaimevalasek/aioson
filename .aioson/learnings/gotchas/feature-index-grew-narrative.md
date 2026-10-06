---
title: "O índice de features virou diário — 86% do features.md era narrativa que nunca saía no fechamento"
scope: [features-md, feature-close, feature-register, feature-tidy, doctor, update]
paths:
  - src/lib/feature-registry.js
  - src/commands/feature-registry.js
  - src/commands/feature-close.js
  - src/doctor.js
  - src/commands/update.js
  - template/.aioson/agents/product.md
  - template/.aioson/brains/dev/patterns.brain.json
discovered_at: 2026-10-06
src: "AIOSON supervised session: projeto consumidor de longa duração com 77 features registradas"
status: corrigido no framework
---

# O índice de features virou diário

## O que o consumidor sentiu

`features.md` com 32 KB e 117 linhas, difícil de ler. Medido: 77 linhas de tabela (≈4,5 KB) e 26 comentários HTML narrativos (27 KB, até 6 KB por linha) com decisões, histórico de escopo e motivo de pausa. 30 linhas foram anexadas depois dos comentários, sem cabeçalho de tabela acima, e por isso já não renderizavam como tabela. Um comentário aberto numa linha e fechado duas linhas depois parecia texto solto. O `feature:close` arquivava todos os documentos da feature, mas a nota dela ficava no índice para sempre.

## Por que todo portão ficou verde

- **Autoavaliação:** nenhum comando escrevia linhas novas; os agentes editavam o arquivo à mão. O kernel do @product dizia "keep this index compact" (prosa), e prosa perde para o prior do modelo.
- **Heurística errada no brain:** `dev/patterns` listava `features.md` entre os caches append-only: "add a new line/row … mark it superseded with a follow-up entry". Essa é a receita exata de narrativa acumulada e de linhas no fim do arquivo.
- **Superfície descoberta:** `hygiene:scan` via linhas duplicadas e arquivamento pendente, mas nada media o formato do índice (notas, linhas sem cabeçalho, comentário aberto).
- **`feature:close`** anexava ao fim do arquivo a linha que não encontrava, depois dos comentários.

## O que agora impede

- `src/lib/feature-registry.js` é o único dono do arquivo: parse → muda linhas → serializa canonicamente (resumo com contagens e uma tabela por situação — em andamento, planejamento, pausadas, concluídas e abandonadas; a ordem das em andamento é preservada porque a ligação do workflow lê "a última linha in_progress"). Nenhuma nota é descartada: um escritor mantém as notas sem alteração no fim do arquivo ou as move para a pasta da feature.
- `feature:close` move as notas da própria feature para `features/{slug}/registry-notes.md` antes do arquivamento, e elas vão junto para `done/{slug}/dossier/`.
- `feature:register` é o caminho do agente (recusa `done`, valida o slug); o kernel do @product e o nó do brain apontam para ele; um teste fixa a frase.
- `feature:tidy` (`--dry-run`) migra projetos existentes com backup; `doctor` avisa (`context:feature_registry_noise`), `doctor --fix` migra, `update` imprime o aviso e nunca reescreve o arquivo sozinho.
- Prova no projeto real (somente leitura): 32,5 KB → 4,9 KB, `parseFeaturesMap` idêntico (77/77), última in_progress preservada.

## Receita

Arquivo de estado que vários agentes escrevem precisa de um escritor no CLI. "Mantenha compacto" escrito no kernel não é contrato. Antes de chamar um arquivo de append-only, pergunte se ele é log (append) ou índice (upsert): um índice tratado como log vira diário.
