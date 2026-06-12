# Memória e Contexto

> **Para quem é:** qualquer pessoa usando AIOSON que queira entender como a "memória" entre sessões funciona, ou que precise depurar por que um agente "esqueceu" algo.
> **Tempo de leitura:** ~10 min (doc consolidado).
> **O que você vai sair sabendo:**
> - As 3 camadas de memória do AIOSON e o papel de cada uma
> - Como usar os 4 comandos de contexto (pack, cache, busca, monitor)
> - Onde cada artefato de memória vive no disco

---

## Por que existe (o problema)

Todo cliente AI tem janela de contexto limitada. Numa sessão longa, você acumula histórico, código, specs, decisões — e quando a janela enche, o cliente compacta ou descarta. A próxima sessão começa do zero. Para um projeto de 3 dias, isso significa repassar para a IA o que você estava fazendo, qual era o estado do código, que decisões já foram tomadas — pura repetição.

O segundo problema é de escala: um monorepo com 2.000 arquivos não cabe numa janela de contexto. Qualquer agente que tentar ler "o projeto inteiro" desperdiça tokens em arquivos irrelevantes para a task em questão.

AIOSON resolve com **memória externa**: decisões importantes viram arquivos em disco, não ficam só no histórico de conversa. A próxima sessão lê esses arquivos antes de qualquer coisa. E um conjunto de ferramentas garante que apenas os arquivos *relevantes para a tarefa atual* sejam carregados.

---

## As 3 camadas de memória

```
┌────────────────────────────────────────────────────────────┐
│  CAMADA 1 — Arquivos de contexto                           │
│  .aioson/context/*.md                                      │
│  project.context.md · architecture.md · spec.md ·          │
│  dev-state.md · prd.md · dossier/ · features/ ...          │
│                                                            │
│  Escrita por agentes, lida por agentes.                    │
│  Persistente no Git (pode commitar).                       │
└────────────────────────────────────────────────────────────┘
           │ alimenta
           ▼
┌────────────────────────────────────────────────────────────┐
│  CAMADA 2 — Brains procedurais (Zettelkasten)              │
│  .aioson/brains/<agente>/                                  │
│                                                            │
│  Nós de conhecimento cross-referenciáveis.                 │
│  Cada agente carrega apenas os nós relevantes.             │
│  Gerado por @discover e outros agentes especializados.     │
└────────────────────────────────────────────────────────────┘
           │ indexado por
           ▼
┌────────────────────────────────────────────────────────────┐
│  CAMADA 3 — Active retrieval (2026)                        │
│  ~/.aioson/search/context-search.sqlite                    │
│                                                            │
│  FTS5 index. Agentes BUSCAM o que precisam em vez de       │
│  carregar tudo. Bônus de recência, ranking BM25.           │
└────────────────────────────────────────────────────────────┘
```

---

## Camada 1 — Arquivos de contexto

São os artefatos que os agentes criam ao longo do workflow. São a "memória oficial" de um projeto.

| Arquivo | Criado por | O que guarda |
|---|---|---|
| `project.context.md` | `@setup` | Stack, classificação, idioma, framework |
| `project-pulse.md` | todos (atualizado a cada sessão) | Estado global vivo do projeto |
| `architecture.md` | `@analyst`, `@architect` | Entidades de domínio + decisões técnicas |
| `prd.md` / `spec.md` | `@product` | Escopo, ACs, fora-de-escopo |
| `design-doc.md` | `@ux-ui` | Specs de componentes, design tokens |
| `tasks.md` | `@pm` | Backlog, user stories |
| `dev-state.md` | `@dev` | O que foi implementado, status |
| `test-plan.md` | `@qa` | Plano de teste, cobertura |
| `handoff-protocol.json` | todos | Último handoff entre agentes |
| `features/<slug>/` | `@product` | Specs por feature |
| `dossier/<slug>/` | agent-chain | Tudo sobre uma feature em curso |

### Context Pack — carregamento mínimo por task

Em vez de ler todos os arquivos acima, use `context:pack` para montar um pacote curado para a task atual:

```bash
aioson context:pack . --agent=dev --goal="ajustar validação do formulário de cadastro" --module=src
```

**Opções:**

| Opção | Descrição |
|---|---|
| `--agent=<nome>` | Agente que vai usar o contexto |
| `--goal="..."` | O que você quer fazer (orienta a seleção) |
| `--module=<pasta>` | Restringir ao módulo relevante |
| `--max-files=N` | Limitar número de arquivos no pacote |

Gera `.aioson/context/context-pack.md` com:
- Ordem de leitura recomendada
- Lista dos arquivos selecionados
- Trechos embutidos dos mais relevantes

**Quando usar:** antes de começar uma task num projeto grande — coloca na janela de contexto apenas o que importa.

---

## Camada 2 — Brains procedurais

O agente `@discover` (e outros especializados, como `@site-forge`) constroem uma base de conhecimento estruturada em nós Zettelkasten — cada nó tem título, conteúdo e referências cruzadas para outros nós.

```
.aioson/brains/
├── discover/
│   ├── entidades-principais.md
│   ├── fluxo-autenticacao.md
│   └── ...
└── site-forge/
    ├── squarespace-layout-patterns.md
    └── ...
```

Agentes carregam apenas os nós relevantes para a task, usando o índice `bootstrap/` para localizar o que precisam sem ler tudo.

**Quando é útil:** codebases grandes (>500 arquivos) onde um agent que tenta ler tudo vai estourar a janela antes de chegar na task.

---

## Camada 3 — Active retrieval

A camada mais recente (adicionada em 2026, commit `5cc7074`). Antes, agentes tinham que carregar blocos fixos de contexto. Com active retrieval, eles podem **buscar** o que precisam usando termos naturais.

O índice é um SQLite com FTS5, salvo em `~/.aioson/search/context-search.sqlite`.

---

## Operações

### Busca FTS5 — `context:search`

**Primeiro, indexe o projeto:**

```bash
aioson context:search:index .

# Forçar reindexação após mudanças significativas
aioson context:search:index . --force
```

**Depois, busque:**

```bash
aioson context:search "autenticação JWT"
aioson context:search "endpoint de pagamento" --limit=5
aioson context:search "configuração banco de dados" --json
```

**Saída:**

```
  Search results for: "autenticação JWT"

  1. Arquitetura de Segurança
     .aioson/context/architecture.md
     ...sistema usa [JWT] com expiração de 24h, [autenticação] via Bearer token...

  2. Especificação de API
     .aioson/context/spec.md
     ...endpoints protegidos exigem header [Authorization: Bearer <token>]...
```

**Como o ranking funciona:**
- BM25 built-in do FTS5 (penaliza termos raros e de spam, recompensa precisão)
- Bônus de recência: arquivos modificados recentemente têm score ligeiramente maior
- Decay de 30 dias: após um mês, o bônus de recência se dissipa
- Entradas com mais de 24h na indexação são reconsideradas na próxima passagem; use `--force` para atualizar antes disso

---

### Cache de snapshot — `context:cache`

Salva o estado de uma sessão para restaurar depois — útil antes de trocar de branch, de agente, ou de máquina.

**Listar sessões salvas:**

```bash
aioson context:cache
```

```
  Cached Context Sessions

  a3f8c2d1  2026-05-06T14:00  6KB — implementar checkout Stripe
  b9e1f4a2  2026-05-05T10:30  8KB — refatorar módulo de pedidos
```

**Salvar snapshot:**

```bash
aioson context:cache:save . \
  --content="$(cat .aioson/context/dev-state.md)" \
  --goal="checkout Stripe — mid-implementation" \
  --agent="dev"
```

**Restaurar:**

```bash
# Restaurar completo
aioson context:cache:restore --session=a3f8c2d1

# Restaurar apenas linhas relacionadas a JWT
aioson context:cache:restore --session=a3f8c2d1 --query="JWT"
```

**Limpar sessões expiradas:**

```bash
aioson context:cache:cleanup          # remove > 24h (padrão)
aioson context:cache:cleanup --max-age=6  # remove > 6h
```

As sessões ficam em `~/.aioson/temp/` — fora do repositório, nunca commitadas.

---

### Monitor de uso — `context:monitor`

Dois modos de operação:

**Modo budget de projeto** — útil em sessões diretas no Claude Code/Codex/etc.:

```bash
aioson context:monitor . --budget=80000 --tokens=52000
```

```
  ⚠ Context: 52,000 tokens (65%) — WARNING
  Suggestion: /clear before next agent activation
```

| Zona | Faixa | Ação |
|---|---|---|
| safe | < 60% | Continuar normalmente |
| warning | 60–80% | Planejar `/clear` antes do próximo agente |
| critical | ≥ 80% | Rodar `context:health` e reduzir carga |

**Thresholds por classificação** (para automonitoramento dos agentes, configurado em `.aioson/config.md`):

| Classificação | Threshold de alerta |
|---|---|
| MICRO | 75% |
| SMALL | 65% (padrão) |
| MEDIUM | 55% |

Quando o agente detecta que está próximo do threshold: ele grava artefatos em progresso, emite aviso de contexto, e registra no `last_checkpoint` o estado atual.

**Modo squad** — para projetos com múltiplos agentes em paralelo:

```bash
aioson context:monitor . --squad=meu-squad
aioson context:monitor . --squad=meu-squad --agent=dev
aioson context:monitor . --squad=meu-squad --json
```

Quando a zona é `warning` ou `critical`, um evento é automaticamente registrado no SQLite local, ficando visível no dashboard.

---

## Carregamento seletivo de contexto (v1.29.0+)

As 3 camadas acima resolvem *onde* a memória mora. Esta seção resolve um problema diferente: *quando* cada arquivo entra na janela de contexto. Antes, ativar um agente carregava de tudo — regras, docs, design-docs, specs — logo de cara, mesmo que a tarefa não precisasse. A partir da v1.29.0 isso é seletivo: o agente carrega só o que a task atual exige, e o resto entra sob demanda.

### Os dois modos

Todo agente que mexe com contexto opera em dois modos explícitos, via `context:select`:

| Modo | Quando | O que carrega |
|---|---|---|
| **PLANNING** | Inspecionar status, listar fontes, decidir o próximo passo | Só fundação + frontmatter; nunca pastas inteiras de regras/docs |
| **EXECUTING** | Antes de escrever/editar um artefato ou código | Só as regras/docs/design-docs selecionados para os arquivos em questão |

```bash
aioson context:select . --agent=dev --mode=planning  --task="<tarefa>" --paths="<arquivos conhecidos>"
aioson context:select . --agent=dev --mode=executing --task="<tarefa>" --paths="<arquivos a tocar>"
```

A saída traz a linha **Boundary**: *"carregue só os arquivos selecionados até a task, o modo, a feature ou os paths mudarem"*. Ou seja: quando o assunto muda no meio da conversa, o agente roda o seletor de novo com a task nova — não fica preso ao que carregou na entrada.

### Fast path de ativação (agentes de entrada)

Ativar um agente "seco" — `@briefing`, `@product`, `@sheldon`, `@analyst`, `@copywriter` (e `@deyvin`) sem nomear feature/tarefa — carrega **só o contexto de fundação** (`project.context.md` + `project-pulse.md`, mais o registro/listagem que o agente precisa para o menu), apresenta as opções de início e para. Nada de PRDs, dossiers, regras ou skills antes de você dizer o que fazer.

### Guarda de ativação (agentes de meio de fluxo)

`@architect`, `@ux-ui`, `@pm`, `@qa`, `@orchestrator`, `@scope-check` e `@discovery-design-doc` ganharam uma **guarda de ativação**: ativados sem slug de feature, leem só a fundação, reportam o estágio atual do workflow, perguntam qual feature trabalhar e param. Os artefatos pesados (specs, requirements, arquitetura) entram só na etapa que os usa.

### Regras e docs roteáveis pelo seletor

Para o `context:select` conseguir escolher uma regra ou doc, o arquivo precisa de **frontmatter de roteamento** — senão ele é "invisível ao seletor" e nunca é carregado sob demanda:

```yaml
---
description: "..."
agents: [dev, qa]          # quem pode carregar
modes: [planning, executing]
task_types: [payment, billing]
triggers: [money, pricing, checkout]   # palavras/frases batidas contra a task
paths: [src/billing/**]                # globs batidos contra os arquivos tocados
load_tier: trigger                     # trigger (padrão) | always | justified
---
```

Uma regra só com `description` (sem `task_types`/`triggers`/`paths` e sem `load_tier: always`) pontua abaixo do corte e o seletor nunca a carrega. Para auditar isso:

```bash
aioson rules:lint .            # acusa regras invisíveis ao seletor
aioson rules:lint . --docs     # inclui .aioson/docs/ na varredura
aioson rules:lint . --strict   # sai com código 1 se houver avisos (para CI)
```

> **Depois de `aioson update` em um projeto:** rode `aioson rules:lint . --docs`. Ele aponta exatamente quais regras/docs locais seus ficaram sem metadata de roteamento e precisam de `triggers`/`task_types`/`paths` para o seletor enxergá-los.

### Por que isso reduz tokens

Lazy-loading rende ~10x mais que comprimir prosa: deixar de carregar PRDs/dossiers/regras inteiros na ativação economiza ~10–25k tokens por sessão, contra ~1k de uma compressão de texto. Os dois se somam — o [`compress:agents`](./compress-agents.md) enxuga o arquivo do agente; o carregamento seletivo evita puxar arquivos que a task nem usa.

---

## Onde tudo vive

```
seu-projeto/
└── .aioson/
    ├── context/             ← Camada 1: artefatos dos agentes (commitável)
    │   ├── project.context.md
    │   ├── project-pulse.md
    │   ├── architecture.md
    │   ├── spec.md
    │   ├── dev-state.md
    │   ├── context-pack.md  ← gerado por context:pack
    │   ├── features/
    │   └── dossier/
    ├── brains/              ← Camada 2: nós Zettelkasten (commitável)
    │   └── discover/
    └── runtime/
        └── aios.sqlite      ← telemetria local (não commitar)

~/.aioson/
    ├── temp/                ← cache de snapshot (context:cache:save)
    │   └── <sessionId>/
    │       └── context.md
    └── search/
        └── context-search.sqlite  ← índice FTS5 (context:search:index)
```

**O que commitar:**
- Pode commitar `.aioson/context/` — é memória do projeto.
- Pode commitar `.aioson/brains/` quando for parte real do trabalho.
- **Não commitar:** `.aioson/runtime/`, `~/.aioson/temp/`, `~/.aioson/search/`.
- **Não commitar** (gerenciados pelo framework): `.aioson/agents/`, `.aioson/locales/`, `.aioson/skills/`, `.aioson/schemas/`, `.aioson/tasks/`, `.aioson/templates/`.

---

## Quando NÃO usar (anti-padrões)

- **Não use `context:pack` para projetos MICRO de 3 arquivos.** O overhead de montar o pacote supera o benefício.
- **Não use `context:search` sem indexar primeiro.** O comando busca só o índice; sem `context:search:index`, retorna vazio.
- **Não comite `~/.aioson/temp/`.** Está fora do projeto por design — é cache pessoal de máquina.
- **Não regenere brains toda sessão.** `@discover` é pesado; rode quando o codebase mudar significativamente.
- **Não confunda `context:cache` com feature dossier.** Cache é snapshot temporário de sessão (expira em 24h). O dossier é memória permanente de feature — veja [`feature-dossier.md`](./feature-dossier.md).

---

## Fluxo prático — codebase grande, sessão nova

```
Você > Quero retomar a feature "checkout-stripe"
       (sessão anterior caiu ontem)

# 1. Busca o que é relevante
$ aioson context:search "checkout stripe"

  1. Feature Dossier: checkout-stripe
     .aioson/context/dossier/checkout-stripe/spec.md
  2. Estado de implementação
     .aioson/context/dev-state.md

# 2. Monta pacote mínimo
$ aioson context:pack . --agent=dev --goal="retomar checkout-stripe" --module=src/checkout

# 3. Abre cliente AI com o pacote já montado
$ claude .

Você > @deyvin
@deyvin > [lê context-pack.md e dev-state.md]
  Encontrei onde paramos: src/checkout/payment.js — a integração
  com o webhook do Stripe estava 80% feita. Continuando...
```

---

## Próximo passo

- Quer entender como o dossier de feature funciona? → [`feature-dossier.md`](./feature-dossier.md)
- Quer ver como sessões completas são retomadas? → [`3-receitas/continuidade-entre-sessoes.md`](../3-receitas/continuidade-entre-sessoes.md)
- Glossário de termos: Brains, Context Pack, Active Retrieval → [`1-entender/glossario.md`](../1-entender/glossario.md)
