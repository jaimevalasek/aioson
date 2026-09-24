# Mapa do ecossistema AIOSON

> **Para quem é:** quem quer ver o time inteiro de uma vez.
> **Tempo de leitura:** 8 min.
> **O que você vai sair sabendo:** qual é a esteira principal, quem são os 34 agentes, quando cada um entra, e como eles se conversam.

---

## A esteira principal

Esta é a cadeia que constrói feature. Ela é a mesma em MICRO, SMALL e MEDIUM — a classificação muda profundidade, orçamento e cobertura de risco, **não** a ordem.

```
   ┌──────────────────────────── ciclo infinito de features ────────────────────────────┐
   │                                                                                    │
   │   DEFINIÇÃO            PRODUTO           PLANO      CONSTRUÇÃO    VERIFICAÇÃO      │
   │  ┌──────────┐       ┌──────────┐      ┌────────┐   ┌────────┐  ┌──────────────┐   │
   │  │ @briefing│──────▶│ @product │─────▶│@planner│──▶│  @dev  │─▶│     @qa      │   │
   │  │    ↓     │       │    ↓     │      └────────┘   └────────┘  │      ↓       │   │
   │  │@briefing-│       │ @sheldon │                                │   @tester    │   │
   │  │ refiner  │       │          │                                │      ↓       │   │
   │  └──────────┘       └──────────┘                                │  @pentester  │   │
   │       │                                                          └──────────────┘   │
   │       │ protótipo aprovado por você                                     │           │
   │       └──────────────────────────────────────────────────────────────────┘          │
   │                                    feature:close → próxima feature                  │
   └────────────────────────────────────────────────────────────────────────────────────┘
```

Em uma linha:

```text
@briefing → @refiner → @product → @sheldon → @planner → @dev → @qa → @tester → @pentester
```

### O que cada fase entrega

| # | Fase | Agente | Papel | Prova de que terminou |
|---|---|---|---|---|
| 1 | **Briefing** | `@briefing` | Autoridade de pré-produção | Briefing redigido: fontes com caminho, promessas numeradas `PROM-*`, dúvida declarada |
| 2 | **Refiner** | `@refiner` | Evidência antes da definição | **Protótipo navegável aprovado por você** — telas, estados e interações reais |
| 3 | **Product** | `@product` | Autoridade de produto | `prd-{slug}.md`: capacidades `CAP-*`, critérios observáveis, exclusões explícitas |
| 4 | **Sheldon** | `@sheldon` | Revisão técnica do PRD | PRD enriquecido e selado (`sheldon_review: approved`, PASS vinculado ao hash) |
| 5 | **Planner** | `@planner` | Execução mapeada | `implementation-plan-{slug}.md`: etapas verticais, arquivos exatos, check por etapa |
| 6 | **Dev** | `@dev` | Implementação do plano | Feature executando pela rota real de produção + `dev-state.md` |
| 7 | **QA** | `@qa` | Revisão e veredito independente | `qa-report-{slug}.md` com PASS/FAIL e evidência por CAP/AC |
| 8 | **Tester** | `@tester` | Engenharia de testes | `test-report-{slug}.md`: regressão, borda e defeito reproduzido antes da correção |
| 9 | **Pentester** | `@pentester` | Ataque autorizado | `security-findings-*.json`: superfície sondada, corrigida e re-sondada |

### Onde o automático para

O encadeamento automático (Autopilot) vai de **Product até QA**. Aí ele para:

- **Gate D é o QA.** O PASS do `@qa` é o que declara a feature pronta.
- **`@tester` e `@pentester` são o endurecimento pós-veredito.** Vêm depois, são habilitados por feature, e nunca substituem o Gate D.
- **`feature:close` e publicação são sempre seus.** Nenhum agente fecha ou publica feature sozinho.
- **Briefing e Refiner são a entrada de fonte crua.** Se a direção já está clara, comece direto no `@product`. Mas se começar o Briefing, tem que terminar: um briefing pela metade não vira PRD. Escopo visual/rico exige o protótipo aprovado antes do Product.

### A rota curta: Simple Plan

Nem toda mudança merece a esteira inteira. Quando a intenção já está clara e a mudança cabe em fronteiras existentes, o AIOSON usa a rota curta — quatro passos, um agente:

| # | Fase | Agente | Prova de que terminou |
|---|---|---|---|
| 1 | **Escopo** | `@dev` | Escopo pequeno confirmado: sem decisão de produto, arquitetura ou segurança em aberto |
| 2 | **Plano curto** | `@dev` | Plano mínimo em disco: delta exato, checks escolhidos, rota reversível |
| 3 | **Implementação** | `@dev` | Menor fatia útil implementada, escopo não inflou |
| 4 | **Verificação** | `@dev` + `@qa` | Check final registrado — se o escopo crescer, a rota escala para a esteira completa |

Simple Plan termina no Dev e não vira feature rastreada silenciosamente. Abaixo dele, uma correção direta (até 2 arquivos de comportamento, sem decisão aberta, verificação conhecida) nem cria arquivo de plano.

### Os desvios opt-in

`@orchestrator`, `@validator`, `@forge-run` e `@shakedown` **não são etapas da esteira**. São consultorias para uma dúvida nomeada e concreta — você pede, eles respondem, o parecer volta para o PRD ou para o plano. Nenhum deles cria um documento obrigatório ou um gate extra.

> Se você viu um tutorial antigo do AIOSON com `@product → @analyst → @architect → @dev`, ele está desatualizado. Esses agentes foram aposentados e absorvidos pela esteira: `@analyst` → `@product` (regras de domínio); `@architect`, `@discovery-design-doc` e `@pm` → `@planner` (decisões de arquitetura, mapa de código, sequenciamento); `@ux-ui` → `@refiner`/protótipo (visual), `@product` (interação), `@qa` (acessibilidade) e `@dev` (entrega de sites); `@scope-check` → `@qa` e o gate de scope drift do `workflow:next`; `@deyvin`/`@pair` → `@dev`.

---

## Os agentes, agrupados por papel

### 1. Boot e roteamento

| Agente | O que faz | Quando invocar |
|---|---|---|
| **`@setup`** | Onboarding do projeto: detecta stack, classifica MICRO/SMALL/MEDIUM, escreve `project.context.md` | Sempre primeiro num projeto novo |
| **`@neo`** | Olha o estado e sugere o próximo agente | Quando você não sabe o que fazer agora |

### 2. A esteira principal

| Agente | O que faz | Saída principal |
|---|---|---|
| **`@briefing`** | Transforma fontes cruas em briefing pré-PRD, com promessas rastreáveis | `briefing.md` |
| **`@refiner`** | Audita lacunas e monta o protótipo navegável para você aprovar | `prototype.html`, `refinement-report.md` |
| **`@product`** | Define capacidades, ACs, regras de domínio, decisões de interação e o que fica fora | `prd-{slug}.md` |
| **`@sheldon`** | Confronta o PRD com fonte, protótipo e repositório; corrige e sela | `prd-{slug}.md` selado |
| **`@planner`** | Mapeia o repositório, registra decisões de arquitetura e corta a entrega em etapas verticais sequenciadas | `implementation-plan-{slug}.md` |
| **`@dev`** | Implementa etapa por etapa pela rota real do produto; também Simple Plan, correções pequenas, continuidade e sub-task scout | Código + `dev-state.md` |
| **`@qa`** | Veredito independente contra o PRD, com evidência, scope drift e acessibilidade | `qa-report-{slug}.md` |
| **`@tester`** | Cobertura que protege o comportamento já aprovado | `test-report-{slug}.md` + testes stack-native |
| **`@pentester`** | Sonda a superfície como adversário autorizado, corrige e re-sonda | `security-findings-*.json` |

### 3. Consultorias opt-in

| Agente | Para qual dúvida nomeada |
|---|---|
| **`@orchestrator`** | Coordenação de execução genuinamente paralela ou cross-cutting |
| **`@validator`** | Verificação binária extra contra o contrato de sucesso |
| **`@shakedown`** | "O que está faltando que ninguém pensou em pedir?" — pente-fino pós-entrega, cego para a spec na primeira passada |

### 4. Continuidade e entrega

| Agente | O que faz | Quando invocar |
|---|---|---|
| **`@committer`** | Gera mensagens de commit profissionais | Antes de commitar |
| **`@discover`** | Constrói cache semântico do projeto: produz `bootstrap/` (estruturado por tipo de artefato, para agentes lerem) **e** `brains/` (Zettelkasten para cross-referência) | Onboarding rápido em codebase grande |

### 5. Especializações

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
| **`@forge-run`** | Lane B opt-in: compila e roda o harness de verificação de uma feature MEDIUM |
| **`@benchmark`** | Orquestra a travessia medida de um prompt congelado: joguinho de uma tela via `@refiner`, app real via cadeia completa em Autopilot |

---

## Como os agentes "conversam"

Eles **não conversam diretamente entre si**. Eles conversam **através de artefatos** em disco. Esse é o coração da arquitetura.

```
@briefing ──escreve──▶ briefing.md ──lê──▶ @refiner
                                                  │
                                                  ▼ escreve
                                          prototype.html  ◀── você aprova
                                                  │
                                                  ▼ lê
@product ──escreve──▶ prd-{slug}.md ──lê/edita──▶ @sheldon ──sela──▶ prd-{slug}.md
                                                                          │
                                                                          ▼ lê
                                        @planner ──escreve──▶ implementation-plan-{slug}.md
                                                                          │
                                                                          ▼ lê
                                                 @dev ──escreve──▶ código + dev-state.md
                                                                          │
                                                                          ▼ lê
                                                  @qa ──escreve──▶ qa-report-{slug}.md
                                                                          │
                                                     ┌────────────────────┤
                                                     ▼                    ▼
                                    @tester ─▶ test-report-{slug}.md   @pentester ─▶ security-findings-*.json
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
        ├── features/<slug>/        ← features em desenvolvimento
        │   ├── briefing.md         ← saída de @briefing
        │   ├── prototype.html      ← protótipo aprovado (@refiner)
        │   ├── prd-<slug>.md       ← saída de @product, selada por @sheldon
        │   └── implementation-plan-<slug>.md  ← saída de @planner
        ├── dev-state.md            ← saída de @dev (status atual)
        ├── qa-report-<slug>.md     ← veredito independente do @qa
        ├── test-report-<slug>.md   ← saída de @tester
        ├── security-findings-*.json ← saída de @pentester
        ├── handoff-protocol.json   ← último handoff entre agentes
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
> Próximo passo natural: @qa para o veredito independente da feature.
> Depois do PASS, se quiser endurecer: @tester (cobertura) ou @pentester (segurança).
> Se quiser retomar uma fatia pequena antes: @dev.
```

---

## Diálogo real — feature completa pela esteira

```
─── Sessão 1 ───
Você > @setup
@setup > Detectei Node.js + Express + Postgres. Tipo de projeto? [api/web_app/site/...]
Você > web_app
@setup > Quantos tipos de usuário? Quantas integrações externas?
Você > 2 / 3
@setup > Classificado como SMALL. Idioma de interação? [en/pt-BR/es/fr]
Você > pt-BR
@setup > project.context.md criado. Próximo: @product (ou @briefing, se a ideia ainda está crua).

─── Sessão 1 (continua) ───
Você > @product
@product > Vamos começar uma feature. Como ela se chama? Qual o problema?
Você > "checkout-stripe", finalizar pedido com cartão.
@product > [...várias perguntas...] PRD criado em context/features/checkout-stripe/prd-checkout-stripe.md
           com 4 capacidades CAP-* e ACs observáveis.
@product > Próximo: @sheldon para a revisão independente antes do @planner.

─── Sessão 2 (no dia seguinte) ───
Você > @neo
@neo > Você parou em @product. O PRD ainda não tem PASS selado; próximo: @sheldon.
Você > @sheldon
@sheldon > [confronta o PRD com as fontes e o código real, corrige 3 lacunas no próprio arquivo]
@sheldon > sheldon_review: approved, PASS vinculado ao hash atual. Próximo: @planner.

─── Sessão 3 ───
Você > @planner
@planner > Plano vertical com 4 etapas, arquivos e checks nomeados. Gate C aprovado. Próximo: @dev.
Você > @dev
@dev > [implementa etapa a etapa pela rota real, roda os checks do plano]
@dev > Todas as etapas completas. dev-state.md atualizado. Próximo: @qa.

Você > @qa
@qa > [smoke gate no caminho de produção + 12 ACs verificados. 12/12 passando.]
@qa > Veredito: PASS. Rode `aioson feature:close` quando quiser fechar.

─── Sessão 4 (endurecimento, opcional) ───
Você > @tester
@tester > Cobertura de regressão nos 3 caminhos de risco + defeito de borda reproduzido.
Você > @pentester
@pentester > Superfície sondada no escopo autorizado. 1 finding corrigido e re-sondado.
```

---

## Próximo passo

- Quer pôr em prática? → [Primeiro projeto do zero](../2-comecar/primeiro-projeto.md)
- Ficha detalhada de cada agente → [Guia de agentes](../4-agentes/README.md)
- Confuso com algum termo? → [Glossário](./glossario.md)
- Curioso sobre por que tudo isso? → [Por que ele existe](./por-que-existe.md)
