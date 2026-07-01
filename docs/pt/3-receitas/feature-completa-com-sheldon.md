# Receita: Feature completa (lanes SMALL e MEDIUM)

> **Para quem é:** quem quer implementar uma feature de média/alta complexidade com o processo AIOSON v1.35.0.
> **Tempo de execução:** 1–2 horas (SMALL lean) ou 3–8 horas (MEDIUM maestro), distribuídas em 1–4 sessões.
> **O que você vai ter no fim:** feature implementada, testada, auditada e com cada decisão rastreável em disco.

---

## As duas lanes principais

### SMALL — lean lane (padrão)

```
@product → @sheldon → @dev → @qa
```

`@sheldon` é a autoridade única de spec: em uma passada produz requirements + decisões técnicas + plano faseado + harness-contract (Gates A/B/C aprovados), e passa direto para `@dev`. Nenhum hop intermediário de agente de spec.

### MEDIUM — maestro lane

```
@product → @orchestrator → @dev → @pentester → @qa
```

`@orchestrator` é o maestro de spec: faz fan-out para `@analyst` + `@architect` + `@pm` (+ `@ux-ui` quando UI-heavy) como sub-agentes, consolida os artefatos, e entrega o pacote de spec aprovado para `@dev`. `@pentester` é inline (entre `@dev` e `@qa`).

> **Passo a passo ou autopilot?** Esta receita mostra o fluxo **manual** — você invoca cada agente. Mas construir a feature do jeito normal (`@product` → `@sheldon`/`@orchestrator` → `@dev` → `@qa`) também pode rodar **sozinho** até a recomendação de `feature:close`: `@product` pergunta o modo de execução uma vez no handoff do PRD (ou você já decide na hora com `/product --auto`/`/product --step`), e cada agente invoca o próximo automaticamente. Veja [Autopilot Handoff](../5-referencia/autopilot-handoff.md) para a cadeia completa, os tokens inline e as condições de parada. Os passos abaixo continuam valendo — é o que cada agente faz por trás, autopilot ligado ou não.

---

## SMALL lean — passo a passo

### Passo 1 — `@product` define o PRD

```
Você > @product

@product > Qual o slug da feature?
Você > billing-assinatura

@product > Em uma frase, o problema?
Você > Cliente quer assinar plano mensal/anual e gerenciar pagamento

@product > [perguntas guiadas: ACs, fora-de-escopo, dependências]
@product > PRD criado em .aioson/context/prd-billing-assinatura.md
@product > Próximo: @sheldon.
```

**O que ficou:** `prd-billing-assinatura.md` com problema, escopo, ACs e fora-de-escopo.

---

### Passo 2 — `@sheldon` produz o pacote de spec (passo crítico)

Este é o passo que condensa o que antes eram 4–5 hops em um.

```
Você > @sheldon

@sheldon > Lendo prd-billing-assinatura.md...
           Varrendo codebase: models, services, routes...
           
           Gaps detectados:
           1. PRD não trata downgrade de plano (só upgrade)
           2. Sem política de proration na troca de plano
           3. Webhook Stripe sem política de retry/idempotency
           4. Sem ACs para falha de cobrança após 3 tentativas (dunning)
           
           Fontes externas? [URL / arquivo / "não"]

Você > docs.stripe.com/billing/subscriptions/upgrade-downgrade

@sheldon > [pesquisa, lê, cita]
           Enriquecendo PRD in-place...
           Produzindo requirements, architecture, implementation-plan...
           
           Gate A (requisitos verificáveis): ✓
           Gate B (decisões técnicas): ✓
           Gate C (plano faseado + harness-contract): ✓
           
           Pacote de spec:
             .aioson/context/requirements-billing-assinatura.md
             .aioson/context/architecture.md
             .aioson/context/implementation-plan-billing-assinatura.md
             .aioson/context/sheldon-enrichment-billing-assinatura.md
             .aioson/plans/billing-assinatura/harness-contract.json
           
           Próximo: @dev.
```

**Por que rodar `@sheldon`:**
- Ele cruza o PRD com o **código real** e vê o que falta.
- Pode buscar **fontes externas** e citar.
- Decide sozinho entre enriquecer in-place ou criar um phased plan quando o escopo é grande demais.
- Pode ser re-invocado N vezes no mesmo PRD — cada rodada fecha mais gaps.

---

### Passo 3 — `@dev` implementa (loop de fases)

```
Você > @dev

@dev > Lendo pacote de spec do @sheldon.
       implementation-plan: 2 fases.
       
       [Fase 1: core subscription model]
       [implementa...]
       aioson harness:check → verificação por fase → OK
       Compactando contexto...
       
       [Fase 2: webhook + dunning]
       [implementa...]
       aioson harness:check → verificação por fase → OK
       
       dev-state.md atualizado. Todas as fases completas.
       Próximo: @qa.
```

`@dev` auto-continua entre fases, compacta contexto entre elas, e roda verificação leve por fase. Sem "continue?" manual entre fases.

---

### Passo 4 — `@qa` valida e fecha

```
Você > @qa

@qa > 18 ACs identificados. Escrevendo testes...
       [runtime smoke gate: build + migrate + boot + happy-path]
       Smoke: ✓
       18/18 ACs passando.
       
       test-plan.md e qa-report.md gravados.
       Veredicto: feature pronta.
```

**Runtime smoke gate:** `@qa` não fecha sem que build + migrations (aplicadas a um DB real) + boot + Core happy-path passem no stack real. `tsc` + testes unitários é o piso, não o "done".

---

### Passos opcionais pós-QA

```
@tester   → cobertura sistemática extra (legacy, edge cases de timezone/concorrência)
@pentester → revisão adversarial de segurança (dados sensíveis, auth, produção)
@validator → verificação contra harness-contract em contexto isolado
@committer → commit final com mensagem profissional
```

---

## MEDIUM maestro — passo a passo

### Passo 1 — `@product` define o PRD (igual ao SMALL)

### Passo 2 — `@sheldon` endurece o PRD (opcional, recomendado)

Se o PRD tem decisões difíceis (billing por uso vs. por assento, multi-tenant vs. single-tenant, auth externa), rode `@sheldon` antes de `@orchestrator` para fechar gaps antes do fan-out.

### Passo 3 — `@orchestrator` produz o pacote de spec

```
Você > @orchestrator

@orchestrator > Classificação MEDIUM confirmada.
                Lendo prd-mvp.md...
                
                Fan-out de spec:
                ├── @analyst   → mapeamento de domínio e entidades
                ├── @architect → estrutura técnica, libs, integração
                └── @pm        → backlog, user stories, plano de implementação
                (+ @ux-ui — feature tem UI pesada)
                
                [sub-agentes executados]
                
                Consolidando e verificando consistência...
                Gates A/B/C aprovados.
                
                Pacote de spec:
                  requirements-mvp.md · architecture.md
                  design-doc-mvp.md · implementation-plan-mvp.md
                  parallel/harness-contract.json
                
                Lanes de execução criadas (3 lanes paralelizáveis):
                  parallel/lane-backend.md
                  parallel/lane-ui.md
                  parallel/lane-migration.md
                
                Próximo: @dev.
```

### Passo 4 — `@dev` implementa (por lane ou sequencial)

```
Você > @dev

@dev > Lendo pacote de spec e lane-backend.md...
       [implementa lane por fase]
       Próximo: @pentester.
```

### Passo 5 — `@pentester` (inline no MEDIUM)

```
Você > @pentester

@pentester > [mapeia superfícies de ataque, gera findings]
@pentester > HIGH: webhook sem validação de signature
@pentester > Passando para @dev corrigir...
@dev > [corrige]
@pentester > HIGH=0. security-findings gravado.
             Próximo: @qa.
```

### Passo 6 — `@qa` valida e fecha (igual ao SMALL)

---

## O que ficou em disco

### SMALL

```
.aioson/context/
├── prd-billing-assinatura.md           ← @product + @sheldon (enriquecido)
├── sheldon-enrichment-billing.md       ← @sheldon (histórico)
├── requirements-billing-assinatura.md  ← @sheldon
├── architecture.md                     ← @sheldon
├── implementation-plan-billing.md      ← @sheldon
├── dev-state.md                        ← @dev
├── test-plan.md                        ← @qa
└── qa-report-billing-assinatura.md     ← @qa

.aioson/plans/billing-assinatura/
├── harness-contract.json               ← @sheldon
└── progress.json                       ← @dev (status)
```

### MEDIUM

```
.aioson/context/
├── prd-mvp.md                          ← @product
├── requirements-mvp.md                 ← @analyst via @orchestrator
├── architecture.md                     ← @architect via @orchestrator
├── design-doc-mvp.md                   ← @ux-ui via @orchestrator
├── implementation-plan-mvp.md          ← @pm via @orchestrator
├── parallel/
│   ├── lane-backend.md                 ← @orchestrator
│   ├── lane-ui.md
│   ├── lane-migration.md
│   └── harness-contract.json
├── dev-state.md                        ← @dev
├── security-findings-mvp.json          ← @pentester
├── test-plan.md                        ← @qa
└── qa-report-mvp.md                    ← @qa
```

---

## Variações e escape hatches

| Situação | O que fazer |
|---|---|
| **MICRO** (escopo pequeno, CRUD simples) | `@product → @dev → @qa`. Pule `@sheldon` e `@orchestrator`. |
| **SMALL com UI complexa** | Rode `@ux-ui` como detour após `@sheldon` antes de `@dev`. |
| **SMALL com decisões de domínio pesadas** | Rode `@analyst` como detour para discovery mais profundo antes de `@sheldon`. |
| **MEDIUM, você quer gerenciar a spec manualmente** | `@product → @analyst → @architect → @ux-ui → @pm → @orchestrator (lanes only) → @dev → @pentester → @qa` — o "escape hatch" full-merged. |
| **Sessão caiu no meio do `@dev`** | `@deyvin` retoma. Ver [Continuidade entre sessões](./continuidade-entre-sessoes.md). |
| **`@sheldon` reclama que PRD está vago** | Volte ao `@product` e refine. `@sheldon` não inventa o que não está claro. |
| **Ciclo `@qa ↔ @dev` estourou cap 3** | Há defeito de design. Volte ao `@sheldon` (SMALL) ou `@orchestrator` (MEDIUM) antes de mais código. |
| **`@pentester` HIGH não baixa** | Não force. Documente como risco aceito ou adie a feature. |

---

## Quando NÃO usar esta receita

- **Bugfix pontual** — vá direto para `@dev` (com referência ao bug ID) e `@qa`.
- **Refatoração sem mudança de comportamento** — use [Refatoração grande](./refatoracao-grande.md).
- **Feature MICRO sem regra de negócio nova** — overhead não compensa.

---

## Próximo passo

- [SDD: planos e estrutura](../5-referencia/sdd-planos-e-estrutura.md) — mapa de todos os artefatos
- [Da ideia ao PRD via @briefing](./da-ideia-ao-prd-via-briefing.md) — quando a ideia ainda é vaga
- [Plans externos para @product](./plans-externos-para-product.md) — quando você já planejou em outro chat
- [Continuidade entre sessões](./continuidade-entre-sessoes.md) — para retomar a receita em outra sessão
- [Mapa do ecossistema](../1-entender/mapa-do-ecossistema.md) — visão de todos os agentes
