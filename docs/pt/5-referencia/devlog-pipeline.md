# Devlog Pipeline

> Processa devlogs escritos manualmente pelos agentes e sincroniza artifacts, decisions, learnings e verdict com o SQLite.

Quando o CLI `aioson` não está disponível (ex: Claude Code sem terminal, sessão sem live session ativa), os agentes escrevem devlogs em `aioson-logs/`. O devlog pipeline importa esses arquivos para o SQLite automaticamente, garantindo visibilidade no dashboard mesmo quando o CLI não foi chamado durante a sessão.

---

## Formato do devlog

Salvar em: `aioson-logs/devlog-{agent}-{unix-timestamp}.md`

```markdown
---
agent: dev
feature: checkout
session_key: direct-session:1711234567890:dev
started_at: 2026-04-01T14:23:00Z
finished_at: 2026-04-01T15:45:00Z
status: completed
verdict: null
plan_step: FASE-1
---

# Devlog: @dev — checkout — 2026-04-01

## Summary
Implementei a migration de cart_items e o AddToCart action com testes unitários.

## Artifacts
- src/database/migrations/003_cart_items.ts
- src/actions/cart/AddToCart.ts
- tests/cart/AddToCart.test.ts

## Decisions
- UUID para cart_id em vez de auto-increment — compatibilidade com múltiplas sessões

## Learnings
- [process] Rodar `npm test -- --filter=cart` isola testes do módulo rapidamente
- [domain] cart_items deve ter constraint UNIQUE(cart_id, product_id) para evitar duplicatas

## Blockers
- Nenhum
```

**Campos obrigatórios:** `agent`, `started_at`, `finished_at`.  
**Campos opcionais:** `feature`, `session_key`, `status`, `verdict`, `plan_step`.

**Devlog mínimo** (para sessões interrompidas):

```markdown
---
agent: dev
feature: checkout
status: partial
started_at: 2026-04-01T14:23:00Z
finished_at: 2026-04-01T14:58:00Z
---
## Summary
Comecei a migration de cart_items — parei no step 2 de 5.
## Learnings
- [process] Sempre rodar migrations em ambiente de teste antes de commitar
```

---

## `aioson devlog:process`

Processa todos os devlogs pendentes de `aioson-logs/` e sincroniza com o SQLite.

```bash
aioson devlog:process [path] [opções]
```

**Opções:**

| Opção | Descrição |
|---|---|
| `--json` | Retorna JSON com lista de resultados e contagens |

**O que o comando faz para cada devlog:**

| Seção | Destino no SQLite |
|---|---|
| `## Artifacts` (caminhos de arquivo) | Tabela `artifacts` vinculada à run |
| `## Decisions` | `execution_events` com tipo `decision` |
| `## Learnings` (`[tipo] texto`) | `project_learnings` (upsert — frequency++) |
| `verdict` no frontmatter | `execution_events.verdict` (PASS/FAIL/PARTIAL) |
| `## Summary` | `agent_runs.summary` |

**Exemplo:**

```bash
aioson devlog:process .
```

Saída:

```
Devlog Processing — meu-projeto
──────────────────────────────────────────────────
Found 3 devlog(s):

devlog-dev-1711234567.md
  run: dev-1711234567890
  Artifacts: 3 registered ✓
  Decisions: 1 logged ✓
  Learnings: 2 upserted ✓

devlog-qa-1711237890.md
  run: qa-1711237890123
  Artifacts: 1 registered ✓
  Learnings: 1 upserted ✓
  Verdict: PASS ✓

devlog-dev-1711241234.md — ⚠ missing frontmatter or agent field. Fix and re-run.
──────────────────────────────────────────────────
Processed: 2/3 devlogs
New learnings: 3 (queued for brains export)
Artifacts registered: 4
```

**Idempotência:** devlogs já processados recebem `processed_at` no frontmatter. Rodar o comando novamente os ignora.

---

## `aioson devlog:watch`

Daemon que observa `aioson-logs/` e processa automaticamente novos devlogs assim que são criados.

```bash
aioson devlog:watch [path] [opções]
```

**Opções:**

| Opção | Descrição |
|---|---|
| `--poll` | Forçar modo polling (padrão automático no WSL2) |

**Detecção automática de WSL2:** o comando lê `/proc/version` e, se detectar `microsoft`, usa polling de 5 segundos em vez de `fs.watch` (que tem comportamento instável no WSL2).

**Exemplos:**

```bash
# Iniciar em background
aioson devlog:watch . &

# Ver output ao vivo (sem background)
aioson devlog:watch .

# Forçar polling em qualquer ambiente
aioson devlog:watch . --poll &
```

Saída durante operação:

```
[DEVLOG WATCHER] WSL2 detected — using polling (5s interval)
[DEVLOG WATCHER] Watching /meu-projeto/aioson-logs for new devlogs...
[DEVLOG WATCHER] Press Ctrl+C to stop.
[14:47:08] New: devlog-dev-1711237890.md → processing...
[14:47:09] Processed: devlog-dev-1711237890.md → 2 learnings, 3 artifacts → SQLite ✓
[14:51:33] New: devlog-qa-1711238200.md → processing...
[14:51:34] Processed: devlog-qa-1711238200.md → VERDICT: PASS → SQLite ✓
```

Para parar: `Ctrl+C` ou `kill %1` se rodou em background.

---

## `aioson devlog:export-brains`

Exporta learnings de alta frequência dos devlogs para `.aioson/brains/` como nodes Zettelkasten.

Funciona exatamente como `learning:export` mas com `--min-frequency=2` por padrão (mais conservador para o pipeline de devlogs).

```bash
aioson devlog:export-brains [path] [--min-frequency=N] [--json]
```

**Exemplos:**

```bash
# Exportar learnings reforçados em 2+ sessões (padrão)
aioson devlog:export-brains .

# Mais seletivo: apenas learnings reforçados em 3+ sessões
aioson devlog:export-brains . --min-frequency=3
```

Saída:

```
Learning Export — min-frequency: 2
──────────────────────────────────────────────────
  process-commit-por-step.md ✓ (frequency: 4)
  domain-cart-uniqueness.md ✓ (frequency: 3)
──────────────────────────────────────────────────
2 nodes written to .aioson/brains/
Run: aioson learning:evolve to promote high-frequency nodes to genome.
```

---

## Pipeline completo

### Modo manual (pós-sessão)

```bash
# 1. Processar devlogs acumulados
aioson devlog:process .

# 2. Checar estado das features
aioson spec:status .

# 3. Exportar learnings para brains
aioson devlog:export-brains . --min-frequency=2

# 4. Promover para genome quando frequency ≥ 5
aioson learning:evolve .
```

### Modo automático (background durante sessão)

```bash
# Iniciar watcher em background antes de começar a sessão
aioson devlog:watch . &

# ... trabalhar normalmente, escrever devlogs ao final de cada subsessão ...

# Depois da sessão: apenas exportar para brains
aioson devlog:export-brains . --min-frequency=2
```

---

## Devlog de @qa com verdict

O devlog do `@qa` deve incluir `verdict` no frontmatter para que o pipeline registre automaticamente o veredito no SQLite:

```markdown
---
agent: qa
feature: checkout
status: completed
verdict: PASS
started_at: 2026-04-01T16:00:00Z
finished_at: 2026-04-01T17:30:00Z
---
## Summary
QA checkout — PASS. 5-step baseline + 2 adversarial probes. Sem regressões.
## Artifacts
- output/qa/checkout-qa-report.md
## Learnings
- [quality] Testar cart com 0 itens é caso de borda crítico — sempre incluir no baseline
```

Após `devlog:process`, o veredito `PASS` aparece em `execution_events.verdict` e fica pesquisável no dashboard.

---

## Diferença entre `devlog:process` e `devlog:sync`

| Comando | Faz |
|---|---|
| `devlog:sync` | Import básico: cria task + run + eventos de seção. Sem extração de learnings, artifacts ou verdict. |
| `devlog:process` | Import enriquecido: learnings → `project_learnings`, artifacts → tabela `artifacts`, decisions → `execution_events`, verdict → `execution_events.verdict`. |

Use `devlog:process` para o pipeline completo. `devlog:sync` é o comando legado mais simples.
