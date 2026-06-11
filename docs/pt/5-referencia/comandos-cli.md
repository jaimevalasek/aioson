# Comandos do CLI

> Referência em português para os comandos públicos do `aioson`.

## Antes de começar

- Você pode usar `aioson` ou o alias curto `aios`.
- Quando o comando aceita `[path]`, omitir esse argumento significa usar o diretório atual.
- Muitos comandos aceitam `--json` para integração com scripts e CI.
- Os comandos `parallel:*` também aceitam os aliases `orchestrator:*`.
- Nesta página usei a forma canônica com `:` para evitar duplicação.
- O dashboard do AIOSON não é mais instalado por este CLI. Para usar o painel, abra o app do dashboard já instalado no computador e selecione a pasta do projeto que contém `.aioson/`.

---

## Mapa completo dos comandos

### Base do projeto

| Comando | O que faz | Quando usar |
|---|---|---|
| `init` | Cria um projeto novo e instala o template do AIOSON | Quando você vai começar do zero |
| `install` | Instala o AIOSON em um projeto já existente | Quando o repositório já existe |
| `update` | Atualiza apenas os arquivos gerenciados pelo framework | Quando você quer puxar melhorias da versão atual |
| `info` | Mostra versão, diretório-alvo, status da instalação e framework detectado | Quando quer inspecionar rapidamente um projeto |
| `version` / `--version` / `-v` | Mostra a versão atual do CLI | Quando quer validar a versão instalada |
| `doctor` | Verifica a saúde da instalação e pode restaurar arquivos faltantes | Quando algo parece quebrado ou incompleto |
| `config` | Lê e grava configurações globais do CLI | Quando quer persistir defaults e preferências do ambiente |

### Contexto e idioma

| Comando | O que faz | Quando usar |
|---|---|---|
| `setup:context` | Cria ou atualiza `.aioson/context/project.context.md` | Logo após instalar o framework |
| `context:validate` | Valida o `project.context.md` | Depois de editar o contexto manualmente |
| `context:pack` | Monta um pacote mínimo de contexto para uma tarefa específica | Quando você quer enviar para a IA só a memória relevante |
| `locale:apply` | Reaplica um pack de idioma nos agentes gerenciados pelo AIOSON | Quando quer trocar o idioma em que os agentes do framework operam no projeto |
| `locale:diff` | Compara um agente com o pack de idioma esperado | Quando quer detectar drift de tradução |
| `i18n:add` | Gera o scaffold de um novo locale do próprio AIOSON | Quando vai adicionar outro idioma oficial ao CLI do framework |

### Agentes, fluxo e testes

| Comando | O que faz | Quando usar |
|---|---|---|
| `agents` | Lista agentes registrados, paths, dependências e outputs | Quando quer entender o arsenal ativo |
| `agent:prompt` | Gera o prompt pronto para ativar um agente em outro cliente de IA | Quando o cliente não suporta slash command |
| `workflow:plan` | Sugere o fluxo de agentes adequado ao porte do projeto | Quando quer decidir a ordem de execução |
| `workflow:next` | Avança o fluxo real, registra estado, aceita desvio e skip ate `@dev`. Agora com gates técnicos e `--auto-heal` | Quando quer handoff automatico entre agentes |
| `workflow:heal` | Reativa um agente com contexto corretivo após falha de gate | Quando um estágio quebrou e você quer retry com o erro como contexto |
| `workflow:harden` | Analisa erros recorrentes do workflow e aplica/preconiza fixes preventivos | Hardening autônomo da base de código |
| `workflow:execute` | Monta e executa o plano de agentes baseado na classificação; aceita `--dry-run` e `--start-from` | Para orquestrar features sem o dashboard |
| `test:agents` | Valida contratos e arquivos críticos dos agentes | Quando mexeu no sistema de agentes |
| `test:smoke` | Roda um smoke test em workspace temporário | Quando quer validar o pacote de forma ampla |
| `test:package` | Testa o pacote instalado a partir de uma origem local | Quando vai validar release ou empacotamento |
| `scan:project` | Faz varredura brownfield, gera índice local e produz contexto inicial | Quando o projeto já existe e falta documentação |

### Orquestração paralela

| Comando | O que faz | Quando usar |
|---|---|---|
| `parallel:init` | Cria a estrutura de lanes paralelas para projetos MEDIUM | Antes de acionar o `@orchestrator` |
| `parallel:doctor` | Verifica e repara arquivos de paralelismo | Quando faltam lanes ou arquivos de coordenação |
| `parallel:assign` | Distribui escopo entre as lanes | Quando quer dividir trabalho entre agentes |
| `parallel:status` | Consolida o estado de todas as lanes | Quando quer visão central do andamento |

### MCP

| Comando | O que faz | Quando usar |
|---|---|---|
| `mcp:init` | Gera configuração inicial de MCP para a ferramenta escolhida | Quando vai conectar ferramentas externas por MCP |
| `mcp:doctor` | Valida a configuração MCP do projeto | Quando o MCP não está sendo reconhecido |

### QA de navegador

| Comando | O que faz | Quando usar |
|---|---|---|
| `qa:doctor` | Verifica pré-requisitos de Browser QA | Antes da primeira execução de QA |
| `qa:init` | Gera `aios-qa.config.json` a partir do contexto e PRD | Quando vai inicializar o fluxo de QA |
| `qa:run` | Executa testes browser guiados por personas | Quando quer validar fluxos reais da aplicação |
| `qa:scan` | Faz crawl automático do app e procura riscos | Quando quer inspeção ampla de rotas |
| `qa:report` | Reexibe ou exporta o último relatório | Quando quer consultar ou regenerar o relatório |

### Web nativa

| Comando | O que faz | Quando usar |
|---|---|---|
| `web:map` | Descobre URLs internas de um site por crawl simples | Quando quer mapear docs, páginas públicas ou áreas navegáveis sem serviço externo |
| `web:scrape` | Extrai conteúdo principal de uma página em markdown, text, html ou links | Quando quer transformar HTML em contexto utilizável para agentes |

### Genomes e squads

| Comando | O que faz | Quando usar |
|---|---|---|
| `genome:doctor` | Valida um arquivo de genome | Quando quer checar integridade de um genome |
| `genome:migrate` | Migra genomes para o formato novo | Quando está atualizando genomes legados |
| `squad:status` | Mostra visão geral das squads instaladas | Quando quer saber o estado atual das squads |
| `squad:doctor` | Diagnostica saúde operacional das squads | Quando suspeita de drift, staleness ou artefatos faltando |
| `squad:repair-genomes` | Corrige referências de genomes em manifesto de squad | Quando um manifesto aponta bindings quebrados |
| `squad:validate` | Valida a estrutura e o manifesto de uma squad específica | Antes de exportar ou publicar |
| `squad:export` | Exporta uma squad local para snapshot/entrega | Quando quer empacotar a squad |
| `squad:pipeline` | Lista, inspeciona ou acompanha pipelines declarados na squad | Quando a squad define pipelines reutilizáveis |
| `squad:agent-create` | Cria agente customizado em `.aioson/my-agents/` ou dentro de uma squad | Quando quer criar agente personalizado. Veja [Agentes Customizados](../4-agentes/squad.md) |
| `squad:dashboard` | Painel web local para monitorar squads em tempo real | Quando quer ver agentes rodando, contexto, tokens e métricas. Veja [Squad Dashboard](./squad-dashboard.md) |
| `squad:worker` | Executa, lista e testa workers não-LLM de uma squad | Quando quer rodar workers determinísticos manualmente |
| `squad:daemon` | Inicia/para/monitora daemon de workers automáticos | Quando quer execução 24/7 com cron e webhooks |
| `squad:mcp` | Configura e testa conectores MCP (WhatsApp, Telegram, etc.) | Quando quer integrar canais reais à squad |
| `squad:roi` | Define modelo de precificação e registra métricas de resultado | Quando quer calcular e reportar ROI da squad |
| `squad:processes` | Lista e encerra processos ativos de uma squad | Quando quer inspecionar ou parar agentes sem usar o dashboard |
| `squad:recovery` | Gera contexto de recovery para reinjecting após compact | Quando um agente perdeu contexto após compactação |
| `squad:bus` | Posta, lê, monitora e resume mensagens do intra-bus de uma sessão de squad | Quando quer inspecionar a comunicação entre executores ou postar um finding/block manualmente. Veja [Squad Bus](#37-intra-bus-de-squad) |
| `squad:autorun` | Decompõe um objetivo em tarefas, executa em grupos paralelos com reflection e registra no bus | Quando quer que uma squad execute autonomamente a partir de um goal de alto nível. Veja [Squad Autorun](#38-execuçao-autonoma-de-squad-squadautorun) |
| `output-strategy:export` | Exporta a estratégia de output (webhooks, delivery) de uma squad | Quando quer copiar configuração para outra squad ou documentar |
| `output-strategy:import` | Importa estratégia de output de um arquivo ou outra squad | Quando quer replicar webhooks/delivery entre squads |
| `deliver` | Dispara delivery manual de conteúdo para webhooks configurados | Quando quer reenviar conteúdo ou testar webhooks |

### Runtime

| Comando | O que faz | Quando usar |
|---|---|---|
| `runtime:init` | Inicializa o banco SQLite de runtime | Antes de rastrear runs e entregas |
| `runtime:ingest` | Indexa artefatos de `output/` no runtime | Quando quer levar entregas para o viewer/status |
| `runtime:task:start` | Abre uma task no runtime | Quando uma sessão ou objetivo começa |
| `runtime:start` | Inicia uma execução de agente | Quando um agente começa a trabalhar |
| `runtime:update` | Registra progresso em uma execução | Durante a execução do agente |
| `runtime:task:finish` | Marca task como concluída | Quando a task acabou com sucesso |
| `runtime:finish` | Finaliza uma execução com sucesso | Quando a run terminou |
| `runtime:task:fail` | Marca task como falha | Quando a task falhou |
| `runtime:fail` | Finaliza uma execução com falha | Quando a run falhou |
| `runtime:status` | Mostra snapshot do runtime | Quando quer uma visão atual das runs |
| `runtime:log` | Logger stateful de uma linha para agentes oficiais | Quando quer registrar eventos sem orquestrar vários comandos |
| `runtime:session:start` | Abre ou reutiliza uma sessao direta de agente oficial | Quando quer manter uma sessao viva entre varias tarefas do `@deyvin` ou outro agente direto |
| `runtime:session:log` | Adiciona um passo concluido na sessao direta ativa | Quando quer registrar cada tarefa concluida durante a sessao |
| `runtime:session:finish` | Encerra a sessao direta ativa | Quando terminou a sessao ou vai fazer handoff |
| `runtime:session:status` | Mostra o estado da sessao direta e os ultimos eventos | Quando quer saber se a sessao ainda esta aberta ou acompanhar com `--watch` |
| `live:start` | Abre uma sessao viva rastreada para Codex, Claude ou OpenCode | Quando quer iniciar o cliente externo a partir do AIOSON e manter status, agente ativo e logs no dashboard |
| `runtime:emit` | Registra eventos compactos da sessão viva atual; aceita `--worker-status`, `--verdict`, `--token-count`, `--progress-pct` | Quando quer marcar tarefa concluída, milestone, block ou step de plano sem abrir uma sessão paralela |
| `live:status` | Mostra o estado da sessao viva e do processo filho | Quando quer acompanhar `active_agent`, progresso do plano e se o cliente ainda esta vivo |
| `live:handoff` | Transfere a mesma sessao viva para outro agente AIOSON | Quando o agente atual precisa passar a continuidade para `@product`, `@architect`, `@dev` ou outro agente |
| `live:close` | Fecha a sessao viva e gera `summary.md` | Quando terminou a sessao externa e quer consolidar o historico compacto + verbose |
| `runtime:backup` | Faz backup incremental do SQLite para S3 ou HTTP do cliente | Quando quer persistir dados de runtime na nuvem do cliente |
| `runtime:restore` | Restaura dados de runtime a partir de um backup remoto | Quando quer recuperar dados em outra máquina ou após perda |
| `agent:done` | Registra conclusão de sessão de agente; aceita `--verdict`, `--artifacts` (CSV de paths) e `--plan-step` | Ao final de cada sessão de agente — é o comando que fecha a run e popula artifacts + verdict no SQLite |
| `runtime:prune` | Remove registros antigos do SQLite de runtime | Quando o banco está grande e quer liberar espaço |

### Skills e otimização de contexto

| Comando | O que faz | Quando usar |
|---|---|---|
| `skill:install` | Instala skill de terceiros via npm, cloud ou path local | Quando quer adicionar capacidade ao projeto. Veja [Skills](./skills.md) |
| `skill:list` | Lista skills instaladas em `.aioson/installed-skills/` | Quando quer saber quais skills estão ativas |
| `skill:remove` | Remove skill instalada e limpa diretórios de ferramentas | Quando uma skill não é mais necessária |
| `compress:agents` | Comprime arquivos de instrução dos agentes para reduzir consumo de tokens por sessão. Modo estrutural (gratuito) ou semântico via LLM (`--llm`). Salva backup automático em `.original.md`. Aceita `--agent`, `--rules`, `--dry-run`, `--restore`. | Quando quer reduzir custo de API sem alterar nenhuma lógica. Veja [compress:agents](./compress-agents.md) |
| `design-hybrid:options` | Abre um seletor visual com setas + espaço para montar um preset temporário de variações de design | Quando quer alimentar a `design-hybrid-forge` com direções mais extravagantes, clássicas, animadas ou com CSS avançado. Usa o locale do projeto automaticamente e aceita `--locale` como override; com `--advanced` libera um 3º modificador. Veja [design-hybrid-forge](../4-agentes/design-hybrid-forge.md) |

### Cloud

| Comando | O que faz | Quando usar |
|---|---|---|
| `cloud:import:squad` | Importa snapshot remoto de squad para o projeto | Quando vai instalar ou sincronizar uma squad publicada |
| `cloud:import:genome` | Importa snapshot remoto de genome | Quando quer trazer um genome publicado |
| `cloud:publish:squad` | Publica snapshot de uma squad local | Quando quer distribuir uma squad para outro projeto ou catálogo |
| `cloud:publish:genome` | Publica snapshot de um genome local | Quando quer versionar e compartilhar um genome |

### Autenticação e Workspaces (Cloud)

| Comando | O que faz | Quando usar |
|---|---|---|
| `auth:login` | Autentica o CLI na AIOSON Store via `--token` | Quando for interagir com recursos em nuvem, instalar pacotes privados ou publicar itens na Store |
| `auth:logout` | Remove o token de autenticação local | Quando quiser desconectar o ambiente da conta atual |
| `auth:status` | Verifica o estado da sua autenticação | Para confirmar se você está logado na AIOSON Store |
| `workspace:init` | Inicializa um projeto local e o vincula a um workspace remoto `--name=<slug>` | Quando começar um projeto que terá persistência, tracking e controle sincronizados no cloud |
| `workspace:status` | Exibe os detalhes e metadados do workspace conectado | Para verificar o id, nome e status de sincronização do projeto atual |
| `workspace:open` | Abre o painel do workspace conectado no seu navegador web | Quando precisar ver configurações do workspace na interface do cloud |

### AIOSON Store (Sistemas, Genomes, Squads e Skills)

A nova versão da Store permite empacotar, distribuir e instalar não só agentes, mas sistemas completos (boilerplates), genomes estruturados e skills.

| Comando | O que faz | Quando usar |
|---|---|---|
| `system:package` | Lê o `system.json` e empacota o projeto local em `.aioson/system-packages` | Quando quiser testar o empacotamento completo do seu sistema antes de submetê-lo |
| `system:publish` | Empacota e publica seu sistema/boilerplate na AIOSON Store. Com `--build`, compila TS/JSX e aplica ofuscação JS (terser). Pacote final em ZIP. | Quando quiser distribuir uma base arquitetural inteira para que outros comecem projetos rapidamente |
| `system:list` | Lista os sistemas disponíveis localmente ou na nuvem | Para descobrir boilerplates e sistemas base que podem ser instalados |
| `system:install` | Baixa e inicializa um sistema completo a partir da Store | Para dar kickstart num projeto novo a partir de um `system` já configurado com squads e arquitetura |
| `squad:list` | Lista squads instaladas localmente ou remotamente na Store `--remote` | Para descobrir e inspecionar quais squads estão ativas ou disponíveis na nuvem |
| `squad:publish` | Publica uma squad local na AIOSON Store | Quando quiser compartilhar ou monetizar `--paid` uma squad montada |
| `squad:install` | Baixa e instala uma squad da Store no projeto local | Para importar capacidades, agentes e workflows empacotados distribuídos na Store |
| `squad:grant` | Concede licença de acesso a uma squad para um email de usuário | Quando você gerencia permissões manuais de suas squads privadas/pagas |
| `genome:publish` | Publica um dos seus genomes na AIOSON Store | Quando criar um padrão de conhecimento valioso (ex: regras de negócio) e quiser distribuir |
| `genome:install` / `install:store` | Baixa e vincula um genome remoto no seu projeto local | Quando precisar instalar pacotes de conhecimento remotos para uso dos seus agentes |
| `genome:list` / `remove` | Lista ou desinstala genomes presentes no projeto | Para gerenciar os pacotes de conhecimento instalados na pasta `.aioson/genomes` |
| `skill:publish` | Empacota e publica uma skill local na AIOSON Store | Quando criar uma ferramenta ou integração e quiser distribuí-la para a comunidade |

### Contexto e recuperação de sessão

| Comando | O que faz | Quando usar |
|---|---|---|
| `recovery:generate` | Gera `.aioson/context/recovery-context.md` com objetivo, agente, arquivos modificados e commits recentes | Antes de encerrar uma sessão longa ou ao detectar compactação iminente. Veja [Recuperação de Sessão](../3-receitas/continuidade-entre-sessoes.md) |
| `recovery:show` | Exibe o conteúdo do arquivo de recovery da sessão atual | Quando quer re-injetar o contexto no início de uma nova sessão |
| `context:health` | Analisa `.aioson/context/`, estima tokens por arquivo, sinaliza arquivos pesados e specs de features já concluídas | Antes de iniciar qualquer sessão longa — dá visibilidade do custo de contexto |
| `feature:archive` | Move artefatos de uma feature `done` para `.aioson/context/done/{slug}/` e atualiza o manifest | Arquivamento retroativo de features já entregues ou verificação com `--dry-run` |
| `context:trim` | *(legado — use `feature:archive`)* | — |
| `context:monitor` | Exibe barras ASCII com uso de contexto por agente de uma squad; aceita `--budget` + `--tokens` para modo de budget de projeto | Quando quer acompanhar em tempo real o contexto de uma squad ou checar se está perto do limite. Veja [Monitor de Contexto](./memoria-e-contexto.md) |
| `context:search:index` | Indexa arquivos `.md`, `.txt` e `.json` do projeto em banco FTS5 | Antes de usar `context:search` — normalmente uma vez, depois incrementalmente. Veja [Busca de Contexto](./memoria-e-contexto.md) |
| `context:search` | Busca documentos relevantes no índice por query em linguagem natural | Quando quer encontrar quais arquivos do projeto contêm contexto relevante para uma tarefa |
| `context:cache` | Lista sessões de contexto em cache (mais recentes primeiro) | Quando quer saber quais snapshots de sessão estão disponíveis para restaurar. Veja [Cache de Contexto](./memoria-e-contexto.md) |
| `context:cache:save` | Salva um snapshot de conteúdo em `~/.aioson/temp/` | Quando quer preservar o estado de uma sessão antes de trocar de branch ou agente |
| `context:cache:restore` | Restaura o conteúdo de uma sessão salva, com filtro opcional por query | Quando quer recuperar contexto de uma sessão anterior |
| `context:cache:cleanup` | Remove sessões expiradas do cache (padrão: mais de 24h) | Quando quer liberar espaço ou forçar limpeza antes do prazo |

### SDD Automation (Regra dos 80%)

Scripts determinísticos que movem verificações de estado, validação de artefatos e gate checks para fora do contexto LLM, economizando entre 4.800–8.800 tokens por feature. Veja [SDD Automation Scripts](./sdd-automation-scripts.md).

| Comando | O que faz | Quando usar |
|---|---|---|
| `preflight` | Coleta modo, classificação, framework, test runner, artefatos, gates e prontidão em uma chamada | No início de qualquer sessão de agente |
| `classify` | Detecta classificação MICRO/SMALL/MEDIUM por scoring automático do PRD ou entrada interativa | Antes de decidir o fluxo de agentes |
| `sizing` | Determina modelo de sizing: `inplace`, `phased_inplace` ou `phased_external` | Quando o `@architect` ou `@analyst` precisa decidir a estrutura de entrega |
| `detect:test-runner` | Detecta PHPUnit, Jest, Vitest, Pytest, RSpec, Forge e node:test via arquivos de config | Quando `@dev` ou `@tester` precisa saber como rodar os testes |
| `pulse:update` | Atualiza `project-pulse.md` com agente, feature, gate e próximo passo | Ao final de cada sessão de agente |
| `state:save` | Salva ponto de continuação em `dev-state.md` (fase, status, spec-version, histórico) | Durante `@dev` ao fim de cada fase ou antes de encerrar |
| `feature:close` | Fecha feature com verdict PASS/FAIL: atualiza spec, features.md, project-pulse.md e dispara archivamento automático | Após QA sign-off — chamado pelo `@qa` automaticamente |
| `feature:archive` | Move artefatos de uma feature `done` para `.aioson/context/done/{slug}/` e atualiza o manifest | Chamado pelo `feature:close` automaticamente; também disponível para retroativo com `--dry-run` e `--restore` |
| `feature:export` | **Copia** todos os artefatos de uma feature para um `--out` limpo, sem mexer na origem; gera `INDEX.md` | Exportar specs para analisar fora, entregar a cliente, ou usar o AIOSON só como gerador de specs. Veja [feature-export.md](./feature-export.md) |
| `gate:check` | Valida pré-requisitos e artefatos de um phase gate (A/B/C/D); retorna PASS ou BLOCKED | Antes de avançar para o próximo agente |
| `artifact:validate` | Verifica a cadeia completa de artefatos de uma feature (PRD → spec → plano → conformance) | A qualquer momento para checar completude |
| `spec:analyze` | Irmão de **conteúdo** do `artifact:validate`: consistência cruzada entre os artefatos (rastreabilidade REQ/AC, staleness, readiness, sanidade do contrato, vínculo AC→contrato, overlap de waves) antes do gate de execução | No preflight do `@scope-check` — errors viram blockers, warnings viram evidência de drift |
| `forge:compile` | **Lane B:** compila os artefatos de uma feature MEDIUM num `forge-run.workflow.js` auditável e versionável (parallel por Wave → convergência no `harness:check` → revisão adversarial → validador fresh-context) | Quando quer execução compilada e reproduzível via `@forge-run`; nunca roda `feature:close`/publish |
| `workflow:execute` | Monta e executa o plano de agentes baseado na classificação; aceita `--dry-run` e `--start-from` | Para orquestrar features sem o dashboard |
| `runner:run` | Executa uma tarefa ou worker diretamente pelo runner | Quando quer executar fora do loop principal de sessão |
| `runner:queue` | Enfileira tarefas no runner com prioridade e agente designado | Para execução assíncrona ou batch de tarefas |
| `runner:plan` | Gera plano de execução do runner a partir de uma feature | Antes de iniciar execução por fase |
| `runner:daemon` | Inicia/para/monitora o daemon do runner para execução 24/7 | Para workers automáticos e execução contínua |
| `runner:queue:from-plan` | Extrai fases `## Phase N:` do plano e enfileira no runner com prioridades | Antes de iniciar execução por fase com o runner |
| `learning:auto-promote` | Promove aprendizados de alta frequência para arquivos de regra em `.aioson/rules/` | Após várias sessões — quando quer solidificar padrões em regras |

### Spec e learnings

| Comando | O que faz | Quando usar |
|---|---|---|
| `spec:sync` | Lê todos os `spec*.md` de `.aioson/context/` e sincroniza learnings + phase gates para o SQLite | Após cada sessão de `@dev` — garante que learnings e progresso de fase aparecem no dashboard |
| `spec:status` | Exibe tabela de features com fase atual, último agente e último checkpoint | Quando quer saber exatamente onde cada feature está sem abrir os arquivos manualmente |
| `spec:checkpoint` | Lê `last_checkpoint` do spec e registra no SQLite como ponto de recuperação explícito | Quando uma sessão caiu sem `agent:done` e o dashboard não reflete o estado real |
| `learning:export` | Exporta `project_learnings` do SQLite para `.aioson/brains/` como nodes Zettelkasten | Quando quer promover learnings acumulados para memória procedural do projeto |

### Devlog pipeline

| Comando | O que faz | Quando usar |
|---|---|---|
| `devlog:process` | Processa devlogs de `aioson-logs/devlog-*.md` e sincroniza artifacts, decisions, learnings e verdict com o SQLite | Quando o CLI não estava disponível durante a sessão e o agente escreveu devlog manual |
| `devlog:watch` | Daemon que observa `aioson-logs/` e processa novos devlogs automaticamente (WSL2: polling de 5s) | Quando quer processamento zero-touch durante sessões longas |
| `devlog:export-brains` | Exporta learnings de alta frequência dos devlogs para `.aioson/brains/` (min-frequency=2 por padrão) | Após `devlog:process` — etapa final do pipeline devlog → brains |

### Execução segura

| Comando | O que faz | Quando usar |
|---|---|---|
| `sandbox:exec` | Executa um comando shell com timeout, redação automática de secrets e summarização de output longo | Quando quer rodar scripts dentro de uma sessão de agente sem expor variáveis sensíveis do ambiente. Veja [Sandbox de Execução](./sandbox.md) |

### Sharding de agente

| Comando | O que faz | Quando usar |
|---|---|---|
| `agent:shard:index` | Divide arquivos de instrução de agente em shards por heading e indexa via FTS5 | Após adicionar ou atualizar arquivos de agente. Veja [Agent Sharding](./agent-sharding.md) |
| `agent:load` | Carrega os shards mais relevantes de um agente para um objetivo dado, dentro de orçamento de tokens | Quando quer enviar ao LLM apenas as seções do agente necessárias para a tarefa atual |

### Active Learning Loop — Memória Viva

Comandos do [Active Learning Loop](../active-learning-loop/README.md): telemetria de contexto, busca BM25, archive/restore com `evolution_log`.

| Comando | O que faz | Tier | Quando usar |
|---|---|---|---|
| `context:load --target=<rule\|brain>:<slug> --agent=<nome>` | Registra que um agente carregou uma regra ou brain; grava evento em `execution_events` | tier-1 silencioso | Agentes declaram no preflight quais regras carregaram |
| `memory:search "<query>"` | Busca BM25 (FTS5) sobre `project_learnings` por palavras-chave | tier-1 silencioso | Quando quer encontrar learnings relevantes antes de criar uma regra |
| `memory:archive --id=<rule\|learning\|brain>:<slug> --reason="<texto>"` | Move o item para `_archived/YYYY-MM-DD/` e grava historico em `evolution_log`; tier-2 requer confirmação humana | tier-2 notificado | Quando o doctor aponta staleness ou você decide arquivar item obsoleto |
| `memory:restore --id=<rule\|learning\|brain>:<slug>` | Restaura item arquivado para o path original; grava `event_type='restored'` | tier-2 notificado | Quando um arquivamento foi precipitado |

Veja [Referência CLI — Active Learning Loop](../active-learning-loop/comandos-cli.md) para flags completos.

### Sub-task Scout

Comandos do [Deyvin Sub-Task Scout](../deyvin-subtask-scout/README.md): diagnóstico estruturado com sub-agente isolado.

| Comando | O que faz | Quando usar |
|---|---|---|
| `scout:prep --question="..." --scope-paths="..." --parent-agent=deyvin --parent-session-id=<id> --parent-session-excerpt="..."` | Valida inputs, checa caps, gera prompt para sub-agente; retorna `{ id, prompt, output_path, cap_remaining }` | Quando `@deyvin` dispara rubrica linha 111 (survey >5 arquivos) |
| `scout:validate --input=<path>` | Valida JSON retornado pelo sub-agente contra output schema; rastreia retries | Após sub-agente escrever o relatório em `output_path` |
| `scout:commit --input=<path>` | Persiste relatório validado, decrementa cap, emite telemetria | Após `scout:validate` retornar exit 0 |

Veja [Referência CLI — Sub-task Scout](../deyvin-subtask-scout/comandos-cli.md) para flags completos.

### Auditoria, briefs e verificação

Três comandos de inteligência de sistema para otimizar tokens, gerar contexto autocontido e verificar entregas sem viés de conversa.

| Comando | O que faz | Quando usar |
|---|---|---|
| `agent:audit` | Audita tamanho e tokens de todos os arquivos de agente; detecta seções candidatas a on-demand loading e calcula economia potencial por sessão | Quando quer entender o custo de contexto dos agentes e identificar o que pode ser movido para `.aioson/docs/` (carregamento sob demanda). Veja [Auditoria de Agentes](#39-auditar-agentes-agentaudit) |
| `brief:gen` | Lê uma fase do plano de implementação + `architecture.md` + `spec.md` e gera um brief 100% autocontido para um worker | Antes de entregar uma fase a um executor de squad — garante que o worker tem tudo que precisa sem buscar contexto adicional. Veja [Geração de Brief](#40-gerar-brief-de-worker-briefgen) |
| `verify:gate` | Verificação de olhos frescos: compara spec vs artefato entregue sem histórico de conversa; emite `PASS`, `PASS_WITH_NOTES`, `FAIL_WITH_ISSUES` ou `BLOCKED` | Após cada entrega de fase — detecta bugs que o agente gerador não consegue ver por viés de contexto. Veja [Verify Gate](#41-verificar-entrega-verifygate) |

### Loop Guardrails e harness

Controle do loop autônomo `self:loop` com scope guard, budget enforcement, human gates e retrospectiva. Veja [Loop Guardrails](./loop-guardrails.md) e [harness:retro](./harness-retro.md).

| Comando | O que faz | Quando usar |
|---|---|---|
| `harness:check` | Roda os comandos `criteria[].verification` do contrato deterministicamente, **fora do self:loop** (read-only sobre `progress.json`); exit 0 = pass | Verificação determinística avulsa dos critérios; o `@validator` roda primeiro e copia o veredito verbatim |
| `harness:validate` | Gera o `validator-prompt.txt` com **review payload autocontido** (resultados do `harness:check` + arquivos alterados + diff vs base resolvida) e consome o veredito pelo circuit breaker | Antes de executar o `@validator` em contexto fresco e isolado |
| `harness:approve` | Aprova um gate humano pendente no loop (persiste decisão auditável) | Quando o loop pausou em `HUMAN_GATE` e você quer retomá-lo |
| `harness:reject` | Rejeita um gate humano (encerra a tentativa com resumo; requer `--reason`) | Quando quer cancelar a tentativa atual após revisão humana |
| `harness:status` | Visão do estado do loop: circuito, iteração N/M, budget, checks, gates pendentes, próxima ação | Sempre que quiser saber o que o loop está fazendo ou por que parou |
| `harness:retro` | Minera deterministicamente o histórico de falhas de uma feature e gera dossiê retrospectivo — sem LLM | Após features com múltiplas iterações, antes de `@qa` ou `@validator` |
| `harness:preview` | Exibe prévia de um artefato com truncação segura (usado no feedback de critério do loop) | Quando quer inspecionar um artefato sem despejar conteúdo no contexto |

### Git e committer

| Comando | O que faz | Quando usar |
|---|---|---|
| `commit:prepare` | Coleta diff staged, roda `git:guard`, gera `commit-prep.json` com tipo, escopo e descrição candidata | Antes de ativar `@committer` — automatiza a preparação e aplica guardrails de segurança |
| `git:guard` | Verifica stage proibido (`node_modules/`, secrets, build artifacts); integra `forbidden_files` do contrato ativo e pode instalar pre-commit hook | Antes de qualquer commit; use `--install-hook` para proteção contínua |

### Feature Dossier

O dossier é o ponto único de verdade de uma feature em andamento: spec, plano, código tocado, índice de pesquisas e status. Veja [Feature Dossier](./feature-dossier.md).

| Comando | O que faz | Quando usar |
|---|---|---|
| `dossier:init` | Cria `.aioson/context/dossier/{slug}/` com schema v1.2 | Ao iniciar uma nova feature com continuidade rastreada |
| `dossier:show` | Exibe o estado atual do dossier: spec, plano, status, arquivos tocados | Quando quer um snapshot da feature em curso |
| `dossier:add-research` | Registra entrada no índice de pesquisas do dossier (`research-index`) | Quando um agente faz uma pesquisa relevante para a feature |
| `dossier:audit` | Verifica completude e consistência do dossier: spec presente? plano ok? handoff válido? | Antes de fechar a feature ou retomar após pausa longa |

### Ferramentas e capacidades

| Comando | O que faz | Quando usar |
|---|---|---|
| `tool:capabilities` | Expõe o mapa de capacidades por cliente AI (suporte a `--resume`, comando de instalação, etc.) | Quando integração externa (AIOSON Play, IDE extensions) precisa saber o que cada tool suporta; aceita `--tool=claude` e `--json` |

---

## Exemplos e usos práticos

### 1. Começar um projeto novo

```bash
aioson init meu-saas --lang=pt-BR --tool=codex
cd meu-saas
aioson setup:context
aioson doctor
```

Use esse fluxo quando o projeto ainda não existe e você quer sair com template, contexto e checagem básica já prontos.

### 2. Instalar em um projeto existente

```bash
cd meu-legado
aioson install . --lang=pt-BR
aioson info .
aioson workflow:plan .
```

Use esse fluxo quando o código já existe e você quer colocar o AIOSON sem recriar o projeto.

### 3. Atualizar sem perder contexto

```bash
aioson update .
aioson doctor . --fix
```

Use depois de atualizar a versão do pacote. O `update` mexe só nos arquivos gerenciados e o `doctor --fix` recoloca o que estiver faltando.

### 4. Ver e ajustar configurações globais

```bash
aioson config show
aioson config get preferred_scan_provider
aioson config set preferred_scan_provider=openai
```

Use quando você quer persistir defaults e preferências globais do CLI.

### 5. Validar versão e diagnóstico rápido

```bash
aioson --version
aioson info .
aioson doctor . --json
```

Use para troubleshooting rápido, CI e automações.

### 6. Criar ou corrigir o contexto do projeto

```bash
aioson setup:context --defaults --framework="Laravel" --backend="PHP" --database="MySQL" --lang=pt-BR
aioson context:validate .
```

Use quando o projeto já está claro e você quer gerar o contexto sem passar pelo wizard interativo.

### 6A. Montar um pacote mínimo de contexto

```bash
aioson context:pack .
aioson context:pack . --agent=dev --goal="ajustar captions do YouTube" --module=src
aioson context:pack . --agent=qa --goal="validar regressao do checkout" --module=app --max-files=10
```

Use quando você quer mandar para Codex, Claude Code ou outro cliente só o contexto mais relevante para a tarefa atual.

O comando escreve `.aioson/context/context-pack.md` e normalmente seleciona:

- `project.context.md`
- `memory-index.md`
- `skeleton-system.md`
- `discovery.md`
- `spec-current.md`
- `spec-history.md`
- `architecture.md`
- `module-<pasta>.md` e `scan-<pasta>.md` quando houver foco em um módulo

Importante:

- `context:pack` não substitui `discovery.md` nem `spec.md`
- ele apenas monta um pacote mínimo para reduzir carga, custo e ruído no contexto
- antes de montar o pack, o comando atualiza os derivados locais como `memory-index.md`, `spec-current.md`, `spec-history.md` e `module-<pasta>.md`

### 7. Trocar idioma do projeto

```bash
aioson locale:apply . --lang=pt-BR
aioson locale:diff ux-ui --lang=pt-BR
```

- `locale:apply` muda o idioma dos agentes do AIOSON
- ou seja: muda o idioma em que o framework espera que os agentes conversem e trabalhem no projeto

Pense assim:

- `--locale=pt-BR` = idioma do **menu/comando do AIOSON**
- `locale:apply --lang=pt-BR` = idioma do **agente do AIOSON**
- i18n do app do cliente = idioma do **produto final do usuário**

Exemplo:

- se você usar `--locale=pt-BR`, o CLI mostra mensagens em português
- se você usar `locale:apply --lang=pt-BR`, os agentes do AIOSON passam a operar em português
- isso **não** traduz o site, sistema ou app do cliente

Em uma frase:

> `locale:apply` troca o idioma do **AIOSON dentro do projeto**, não o idioma do **produto do cliente**.

Use `locale:diff` para checar se algum agente ficou diferente do pack de idioma esperado.

### 8. Adicionar um novo locale ao próprio AIOSON

```bash
aioson i18n:add fr --dry-run
aioson i18n:add fr
```

- `i18n:add` **não** adiciona idiomas ao app do cliente
- `i18n:add` adiciona um idioma novo ao **próprio AIOSON**

Pense assim:

- o AIOSON é a “ferramenta”
- o projeto do cliente é a “coisa que você está construindo”
- esse comando mexe na **ferramenta**
- esse comando não mexe na **coisa construída**

Hoje esse comando cria a base de um arquivo de idioma do CLI em:

```text
src/i18n/messages/<locale>.js
```

Então ele serve para coisas como:

- traduzir mensagens do CLI do AIOSON
- ajudar o framework a falar outro idioma
- expandir o próprio AIOSON

Ele não serve para:
- adicionar i18n ao app do usuário
- criar feature multilíngue no projeto do cliente
- traduzir automaticamente telas, textos ou rotas do produto final

Resumo sem dúvida:

- quer mudar o idioma do **CLI**? use `--locale`
- quer mudar o idioma dos **agentes do AIOSON**? use `locale:apply`
- quer adicionar um idioma novo ao **próprio AIOSON**? use `i18n:add`
- quer deixar o **app do cliente** multilíngue? isso é trabalho do projeto, não do `i18n:add`

### 9. Inspecionar agentes e gerar prompt pronto

```bash
aioson agents . --lang=pt-BR
aioson agent:prompt architect . --tool=codex
```

Use `agents` para ver quem existe e `agent:prompt` quando o cliente de IA nao entende `/aioson:agent:setup`, `@dev` ou slash commands, ou quando voce quer um handoff direto rastreado no runtime antes de continuar em outro cliente.

### 10. Validar agentes e pacote antes de release

```bash
aioson test:agents
aioson test:smoke /tmp --lang=pt-BR --profile=standard
aioson test:package . --dry-run
```

Use quando você alterou templates, agentes, contratos ou empacotamento e quer uma validação mais segura antes de publicar.

### 11. Fazer scanner brownfield

```bash
aioson scan:project . --folder=src
aioson scan:project . --folder=app --summary-mode=titles
aioson scan:project . --folder=src --with-llm --provider=openai
aioson scan:project . --folder=src,app --dry-run
```

Use em sistemas legados ou repositórios que ainda não têm `discovery.md` e `skeleton-system.md`.

O comando agora trabalha em duas etapas:

1. O JavaScript faz uma análise local do projeto e gera `.aioson/context/scan-index.md`.
2. Se você ativar `--with-llm`, a LLM usa esse índice compacto para produzir `discovery.md` e `skeleton-system.md`.

Importante:

- `scan:project` sozinho nao gera `discovery.md`
- `scan:project` nunca gera `architecture.md`
- se `discovery.md` e `skeleton-system.md` ja existirem e voce rodar com `--with-llm`, o scanner agora entra em modo de atualizacao por padrao: usa os arquivos atuais como memoria base, gera a nova versao consolidada e cria backup automatico em `.aioson/backups/` antes de sobrescrever
- em projetos SMALL brownfield, o fluxo tipico depois do scan completo e `@analyst` -> `@scope-check` -> `@architect` -> `@dev`
- sem API LLM configurada, o fluxo local tambem e valido: `scan:project --folder=...` -> `@analyst` no seu Codex/Claude -> `@scope-check` -> `@architect` -> `@dev`

O parâmetro `--folder` agora é obrigatório. Ele define quais pastas do projeto devem ganhar um mapa completo com pastas e arquivos. Você pode informar uma pasta ou várias separadas por vírgula.

Artefatos locais gerados pelo scan:

- `scan-index.md`: índice geral com footprint, arquivos-chave e referência para os mapas especializados
- `scan-folders.md`: mapa somente de pastas do projeto
- `scan-<pasta>.md`: mapa completo da pasta pedida em `--folder`, incluindo toda a estrutura de pastas e arquivos
- `scan-aioson.md`: mapa útil do `.aioson/`, mostrando só artefatos gerados no uso do projeto
- `memory-index.md`: índice de leitura com “leia isto quando precisar de X”
- `module-<pasta>.md`: memória focada para cada pasta pedida em `--folder`

Se existir `.aioson/context/spec.md`, o scanner também deriva:

- `spec-current.md`: recorte curto do estado atual, trabalho em andamento e decisões abertas
- `spec-history.md`: recorte histórico com implementações concluídas e decisões tomadas

No caso de `.aioson/`, o scanner oculta o que é padrão do framework:

- agentes padrão
- locales
- schemas
- skills estáticas
- tasks internas

E mostra o que importa para operação do projeto, por exemplo:

- páginas de contexto geradas
- squads criadas
- genomes criados
- arquivos locais de MCP
- outros artefatos específicos do uso real do cliente

Modos de resumo:

- `--summary-mode=titles`: envia só títulos, tamanhos e estrutura. É o modo mais leve.
- `--summary-mode=summaries`: envia títulos + resumos curtos. É o modo padrão.
- `--summary-mode=raw`: além do índice, envia também o conteúdo bruto dos arquivos-chave. É o modo mais pesado.
- `--context-mode=merge`: padrão para brownfield. Se já existir `discovery.md` ou `skeleton-system.md`, tenta atualizar sem apagar contexto útil.
- `--context-mode=rewrite`: reescreve a memória a partir do scan atual. Use quando quiser regenerar do zero.
- `--with-llm`: ativa a etapa opcional de enriquecimento por LLM.
- `--llm-model=<name>`: sobrescreve o modelo configurado para esta execução.

Quando usar cada modo:

- Se o provider estiver lento ou com timeout, comece por `titles`.
- Se quiser mais contexto sem mandar arquivos brutos, use `summaries`.
- Se quiser máxima riqueza de contexto e aceitar um prompt maior, use `raw`.

Fluxos recomendados:

- **Com API no aioson:** `scan:project --folder=src --with-llm --provider=...` -> `@analyst` -> `@scope-check` -> `@architect` -> `@dev`
- **Sem API no aioson:** `scan:project --folder=src` -> abrir seu AI CLI -> `@analyst` -> `@scope-check` -> `@architect` -> `@dev`
- **Com contexto mínimo para tarefa específica:** `scan:project --folder=src` -> `context:pack --agent=dev --goal="..." --module=src`
- Se o seu cliente nao entender `@analyst`, gere um prompt pronto com `aioson agent:prompt analyst --tool=codex` ou troque `--tool` para o cliente correto

Exemplo prático para reduzir carga no provider:

```bash
aioson scan:project . --folder=src --with-llm --provider=deepseek --summary-mode=titles
```

Nesse fluxo, providers como DeepSeek servem melhor como sintetizadores da arquitetura, relações e riscos do sistema, enquanto o trabalho pesado de mapear pastas solicitadas e filtrar o `.aioson/` fica no próprio CLI.

Exemplo prático para atualizar memória existente sem perder contexto:

```bash
aioson scan:project . --folder=src,app --with-llm --provider=openai
```

Exemplo prático para reescrever do zero:

```bash
aioson scan:project . --folder=src,app --with-llm --provider=openai --context-mode=rewrite
```

### 12. Avancar o workflow real entre agentes

```bash
aioson workflow:next .
aioson workflow:next . --complete
aioson workflow:next . --agent=ux-ui
aioson workflow:next . --skip=dev
```

Use quando quiser que o CLI acompanhe a etapa atual e decida o proximo agente de forma consistente.

Regras:
- cria `.aioson/context/workflow.state.json` se ainda nao existir
- usa `.aioson/context/workflow.config.json` se o projeto tiver uma orquestracao customizada
- aceita desvio temporario com `--agent=<agente>` e depois retorna para a trilha principal
- aceita `--skip=<agente>` so ate chegar no `@dev`
- nunca permite pular o `@dev`

Alias compativel:
- `agent:next`

Flags novas de hardening:
- `--auto-heal`: se um gate técnico falhar ao completar, reativa o agente automaticamente com o erro como contexto corretivo (máx 3 retries)
- `--force`: ignora gates técnicos (uso com cautela)

### 12a. Reativar um agente com auto-cura (healing)

```bash
# Reativa @dev com o último erro injetado no prompt
aioson workflow:heal . --stage=dev

# Reativa @qa após falha de teste
aioson workflow:heal . --stage=qa
```

Use quando um estágio falhou em um gate técnico ou contrato e você quer dar ao agente uma segunda chance com o erro explícito no contexto.

### 12b. Hardening autônomo do projeto

```bash
# Analisa erros recorrentes e aplica fixes preventivos
aioson workflow:harden .

# Apenas preview
aioson workflow:harden . --dry-run
```

Use periodicamente para:
- detectar padrões de erro nos logs do workflow
- atualizar `.gitignore` e instalar pre-commit hooks automaticamente
- criar stubs de helpers de teste quando faltam

### 13. Preparar orquestração paralela

```bash
aioson parallel:init . --workers=3
aioson parallel:assign . --source=architecture --workers=3
aioson parallel:status .
aioson parallel:doctor . --fix
```

Use em projetos `MEDIUM` quando o `@orchestrator` vai dividir trabalho em lanes.  
Alias equivalentes:
- `orchestrator:init`
- `orchestrator:assign`
- `orchestrator:status`
- `orchestrator:doctor`

### 14. Inicializar e diagnosticar MCP

```bash
aioson mcp:init . --tool=codex
aioson mcp:doctor . --strict-env
```

Use quando você quer preparar integrações MCP e confirmar se as variáveis e arquivos estão corretos.

### 15. Rodar Browser QA

```bash
aioson qa:init . --url=http://localhost:8000
aioson qa:doctor .
aioson qa:run . --persona=power --html
aioson qa:scan . --depth=2 --max-pages=20 --html
aioson qa:report . --html
```

Use:
- `qa:init` para gerar a configuração
- `qa:doctor` para validar ambiente
- `qa:run` para um teste guiado por personas
- `qa:scan` para cobertura mais ampla de rotas
- `qa:report` para rever o último relatório sem rodar tudo de novo

### 16. Abrir o dashboard do AIOSON

O dashboard agora é instalado separadamente do CLI.

Use este fluxo:
- abra o app do dashboard já instalado no computador
- clique em criar projeto ou adicionar projeto
- selecione a pasta do projeto que já contém `.aioson/`

Use isso quando quiser um painel local para acompanhar squads, runtime e entregas do projeto.

### 16. Validar e migrar genomes

```bash
aioson genome:doctor .aioson/genomes/fintech.md
aioson genome:migrate .aioson/genomes --write
```

Use `genome:doctor` para validar um arquivo individual e `genome:migrate` para atualizar um conjunto legado para o formato novo.

### 17. Operar squads locais

```bash
aioson squad:status .
aioson squad:doctor . --squad=marketing
aioson squad:validate . --squad=marketing
aioson squad:export . --squad=marketing
aioson squad:pipeline . --sub=list
aioson squad:pipeline . --sub=show --pipeline=conteudo-semanal
aioson squad:pipeline . --sub=status --pipeline=conteudo-semanal
```

Use:
- `squad:status` para visão geral
- `squad:doctor` para detectar problemas operacionais
- `squad:validate` antes de exportar ou publicar
- `squad:export` para empacotar a squad
- `squad:pipeline` para inspecionar pipelines definidos dentro da squad

### 18. Monitorar squads com o Squad Dashboard

```bash
# Levantar o dashboard na raiz do projeto
aioson squad:dashboard

# Porta customizada
aioson squad:dashboard --port=4200

# Abrir direto em um squad específico
aioson squad:dashboard --squad=marketing-odonto
```

Acesse `http://localhost:4180` no browser. O dashboard mostra todos os squads do projeto com agentes rodando, uso de contexto, tokens, logs de execução e métricas em tempo real.

Para documentação completa: [Squad Dashboard](./squad-dashboard.md)

### 19. Workers, Daemon e Integrações

```bash
# Listar workers de uma squad
aioson squad:worker . --sub=list --squad=clinica

# Executar um worker manualmente
aioson squad:worker . --sub=run --squad=clinica --worker=confirma-consulta --input='{"phone":"5511999999999"}'

# Iniciar daemon (workers automáticos 24/7)
aioson squad:daemon . --sub=start --squad=clinica

# Ver status do daemon
aioson squad:daemon . --sub=status

# Configurar integração WhatsApp
aioson squad:mcp . --sub=configure --squad=clinica --mcp=whatsapp --connector=whatsapp-business

# Testar conexão
aioson squad:mcp . --sub=test --squad=clinica --mcp=whatsapp

# Registrar métrica de ROI
aioson squad:roi . --sub=metric --squad=clinica --key=no_show_rate --value=8 --unit=% --baseline=20 --target=5

# Ver relatório de ROI
aioson squad:roi . --sub=report --squad=clinica
```

### 20. Reparar bindings de genome em squads

```bash
aioson squad:repair-genomes .aioson/squads/marketing/squad.manifest.json --write
```

Use quando o manifesto da squad perdeu referências corretas para genomes ou ficou incompatível com a estrutura atual.

### 19. Inicializar o runtime e indexar entregas

```bash
aioson runtime:init .
aioson runtime:ingest . --squad=marketing
aioson runtime:status .
```

Use para preparar o SQLite de runtime e puxar arquivos de `output/` para o índice consultável.

### 20. Rastrear uma task e uma execução completas

```bash
aioson runtime:task:start . --task=task-001 --title="Landing page do produto" --squad=marketing --by=orchestrator
aioson runtime:start . --run=run-001 --task=task-001 --agent=ux-ui --title="Criacao da UI"
aioson runtime:update . --run=run-001 --message="Hero e secoes principais definidos"
aioson runtime:finish . --run=run-001 --summary="UI pronta para handoff" --output=output/marketing/landing/index.html
aioson runtime:task:finish . --task=task-001 --goal="Landing entregue"
```

Use esse fluxo quando você quer rastreamento explícito de task, run, progresso e artefatos finais.

### 21. Manter uma sessao direta rastreada no terminal

```bash
aioson runtime:session:start . --agent=deyvin --title="Sessao de continuidade"
aioson runtime:session:log . --agent=deyvin --message="Corrigi validacao do modal de estoque"
aioson runtime:session:log . --agent=deyvin --message="Ajustei feedback visual de erro no formulario"
aioson runtime:session:status . --agent=deyvin --watch=2
aioson runtime:session:finish . --agent=deyvin --summary="Sessao encerrada com correcoes no estoque"
```

Use esse fluxo quando voce quer deixar uma sessao direta viva entre varios pedidos ao mesmo agente e ver no dashboard se ela ainda esta aberta, quais passos ja foram registrados e quando foi encerrada. Rode `runtime:session:status --watch=2` em outro terminal se quiser acompanhar ao vivo.

### 22. Abrir uma sessao viva rastreada em cliente externo

```bash
aioson live:start . --tool=codex --agent=deyvin --plan=plan.md --no-launch
aioson runtime:emit . --agent=deyvin --type=task_started --title="Corrigir modal de estoque"
aioson runtime:emit . --agent=deyvin --type=plan_checkpoint --plan-step=RF-01 --summary="Launcher entregue"
aioson runtime:emit . --agent=deyvin --type=task_completed --summary="Corrigi o modal de estoque" --refs="src/app.js,src/styles.css"
aioson live:handoff . --agent=deyvin --to=product --reason="Escopo exige decisao de produto"
aioson live:status . --agent=product --watch=2
aioson live:close . --agent=product --summary="Sessao encerrada com handoff e resumo final"
```

Use esse fluxo quando voce quer iniciar Codex, Claude ou OpenCode por fora do cliente, manter a mesma `session_key` viva entre varias tarefas e registrar no runtime:
- agente ativo atual
- marcos compactos no SQLite
- `state.json`, `events.ndjson` e `summary.md` em `.aioson/runtime/live/{session_key}/`
- handoffs entre agentes no mesmo envelope de sessao
- progresso resumido de plano quando a sessao foi iniciada com `--plan`
- projecoes prontas em `runtime:status --json` para `activeLiveSessions`, `recentMicroTasks` e `recentHandoffs`

### 23. Registrar eventos rápidos com `runtime:log`

```bash
aioson runtime:log . --agent=ux-ui --message="Comecei a revisar a landing"
aioson runtime:log . --agent=ux-ui --message="Entreguei a UI final" --finish --status=completed --summary="Tela pronta"
```

Use quando quer um logger stateful de uma linha, sem precisar chamar manualmente `task:start`, `start`, `update` e `finish`.

### 24. Fechar falhas de task ou run

```bash
aioson runtime:task:fail . --task=task-001 --goal="Bloqueio em requisitos"
aioson runtime:fail . --run=run-001 --message="Dependencia externa indisponivel" --summary="Execucao interrompida"
```

Use quando a task ou a run precisa ser encerrada como falha, mantendo histórico no runtime.

### 25. Publicar squads e genomes

```bash
aioson cloud:publish:squad . --slug=marketing --resource-version=1.0.0 --base-url=https://aiosforge.com
aioson cloud:publish:genome . --slug=fintech --resource-version=1.0.0 --base-url=https://aiosforge.com
```

Use quando você quer transformar artefatos locais em snapshots publicáveis e versionados.

### 26. Importar squads e genomes publicados

```bash
aioson cloud:import:squad . --url=https://aiosforge.com/snapshots/squads/marketing/1.0.0.json
aioson cloud:import:genome . --url=https://aiosforge.com/snapshots/genomes/fintech/1.0.0.json
```

Use quando vai instalar, atualizar ou sincronizar recursos publicados em outro projeto.

### 27. Configurar e monitorar delivery de conteúdo

```bash
# Validar output strategy antes de rodar
aioson squad:validate . --squad=youtube-creator

# Verificar saúde (modo, webhooks, env vars)
aioson squad:doctor . --squad=youtube-creator

# Exportar configuração para outra squad ou documentar
aioson output-strategy:export . --squad=youtube-creator

# Copiar webhooks de uma squad para outra
aioson output-strategy:import . --squad=nova-squad --from=youtube-creator

# Ou importar de um arquivo
aioson output-strategy:import . --squad=nova-squad --file=config-webhooks.json

# Disparar delivery manual de conteúdo (quando autoPublish está desligado)
aioson deliver . --squad=youtube-creator --content-key=episode-001
```

Use quando você quer:
- **Validar** que webhooks estão configurados corretamente
- **Copiar** a mesma estratégia de delivery entre múltiplas squads
- **Testar** webhooks antes de rodar squads de verdade
- **Reenviar** conteúdo que falhou na entrega automática

Veja [Output Strategy e Delivery](./output-strategy-delivery.md) para guia completo sobre webhooks, payloads, env vars e troubleshooting.

### 28. Verificar saúde do contexto antes de uma sessão

```bash
aioson context:health .
```

Saída esperada:

```
Context Health Report — meu-projeto
────────────────────────────────────────────────────────
Files                        Size      Tokens (est.)
────────────────────────────────────────────────────────
discovery.md                 28.3KB    ~7,075  ⚠ HEAVY
architecture.md              18.1KB    ~4,525
spec-checkout.md             12.0KB    ~3,000
spec-auth.md                  8.2KB    ~2,050
project.context.md            3.9KB    ~975
────────────────────────────────────────────────────────
Total context load:                    ~17,625 tokens

⚠  discovery.md is heavy (28.3KB). Consider:
   → Run: aioson context:pack . --scope=checkout

⚠  1 stale spec file(s) (features: done):
   → spec-auth.md (feature: auth is done)
   Run: aioson feature:archive . --feature=auth to archive it
```

Use **antes de começar uma sessão longa** — se `Total context load` estiver acima de 15.000 tokens, considere arquivar specs stale ou criar um contexto escopado.

### 29. Arquivar artefatos de features já entregues

O arquivamento é **automático** a partir do `feature:close --verdict=PASS` — o `@qa` dispara o comando e todos os artefatos da feature (`prd-`, `spec-`, `requirements-`, `sheldon-enrichment-`, etc.) são movidos para `.aioson/context/done/{slug}/` sem intervenção manual.

Para ver o que seria movido antes de rodar:

```bash
aioson feature:archive . --feature=checkout --dry-run
```

Para retroativo em features que já estão como `done` em `features.md`:

```bash
aioson feature:archive . --feature=user-auth
```

Para restaurar uma feature arquivada (e voltar a trabalhar nela):

```bash
aioson feature:archive . --feature=user-auth --restore
```

O manifest em `.aioson/context/done/MANIFEST.md` registra todas as features arquivadas com data, contagem de arquivos e resumo da Vision — agentes históricos (`@briefing`, `@neo`, `@discover`, `@sheldon`) leem esse manifest em vez dos arquivos completos.

> Veja a [documentação completa do feature:archive](./feature-archive.md) para detalhes de safety guards, saída JSON e impacto nos agentes.

### 30. Monitorar budget de tokens durante uma sessão

```bash
# Verificar se está no safe zone (< 60%), warning (60–80%) ou critical (≥ 80%)
aioson context:monitor . --budget=80000 --tokens=52000
# ⚠ Context: 52,000 tokens (65%) — WARNING
# Suggestion: /clear before next agent activation

# Verificar com output JSON para integrar em scripts
aioson context:monitor . --budget=80000 --tokens=67000 --json
```

O comando emite automaticamente um evento no SQLite quando entra em warning ou critical — visível no dashboard como `context_budget_warning`.

### 31. Sincronizar spec com o banco após sessão do @dev

```bash
# Sincroniza learnings e phase_gates de todos os specs
aioson spec:sync .

# Ver o estado atual de todas as features
aioson spec:status .
```

Saída do `spec:status`:

```
Project Status — meu-projeto
────────────────────────────────────────────────────────────────────────────────
Feature             Phase     Status          Last Agent      Checkpoint
────────────────────────────────────────────────────────────────────────────────
checkout            2/5       in_progress     dev             Criando migration...
auth                5/5       done            qa              QA sign-off 2026-03-28
────────────────────────────────────────────────────────────────────────────────
Active learnings: 8  |  Promotable (freq≥3): 3
```

Execute `spec:sync` logo após cada sessão do `@dev` para manter o dashboard atualizado sem precisar do `live:start`.

### 32. Registrar checkpoint manual quando a sessão caiu

```bash
# O @dev estava trabalhando em checkout mas o Claude travou sem chamar agent:done
aioson spec:checkpoint . --feature=checkout

# Para um agente diferente de dev
aioson spec:checkpoint . --feature=checkout --agent=architect
```

Saída:

```
Reading spec-checkout.md...
last_checkpoint: "Criando migration cart_items — step 3 of 5"
phase_gates: {"plan":"approved","requirements":"approved","design":"pending"}

Checkpoint registered:
  run_key: dev-1711234567890
  summary: "Criando migration cart_items — step 3 of 5"
  status: in_progress (checkpoint only — use agent:done to close)

Next: continue with /dev — start from last_checkpoint
```

### 33. Processar devlogs acumulados após sessões sem CLI

```bash
# Processar todos os devlogs de aioson-logs/ que ainda não foram processados
aioson devlog:process .
```

Saída:

```
Devlog Processing — meu-projeto
──────────────────────────────────────────────────
Found 3 devlog(s):

devlog-dev-1711234567.md
  run: dev-1711234567890
  Artifacts: 3 registered ✓
  Decisions: 1 logged ✓
  Learnings: 2 upserted ✓

devlog-qa-1711237890.md
  run: qa-1711237890123
  Artifacts: 1 registered ✓
  Learnings: 1 upserted ✓
  Verdict: PASS ✓

devlog-dev-1711241234.md — ⚠ missing frontmatter or agent field. Fix and re-run.
──────────────────────────────────────────────────
Processed: 2/3 devlogs
New learnings: 3 (queued for brains export)
Artifacts registered: 4
```

O devlog processado recebe `processed_at` no frontmatter — rodar de novo não cria duplicatas.

### 34. Pipeline completo: devlog → learnings → brains

```bash
# 1. Processar devlogs acumulados
aioson devlog:process .

# 2. Exportar learnings com frequência ≥ 3 para .aioson/brains/
aioson devlog:export-brains . --min-frequency=3

# 3. Promover nodes com frequência ≥ 5 para genome (memória de longo prazo)
aioson learning:evolve .
```

Ou, para processamento automático durante uma sessão longa:

```bash
# Rodar em background — processa novos devlogs assim que são criados
aioson devlog:watch . &

# No WSL2, usa polling de 5s automaticamente
# Para forçar polling em qualquer ambiente:
aioson devlog:watch . --poll &
```

### 35. Fechar sessão com verdict e artifacts

```bash
# @dev — sessão concluída com artefatos
aioson agent:done . --agent=dev \
  --summary="Cart implementado com migration + testes" \
  --artifacts="src/database/migrations/003_cart_items.ts,src/actions/cart/AddToCart.ts" \
  --plan-step=FASE-2

# @qa — sessão com verdict
aioson agent:done . --agent=qa \
  --summary="QA checkout — PASS" \
  --verdict=PASS \
  --artifacts="output/qa/checkout-report.md"
```

Os artifacts aparecem na tabela `artifacts` do SQLite e ficam visíveis no dashboard. O verdict é indexado em `execution_events.verdict` para busca e filtragem rápida.

### 36. Emitir evento enriquecido durante sessão live

```bash
# Checkpoint de plano com consumo de tokens e progresso
aioson runtime:emit . --agent=dev \
  --type=plan_checkpoint \
  --plan-step=FASE-1 \
  --summary="Migration de cart_items criada e testada" \
  --token-count=3800 \
  --progress-pct=40

# Blocker com worker status
aioson runtime:emit . --agent=dev \
  --type=task_blocked \
  --worker-status=blocked \
  --summary="Aguardando schema de pagamentos do @architect"
```

### 37. Intra-bus de squad

O `squad:bus` é o canal de comunicação em tempo real entre executores de uma mesma sessão de squad. Cada sessão tem um arquivo JSONL em `.aioson/squads/{slug}/sessions/{id}/bus.jsonl` com todos os eventos de status, findings, bloqueios e resultados.

```bash
# Postar uma mensagem no bus (executor → coordenador)
aioson squad:bus . post \
  --squad=content-team \
  --session=abc123 \
  --from=roteirista \
  --to=coordenador \
  --type=finding \
  --content="Briefing do episódio 3 está incompleto — falta o CTA final"

# Ler todas as mensagens da sessão
aioson squad:bus . read --squad=content-team --session=abc123

# Ler apenas os últimos 10 mensagens, compacto
aioson squad:bus . read --squad=content-team --session=abc123 --last=10 --compact

# Filtrar só bloqueios
aioson squad:bus . read --squad=content-team --session=abc123 --type=block

# Monitorar em tempo real (aguarda novas mensagens)
aioson squad:bus . watch --squad=content-team --session=abc123

# Resumo da sessão (totais por tipo, lista de bloqueios)
aioson squad:bus . summary --squad=content-team --session=abc123

# Listar todas as sessões da squad
aioson squad:bus . list --squad=content-team

# Limpar o bus de uma sessão encerrada
aioson squad:bus . clear --squad=content-team --session=abc123
```

**Tipos de mensagem suportados:**

| Tipo | Quando usar |
|------|-------------|
| `status` | Início, progresso ou conclusão de tarefa |
| `finding` | Descoberta relevante que outros executores precisam saber |
| `feedback` | Resultado da reflection após executar uma tarefa |
| `question` | Dúvida que bloqueia o executor e precisa de resposta |
| `result` | Output final de uma tarefa |
| `block` | Bloqueio que impede continuar sem intervenção |

**Exemplo: coordenador respondendo a um bloqueio**

```bash
# 1. Ver o que está bloqueado
aioson squad:bus . read --squad=content-team --session=abc123 --type=block

# Saída:
# [10:14:32] roteirista → coordenador [block]
#   Aguardando aprovação do outline do ep.3 antes de escrever roteiro

# 2. Coordenador desbloqueia postando no bus
aioson squad:bus . post \
  --squad=content-team \
  --session=abc123 \
  --from=coordenador \
  --to=roteirista \
  --type=feedback \
  --content="Outline aprovado. Pode prosseguir com o roteiro completo."
```

---

### 38. Execução autônoma de squad — `squad:autorun`

O `squad:autorun` recebe um objetivo de alto nível, decompõe em tarefas, organiza em grupos paralelos e executa tudo automaticamente. Pode usar reflection após cada tarefa e registrar tudo no intra-bus.

#### Fluxo básico

```bash
# Executar com goal direto (decomposição heurística)
aioson squad:autorun . \
  --squad=content-team \
  --goal="Criar 3 episódios de podcast para o mês de abril"
```

O comando:
1. Detecta os executores da squad em `squad.json`
2. Decompõe o goal em tarefas usando verbos de ação (criar, revisar, publicar, etc.)
3. Organiza tarefas em grupos paralelos por dependência
4. Executa cada grupo (tarefas independentes em paralelo)
5. Grava o plano em `.aioson/squads/content-team/sessions/{id}/plan.json`

#### Com reflection e bus

```bash
aioson squad:autorun . \
  --squad=content-team \
  --goal="Criar 3 episódios de podcast para o mês de abril" \
  --reflect \
  --bus
```

Com `--reflect`, após cada tarefa o sistema roda uma checklist de qualidade. Se falhar em critérios críticos, marca como `NEEDS_ITERATION` e tenta de novo (até `max_iterations` configurado em `squad.json`). Se esgotar as iterações, marca como `ESCALATE` — o coordenador precisa intervir.

#### Ver o plano sem executar (dry-run)

```bash
aioson squad:autorun . \
  --squad=content-team \
  --goal="Criar campanha de lançamento do produto X" \
  --dry-run
```

Saída de exemplo:

```
Plan ready: 6 tasks across 3 parallel group(s)

Group 1 (2 tasks) — running in parallel
  ○ task-1: Criar briefing da campanha [executor: estrategista]
  ○ task-2: Mapear canais de distribuição [executor: analista]

Group 2 (3 tasks) — running in parallel
  ○ task-3: Escrever copy das redes sociais [executor: copywriter]
  ○ task-4: Criar roteiro do vídeo de lançamento [executor: roteirista]
  ○ task-5: Definir calendário de publicação [executor: estrategista]

Group 3 (1 task)
  ○ task-6: Revisar pacote completo da campanha [executor: coordenador]

[dry-run] Plan shown above. No tasks executed.
```

#### Modo estruturado (LLM decompõe o plano)

```bash
aioson squad:autorun . \
  --squad=content-team \
  --goal="Criar campanha de lançamento" \
  --mode=structured
```

No modo `structured`, o comando salva um prompt de decomposição para o agente preencher o plano manualmente e depois retoma:

```bash
# Depois que o agente preencheu o plano:
aioson squad:autorun . --squad=content-team --plan=SESSION_ID
```

#### Retomar uma sessão existente

```bash
# Ver sessões disponíveis
aioson squad:bus . list --squad=content-team

# Retomar do ponto onde parou
aioson squad:autorun . --squad=content-team --plan=abc-123-def-456
```

#### Flags disponíveis

| Flag | Padrão | O que faz |
|------|--------|-----------|
| `--goal` | — | Objetivo de alto nível (obrigatório se não usar `--plan`) |
| `--plan` | — | ID de sessão para retomar plano existente |
| `--reflect` | false | Roda reflection após cada tarefa |
| `--bus` | true | Ativa o intra-bus de comunicação |
| `--mode` | heuristic | `heuristic` (regex + executores) ou `structured` (LLM) |
| `--dry-run` | false | Mostra o plano sem executar |
| `--sequential` | false | Força execução sequencial mesmo para tarefas paralelas |
| `--timeout` | 120 | Timeout por tarefa em segundos |

---

### 39. Auditar agentes — `agent:audit`

Escaneia todos os arquivos de agente, estima tokens, classifica por tipo e aponta seções que podem ser movidas para `.aioson/docs/` (on-demand loading) — economizando tokens toda vez que um agente é lido.

**Por que isso importa:** cada sessão longa com um agente de 38KB custa ~9.800 tokens só de instrução. Se metade dessas seções raramente são usadas (convenções de stack, exemplos, templates), movê-las para docs reduz o custo de contexto sem perder capacidade.

#### Auditoria básica

```bash
aioson agent:audit .
```

Saída de exemplo:

```
Agent Audit
──────────────────────────────────────────────────────────────────────
Files scanned  : 25
Total tokens   : ~119,557 per session
Over hard limit: 6   Over target: 11
Potential save : ~12,565 tokens/session (on-demand split)

File                                         Type          Size     Tokens      Status
──────────────────────────────────────────────────────────────────────
template/.aioson/agents/squad.md             orchestrator  65.0KB   ~16,641 tok ✗ hard
template/.aioson/agents/dev.md               generalist    38.4KB   ~9,832 tok  ⚠ target
template/.aioson/agents/ux-ui.md             generalist    33.6KB   ~8,614 tok  ⚠ target
template/.aioson/agents/deyvin.md            generalist    14.2KB   ~3,633 tok  ✓ ok

On-demand candidates (move to .aioson/docs/ to save tokens):
  template/.aioson/agents/dev.md              save ~2,100 tok  (4 sections)
  template/.aioson/agents/ux-ui.md            save ~1,400 tok  (3 sections)
```

#### Breakdown por seção (verbose)

```bash
aioson agent:audit . --verbose
```

Mostra as 5 maiores seções de cada arquivo e marca quais são candidatas a on-demand:

```
template/.aioson/agents/dev.md    generalist    38.4KB   ~9,832 tok  ⚠ target
  § Stack e Convenções de Código          4.2KB [on-demand candidate]
  § Exemplos de implementação             3.1KB [on-demand candidate]
  § Debugging e troubleshooting           2.8KB [on-demand candidate]
  § Regras de trabalho                    2.1KB
  § Working memory (task list)            1.4KB
```

#### Incluir variantes de locale

```bash
aioson agent:audit . --locales
```

Inclui os arquivos de `template/.aioson/locales/*/agents/` na análise — útil para detectar qual locale está mais fora do orçamento.

#### Salvar relatório completo

```bash
aioson agent:audit . --fix
```

Escreve `.aioson/docs/agent-audit.md` com tabela completa, lista de candidatos on-demand e recomendações de split. Use para revisão em equipe ou para planejar refatorações de agentes.

**Limites de orçamento por tipo de agente:**

| Tipo | Alvo | Limite |
|------|------|--------|
| Auto-loaded (`CLAUDE.md`, `AGENTS.md`) | 3.500 chars | 4.000 chars |
| Orquestrador (`orchestrator`, `squad`) | 12.000 chars | 20.000 chars |
| Generalista (`dev`, `architect`, `sheldon`, etc.) | 15.000 chars | 40.000 chars |
| Focado (todos os demais) | 8.000 chars | 16.000 chars |

**Seções automaticamente detectadas como candidatas a on-demand:** convenções, folder structure, stack, laravel, next.js, debugging, worktree, animação, output contract, exemplos, templates e outras seções raramente necessárias no início da sessão.

---

### 40. Gerar brief de worker — `brief:gen`

Um brief autocontido é o que garante que um executor de squad não vai falhar por falta de contexto. O `brief:gen` lê o plano de implementação, puxa excerpts relevantes de `architecture.md` e `spec.md` e monta um documento que o worker pode executar sem olhar mais nada.

**Regra de ouro dos briefs:**

> O worker não tem acesso ao histórico de conversa. Tudo que ele precisa saber deve estar no brief.

#### Gerar brief para a primeira fase não executada

```bash
aioson brief:gen .
```

O comando descobre automaticamente `implementation-plan.md` em `.aioson/context/` e usa a fase 1 por padrão.

#### Especificar uma fase

```bash
aioson brief:gen . --phase=2
```

#### Especificar o arquivo de plano

```bash
aioson brief:gen . --plan=plans/sprint-2.md --phase=1
```

#### Gerar brief para executor de squad

```bash
aioson brief:gen . --squad=content-team --executor=roteirista --phase=3
```

O brief é salvo em `.aioson/squads/content-team/briefs/phase-3-roteirista.md`.

#### Sobrescrever o caminho de saída

```bash
aioson brief:gen . --phase=2 --out=briefs/fase-2-dev.md
```

#### Estrutura gerada

O brief gerado contém:

```markdown
---
generated_at : 2026-04-02T10:00:00.000Z
plan_file    : .aioson/context/implementation-plan.md
phase        : 2
---

# Worker Brief — ## Phase 2 — API de autenticação

> Este brief é 100% autocontido. Não busque contexto adicional.
> Leia apenas os arquivos listados. Escreva apenas os arquivos listados.

## Phase goal and tasks

[conteúdo da fase 2 do plano]

## Architecture reference (excerpts)

[seções relevantes de architecture.md — tech stack, folder structure, conventions]

## Spec reference (excerpts)

[spec.md truncado em 4.000 chars]

## Project context

[resumo de project.context.md]

## Done criteria

> Preencha critérios verificáveis antes de entregar ao worker.
> Exemplo:
> - [ ] `src/auth/login.ts` existe e exporta `loginHandler`
> - [ ] Todos os testes passam (`npm test`)

## Hard constraints

> O que o worker NÃO pode tocar ou modificar.

## Out of scope

> O que explicitamente fica fora desta fase.
```

**Importante:** as seções "Done criteria", "Hard constraints" e "Out of scope" são deixadas como placeholder propositalmente — o orquestrador ou coordenador deve preenchê-las antes de entregar o brief ao worker. Um brief entregue sem done criteria claros é uma das causas mais comuns de falha em squads.

---

### 41. Verificar entrega — `verify:gate`

O `verify:gate` é uma passagem de "olhos frescos" — ele verifica se o artefato entregue atende ao spec sem carregar nenhum histórico de conversa. Isso elimina o viés de contexto que o agente gerador acumula ao longo da sessão.

**Por que isso funciona:** o agente que implementou uma feature, ao revisar o próprio código, tende a "ver" o que pretendia escrever, não o que está escrito. O verify:gate parte do zero: só spec e artefato.

#### Verificação básica

```bash
aioson verify:gate . \
  --spec=.aioson/context/briefs/phase-2.md \
  --artifact=src/auth/
```

Saída de exemplo:

```
Verify Gate
────────────────────────────────────────────────────────────
Spec     : .aioson/context/briefs/phase-2.md
Artifact : src/auth/
Files    : 7

Verdict  : ✗ FAIL_WITH_ISSUES

Issues:
  ✗ Missing required file: `src/auth/login.ts`
  ✗ Unchecked criterion: `src/auth/middleware.ts` existe e exporta `authMiddleware`

Notes:
  ⚠ Empty file: `src/auth/refresh-token.ts`

Passed: 3 checks

Report   : .aioson/context/verify-gate-phase-2.md
```

#### Verificar com spec completa do projeto

```bash
aioson verify:gate . \
  --spec=.aioson/context/spec.md \
  --artifact=src/
```

#### Modo strict (notas viram issues)

```bash
aioson verify:gate . \
  --spec=.aioson/context/briefs/phase-2.md \
  --artifact=src/auth/ \
  --strict
```

No modo strict, arquivos vazios e critérios sem checkbox marcado também viram `FAIL_WITH_ISSUES`.

#### Salvar relatório em path customizado

```bash
aioson verify:gate . \
  --spec=.aioson/context/briefs/phase-2.md \
  --artifact=src/auth/ \
  --out=output/qa/verify-fase-2.md
```

#### Usar no CI (JSON + exit code)

```bash
aioson verify:gate . \
  --spec=.aioson/context/briefs/phase-2.md \
  --artifact=src/ \
  --json
```

Saída JSON:

```json
{
  "ok": false,
  "verdict": "FAIL_WITH_ISSUES",
  "spec": ".aioson/context/briefs/phase-2.md",
  "artifact": "src/auth/",
  "report_path": ".aioson/context/verify-gate-phase-2.md",
  "files_scanned": 7,
  "issues": [
    "Missing required file: `src/auth/login.ts`",
    "Unchecked criterion: `src/auth/middleware.ts` existe e exporta `authMiddleware`"
  ],
  "notes": ["Empty file: `src/auth/refresh-token.ts`"],
  "passes": ["Required file exists: `src/auth/index.ts`"],
  "requirements": {
    "required_files": 3,
    "acceptance_criteria": 5,
    "required_patterns": 1,
    "forbidden_patterns": 0
  }
}
```

#### O que o verify:gate checa

| Checagem | Como funciona |
|----------|---------------|
| **Arquivos obrigatórios** | Extrai paths de seções "Files to write", "Output files" e "Done criteria" do spec |
| **Critérios de aceite** | Lê checkboxes `- [ ]` e `- [x]` da seção "Done criteria" — reporta os não marcados |
| **Padrões obrigatórios** | Busca strings de "Must contain" e "Required patterns" nos arquivos do artefato |
| **Padrões proibidos** | Busca strings de "Hard constraints" — falha se encontrar |
| **Arquivos vazios** | Reporta qualquer arquivo de 0 bytes como nota (issue no modo `--strict`) |

**Dica para máxima cobertura:** use `brief:gen` para gerar o spec — ele já formata a seção "Done criteria" com checkboxes e "Files to write" com paths explícitos, que são exatamente o que o `verify:gate` sabe checar.

#### Fluxo completo com brief:gen + verify:gate

```bash
# 1. Gerar brief para a fase 2
aioson brief:gen . --phase=2
# → .aioson/context/briefs/phase-2.md

# 2. [Orquestrador preenche: Done criteria, Hard constraints, Out of scope]
# 3. Worker executa a fase 2

# 4. Verificar a entrega
aioson verify:gate . \
  --spec=.aioson/context/briefs/phase-2.md \
  --artifact=src/

# 5. Se PASS → agent:done
aioson agent:done . --agent=dev \
  --summary="Fase 2 concluída — auth implementado" \
  --artifacts="src/auth/login.ts,src/auth/middleware.ts" \
  --plan-step=FASE-2

# 6. Se FAIL_WITH_ISSUES → corrigir e rodar verify:gate de novo
```

---

### 42. Pré-voo antes de começar o dev

```bash
aioson preflight . --agent=dev --feature=checkout --json
```

Retorna modo, classificação, framework, test runner, gates e prontidão em uma chamada. Use antes de abrir qualquer sessão de agente.

### 43. Classificar feature automaticamente

```bash
aioson classify . --feature=checkout
# Com override manual via prompts:
aioson classify . --feature=checkout --interactive
```

Detecta MICRO / SMALL / MEDIUM lendo PRD e requirements. Use para decidir o fluxo antes de acionar `workflow:execute`.

### 44. Determinar modelo de sizing

```bash
aioson sizing . --feature=checkout
```

Decide entre `inplace`, `phased_inplace` e `phased_external` contando entidades, fases e integrações do PRD.

### 45. Detectar test runner do projeto

```bash
aioson detect:test-runner . --json
```

Verifica phpunit.xml, jest.config.*, vitest.config.*, pytest.ini, .rspec e package.json. Use no início do `@dev` para saber o comando correto de testes.

### 46. Verificar gate antes de avançar

```bash
# Checar se Gate C (plano) está aprovado
aioson gate:check . --feature=checkout --gate=C

# Usar nome aliases
aioson gate:check . --feature=checkout --gate=plan --json
```

Valida pré-requisitos e artefatos. Retorna PASS ou BLOCKED com lista de evidências. Use antes de acionar `@dev` após `@analyst`.

### 47. Validar cadeia de artefatos

```bash
aioson artifact:validate . --feature=checkout --json
```

Verifica toda a cadeia PRD → spec → plano → conformance e indica o próximo artefato faltante. Para checar a **consistência de conteúdo** entre os artefatos (não só a presença), veja `spec:analyze` no exemplo 58.

### 48. Atualizar pulse ao final da sessão

```bash
aioson pulse:update . \
  --agent=dev \
  --feature=checkout \
  --gate="Gate C: approved" \
  --action="Phase 2 concluída" \
  --next="Phase 3: webhook"
```

Atualiza `project-pulse.md` com estado atual. Use no `agent:done` ou antes de encerrar a sessão.

### 49. Salvar ponto de continuação

```bash
aioson state:save . \
  --feature=checkout \
  --phase=2 \
  --status=in_progress \
  --next="Implement webhook idempotency" \
  --spec-version=4
```

Cria entrada em `dev-state.md` para recuperação de sessão. Use ao fim de cada fase.

### 50. Fechar feature após QA

```bash
# PASS com residual
aioson feature:close . \
  --feature=checkout \
  --verdict=PASS \
  --residual="Email delivery não testado E2E"

# FAIL
aioson feature:close . \
  --feature=checkout \
  --verdict=FAIL \
  --notes="Auth edge case ausente"
```

Fecha a feature: atualiza spec (QA sign-off), features.md e project-pulse.md em uma chamada. Em `--verdict=PASS`, dispara `feature:archive` automaticamente — todos os artefatos da feature são movidos para `.aioson/context/done/{slug}/` e o manifest é atualizado sem intervenção manual.

### 51. Executar workflow completo

```bash
# Dry-run para ver o plano
aioson workflow:execute . \
  --feature=checkout \
  --classification=SMALL \
  --dry-run

# Executar de verdade
aioson workflow:execute . --feature=checkout --tool=claude

# Executar com política agentica persistida para o gateway
aioson workflow:execute . --feature=checkout --tool=codex --agentic --max-dev-qa-cycles=3

# Retomar do dev (pular product e analyst)
aioson workflow:execute . \
  --feature=checkout \
  --tool=claude \
  --start-from=dev
```

### 52. Enfileirar fases do plano no runner

```bash
# Ver fases antes de enfileirar
aioson runner:queue:from-plan . --feature=checkout --dry-run

# Enfileirar para o agente dev
aioson runner:queue:from-plan . --feature=checkout --agent=dev

# Usar arquivo de plano arbitrário
aioson runner:queue:from-plan . \
  --plan=docs/implementation-plan.md \
  --agent=dev
```

### 53. Promover aprendizados para regras

```bash
# Ver o que seria promovido (sem escrever)
aioson learning:auto-promote . --threshold=3 --dry-run

# Promover aprendizados frequentes
aioson learning:auto-promote . --threshold=3

# Threshold mais exigente
aioson learning:auto-promote . --threshold=5
```

Cria arquivos em `.aioson/rules/` para aprendizados `process` e `quality` com frequência ≥ threshold. Aprendizados `domain` são anotados mas não viram regras.

---

### 54. Preparar commit com `commit:prepare`

```bash
# Preparar commit do estado atual (staged)
aioson commit:prepare .
```

Saída esperada:

```
Commit Preparation
──────────────────────────────────────────────────
Staged files : 3
Guard status : PASS

Changes:
  src/components/Button.tsx    (modified)
  tests/button.test.tsx        (modified)
  README.md                    (modified)

commit-prep.json written to .aioson/context/commit-prep.json
```

O `@committer` lerá esse arquivo e gerará a mensagem semântica correta.

Se nada estiver staged:

```
Guard status : BLOCKED — no staged files
Nothing to commit. Stage files first with git add.
```

Se houver arquivos proibidos:

```
Guard status : BLOCKED — forbidden files detected
  node_modules/.package-lock.json
Remove forbidden files from stage before committing.
```

---

### 55. Verificar stage com `git:guard`

```bash
# Verificação única
aioson git:guard .

# Instalar hook de pre-commit para verificação contínua
aioson git:guard . --install-hook
```

Regras do guard:
- Bloqueia stage vazio
- Bloqueia arquivos em `node_modules/`, `dist/`, `.next/`, `*.db`, secrets
- Pode instalar hook em `.git/hooks/pre-commit`

---

### 56. Controlar o self:loop com guardrails

O `self:loop` agora suporta contrato verificável. Veja [Loop Guardrails](./loop-guardrails.md) para o guia completo.

```bash
# Ver estado atual do loop de uma feature
aioson harness:status . --slug=checkout
aioson harness:status . --slug=checkout --json

# Aprovar gate humano (ex: mudança em migrations detectada automaticamente)
aioson harness:approve . --slug=checkout --gate=database_destructive_change-1

# Rejeitar gate (cancela tentativa atual)
aioson harness:reject . --slug=checkout --gate=database_destructive_change-1 --reason="revert necessário"
```

**Campos novos no harness-contract.json:**
```json
{
  "contract_mode": "safe",
  "allowed_files": ["src/modules/checkout/**"],
  "human_gate": { "required_for": ["database_destructive_change"] }
}
```

Use `contract_mode: "safe"` para loops conservadores (10 steps, 200k tokens), `"builder"` para desenvolvimento ativo, `"autopilot"` para loops longos.

---

### 57. Retrospectiva de falhas com harness:retro

```bash
# Dossiê da feature checkout
aioson harness:retro . --feature=checkout

# Dossiê das últimas 5 features (ordenadas por data de PASS)
aioson harness:retro . --last=5

# Formato JSON (com exit codes propagados)
aioson harness:retro . --feature=checkout --json
```

Saída em `.aioson/context/retro/checkout.md`. Fontes mineradas: QA reports, planos de correção, trilha FAIL→PASS do dossier, eventos de execução, tentativas, assinaturas de falha e devlogs. Operação de leitura — arquivos-fonte nunca são alterados.

```bash
# Exibir prévia de um artefato com truncação segura
aioson harness:preview .aioson/context/retro/checkout.md
```

---

### 58. Verificar critérios deterministicamente com harness:check

Roda os comandos `criteria[].verification` do `harness-contract.json` **fora do self:loop**, de forma determinística. Read-only sobre `progress.json` — o estado do circuit breaker continua exclusivo de `harness:validate`/`apply-validation`.

```bash
# Rodar todos os critérios verificáveis do contrato ativo (auto-descoberto)
aioson harness:check . --slug=checkout

# Rodar um subconjunto de critérios
aioson harness:check . --slug=checkout --criteria=C1,C3

# Com timeout customizado e saída JSON (exit 0 = pass)
aioson harness:check . --slug=checkout --timeout=120000 --json
```

Reusa o mesmo motor do loop (timeouts, kill de process-tree, redaction de credenciais, failure signatures). Persiste `last-check-output.json` e emite telemetria `criteria_check_failed`. O `verification` é campo autorado por critério — o `@sheldon` o escreve para todo critério `binary:true` mecanicamente verificável; contratos legados sem o campo continuam válidos (gera apenas WARNING advisory). O `@validator` roda `harness:check` **primeiro** e copia o veredito do exit code verbatim. Veja [Loop Guardrails](./loop-guardrails.md#harnesscheck--verificação-determinística-avulsa).

---

### 59. Validar consistência cruzada com spec:analyze

Irmão de **conteúdo** do `artifact:validate` (que checa só presença). Roda checagens determinísticas entre os artefatos da feature antes do gate de execução.

```bash
# Analisar a consistência cruzada dos artefatos da feature
aioson spec:analyze . --feature=checkout

# Saída JSON para scripting de gate (errors → exit 1)
aioson spec:analyze . --feature=checkout --json
```

Checagens: rastreabilidade REQ/AC (ids declarados nunca usados downstream = gap; ids usados sem declaração = órfão/drift), staleness (upstream modificado após downstream gerado), readiness (`blocked` = error, `ready_with_warnings` = info), sanidade do contrato e vínculo AC→contrato, mais `wave_file_overlap` (fases da mesma Wave com Primary files sobrepostos). Severidades: **error** vira `ok:false`/exit 1; **warning** = drift provável; **info** = dívida. Persiste `spec-analyze-{slug}.json` em `.aioson/context/`. O `@scope-check` roda no preflight: errors são blockers, warnings viram evidência de drift pré-computada.

---

### 60. Compilar a Lane B com forge:compile

Compila os artefatos de uma feature MEDIUM num script de dynamic workflow auditável e versionável, commitado junto da spec. Entrada opt-in via `@forge-run`.

```bash
# Compilar a feature num forge-run.workflow.js
aioson forge:compile . --feature=checkout

# Saída JSON (preflights duros podem recusar a compilação)
aioson forge:compile . --feature=checkout --json
```

Gera `.aioson/plans/{slug}/forge-run.workflow.js`: um `parallel()` por Wave (devs em arquivos disjuntos) → loop de convergência no `harness:check` (fixes sequenciais, limitado pelo `error_streak_limit` do governor + guarda de orçamento) → revisão adversarial de 3 lentes para critérios binários **sem** `verification` → estágio de validador fresh-context fechando pelo ciclo normal `harness:validate` → `apply-validation`. Preflights duros recusam compilar (contrato inválido/ausente, zero critério executável, plano sem coluna Wave, errors do `spec:analyze`, `wave_file_overlap`) e nomeiam o agente dono (`@sheldon`, `@pm`, `@discovery-design-doc`). O script gerado **nunca** roda `feature:close`/publish.

---

## Atalhos úteis

```bash
aioson --help --locale=pt-BR
aioson agents --json
aioson runtime:status --json
aioson qa:report --json
```

Esses atalhos ajudam quando você quer explorar o CLI, integrar com scripts ou depurar estado sem depender de saída humana.
