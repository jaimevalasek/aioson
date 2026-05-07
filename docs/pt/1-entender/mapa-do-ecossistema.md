# Mapa do ecossistema AIOSON

> **Para quem é:** quem quer ver o time inteiro de uma vez.
> **Tempo de leitura:** 8 min.
> **O que você vai sair sabendo:** quem são os 28 agentes, em que momento cada um entra, e como eles se conversam.

---

## Visão de alto nível

```
                       ┌──────────────────┐
                       │   Você + cliente │
                       │       AI         │
                       └────────┬─────────┘
                                │
                ┌───────────────┼───────────────┐
                ▼               ▼               ▼
         ┌──────────┐    ┌──────────┐    ┌──────────┐
         │  Setup   │    │   Neo    │    │ Briefing │
         │  (boot)  │    │ (rotear) │    │ (pré-PRD)│
         └────┬─────┘    └────┬─────┘    └────┬─────┘
              │               │               │
              └───────┬───────┴───────┬───────┘
                      │               │
                      ▼               ▼
        ┌──────────────────────────────────────┐
        │       NÚCLEO DE DESENVOLVIMENTO      │
        │                                      │
        │  Product → Analyst → Architect →     │
        │  UX-UI → PM → Orchestrator → Dev →   │
        │  QA → Validator → Tester → Pentester │
        │                                      │
        └──────────────────────────────────────┘
                      │
                      ▼
        ┌──────────────────────────────────────┐
        │      CONTINUIDADE & ENTREGA          │
        │                                      │
        │  Deyvin (pair) · Sheldon (review)    │
        │  Committer (git) · Discover (cache)  │
        │                                      │
        └──────────────────────────────────────┘
                      │
                      ▼
        ┌──────────────────────────────────────┐
        │         ESPECIALIZAÇÕES              │
        │                                      │
        │  Squad · Genome · Profiler trio ·    │
        │  Site-Forge · Design-Hybrid-Forge ·  │
        │  Orache · Copywriter                 │
        │                                      │
        └──────────────────────────────────────┘
```

---

## Os agentes, agrupados por papel

### 1. Boot e roteamento

| Agente | O que faz | Quando invocar |
|---|---|---|
| **`@setup`** | Onboarding do projeto: detecta stack, classifica MICRO/SMALL/MEDIUM, escreve `project.context.md` | Sempre primeiro num projeto novo |
| **`@neo`** | Olha o estado e sugere o próximo agente | Quando você não sabe o que fazer agora |
| **`@briefing`** | Transforma plans/anotações soltas em um briefing pré-PRD | Você tem ideias, não tem feature ainda |

### 2. Núcleo de desenvolvimento (workflow oficial)

A ordem padrão depende da classificação:

**MICRO:** `@setup → @product (opcional) → @dev`
**SMALL:** `@setup → @product → @analyst → @architect → @dev → @qa`
**MEDIUM:** `@setup → @product → @analyst → @architect → @ux-ui → @pm → @orchestrator → @dev → @qa`

| Agente | O que faz | Saída principal |
|---|---|---|
| **`@product`** | Define visão, escopo, PRD da feature | `prd.md`, `spec.md` |
| **`@analyst`** | Descobre domínio, entidades, fluxos no codebase | `architecture.md`, ER diagrams |
| **`@architect`** | Decisões técnicas: estrutura, libs, integração | `architecture.md` (decisões) |
| **`@ux-ui`** | Design system e specs de componentes (MEDIUM) | `design-doc.md`, `discovery.md` |
| **`@pm`** | Backlog, user stories, ACs (MEDIUM) | `tasks.md`, user stories |
| **`@orchestrator`** | Coordena lanes paralelas (MEDIUM) | `parallel/`, plano de execução |
| **`@dev`** | Implementa a feature | Código + `dev-state.md` |
| **`@qa`** | Escreve testes, valida ACs, ciclo autônomo de correção (cap 2) | `test-plan.md`, `qa-report-*.md` |
| **`@validator`** | Valida tecnicamente contra contrato de sucesso | `last-handoff.json`, validation report |
| **`@tester`** | Engenharia sistemática de testes (legacy/brownfield) | `test-inventory.md`, coverage tier |
| **`@pentester`** | Revisão adversarial de segurança (OWASP, LLM Top 10) | `security-findings-*.json` |

### 3. Continuidade e entrega

| Agente | O que faz | Quando invocar |
|---|---|---|
| **`@deyvin`** (alias `@pair`) | Pair-programming, continuidade | Voltar a uma feature em curso |
| **`@sheldon`** | Análise técnica profunda, revisão de arquitetura | Antes de mergulhar em decisões grandes |
| **`@committer`** | Gera mensagens de commit profissionais | Antes de commitar |
| **`@discover`** | Constrói cache semântico do projeto | Onboarding rápido em codebase grande |

### 4. Especializações

| Agente | O que faz |
|---|---|
| **`@squad`** | Cria/gerencia squads customizados (`refresh`, `agent-create`) |
| **`@genome`** | Cria e aplica genomes (DNA cognitivo de personas) |
| **`@profiler-researcher`** | Coleta material bruto sobre uma pessoa pública |
| **`@profiler-enricher`** | Analisa cognitivamente o material |
| **`@profiler-forge`** | Gera o Genome 4.0 + advisor |
| **`@site-forge`** | Clona, reconstrói ou extrai design de qualquer URL |
| **`@design-hybrid-forge`** | Combina dois design skills em um híbrido |
| **`@orache`** | Investigação de domínio e pesquisa estratégica |
| **`@copywriter`** | Copy de conversão para landing pages, emails |
| **`@discovery-design-doc`** | Discovery + design doc combinados (modo conjunto) |

---

## Como os agentes "conversam"

Eles **não conversam diretamente entre si**. Eles conversam **através de artefatos** em disco. Esse é o coração da arquitetura.

```
┌─────────────┐  escreve   ┌──────────────────┐  lê   ┌──────────────┐
│  @product   ├───────────▶│  spec.md         │◀──────┤  @architect  │
└─────────────┘            │  prd.md          │       └──────────────┘
                           └──────────────────┘
                                    │
                                    ▼ lê
                           ┌──────────────────┐  lê   ┌──────────────┐
                           │  @architect      │       │  @dev        │
                           │  escreve →       ├──────▶│              │
                           │  architecture.md │       └──────┬───────┘
                           └──────────────────┘              │
                                                              ▼ escreve
                                                     ┌──────────────────┐
                                                     │  dev-state.md    │
                                                     │  (código)        │
                                                     └────────┬─────────┘
                                                              │ lê
                                                              ▼
                                                     ┌──────────────┐
                                                     │  @qa         │
                                                     └──────────────┘
```

**Vantagem:** se uma sessão cai, o próximo agente só precisa ler os artefatos. Não há "memória conversacional" perdida.

---

## Onde os artefatos vivem

```
seu-projeto/
└── .aioson/
    └── context/
        ├── project.context.md      ← contexto global (criado por @setup)
        ├── project-pulse.md        ← estado vivo, atualizado a cada sessão
        ├── architecture.md         ← decisões de @analyst e @architect
        ├── prd.md                  ← saída de @product
        ├── design-doc.md           ← saída de @ux-ui
        ├── tasks.md                ← saída de @pm
        ├── dev-state.md            ← saída de @dev (status atual)
        ├── test-plan.md            ← saída de @qa
        ├── security-findings-*.json ← saída de @pentester
        ├── handoff-protocol.json   ← último handoff entre agentes
        ├── features/<slug>/        ← features em desenvolvimento
        ├── done/                   ← features arquivadas (after feature:close)
        └── dossier/<slug>/         ← dossier por feature (Phase 1+ do continuity)
```

---

## "Eu não sei qual agente usar"

Use o `@neo`. É literalmente o agente "estou perdido".

```
Você no Claude Code:
> @neo

@neo:
> Lendo project-pulse.md... você está no projeto "minha-loja", classificação SMALL,
  com a feature "checkout-stripe" em andamento. O @dev terminou ontem.
> Próximo passo natural: @qa para escrever testes da feature.
> Se quiser revisar segurança antes do QA: @pentester.
> Se quiser fazer um pair antes: @deyvin.
```

---

## Diálogo real — ciclo SMALL completo

```
─── Sessão 1 ───
Você > @setup
@setup > Detectei Node.js + Express + Postgres. Tipo de projeto? [api/web_app/site/...]
Você > web_app
@setup > Quantos tipos de usuário? Quantas integrações externas?
Você > 2 / 3
@setup > Classificado como SMALL. Idioma de interação? [en/pt-BR/es/fr]
Você > pt-BR
@setup > project.context.md criado. Próximo: @product.

─── Sessão 1 (continua) ───
Você > @product
@product > Vamos começar uma feature. Como ela se chama? Qual o problema?
Você > "checkout-stripe", finalizar pedido com cartão.
@product > [...várias perguntas...] Spec criada em context/features/checkout-stripe/spec.md.
@product > Próximo: @analyst para mapear o domínio.

─── Sessão 2 (no dia seguinte) ───
Você > @neo
@neo > Você parou em @product. Próximo: @analyst.
Você > @analyst
@analyst > [lê spec.md, examina codebase] Mapeei: Order, Customer, Payment, OrderItem.
@analyst > Decisão registrada em architecture.md. Próximo: @architect.

─── e assim por diante até @qa ───
```

---

## Próximo passo

- Quer pôr em prática? → [Primeiro projeto do zero](../2-comecar/primeiro-projeto.md)
- Confuso com algum termo? → [Glossário](./glossario.md)
- Curioso sobre por que tudo isso? → [Por que ele existe](./por-que-existe.md)
