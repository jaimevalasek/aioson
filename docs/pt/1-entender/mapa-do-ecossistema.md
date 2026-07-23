# Mapa do ecossistema AIOSON

> **Para quem é:** quem quer ver o time inteiro de uma vez.
> **Tempo de leitura:** 8 min.
> **O que você vai sair sabendo:** quem são os 29 agentes, em que momento cada um entra, e como eles se conversam.

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
        │  Product → [Sheldon] → Planner →      │
        │  Dev → QA                            │
        │                                      │
        │  Especialistas sob pedido: Analyst,  │
        │  Architect, PM, Tester, Pentester…   │
        │                                      │
        └──────────────────────────────────────┘
                      │
                      ▼
        ┌──────────────────────────────────────┐
        │      CONTINUIDADE & ENTREGA          │
        │                                      │
        │  Deyvin (pair) · Committer (git)     │
        │  Discover (cache semântico)          │
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

A ordem é a mesma em MICRO, SMALL e MEDIUM:

`@setup → [@briefing → @briefing-refiner] → @product → [@sheldon] → @planner → @dev → @qa`

Briefing/Refiner e Sheldon são opcionais. A classificação muda profundidade e orçamento. Especialistas entram somente por pedido explícito ou necessidade nomeada.

| Agente | O que faz | Saída principal |
|---|---|---|
| **`@product`** | Define visão, escopo e ACs | `prd-{slug}.md` |
| **`@sheldon`** | Enriquece criticamente o mesmo PRD, quando solicitado | `prd-{slug}.md` atualizado |
| **`@planner`** | Cria fases verticais e checks executáveis | `implementation-plan-{slug}.md` |
| **`@analyst`** | Consultoria explícita de domínio | parecer incorporado ao PRD/plano |
| **`@architect`** | Consultoria explícita de arquitetura | decisão incorporada ao PRD/plano |
| **`@ux-ui`** | Consultoria de UI/UX quando solicitada | spec auxiliar |
| **`@pm`** | Consultoria de backlog/priorização | parecer auxiliar |
| **`@orchestrator`** | Coordenação de sessão ou especialistas sob pedido | handoffs e coordenação |
| **`@dev`** | Implementa a feature | Código + `dev-state.md` |
| **`@qa`** | Revisão final proporcional e independente | `qa-report-{slug}.md` |
| **`@validator`** | Verificação binária adicional, opt-in | veredito do harness |
| **`@tester`** | Engenharia sistemática de testes, opt-in | `test-report-{slug}.md` + testes stack-native |
| **`@pentester`** | Revisão adversarial de segurança, opt-in | `security-findings-*.json` |

### 3. Continuidade e entrega

| Agente | O que faz | Quando invocar |
|---|---|---|
| **`@deyvin`** (alias `@pair`) | Pair-programming continuity-first — recupera estado com `confirmed/inferred`, trabalha em batches pequenos validados, scope gate automático (recusa greenfield e devolve para `@product`) | Retomar feature em curso após crash, debugar slice pequena, pair em tarefa já delimitada |
| **`@committer`** | Gera mensagens de commit profissionais | Antes de commitar |
| **`@discover`** | Constrói cache semântico do projeto: produz `bootstrap/` (estruturado por tipo de artefato, para agentes lerem) **e** `brains/` (Zettelkasten para cross-referência) | Onboarding rápido em codebase grande |

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
        ├── qa-report-{slug}.md     ← veredito independente do @qa
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

## Diálogo real — ciclo SMALL completo (lean lane)

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
@product > [...várias perguntas...] PRD criado em context/prd-checkout-stripe.md.
@product > Próximo: @sheldon para enriquecimento opcional, ou @planner.

─── Sessão 2 (no dia seguinte) ───
Você > @neo
@neo > Você parou em @product. O PRD pede enriquecimento; próximo: @sheldon.
Você > @sheldon
@sheldon > [lê PRD, detecta 3 gaps e os incorpora no mesmo arquivo]
@sheldon > PRD pronto. Próximo: @planner.

─── Sessão 3 ───
Você > @planner
@planner > Plano vertical aprovado. Próximo: @dev.
Você > @dev
@dev > [lê PRD e plano, implementa por fases e roda os checks do plano]
@dev > Todas as fases completas. dev-state.md atualizado.
@dev > Próximo: @qa.

Você > @qa
@qa > [runtime smoke gate + 12 ACs verificados. 12/12 passando.]
@qa > Veredicto: feature pronta.
```

---

## Próximo passo

- Quer pôr em prática? → [Primeiro projeto do zero](../2-comecar/primeiro-projeto.md)
- Confuso com algum termo? → [Glossário](./glossario.md)
- Curioso sobre por que tudo isso? → [Por que ele existe](./por-que-existe.md)
