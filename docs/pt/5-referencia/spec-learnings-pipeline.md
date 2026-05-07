# Spec & Learnings Pipeline

> Sincroniza specs Markdown com o SQLite e exporta learnings para memória procedural do projeto.

O AIOSON mantém duas representações do estado de desenvolvimento: os arquivos `spec-{slug}.md` em `.aioson/context/` (editados pelos agentes) e o banco SQLite `aios.sqlite` (lido pelo dashboard). Este pipeline conecta os dois automaticamente.

---

## Visão geral do fluxo

```
@dev escreve spec-checkout.md
  └─ ## Session Learnings: [process] commit por step
  └─ frontmatter: phase_gates: {plan: approved}
  └─ last_checkpoint: "Criando migration cart_items — step 3 de 5"

aioson spec:sync .
  └─ project_learnings ← learnings upserted (frequency++)
  └─ plan_phases ← phase_gates mapeadas para status

aioson spec:status .
  └─ tabela de features com fase, agente, checkpoint

aioson learning:export . --min-frequency=2
  └─ .aioson/brains/process-commit-por-step.md  ← node Zettelkasten

aioson learning:evolve .
  └─ genome ← learnings com frequency ≥ 5 promovidos
```

---

## `aioson spec:sync`

Sincroniza learnings e phase gates de todos os specs para o SQLite.

```bash
aioson spec:sync [path] [opções]
```

**Opções:**

| Opção | Descrição |
|---|---|
| `--json` | Retorna JSON com contagem de learnings e fases sincronizadas |
| `--verbose` | Mostra detalhes de cada arquivo processado |

**Exemplo:**

```bash
aioson spec:sync .
```

Saída:

```
Spec Sync — meu-projeto
──────────────────────────────────────────────────
spec-checkout.md
  Learnings synced: 3
  Plan phases updated: 1
  last_checkpoint: "Criando migration cart_items"
spec.md
  Learnings synced: 2
──────────────────────────────────────────────────
Summary: 5 learnings synced, 1 plan phases updated
```

**Formato dos learnings no spec:**

```markdown
## Session Learnings
- [process] Fazer commit após cada step atômico, não só no final
- [domain] cart_items deve ter UNIQUE(cart_id, product_id)
- [quality] Rodar testes com --filter isola o módulo rapidamente
```

Prefixos aceitos: `[process]`, `[domain]`, `[quality]`, `[preference]`.  
Linhas sem prefixo são classificadas automaticamente como `[process]`.

**Idempotência:** rodar `spec:sync` duas vezes no mesmo spec não duplica learnings. Se o título já existe em `project_learnings`, o campo `frequency` é incrementado (`frequency++`).

---

## `aioson spec:status`

Exibe o estado atual de todas as features com dados do SQLite.

```bash
aioson spec:status [path] [opções]
```

**Opções:**

| Opção | Descrição |
|---|---|
| `--json` | Retorna JSON com array de features e contagem de learnings |

**Exemplo:**

```bash
aioson spec:status .
```

Saída:

```
Project Status — meu-projeto
────────────────────────────────────────────────────────────────────────────────
Feature             Phase     Status          Last Agent      Checkpoint
────────────────────────────────────────────────────────────────────────────────
checkout            2/5       in_progress     dev             Criando migration...
auth                5/5       done            qa              QA sign-off 2026-03-28
onboarding          0/5       not_started     —               —
────────────────────────────────────────────────────────────────────────────────
Active learnings: 12  |  Promotable (freq≥3): 4
```

---

## `aioson spec:checkpoint`

Registra manualmente o `last_checkpoint` de um spec no SQLite. Útil quando a sessão caiu sem `agent:done`.

```bash
aioson spec:checkpoint [path] --feature=<slug> [--agent=<agent>]
```

**Opções:**

| Opção | Descrição |
|---|---|
| `--feature=<slug>` | Feature cujo spec será lido (obrigatório) |
| `--agent=<name>` | Agente da run ativa (padrão: `dev`) |
| `--json` | Retorna JSON com run_key e checkpoint registrado |

**Exemplo:**

```bash
# Sessão do @dev em checkout caiu sem agent:done
aioson spec:checkpoint . --feature=checkout
```

Saída:

```
Reading spec-checkout.md...
last_checkpoint: "Criando migration cart_items — step 3 of 5"
phase_gates: {"plan":"approved","requirements":"approved","design":"pending"}

Checkpoint registered:
  run_key: dev-1711234567890
  summary: "Criando migration cart_items — step 3 of 5"
  status: in_progress (checkpoint only — use agent:done to close)

Next: continue with /dev — start from last_checkpoint
```

O comando procura a run mais recente do agente no SQLite e registra um evento `plan_checkpoint` nela. O run permanece `in_progress` — use `agent:done` para fechá-la quando terminar.

---

## `aioson learning:export`

Exporta `project_learnings` do SQLite para `.aioson/brains/` como nodes no formato Zettelkasten.

```bash
aioson learning:export [path] [--min-frequency=N] [--json]
```

**Opções:**

| Opção | Descrição |
|---|---|
| `--min-frequency=N` | Exporta apenas learnings com `frequency >= N` (padrão: 1) |
| `--json` | Retorna JSON com lista de nodes exportados |

**Exemplos:**

```bash
# Exportar todos os learnings ativos
aioson learning:export .

# Apenas learnings reforçados em 2+ sessões
aioson learning:export . --min-frequency=2
```

Saída:

```
Learning Export — min-frequency: 2
──────────────────────────────────────────────────
  process-commit-por-step.md ✓ (frequency: 4)
  domain-cart-uniqueness.md ✓ (frequency: 3)
  process-test-isolation.md ✓ (frequency: 2)
──────────────────────────────────────────────────
3 nodes written to .aioson/brains/
2 learning(s) with frequency ≥ 5 — run: aioson learning:evolve to promote to genome
```

**Formato do node exportado** (`.aioson/brains/process-commit-por-step.md`):

```markdown
---
id: process-commit-por-step
type: process
title: Fazer commit após cada step atômico, não só no final
frequency: 4
last_reinforced: 2026-04-01
source_feature: checkout
promoted_to: null
created_at: 2026-03-15
---

# Fazer commit após cada step atômico

**Evidence:** Detected in 4 session(s).

## Applications
- Review and apply this learning in future sessions of type: process

## Links
<!-- Add cross-references here -->
```

---

## Fluxo recomendado após cada sessão do @dev

```bash
# 1. Sincronizar spec com o SQLite
aioson spec:sync .

# 2. Ver estado atual das features
aioson spec:status .

# 3. Quando learnings se acumularem (≥ 2 sessões), exportar para brains
aioson learning:export . --min-frequency=2

# 4. Quando um learning atingir frequency ≥ 5, promover para genome
aioson learning:evolve .
```

---

## Integração com o spec.md

O `spec:sync` procura esses elementos em cada `spec-{slug}.md`:

| Elemento | Onde fica | O que faz |
|---|---|---|
| `## Session Learnings` | Corpo do arquivo | Cria/atualiza `project_learnings` |
| `phase_gates` | Frontmatter YAML | Atualiza `plan_phases.status` |
| `last_checkpoint` | Frontmatter ou seção | Exibido em `spec:status` |

**Exemplo de frontmatter de spec:**

```markdown
---
feature: checkout
status: in_progress
phase_gates: {"plan": "approved", "requirements": "approved", "design": "pending"}
last_checkpoint: "Criando migration cart_items — step 3 de 5"
---
```
