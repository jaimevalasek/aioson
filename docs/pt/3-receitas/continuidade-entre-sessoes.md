# Receita: Continuidade entre sessões

> **Para quem é:** qualquer desenvolvedor que trabalha em features longas distribuídas em múltiplas sessões — e não quer recomeçar do zero toda vez que abre o projeto.
> **Tempo de execução:** 10 min de setup na primeira vez; quase zero nas sessões seguintes.
> **O que você vai ter no fim:** toda feature com um dossier em disco — spec, plano, decisões, código tocado, status — que qualquer agente lê e retoma sem precisar reler o histórico de chat.

---

## Cenário

Você estava implementando a feature de checkout com Stripe. Passou três horas com o `@dev`, chegou até 80%, e a sessão do Claude Code encerrou. No dia seguinte, você abre o projeto e pergunta à IA: "onde paramos?" A IA não sabe. Ela tem só o histórico recente, e o contexto de ontem foi compactado.

Isso é o problema do **prompt-monolito**: toda a memória fica na conversa, que é temporária.

O **Feature Dossier** (sistema de agent-chain continuity, implementado em 8 fases entre Mar–Mai/2026) resolve isso. Cada feature tem uma pasta com artefatos persistentes. Quando você retoma, o `@deyvin` lê o dossier e continua de onde parou — sem entrevistar você sobre o que já foi feito.

---

## Pré-requisitos

- AIOSON instalado no projeto
- Uma feature em andamento (ou prestes a começar)
- Claude Code aberto no projeto

---

## Como um dossier é criado

O dossier é inicializado automaticamente quando você começa uma feature via o workflow normal (`@product` → `@analyst` → `@dev`). Mas você também pode criá-lo manualmente:

```bash
npx @jaimevalasek/aioson dossier:init --slug=checkout-stripe
```

```
Dossier inicializado em:
.aioson/context/features/checkout-stripe/
├── dossier.md          ← documento principal (spec, plano, decisões, trail)
├── codemap/            ← mapa dos arquivos tocados pela feature
└── research/           ← índice de pesquisas feitas durante a feature
```

---

## Anatomy do dossier

```
.aioson/context/features/checkout-stripe/dossier.md
```

O arquivo tem seções padronizadas:

```
## Meta
slug: checkout-stripe
status: in_progress
classification: SMALL
agents_trail: [@product, @analyst, @architect, @dev]
last_agent: @dev
last_updated: 2026-05-06T14:32:00Z

## Spec Summary
[resumo da spec — o que a feature resolve, ACs principais]

## Plan
[passos do plano de implementação com checkboxes]
- [x] Schema do banco (tabela payments)
- [x] Rota POST /checkout/create-session
- [ ] Webhook handler /webhooks/stripe
- [ ] Página de confirmação

## Decisions
[decisões tomadas durante a feature com justificativa]
- Usando Stripe Checkout (não Elements) — menor complexidade de PCI
- Webhook verificado com stripe.webhooks.constructEvent

## Code Map
[arquivos que fazem parte desta feature]
- src/routes/checkout.js       (criado)
- src/services/stripe.js       (criado)
- src/db/migrations/005_payments.js (criado)
- src/routes/webhooks.js       (pendente)
- app/pages/checkout/success.tsx (pendente)

## Agent Trail
[o que cada agente fez]
@product: spec criada em 2026-05-05
@analyst: Payment, Order mapeados
@architect: Stripe Checkout escolhido, estrutura definida
@dev: 3/5 passos do plano concluídos
```

---

## Retomando uma feature — fluxo real

### Sessão nova, agente `@deyvin`

```
Você > @deyvin

@deyvin > Lendo project-pulse.md... feature checkout-stripe em andamento.
           Lendo dossier.md...

@deyvin > Aqui está onde você parou:

           FEATURE: checkout-stripe
           Status: in_progress (80%)
           Último agente: @dev

           CONCLUÍDO:
           ✓ Schema payments (migration 005)
           ✓ POST /checkout/create-session
           ✓ Integração Stripe Checkout

           PENDENTE:
           ✗ Webhook handler /webhooks/stripe
           ✗ Página de confirmação /checkout/success

           DECISÕES REGISTRADAS:
           - Stripe Checkout (não Elements)
           - Verificação de webhook com constructEvent

           Quer continuar implementando os 2 passos pendentes?
Você > Sim, comece pelo webhook.

@deyvin > [implementa src/routes/webhooks.js]
           Webhook handler criado. Testando com stripe-cli...
           Evento payment_intent.succeeded recebido ✓
           Dossier atualizado: webhooks marcado como concluído.
```

---

## Detectando drift

O dossier tem **drift detection**: se o código mudou desde o último registro do agente, ele detecta a divergência antes de continuar.

```
@deyvin > Verificando drift...
           Arquivo: src/services/stripe.js
           Última versão conhecida: criado por @dev em 2026-05-05
           Estado atual: modificado fora do agente (1 função adicionada)

           Drift detectado. Antes de continuar, vou ler o que mudou...
           [lê diff]
           Mudança: função handleRefund() adicionada manualmente.
           Vou incluir isso no codemap e continuar.
```

---

## Adicionando pesquisas ao dossier

Quando você (ou um agente) pesquisa algo importante para a feature, adicione ao índice de pesquisa:

```bash
npx @jaimevalasek/aioson dossier:add-research . \
  --slug=checkout-stripe \
  --url="https://stripe.com/docs/webhooks" \
  --summary="Stripe requer verificação de signature em todos os webhooks. Usar constructEvent." \
  --agent=dev
```

Isso fica em `research/` e futuros agentes encontram sem precisar reler a documentação.

---

## Auditoria do dossier

Para verificar se o dossier está consistente com o estado real do código:

```bash
npx @jaimevalasek/aioson dossier:audit --slug=checkout-stripe
```

```
Auditando checkout-stripe...

✓ Todos os arquivos do codemap existem
✓ Migration 005 aplicada (verificada via introspection)
✗ src/routes/webhooks.js listado como pendente mas arquivo existe no disco

  Possível inconsistência: arquivo criado mas dossier não atualizado.
  Recomendação: rode @deyvin para sincronizar o status.
```

---

## Ver estado atual do dossier

```bash
npx @jaimevalasek/aioson dossier:show --slug=checkout-stripe
```

```
FEATURE: checkout-stripe
Status: in_progress
Agentes: @product, @analyst, @architect, @dev, @deyvin
Progresso: 4/5 passos concluídos (80%)
Arquivos: 5 (3 criados, 2 pendentes)
Pesquisas: 1 (stripe webhooks)
Última atualização: 2026-05-07 10:15
```

---

## `dev-state.md` — o complemento do dossier

Além do dossier, o `@dev` mantém `.aioson/context/dev-state.md` — um snapshot mais granular do estado de implementação:

```
## Dev State — checkout-stripe

### Concluído
- src/routes/checkout.js: POST /checkout/create-session → Stripe Checkout
- src/services/stripe.js: createCheckoutSession, handleRefund
- src/db/migrations/005_payments.js: tabela payments com campos Stripe

### Em progresso
- src/routes/webhooks.js: handler parcial, falta payment_intent.payment_failed

### Bloqueado
- (nenhum)

### Próximos passos
1. Completar webhook handler (caso .payment_failed)
2. Criar página /checkout/success com query param session_id
3. Ativar @qa para validar os ACs
```

---

## O que acontece quando a feature é fechada

Quando você roda `aioson feature:close --slug=checkout-stripe`, o dossier é movido para `.aioson/context/done/`. O feature archive guarda:

```
.aioson/context/done/
└── checkout-stripe/
    ├── dossier.md        ← estado final
    ├── codemap/          ← todos os arquivos tocados
    └── research/         ← pesquisas acumuladas
```

Isso cria um histórico auditável de todas as features — útil para onboarding de novos devs ou para o `@neo` entender o histórico do projeto.

---

## O que ficou em disco (rastreio)

```
.aioson/context/features/checkout-stripe/
├── dossier.md           ← documento central (spec, plano, decisões, trail)
├── codemap/
│   └── files.json       ← arquivos, status (criado/modificado/pendente), agente
└── research/
    └── index.md         ← pesquisas indexadas com resumos

.aioson/context/
├── dev-state.md         ← estado granular de implementação
└── project-pulse.md     ← estado global do projeto (feature ativa, próximo passo)
```

---

## Quando NÃO usar o dossier

- Feature de 1 hora que você termina na mesma sessão — overhead desnecessário.
- Projeto MICRO com uma única feature — o `project.context.md` e o `dev-state.md` já bastam.
- Exploração rápida de código — use `@deyvin` direto sem inicializar dossier.

Para features rastreadas, o dossiê é memória auxiliar recomendada em qualquer classificação. Ele não adiciona estágios nem substitui PRD, plano ou relatório QA.

---

## Variações

| Situação | Ajuste |
|---|---|
| Múltiplas features paralelas | Um dossier por feature slug. O `project-pulse.md` mostra qual está ativa. |
| Time com vários devs | Commitam os dossiês no Git. Cada dev vê o estado de todas as features. |
| Feature retomada por agente diferente | Qualquer agente lê o dossier. O trail de agentes fica registrado. |
| Sessão caiu sem salvar `dev-state.md` | `@deyvin` usa o dossier + git diff para reconstituir o estado. |

---

## Solução de problemas

| Problema | Solução |
|---|---|
| `@deyvin` não encontrou o dossier | Rode `dossier:show --slug=X` para confirmar que existe. Se não, `dossier:init`. |
| Dossier desatualizado com o código | `dossier:audit` detecta inconsistências e orienta correção. |
| `dev-state.md` foi sobrescrito | O Git tem o histórico. O dossier tem o trail de agentes. |
| Drift detection disparou erro incorreto | Diga ao `@deyvin`: "o arquivo foi modificado intencionalmente, atualize o codemap". |

---

## Próximo passo

- Quer começar com este fluxo num projeto legado? → [Integrar em codebase grande](./integracao-em-codebase-grande.md)
- Quer entender o que mais o dossier rastreia? Consulte o [Glossário — Dossier](../1-entender/glossario.md).
- Quer ver o mapa completo de artefatos? → [Mapa do ecossistema](../1-entender/mapa-do-ecossistema.md).
