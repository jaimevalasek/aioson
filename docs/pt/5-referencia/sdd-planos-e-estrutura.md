# SDD: Planos e estrutura de artefatos

> Referência técnica da nomenclatura, hierarquia de artefatos e estrutura de planos do SDD (Spec-Driven Development).
>
> **Veja também:** [SDD Framework](./sdd-framework.md) — princípios e metodologia.

---

## O problema que este doc resolve

O AIOSON tem múltiplas pastas que contêm algo chamado "plano":

- `plans/` na raiz
- `.aioson/plans/`
- `.aioson/context/`
- `.aioson/context/parallel/`

Cada uma tem um propósito diferente. Confundi-las quebra o fluxo de agentes.

---

## Mapa geral de artefatos

```
projeto/
│
├── plans/                          ← SUAS pesquisas (pré-produção, gitignored)
│   ├── pesquisa-stripe.md
│   ├── analise-concorrentes.md
│   └── source-manifest.md          ← registro de consumo
│
└── .aioson/
    ├── context/                    ← ARTEFATOS do ciclo de agentes
    │   ├── project.context.md      ← @setup
    │   ├── project-pulse.md        ← estado global (atualizado a cada sessão)
    │   ├── prd.md                  ← @product (projeto novo)
    │   ├── prd-{slug}.md           ← @product (feature específica)
    │   ├── sheldon-enrichment.md   ← @sheldon (histórico de enriquecimento)
    │   ├── architecture.md         ← @analyst + @architect
    │   ├── design-doc.md           ← @ux-ui
    │   ├── tasks.md                ← @pm
    │   ├── dev-state.md            ← @dev (continuidade de sessão)
    │   ├── test-plan.md            ← @qa
    │   ├── features.md             ← registro de features (status por slug)
    │   └── parallel/               ← @orchestrator (lanes paralelas)
    │       ├── lane-backend.md
    │       ├── lane-ui.md
    │       └── harness-contract.json
    │
    └── plans/                      ← PLANOS FASEADOS gerados por @sheldon
        └── {slug}/
            ├── phase-1.md
            ├── phase-2.md
            ├── harness-contract.json
            └── progress.json
```

---

## `plans/` (raiz) — pesquisas pré-produção

| Característica | Detalhe |
|---|---|
| **Quem escreve** | Você — antes do ciclo de agentes |
| **Conteúdo** | Rascunhos, exportações de chat, benchmarks, análises |
| **Gitignored?** | Sim (padrão) |
| **Lido por** | `@briefing`, `@product`, `@sheldon` |
| **Modificado por agentes?** | Nunca — read-only |
| **Quando remover** | Você decide; tipicamente após entrega completa |

O arquivo especial `plans/source-manifest.md` é criado automaticamente e registra qual agente consumiu qual arquivo e que artefato foi produzido. Serve para auditoria: "o que foi gerado a partir do quê?".

Veja [Plans externos para @product](../3-receitas/plans-externos-para-product.md) para o fluxo de uso.

---

## `.aioson/context/` — artefatos do ciclo

É a pasta central do AIOSON. Cada agente lê e escreve aqui dentro de sua responsabilidade.

### Artefatos de produto e planejamento

| Arquivo | Criado por | Consumido por |
|---|---|---|
| `project.context.md` | `@setup` | todos os agentes (sempre) |
| `project-pulse.md` | qualquer agente (ao fechar sessão) | todos os agentes (ao iniciar sessão) |
| `prd.md` | `@product` (projeto novo) | `@sheldon`, `@analyst`, `@ux-ui`, `@pm`, `@dev` |
| `prd-{slug}.md` | `@product` (feature) | idem |
| `sheldon-enrichment.md` | `@sheldon` | `@sheldon` (re-entrada), `@analyst` |
| `architecture.md` | `@analyst` + `@architect` | `@ux-ui`, `@pm`, `@dev`, `@qa` |
| `design-doc.md` | `@ux-ui` | `@pm`, `@dev` |
| `tasks.md` | `@pm` | `@orchestrator`, `@dev` |
| `features.md` | qualquer agente | todos (status por slug) |

### Artefatos de execução

| Arquivo | Criado por | Consumido por |
|---|---|---|
| `dev-state.md` | `@dev` (ao pausar/fechar) | `@deyvin` (retomada), `@dev` |
| `test-plan.md` | `@qa` | `@qa` (iterações), `@validator` |
| `qa-report-{slug}.md` | `@qa` | `@validator`, `@tester` |
| `test-inventory.md` | `@tester` | `@qa` (rodada seguinte) |
| `security-findings-{slug}.json` | `@pentester` | `@dev` (correção), `@qa` (regressão) |
| `last-handoff.json` | `@validator` | fechamento da feature |

### `parallel/` — lanes do `@orchestrator`

O `@orchestrator` cria esta subpasta quando detecta trabalho paralelizável:

```
.aioson/context/parallel/
├── lane-backend.md         ← tarefas sem dependência de UI
├── lane-ui.md              ← componentes front-end
├── lane-migration.md       ← schema de banco
└── harness-contract.json   ← contrato de sucesso (lido por @validator)
```

Cada `lane-*.md` tem:
- Lista de tarefas com ordem de execução
- Dependências entre lanes (ex: "lane-ui depende da API definida em lane-backend")
- Critérios de aceite por lane

O `@dev` pode trabalhar uma lane por sessão. O `@deyvin` retoma a lane que ficou incompleta.

---

## `.aioson/plans/` — planos faseados do `@sheldon`

Criado quando o `@sheldon` detecta que a feature é grande demais para implementação única. Contém o plano de execução faseada.

```
.aioson/plans/{slug}/
├── phase-1.md              ← escopo, entidades, ACs da fase 1
├── phase-2.md              ← escopo da fase 2
├── harness-contract.json   ← critérios de sucesso de cada fase
└── progress.json           ← status corrente (lido por @dev, @qa)
```

### Estrutura de um `phase-N.md`

```markdown
---
phase: 1
title: "Core subscription model"
status: in_progress
depends_on: []
---

## Escopo
O que está incluso nesta fase e o que fica para depois.

## Entidades
Quais entidades de domínio são introduzidas ou modificadas.

## ACs desta fase
- AC-01: ...
- AC-02: ...

## Fora do escopo desta fase
...
```

### `harness-contract.json`

Contrato binário lido pelo `@validator` no gate D:

```json
{
  "feature": "billing-assinatura",
  "phases": [
    {
      "phase": 1,
      "required": ["AC-01", "AC-02", "AC-03"],
      "optional": ["AC-09"]
    }
  ],
  "global_required": ["nenhum HIGH em security-findings"]
}
```

### `progress.json`

Estado corrente atualizado pelo `@dev`:

```json
{
  "feature": "billing-assinatura",
  "current_phase": 2,
  "phases": {
    "1": "complete",
    "2": "in_progress",
    "3": "pending"
  },
  "updated_at": "2026-05-07T14:30:00Z"
}
```

---

## `tasks.md` — o backlog do `@pm`

Criado pelo `@pm` (somente em MEDIUM). Formato:

```markdown
# Tasks — {feature-slug}

## Epic 1: Subscription Model

### US-01: Criar plano de assinatura
**Como** admin, **quero** criar planos (mensal/anual), **para** oferecer opções ao cliente.

**ACs:**
- [ ] POST /plans retorna 201 com id, name, price, interval
- [ ] Validação: price > 0, interval in ["monthly", "annual"]
- [ ] Duplicate name retorna 422

**Story points:** 3
**Dependências:** nenhuma

---

### US-02: Assinar plano
**Como** cliente...
```

O `@orchestrator` lê `tasks.md` para identificar dependências e criar lanes paralelas.

---

## `features.md` — registro de features

Mantido por múltiplos agentes. Rastreia o status de cada feature por slug:

```markdown
# Features Registry

| slug | status | started | closed | verdict |
|------|--------|---------|--------|---------|
| billing-assinatura | in_progress | 2026-05-01 | — | — |
| push-notifications | done | 2026-04-15 | 2026-04-22 | PASS |
| checkout-v2 | qa_failed | 2026-04-28 | 2026-04-30 | FAIL |
```

**Status possíveis:**

| Status | Significado |
|---|---|
| `planned` | PRD existe, implementação não iniciou |
| `in_progress` | `@dev` ativo |
| `qa_review` | Aguardando `@qa` |
| `done` | Fechada com PASS via `feature:close` |
| `qa_failed` | Fechada com FAIL — requer re-abertura |

---

## `project-pulse.md` — estado global da sessão

Atualizado por todos os agentes ao fechar cada sessão. Serve como "onde estávamos?" para a próxima sessão.

```markdown
---
active_agent: dev
active_feature: billing-assinatura
last_agent: sheldon
last_gate: "Gate B: approved"
updated_at: 2026-05-07T15:00:00Z
---

# Project Pulse

## Active work
Implementando Phase 2 de billing-assinatura: webhook handler com idempotency.

## Next step
Phase 3: Dunning cron job (3 tentativas, intervalos 1d/3d/7d).

## Recent Activity
- 2026-05-07 15:00 · @dev · Phase 2 iniciada
- 2026-05-07 10:00 · @sheldon · PRD enriquecido, phased plan criado
- 2026-05-06 18:00 · @product · PRD criado
```

O `aioson pulse:update` atualiza este arquivo via script (sem precisar de LLM). Ver [SDD Automation Scripts](./sdd-automation-scripts.md).

---

## Fluxo de artefatos por classificação

### MICRO

```
plans/ → prd.md → [dev implementa] → qa-report.md
```

### SMALL

```
plans/ → prd.md → sheldon-enrichment.md → architecture.md
       → dev-state.md → test-plan.md → qa-report.md
```

### MEDIUM (completo)

```
plans/ → prd.md → sheldon-enrichment.md → .aioson/plans/{slug}/
       → architecture.md → design-doc.md → tasks.md
       → parallel/ → dev-state.md (por lane)
       → test-plan.md → qa-report.md → test-inventory.md
       → security-findings.json → last-handoff.json
```

---

## Referências cruzadas

- [SDD Framework](./sdd-framework.md) — princípios, Constitution, MICRO/SMALL/MEDIUM
- [SDD Automation Scripts](./sdd-automation-scripts.md) — comandos para mover estado sem LLM
- [Feature Dossier](./feature-dossier.md) — ponto único de verdade por feature
- [Agent-chain continuity](./agent-chain-continuity.md) — como `dev-state.md` é usado para retomada
- [Plans externos para @product](../3-receitas/plans-externos-para-product.md) — usar `plans/` como entrada
- [Feature completa com @sheldon](../3-receitas/feature-completa-com-sheldon.md) — fluxo prático com todos os artefatos
