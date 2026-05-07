# Receita: App SaaS do zero (classificação MEDIUM)

> **Para quem é:** desenvolvedor ou time montando um SaaS com auth, billing e painel admin.
> **Tempo de execução:** 2–4 horas (processo distribuído em múltiplas sessões).
> **O que você vai ter no fim:** SaaS funcional com autenticação, planos de assinatura via Stripe, painel de admin, testes e artefatos completos de spec/arquitetura/QA.

---

## Cenário

Você quer construir um SaaS: usuários se cadastram, escolhem um plano pago (Stripe), e acessam um painel com as funcionalidades. Tem também um admin para gerenciar usuários e assinaturas.

Isso é um projeto **MEDIUM** (3 tipos de usuário: visitante, subscriber, admin — e integrações externas: Stripe, email). O AIOSON aplica o workflow completo, incluindo `@orchestrator` para coordenar lanes paralelas, o que permite que backend e frontend se desenvolvam em paralelo após o alinhamento de arquitetura.

Se você nunca viu o AIOSON em ação, comece pela receita [Primeiro projeto do zero](../2-comecar/primeiro-projeto.md) antes desta.

---

## Pré-requisitos

- Node.js 18+, conta Stripe (modo teste é suficiente)
- Claude Code ou Codex
- `npx @jaimevalasek/aioson init meu-saas` já executado
- Modo: Development + Squads (não obrigatório, mas recomendado para MEDIUM)

---

## Passo 1 — Setup classifica o projeto como MEDIUM

```bash
cd meu-saas
claude .
```

```
Você > @setup

@setup > Qual o tipo? [web_app · api · site · ...]
Você > web_app

@setup > Stack?
Você > Next.js + Prisma + PostgreSQL + Stripe

@setup > Tipos de usuário?
Você > Visitante (público), Subscriber (pago), Admin (interno) — 3 tipos

@setup > Integrações externas?
Você > Stripe (billing) + SendGrid (email) — 2

@setup > Regras de negócio não-óbvias?
Você > Sim — degrade de plano, trial de 14 dias, acesso por feature flag por plano

@setup > Score: 2 + 1 + 2 = 5 → MEDIUM.
@setup > project.context.md criado. Próximo: @product.
```

---

## Passo 2 — `@product` define escopo e PRD

```
Você > @product

@product > Qual o nome do produto e o problema que ele resolve?
Você > Senty — ferramenta de monitoramento de uptime para devs independentes

@product > Features no MVP?
Você > Monitor de URL (ping a cada 5min), alerta por email se cair, histórico 30 dias,
       plano Free (3 monitores) e Pro (20 monitores, alertas SMS)

@product > Critérios de aceitação do MVP?
Você > [lista detalhada de ACs]

@product > PRD gravado em context/prd.md. Spec do MVP em features/mvp/spec.md.
           Próximo: @sheldon para revisão antes de implementar, ou @analyst.
```

> **Quando usar `@sheldon` aqui:** se o PRD tiver decisões difíceis (ex: billing por uso vs. por assento, multi-tenant vs. single-tenant), o `@sheldon` detecta lacunas e enriquece antes do `@analyst`. Para fluxos claros, pode pular.

---

## Passo 3 — `@analyst` mapeia o domínio

```
Você > @analyst

@analyst > Entidades identificadas:
           - User { id, email, plan, trial_ends_at, stripe_customer_id }
           - Monitor { id, user_id, url, interval_min, active }
           - Check { id, monitor_id, status, latency_ms, checked_at }
           - Incident { id, monitor_id, started_at, resolved_at }
           - Subscription { id, user_id, stripe_subscription_id, plan, status }

@analyst > Fluxos críticos:
           1. Signup → trial → plano Pro (webhook Stripe)
           2. Check engine (cron) → Incident → notificação email
           3. Admin: listar users, suspender, ver histórico

@analyst > Domain map em architecture.md. Próximo: @architect.
```

---

## Passo 4 — `@architect` decide a estrutura técnica

```
Você > @architect

@architect > Decisões:
             - Monorepo: Next.js app (app router) + worker separado para checks
             - DB: PostgreSQL via Prisma (Supabase recomendado para hospedagem fácil)
             - Auth: NextAuth v5 com provider email magic-link
             - Billing: Stripe Checkout + webhooks em /api/webhooks/stripe
             - Email: SendGrid via Resend SDK (mais simples na DX)
             - Worker: BullMQ + Redis para fila de checks
             - Feature flags: middleware Next.js verificando plan no session

@architect > Decisões em architecture.md. Próximo: @ux-ui.
```

---

## Passo 5 — `@ux-ui` especifica o sistema visual

```
Você > @ux-ui

@ux-ui > Projeto: SaaS de monitoring. Design skill: Aurora Command UI (dark, técnico).
          Mapeando telas necessárias:
          - /login, /signup, /onboarding (escolha de plano)
          - /dashboard (lista de monitores + status)
          - /monitors/new, /monitors/[id] (detalhes + histórico)
          - /billing (plano atual, upgrade, portal Stripe)
          - /admin (tabela de users com filtros)

@ux-ui > Especificando componentes: StatusBadge, MonitorCard, IncidentTimeline,
          UptimeChart, PlanSelector, BillingPortalButton, AdminTable.
          design-doc-mvp.md criado.
```

---

## Passo 6 — `@pm` cria o backlog e user stories

```
Você > @pm

@pm > Lendo PRD + spec + design-doc...
       Quebrando em user stories:

       Epic 1: Autenticação
       US-01: Como visitante, quero criar conta com email para acessar o produto
       US-02: Como usuário, quero entrar com magic link para não precisar de senha

       Epic 2: Monitores
       US-03: Como subscriber Free, quero adicionar até 3 monitores de URL
       US-04: Como subscriber Pro, quero adicionar até 20 monitores

       Epic 3: Billing
       US-05: Como usuário Free, quero fazer upgrade para Pro via Stripe Checkout
       US-06: Como sistema, quero processar webhooks Stripe para atualizar plano

       [...mais stories...]

@pm > tasks.md com 18 user stories, prioridade e estimativa. Próximo: @orchestrator.
```

---

## Passo 7 — `@orchestrator` divide em lanes paralelas

```
Você > @orchestrator

@orchestrator > Lendo implementação-plan, design-doc, tasks...
                Projeto MEDIUM confirmado. Vou criar 3 lanes:

                LANE 1 — Auth + DB schema
                  Responsável: @dev (sessão A)
                  Escopo: schema Prisma, NextAuth config, /login, /signup

                LANE 2 — Core de monitores + worker
                  Responsável: @dev (sessão B)
                  Escopo: CRUD de monitors, BullMQ worker, cron checks, incidents

                LANE 3 — Billing + Admin
                  Responsável: @dev (sessão C)
                  Escopo: Stripe Checkout, webhooks, /billing, /admin

                Gate C: lanes 1+2 devem ter testes unitários passando antes do merge.

@orchestrator > aioson parallel:init . executado.
                Workspace em .aioson/context/parallel/.
                Execute cada lane em uma sessão separada do cliente AI.
```

```
Diagrama de dependências:
┌───────────────┐    ┌───────────────────────┐    ┌────────────────┐
│  LANE 1       │    │  LANE 2               │    │  LANE 3        │
│  Auth + DB    │───▶│  Monitors + Worker    │    │  Billing +     │
│               │    │  (depende do schema)  │    │  Admin         │
└───────────────┘    └───────────────────────┘    └────────────────┘
         │                      │                          │
         └──────────────────────┴──────────────────────────┘
                                │
                         aioson parallel:merge
```

---

## Passo 8 — Executar as lanes (em sessões separadas)

Abra três terminais ou sessões do cliente AI. Em cada um:

```bash
# Sessão A (Lane 1)
claude .
```
```
Você > @dev
@dev > [lê lane 1 em parallel/lane-01.md, implementa auth + schema]
@dev > Lane 1 concluída. Tests: 12/12.
```

```bash
# Sessão B (Lane 2)
claude .
```
```
Você > @dev
@dev > [lê lane 2, implementa monitors + worker]
@dev > Lane 2 concluída. Tests: 24/24.
```

```bash
# Sessão C (Lane 3)
claude .
```
```
Você > @dev
@dev > [lê lane 3, implementa billing + admin]
@dev > Lane 3 concluída. Tests: 8/8.
```

---

## Passo 9 — Merge e QA final

```bash
# De volta à sessão principal
```
```
Você > aioson parallel:status .
```
```
Lane 1: done  Lane 2: done  Lane 3: done  Gate C: PASS
```
```
Você > aioson parallel:merge . --apply
```
```
@orchestrator > Merge determinístico executado. Verificando conflitos... nenhum.
```
```
Você > @qa

@qa > Rodando suite completa: 44/44 testes passando.
       Verificando ACs do PRD...
       AC-Billing-01: webhook Stripe atualiza plano ✓
       AC-Monitor-03: Free fica bloqueado no 4º monitor ✓
       AC-Admin-01: admin vê tabela paginada ✓
       Todos os 12 ACs passando. QA completo.
```

---

## O que ficou em disco (rastreio)

```
.aioson/context/
├── project.context.md        ← MEDIUM, web_app, Aurora Command UI
├── prd.md                    ← PRD completo (@product)
├── architecture.md           ← decisões técnicas (@analyst + @architect)
├── design-doc-mvp.md         ← telas e componentes (@ux-ui)
├── tasks.md                  ← 18 user stories (@pm)
├── parallel/
│   ├── lane-01.md            ← escopo lane Auth
│   ├── lane-02.md            ← escopo lane Monitors
│   └── lane-03.md            ← escopo lane Billing
├── features/mvp/spec.md      ← spec original
├── dev-state.md              ← status pós-merge
└── qa-report-test-coverage.md
```

---

## Variações

| Situação | Ajuste |
|---|---|
| Não quer Stripe agora | Retire billing do escopo no `@product`. Lane 3 desaparece. |
| Time de 3 pessoas | Cada pessoa executa uma lane. Os artefatos de `parallel/` são o contrato entre vocês. |
| Quer começar pequeno e crescer | Classifique como SMALL agora. Quando o produto crescer, reabra `@setup` e reclassifique MEDIUM. |
| Auth com OAuth (Google/GitHub) | Declare no `@architect`. NextAuth tem providers prontos. |

---

## Solução de problemas

| Problema | Solução |
|---|---|
| `parallel:merge` relata conflito | `aioson parallel:doctor . --fix` — diagnostica e sugere resolução manual |
| Webhooks Stripe não chegam em dev | Use Stripe CLI: `stripe listen --forward-to localhost:3000/api/webhooks/stripe` |
| Lane 2 depende de schema ainda não migrado | Lane 1 deve terminar e rodar `prisma migrate dev` antes da Lane 2 começar |
| `@qa` acha ACs vagos demais | Abra `spec.md`, torne os ACs mais específicos, reative `@qa` |

---

## Próximo passo

- Quer auditar segurança antes de ir para produção? → [Auditoria de segurança](./auditoria-seguranca.md)
- Quer publicar o SaaS no aioson.com? → [Publicar no aioson.com](./publicar-no-aioson-com.md)
- Sessão caiu no meio de uma lane? → [Continuidade entre sessões](./continuidade-entre-sessoes.md)
