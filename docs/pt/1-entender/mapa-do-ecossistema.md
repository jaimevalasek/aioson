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
        │  Product → Sheldon → Analyst →       │
        │  Architect → UX-UI → PM →            │
        │  Orchestrator → Dev → QA →           │
        │  Validator → Tester → Pentester      │
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

A ordem padrão depende da classificação (v1.35.0):

**MICRO:** `@setup → @product → @dev → @qa`
**SMALL (lean — padrão):** `@setup → @product → @sheldon → @dev → @qa`
**MEDIUM (maestro):** `@setup → @product → @orchestrator → @dev → @pentester → @qa`

> **Por que `@sheldon` substitui toda a cadeia de spec no SMALL?** Ele é a **autoridade única de spec**: em uma passada vertical produz requirements + decisões técnicas + design-doc + readiness + plano de implementação + harness-contract (Gates A/B/C aprovados). `@analyst`, `@architect`, `@scope-check` e outros viram **detours opt-in**, não hops padrão.

> **Por que `@orchestrator` substitui a cadeia longa no MEDIUM?** Ele é o **maestro de spec**: faz fan-out para `@analyst`, `@architect`, `@pm` (+ `@ux-ui` quando UI-heavy) como sub-agentes, consolida e verifica os artefatos. Mesma qualidade, menos hops manuais.

| Agente | O que faz | Saída principal |
|---|---|---|
| **`@product`** | Define visão, escopo, PRD da feature | `prd.md`, `spec.md` |
| **`@sheldon`** | **SMALL:** autoridade única de spec (vertical/solo) — produz requirements + decisões técnicas + plano + harness-contract (Gates A/B/C) em uma passada. **Qualquer lane:** gap analysis, pesquisa web, endurecimento de PRD. | `sheldon-enrichment-{slug}.md`, `requirements-{slug}.md`, `implementation-plan-{slug}.md`, `harness-contract.json` |
| **`@analyst`** | Discovery de domínio: entidades, fluxos, regras de negócio. **MEDIUM:** sub-agente do `@orchestrator`. **Qualquer tamanho:** detour opt-in. | `requirements-{slug}.md`, ER diagrams |
| **`@architect`** | Decisões técnicas: estrutura, libs, integração. **Merged mode:** também produz design-doc + readiness quando `@discovery-design-doc` não está no fluxo. **MEDIUM:** sub-agente do `@orchestrator`. **Qualquer tamanho:** detour opt-in. | `architecture.md` |
| **`@ux-ui`** | Spec de UI/UX e componentes. **MEDIUM com UI pesada:** sub-agente do `@orchestrator`. **Qualquer tamanho:** detour opt-in. | `design-doc.md` |
| **`@pm`** | Backlog, user stories, plano de implementação. **MEDIUM:** sub-agente do `@orchestrator`. **Qualquer tamanho:** detour opt-in. | `tasks.md`, `implementation-plan-{slug}.md` |
| **`@orchestrator`** | **MEDIUM:** maestro de spec (faz fan-out para @analyst/@architect/@pm/@ux-ui, consolida e verifica, entrega pacote de spec com Gates A/B/C). Também coordena lanes paralelas de implementação pós-spec. | `parallel/`, `implementation-plan-{slug}.md`, `harness-contract.json` |
| **`@dev`** | Implementa a feature | Código + `dev-state.md` |
| **`@qa`** | Escreve testes, valida ACs, ciclo autônomo de correção (cap 2) | `test-plan.md`, `qa-report-*.md` |
| **`@validator`** | Valida tecnicamente contra `harness-contract.json` em sandbox de contexto | `.aioson/plans/{slug}/last-validator-output.json` (consumido por `harness:apply-validation`, atualiza `progress.json`) |
| **`@tester`** | Engenharia sistemática de testes (legacy/brownfield) | `test-inventory.md`, coverage tier |
| **`@pentester`** | Revisão adversarial de segurança (OWASP, LLM Top 10) | `security-findings-*.json` |

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
@product > Próximo: @sheldon para produzir o pacote de spec.

─── Sessão 2 (no dia seguinte) ───
Você > @neo
@neo > Você parou em @product. Próximo: @sheldon.
Você > @sheldon
@sheldon > [lê PRD, varre codebase, detecta 3 gaps, pesquisa fontes] Gates A/B/C aprovados.
           Pacote de spec: requirements + architecture + implementation-plan + harness-contract.
@sheldon > Próximo: @dev.

─── Sessão 3 ───
Você > @dev
@dev > [lê pacote de spec, implementa por fases com auto-continue, verifica por fase]
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
