---
title: "O disco enchia com o próprio aioson — snapshots sem fim, rollbacks e fixtures de teste, e nada media"
scope: [backup-local, installer, storage-triage, hygiene-scan, doctor, neo, test-suite]
paths:
  - src/lib/storage-footprint.js
  - src/commands/storage-triage.js
  - src/backup-local.js
  - src/installer.js
  - src/context-search.js
  - src/commands/hygiene-scan.js
  - src/doctor.js
  - tests/setup/windows-fs-retries.js
  - template/.aioson/docs/neo/runtime-storage.md
discovered_at: 2026-10-09
src: "AIOSON supervised session: máquina de um operador com o disco em 0 bytes, medida em modo somente leitura (42 projetos consumidores, ~/.aioson e a pasta temporária)"
status: corrigido no framework
---

# O disco enchia com o próprio aioson

## O que o operador sentiu

O disco C: chegou a 0 bytes no meio de uma sessão e o espaço teve de ser liberado à mão. Medido
(somente leitura):

- `~/.aioson/backups`: 1,66 GB em 164 mil arquivos. Cada `agent:done` de @product/@sheldon/@planner
  copiava todo `.md` de `.aioson/context` — inclusive os arquivos de `done/` e `abandoned/` — e nada
  apagava: 162 snapshots (740 MB) num só projeto, 120 (299 MB) noutro;
- pastas de rollback do `update` em `.aioson/backups/{timestamp}`: até 80 por projeto, 9 mil arquivos;
- um log de 215 MB dentro de um checkpoint de execução (o loop de verificação de um agente
  anexando a mesma saída);
- caminhos pesados que só o dono sabe se servem: um Postgres portátil de 135 MB em
  `.aioson/runtime/`, um backup manual de 429 MB em `.aioson/backups/`, um spike de 748 MB em
  `researchs/`, um `.bak` de 381 MB ao lado do índice de recall;
- na máquina de quem desenvolve o aioson: ~15 GB de fixtures da suíte de testes na pasta temporária
  em quatro dias, mais snapshots e partições do índice de recall de projetos de teste gravados no
  `~/.aioson` real (2,6 mil pastas com nome de diretório temporário).

## Por que todo portão ficou verde

- **Superfície descoberta:** nenhuma medição olhava o disco fora do `aios.sqlite` e das capturas de
  evidência. O primeiro sinal era o disco cheio.
- **Heurística errada no produtor:** o snapshot copiava arquivos imutáveis (as features arquivadas)
  a cada rodada e nunca comparava com o anterior; nenhum produtor de backup tinha retenção.
- **Isolamento ausente nos testes:** fixtures `mkdtemp` que perdiam a corrida de handle no Windows
  ficavam para trás, e os testes escreviam nas lojas da máquina do desenvolvedor.

## O que agora impede

- Produtores com retenção: o snapshot deixa `done/`/`abandoned/` de fora, é pulado quando nada mudou
  (manifesto caminho/tamanho/mtime), mantém os 10 mais recentes e nunca grava no `~/.aioson` um
  projeto que vive na pasta temporária (mesma doutrina do registro de design; `AIOSON_BACKUPS_DIR`
  nomeia outra loja). O `update` mantém as 5 pastas de rollback mais recentes.
- `src/lib/storage-footprint.js` mede o que sobra e separa quem decide: `doc_snapshots`,
  `rollback_backups` e `oversized_log` são mecânicos; `heavy_path` (≥ 50 MB que o aioson não
  regenera) é do dono, por caminho. Link nunca é seguido; banco, sessões vivas e evidência seguem
  os procedimentos deles.
- `aioson storage:triage` lê por padrão; `--apply` faz o mecânico; `--remove=<caminho>` só aceita o
  que o relatório listou (um caminho estranho recusa tudo). `--global` olha a máquina.
- Disparo automático: `hygiene:scan` (toda ativação do @neo) traz `disk_footprint`; `doctor` e
  `update` avisam `runtime:disk_footprint`; o @neo conduz pelo módulo `runtime-storage.md`.
- A suíte roda dentro de uma raiz `aioson-t-<pid>` na pasta temporária, com as lojas
  (`AIOSON_BACKUPS_DIR`, `AIOSON_SEARCH_DIR`) dentro dela; o processo pai apaga a raiz ao sair e a
  próxima execução varre raízes de execuções mortas.

## Receita

Todo produtor que grava cópia, log ou fixture precisa de retenção no momento em que grava, e o
framework precisa de um medidor do próprio rastro que separe o mecânico (roda com uma aprovação) do
que é decisão do dono (sai só pelo nome). Teste que grava fora da raiz temporária da execução vaza
para a máquina de quem roda a suíte.
