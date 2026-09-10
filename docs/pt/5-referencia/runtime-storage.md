# Armazenamento local do runtime

O AIOSON usa um único banco local por clone: `.aioson/runtime/aios.sqlite`. Ele continua no `.gitignore`,
não é enviado pelo `aioson update`, não deve ser versionado e não precisa de servidor. Cada desenvolvedor
tem seu próprio runtime operacional; o histórico compartilhável do projeto permanece nos arquivos Markdown/JSON
versionados de features, learnings, brains, rules, docs, dossiers e planos.

## O que usa o SQLite

| Família de comandos | Estado principal | Valor atual | Retenção |
|---|---|---|---|
| `runtime:*`, `live:*`, `agent:done`, `agent:recover` | `tasks`, `agent_runs`, `execution_events`, `agent_events`, `artifacts` | sessões, tarefas pai/filho, handoffs e observabilidade | trabalho ativo é protegido; histórico terminal expira |
| `agent:execution:*` e dispatcher | `agent_execution_runs`, `agent_execution_events` | processo/modelo/estado e saída segura limitada | saída terminal: 14 dias; execução terminal/pausada obsoleta: 30 dias |
| `runner:queue*`, `runner:daemon` | `runner_queue` | fila local e fallback entre modelos | pending/running é protegido; terminal expira |
| `chain:*` | `chain_edges`, `chain_work_items` | relações e fila causal com claim/lease | work items acionáveis nunca são podados pela manutenção |
| `squad:*` | handoffs, eventos, planos, workers, catálogos e métricas | coordenação de squads | estado em curso e configuração são protegidos |
| outputs de squads | `content_items` | índice local dos arquivos em `output/{slug}/` | linhas com `source_path` expiram; arquivos e linhas legadas sem origem permanecem |
| `learning`, memória e evolução | `project_learnings`, `squad_learnings`, `evolution_log` | busca e materialização de conhecimento | não é podado pela manutenção do runtime |

`cascade` no runner significa atualmente fallback/escalonamento entre modelos. O importador de plano registra a
ordem das fases na descrição/prioridade, mas ainda não mantém um grafo executável de dependências entre tarefas.
O banco já é útil para filas, tarefas pai/filho, claims e Neural Chain; uma futura cascata de tarefas deve reutilizar
essas superfícies sem depender de logs brutos.

## Diagnóstico e manutenção

```bash
aioson runtime:storage . --json
aioson runtime:prune . --dry-run --older-than=30 --output-older-than=14 --json
aioson runtime:prune . --older-than=30 --output-older-than=14 --compact --json
aioson runtime:compact . --json
```

- `runtime:storage` é somente leitura e mostra bytes/linhas por tabela e categoria, estado ativo e prévia da retenção.
- `runtime:prune --dry-run` não apaga dados.
- `runtime:prune` remove telemetria antiga e histórico terminal, preservando coordenação ativa e memória durável.
- Índices de conteúdo file-backed são regeneráveis com `aioson runtime:ingest . --squad={slug}`; o prune não remove os arquivos.
- `runtime:compact` executa `quick_check`, checkpoint e `VACUUM` para devolver espaço físico. Ele recusa trabalho ativo;
  `--force` deve ser usado somente depois de confirmar que os registros reportados são obsoletos.

O `aioson update` abre e migra o mesmo `aios.sqlite` de forma aditiva. Não cria um segundo banco e não executa
limpeza destrutiva automaticamente. Depois da atualização, o NEO pode diagnosticar, mostrar uma prévia e, mediante
pedido explícito, executar apenas esses comandos guardados.

Arquivos próprios com nomes novos dentro de `.aioson/docs/` e `.aioson/rules/` permanecem intactos no update.
Arquivos de framework que também existem no template são gerenciados pelo AIOSON e recebem backup antes da
substituição; use arquivos separados para regras/documentação do projeto. `.aioson/config/*.json` usa merge aditivo,
enquanto `.aioson/config.md` é configuração gerenciada e local. `.aioson/constitution.md` e o contexto versionado em
`.aioson/context/` são protegidos e não são sobrescritos pelo update.

## Crescimento novo

A ponte de telemetria agrupa linhas adjacentes do mesmo stream em blocos limitados (até 16 KB), mantendo ordem,
redação de segredos e o teto de 1 MB por execução. Isso reduz drasticamente o número de linhas e índices quando
um agente produz muita saída. Ao iniciar novas execuções, ela também remove em lotes a saída terminal acima de 14
dias e execuções terminais/pausadas acima de 30 dias. A manutenção física continua explícita porque `wal_checkpoint`
sozinho não reduz o arquivo principal; quem recupera esse espaço é o `VACUUM`.

## Evidência de browser em disco

Fora do SQLite, os gates visual e de browser deixam binários regeneráveis ao lado dos relatórios: capturas em
`.aioson/context/features/{slug}/visual-screenshots/` (de `verify:artifact --kind=visual --screenshots`) e snapshots por
passo em `.aioson/briefings/{slug}/browser/{script}/` ou `.aioson/context/features/{slug}/browser/{script}/` (de `browser:run`).
Eles não são a evidência — o JSON e o Markdown ao lado são — e cada relatório carrega a linha que regenera a sua pasta.
Os produtores substituem o que gravaram depois que a execução mediu (uma captura estreitada por `--route` mantém as
capturas vizinhas), a política de `.gitignore` do instalador os mantém fora do repositório,
o `feature:archive` os descarta ao fechar a feature (`--keep-diagnostics` para arquivar junto), o `hygiene:scan` lista o
que ficou órfão ou pesado em `heavy_evidence_artifacts`, e `aioson evidence:prune . --dry-run` mostra o que
`aioson evidence:prune .` remove (órfãos por padrão; `--all` para toda captura; `--slug` para um dono).
