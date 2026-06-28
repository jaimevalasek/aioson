# Receita: App SaaS do zero (classificação MEDIUM)

> **Para quem é:** desenvolvedor ou time montando um SaaS com auth, billing e painel admin.
> **Tempo de execução:** 2–4 horas (processo distribuído em múltiplas sessões).
> **O que você vai ter no fim:** SaaS funcional com autenticação, planos de assinatura via Stripe, painel de admin, testes e artefatos completos de spec/arquitetura/QA.

---

## Cenário

Você quer construir um SaaS: usuários se cadastram, escolhem um plano pago (Stripe), e acessam um painel com as funcionalidades. Tem também um admin para gerenciar usuários e assinaturas.

Isso é um projeto **MEDIUM** (3 tipos de usuário: visitante, subscriber, admin — e integrações externas: Stripe, email). O AIOSON aplica a **maestro lane**: `@orchestrator` atua como autoridade única de spec (faz fan-out para `@analyst`, `@architect`, `@pm` e `@ux-ui` como sub-agentes, consolida o pacote de spec) e depois pode coordenar lanes paralelas de implementação.

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

> **`@sheldon` opcional aqui:** se o PRD tiver decisões difíceis (billing por uso vs. por assento, multi-tenant vs. single-tenant), rode `@sheldon` para detectar lacunas e endurecer o PRD **antes** de `@orchestrator`. Para fluxos claros, `@orchestrator` pode ir direto.

---

## Passo 3 — `@orchestrator` produz o pacote de spec

Em v1.35.0, `@orchestrator` é o **maestro de spec** do MEDIUM: você não precisa invocar `@analyst`, `@architect`, `@ux-ui` e `@pm` manualmente — o `@orchestrator` os dispara como sub-agentes no fan-out, consolida os artefatos e entrega o pacote de spec completo (Gates A/B/C).

```
Você > @orchestrator

@orchestrator > Classificação MEDIUM confirmada. Lendo prd.md...
                
                Fan-out de spec:
                ├── @analyst   → mapeamento de entidades e domínio
                ├── @architect → decisões técnicas (monorepo, auth, billing, worker)
                ├── @ux-ui     → design Aurora Command UI, telas e componentes
                └── @pm        → 18 user stories, 3 epics, estimativas
                
                [sub-agentes executados]
                
                Consolidando e verificando consistência...
                ⚠ US-06 sem AC verificável em webhook → retrabalhando
                Gates A/B/C aprovados.
                
                Pacote de spec:
                  requirements-mvp.md · architecture.md
                  design-doc-mvp.md · tasks.md
                  implementation-plan-mvp.md
                
                Lanes de implementação criadas:
                  LANE 1 — Auth + DB schema
                  LANE 2 — Core de monitores + worker
                  LANE 3 — Billing + Admin
                
                Gate C: lanes 1+2 devem ter testes unitários passando antes do merge.
                
                aioson parallel:init . executado.
                Workspace em .aioson/context/parallel/.
                
                Próximo: @dev (pode trabalhar lanes em sessões separadas).
```

> **Os passos individuais de @analyst, @architect, @ux-ui e @pm** ainda acontecem — agora como sub-agentes coordenados pelo `@orchestrator`. Se você quiser inspecionar o que cada sub-agente produziu, leia os artefatos em `.aioson/context/` após o `@orchestrator` finalizar.

---

## Passo 4 — `@dev` implementa (por lane, em sessões separadas)

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

## Passo 5 — Merge e QA final

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
