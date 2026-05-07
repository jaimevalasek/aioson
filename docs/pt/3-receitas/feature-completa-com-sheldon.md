# Receita: Feature completa com `@sheldon` (trilha canônica)

> **Para quem é:** features de média/alta complexidade onde decisões erradas no início custam caro.
> **Tempo de execução:** 2 a 8 horas (varia com escopo), distribuídas em 1–4 sessões.
> **O que você vai ter no fim:** feature implementada, testada, auditada em segurança, e revisada de ponta a ponta — com cada decisão rastreável em disco.
> **Status:** esta é a trilha que o criador do AIOSON usa por padrão para projetos SMALL/MEDIUM com implementação significativa.

---

## A trilha em uma linha

```
@product → @sheldon → @analyst → @architect → @ux-ui → @pm → @orchestrator → @dev
                                                              │
                                              (@qa ↔ @dev)  ← ciclo autônomo
                                                              │
                              opcional: @tester → (@qa ↔ @dev) ← cobertura extra
                                                              │
                              opcional: @pentester ↔ @dev    ← segurança
                                                              │
                                              @qa (revisão final geral)
```

**Por que essa ordem importa:** cada agente lê os artefatos do anterior. Pular um agente significa o próximo improvisar — e improviso em decisões grandes vira retrabalho.

---

## Cenário

Você vai construir uma feature relevante — exemplos típicos: **billing por assinatura com Stripe**, **dashboard do vendedor num marketplace**, **cancelamento de pedido com regras de janela**. Algo que mistura backend + UI + regras de negócio + integração externa.

Se a feature é trivial (CRUD simples sem regra), pule para a [Receita Landing Page](./landing-page.md) ou [App SaaS do zero](./app-saas-do-zero.md). Esta trilha é desenho de canhão; não atire em pardal.

## Pré-requisitos

- Projeto com `aioson init/install` rodado
- `project.context.md` populado (`@setup` já feito)
- Classificação **SMALL** ou **MEDIUM**
- Cliente AI aberto no projeto

---

## Passo 1 — `@product` define o PRD

```
Você > @product

@product > Vamos definir uma feature. Qual o slug?
Você > billing-assinatura

@product > Em uma frase, o problema?
Você > Cliente quer assinar plano mensal/anual e gerenciar pagamento

@product > [perguntas guiadas: ACs, fora-de-escopo, dependências, limites de SLA]
@product > PRD criado em .aioson/context/prd.md (e cópia em features/billing-assinatura/spec.md).
@product > Próximo: @sheldon para validar e enriquecer antes de descer pro técnico.
```

**O que ficou:** `prd.md` com seções claras (problema, escopo, ACs, fora-de-escopo).

> **Variação:** se você já tem material em `/plans/` ou um briefing aprovado, `@product` detecta e oferece para usar como base. Veja [Plans externos para @product](./plans-externos-para-product.md) e [Da ideia ao PRD via @briefing](./da-ideia-ao-prd-via-briefing.md).

---

## Passo 2 — `@sheldon` enriquece o PRD (passo crítico)

Esse é o passo que mais gente pula — e é onde o AIOSON ganha espessura.

```
Você > @sheldon

@sheldon > Lendo prd.md... varrendo .aioson/context/architecture.md, dependencies, plans/.
@sheldon > Detectei 4 gaps:
        1. PRD não trata downgrade de plano (só upgrade)
        2. Não há decisão sobre cobrança proporcional (proration)
        3. Webhook do Stripe sem política de retry/idempotency
        4. Sem ACs para falha de cobrança após 3 tentativas (dunning)

@sheldon > Tem fontes externas? [URL, arquivo local, "não"]
Você > docs.stripe.com/billing/subscriptions/upgrade-downgrade

@sheldon > [pesquisa, lê, cita]
@sheldon > Recomendação:
        - Enriquecer o PRD in-place (gaps 1, 2 são decisão de produto)
        - Criar phased plan em .aioson/plans/billing-assinatura/ para
          implementação faseada de webhook+dunning (gaps 3, 4)

@sheldon > Aplicando enrichment... prd.md atualizado.
@sheldon > Phased plan: .aioson/plans/billing-assinatura/{phase-1.md, phase-2.md, harness-contract.json}
@sheldon > Próximo: @analyst.
```

**Por que rodar `@sheldon`:**
- Ele consulta o **código real do projeto** e cruza com o PRD — vê o que falta.
- Pode buscar **fontes externas** (Stripe docs, RFCs, posts técnicos) e **citar**.
- Decide entre **enriquecer in-place** (mexer no `prd.md`) ou **criar phased plan** quando o escopo é grande demais para uma única implementação.

**Pode rodar múltiplas vezes:** se a primeira passada deixou gaps, você invoca `@sheldon` de novo. Ele detecta `sheldon-enrichment.md` existente e oferece nova rodada de enriquecimento sem refazer do zero.

> **Quando NÃO rodar `@sheldon`:** features triviais (CRUD básico) ou MICRO. O esforço de enriquecimento não compensa.

---

## Passo 3 — `@analyst` mapeia o domínio

```
Você > @analyst

@analyst > Lendo prd.md enriquecido + code base.
@analyst > Entidades: Subscription, Plan, Invoice, PaymentMethod, DunningAttempt.
        Já existem no código: Customer, Order. Vou estender.
@analyst > Domain map gravado em architecture.md (seção domain).
@analyst > Próximo: @architect.
```

## Passo 4 — `@architect` decide a estrutura técnica

```
Você > @architect

@architect > Decisões:
        - Stripe Customer Portal para self-service (reduz UI custom)
        - Webhook handler em rota dedicada com idempotency key
        - Cron diário de dunning (3 tentativas, intervalos 1d/3d/7d)
        - Migração: tabela subscriptions com FK em customers
@architect > Decisões em architecture.md (seção decisions).
@architect > Próximo: @ux-ui.
```

## Passo 5 — `@ux-ui` desenha a UI

```
Você > @ux-ui

@ux-ui > Lendo architecture e PRD. Stack confirmado: React + design skill atual.
@ux-ui > Componentes:
        - PlanSelector (3 cards: Free, Pro, Enterprise)
        - BillingPortal (link para Stripe Portal)
        - InvoiceList
        - DunningBanner (alerta de cobrança falhada)
@ux-ui > Specs em design-doc.md. Próximo: @pm.
```

> Em projetos **SMALL** sem `@ux-ui` no fluxo, pule este passo.

## Passo 6 — `@pm` quebra em user stories

```
Você > @pm

@pm > 7 user stories identificadas, agrupadas em 3 epics.
        Cada uma com ACs verificáveis (ex: "POST /subscriptions/upgrade
        retorna 200 e seta proration_amount > 0").
@pm > tasks.md gravado.
@pm > Próximo: @orchestrator.
```

## Passo 7 — `@orchestrator` define lanes paralelas

```
Você > @orchestrator

@orchestrator > Identifiquei 3 lanes paralelizáveis:
        - lane-backend.md (rotas + webhook + cron)
        - lane-ui.md (4 componentes + integração)
        - lane-migration.md (DB schema + seeds de teste)
@orchestrator > Dependência: lane-ui depende de lane-backend para o contrato de API.
@orchestrator > parallel/ gravado. harness-contract.json criado.
@orchestrator > Próximo: @dev (pode tocar lanes em sessões separadas).
```

> Em projetos **SMALL**, pule `@orchestrator` — não há lanes paralelas que valham o overhead.

## Passo 8 — `@dev` implementa

```
Você > @dev

@dev > Lendo plano completo. Vou começar pela lane-backend (sem dependência).
@dev > [implementa] Lane-backend done. dev-state.md atualizado.
@dev > Próximo: rodar @qa para esta lane antes de continuar para lane-ui.
```

> O `@dev` é **resumível**. Se a sessão cair no meio, na próxima sessão `@deyvin` lê `dev-state.md` e continua exatamente de onde parou. Veja [Continuidade entre sessões](./continuidade-entre-sessoes.md).

## Passo 9 — Ciclo `@qa ↔ @dev` (automático, cap 2)

```
Você > @qa

@qa > 18 ACs identificados. Escrevendo testes...
@qa > Falha em AC-12 (proration calculation).
        Iteração 1/2 — passando para @dev autonomamente.
@dev > [corrige cálculo, rebatiza variável misleading]
@qa > Re-rodando... 18/18 OK.
@qa > test-plan.md e qa-report.md gravados.
```

**Cap 2** significa: o ciclo autônomo só corre 2 iterações. Se ainda assim falhar, o `@qa` para e te chama para revisão humana — evita loops infinitos.

---

## Passo 10 (opcional) — `@tester` para cobertura sistemática

Quando ativar:
- Você sabe que a feature vai ter alta carga e quer **mais cobertura** que apenas os ACs do PRD.
- Suspeita de **edge cases** que `@qa` não cobriu (timezones, concorrência, locales).
- O projeto é legacy e a feature toca código sem testes.

```
Você > @tester

@tester > Lendo qa-report. Coverage atual: 78%. Quality tier: MÉDIO.
@tester > Identifiquei 3 zonas com test smell:
        - Tests acoplados a fixtures frágeis (3 testes)
        - 2 testes só verificam "não throw" (não checam comportamento)
        - Falta cobertura de proration em edge dates (29-30-31 do mês)
@tester > Plano de teste adicional gravado em test-inventory.md.
@tester > Próximo: rodar @qa de novo para implementar os testes faltantes.
```

Depois do `@tester`, **rode `@qa` novamente** — ciclo `@qa ↔ @dev` se repete sobre os novos testes.

## Passo 11 (opcional) — `@pentester ↔ @dev` para segurança

Quando ativar:
- Feature toca dados sensíveis (pagamento, PII, auth).
- Vai entrar em produção.
- Há requisito regulatório.

```
Você > @pentester

@pentester > Mapeando superfícies de ataque (OWASP + supply chain + tooling).
@pentester > Findings:
        - HIGH: webhook Stripe sem validação de signature em modo dev
        - MEDIUM: rota /billing/portal sem rate-limit
        - LOW: log inclui email do cliente em texto

@pentester > Iteração 1 — passando para @dev corrigir.
@dev > [corrige signature validation, adiciona rate-limit, redação de log]
@pentester > Re-varredura: HIGH=0, MEDIUM=0, LOW=1 (aceito como risco baixo).
@pentester > security-findings-billing-assinatura.json gravado.
```

## Passo 12 — `@qa` final, revisão geral

Depois de tudo (tester e pentester), rode `@qa` mais uma vez:

```
Você > @qa

@qa > Revisão geral pós-pentester e pós-tester.
@qa > 18 ACs originais + 9 testes adicionais (de @tester) + 3 testes de regressão
        de segurança (de @pentester). Total: 30 testes. Todos passando.
@qa > Veredicto: feature pronta. Recomendado @validator antes de fechar.
```

Opcional: rodar `@validator` para checagem do contrato de sucesso, e `@committer` para commit final.

---

## O que ficou em disco (rastreio completo)

```
.aioson/context/
├── prd.md                          ← @product
├── sheldon-enrichment.md           ← @sheldon (rodadas múltiplas)
├── architecture.md                 ← @analyst + @architect
├── design-doc.md                   ← @ux-ui
├── tasks.md                        ← @pm
├── parallel/
│   ├── lane-backend.md             ← @orchestrator
│   ├── lane-ui.md
│   └── lane-migration.md
├── dev-state.md                    ← @dev (atualizado a cada sessão)
├── test-plan.md                    ← @qa
├── qa-report-billing-assinatura.md ← @qa
├── test-inventory.md               ← @tester
├── security-findings-billing-assinatura.json ← @pentester
└── features/billing-assinatura/
    ├── spec.md
    └── done/                       ← arquivado pelo feature:close

.aioson/plans/billing-assinatura/
├── phase-1.md                      ← @sheldon (phased plan)
├── phase-2.md
├── harness-contract.json           ← contrato de sucesso
└── progress.json                   ← status corrente
```

Daqui a 6 meses, qualquer pessoa (ou IA) lê esses arquivos e entende **tudo**: o que foi pensado, por quê, o que foi implementado, o que foi descartado.

---

## Variações da trilha

### MICRO (escopo pequeno)
`@product → @dev → @qa`. Pule `@sheldon`, `@analyst`, `@architect`, `@ux-ui`, `@pm`, `@orchestrator`. A Constitution Article II (*Right-Sized Process*) protege você de cerimônia desnecessária.

### SMALL sem UI
`@product → @sheldon → @analyst → @architect → @dev → @qa`. Pule `@ux-ui`, `@pm`, `@orchestrator`.

### MEDIUM puro
A trilha completa acima.

### Quando você só vai implementar a Lane 1 hoje
Vá até `@orchestrator`, depois invoque `@dev` apenas para `lane-backend.md`. Pause antes do `@qa`. Próxima sessão: `@deyvin` retoma na lane que ficou pendente.

---

## Solução de problemas

| Problema | Solução |
|---|---|
| `@sheldon` reclama que PRD está vago | Volte para `@product` e refine. `@sheldon` não inventa o que não está claro. |
| `@orchestrator` cria 1 lane só | Sua feature provavelmente é SMALL disfarçado. Pule lanes paralelas. |
| Ciclo `@qa ↔ @dev` estourou cap 2 | Há defeito de design. Volte ao `@architect` ou `@product` antes de mais código. |
| `@pentester` HIGH não baixa | Não force. Documente como risco aceito ou adie a feature. |
| Sessão caiu no meio do `@dev` | `@deyvin` retoma. Ver [Continuidade entre sessões](./continuidade-entre-sessoes.md). |

---

## Quando NÃO usar esta trilha

- **Bugfix pontual** — vá direto para `@dev` (com referência ao bug ID) e `@qa`.
- **Refatoração sem mudança de comportamento** — use [Refatoração grande](./refatoracao-grande.md).
- **Feature MICRO sem regra de negócio nova** — overhead não compensa.

---

## Próximo passo

- [SDD: planos e estrutura](../5-referencia/sdd-planos-e-estrutura.md) — entenda a fundo a estrutura que `@pm` e `@orchestrator` criam
- [Da ideia ao PRD via @briefing](./da-ideia-ao-prd-via-briefing.md) — quando a ideia ainda é vaga
- [Plans externos para @product](./plans-externos-para-product.md) — quando você já planejou em outro chat
- [Continuidade entre sessões](./continuidade-entre-sessoes.md) — para retomar a trilha em outra sessão
- [Mapa do ecossistema](../1-entender/mapa-do-ecossistema.md) — visão de todos os agentes
