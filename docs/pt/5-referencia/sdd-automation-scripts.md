# SDD Automation Scripts — Regra dos 80%

> Referência completa dos 12 comandos determinísticos do AIOSON que movem trabalho de arquivo/estado/validação para fora do contexto LLM.
>
> **Veja também:** [SDD Framework](./sdd-framework.md) — os princípios e a metodologia por trás desses scripts.

## Por que esses scripts existem

Antes desses scripts, verificações como "o gate A está aprovado?" ou "qual o classificação desse projeto?" eram resolvidas dentro da janela de contexto do agente — custando entre 7.200 e 18.500 tokens por feature. Os scripts SDD cobrem exatamente esses 80% de trabalho determinístico, deixando o agente focar nos 20% que exigem raciocínio.

---

## preflight

```
aioson preflight [path] [--agent=<agent>] [--feature=<slug>] [--json]
```

Coleta todos os dados de pré-voo em uma chamada só: modo do projeto, classificação, framework detectado, test runner, artefatos disponíveis, estado dos phase gates, dev-state, contexto compacto e prontidão para o agente pedido.

**Flags:**

| Flag | Descrição |
|---|---|
| `--agent=<name>` | Filtra prontidão para o agente específico (dev, qa, analyst…) |
| `--feature=<slug>` | Slug da feature para procurar artefatos e gates |
| `--json` | Saída estruturada JSON |

**Saída JSON (campos principais):**

```json
{
  "ok": true,
  "mode": "feature",
  "classification": "SMALL",
  "framework": "Laravel",
  "test_runner": "phpunit",
  "artifacts": { "prd": true, "spec": true, "implementation_plan": false },
  "phase_gates": { "A": "approved", "B": "approved", "C": null, "D": null },
  "readiness": { "status": "READY", "blockers": [] },
  "rules": ["process-atomic-commits.md"]
}
```

**Quando usar:** no início de qualquer sessão de agente para eliminar a necessidade de ler vários arquivos manualmente.

---

## classify

```
aioson classify [path] [--feature=<slug>] [--interactive] [--json]
```

Detecta a classificação da feature (MICRO / SMALL / MEDIUM) automaticamente a partir do PRD e dos requirements, ou interativamente via prompts.

**Algoritmo de pontuação:**

| Dimensão | 0 pts | 1 pt | 2 pts |
|---|---|---|---|
| Tipos de usuário | 1 | 2 | 3+ |
| Integrações externas | nenhuma | 1 | 2+ |
| Regras de negócio | simples | moderadas | complexas |

- **0–1:** MICRO — só `@dev`, sem fases
- **2–3:** SMALL — `@product → @analyst → @dev → @qa`
- **4–6:** MEDIUM — adiciona `@architect`, paralelismo, conformance

**Flags:**

| Flag | Descrição |
|---|---|
| `--feature=<slug>` | Lê `prd-<slug>.md` e `requirements-<slug>.md` automaticamente |
| `--interactive` | Prompts no terminal para entrada manual |
| `--json` | Saída estruturada |

---

## sizing

```
aioson sizing [path] [--feature=<slug>] [--prd=<path>] [--json]
```

Lê o PRD e determina o modelo de sizing: `inplace`, `phased_inplace` ou `phased_external`.

**Critérios:**

| Decisão | Quando |
|---|---|
| `inplace` | ≤ 3 entidades, ≤ 2 fases, sem integração externa |
| `phased_inplace` | 4–7 entidades, 3–5 fases, 1 integração |
| `phased_external` | 8+ entidades ou 6+ fases ou 2+ integrações |

**Saída:**

```json
{
  "ok": true,
  "sizing": "phased_inplace",
  "entities": 5,
  "phases": 4,
  "integrations": 1,
  "score": 10
}
```

---

## detect:test-runner

```
aioson detect:test-runner [path] [--json]
```

Detecta o test runner do projeto verificando arquivos de configuração e `package.json`.

**Frameworks detectados:**

| Framework | Arquivo de configuração |
|---|---|
| PHPUnit | `phpunit.xml`, `phpunit.xml.dist` |
| Pest | `phpunit.xml` com `pestphp` |
| Jest | `jest.config.js`, `jest.config.ts`, `jest.config.mjs` |
| Vitest | `vitest.config.js`, `vitest.config.ts` |
| Pytest | `pytest.ini`, `pyproject.toml`, `setup.cfg` |
| RSpec | `.rspec`, `spec/spec_helper.rb` |
| Forge | `phpunit.xml` com `orchestra/testbench` |
| node:test | `package.json` com script `test` usando `node --test` |

**Saída:**

```json
{
  "ok": true,
  "name": "jest",
  "command": "npx jest",
  "configFile": "jest.config.ts"
}
```

---

## pulse:update

```
aioson pulse:update [path] --agent=<agent> [--feature=<slug>] [--gate=<text>] [--action=<text>] [--next=<text>] [--json]
```

Cria ou atualiza `.aioson/context/project-pulse.md` com o estado atual da sessão.

**O que atualiza:**
- `active_agent`, `active_feature`, `active_work`
- `last_gate` e `last_agent`
- Seção `## Recent Activity` (mantém as últimas 3 entradas)

**Flags:**

| Flag | Descrição |
|---|---|
| `--agent=<name>` | Agente ativo (obrigatório) |
| `--feature=<slug>` | Feature em andamento |
| `--gate=<text>` | Último gate avançado |
| `--action=<text>` | O que está sendo feito agora |
| `--next=<text>` | Próximo passo previsto |

**Exemplo:**

```bash
aioson pulse:update . \
  --agent=dev \
  --feature=checkout \
  --gate="Gate C: approved" \
  --action="Implementing Phase 2: AddToCart" \
  --next="Phase 3: Payment webhook"
```

---

## state:save

```
aioson state:save [path] --feature=<slug> [--phase=<n>] [--next=<text>] [--spec-version=<n>] [--status=<status>] [--json]
```

Cria ou atualiza `.aioson/context/dev-state.md` com o ponto de continuação atual.

**Status válidos:** `in_progress`, `blocked`, `complete`, `paused`

**O que grava:**
- Frontmatter: `feature`, `phase`, `status`, `spec_version`, `updated_at`
- Seção `## History` com entrada timestampada para auditoria

**Exemplo:**

```bash
aioson state:save . \
  --feature=checkout \
  --phase=3 \
  --next="Implement webhook idempotency" \
  --spec-version=4 \
  --status=in_progress
```

---

## feature:close

```
aioson feature:close [path] --feature=<slug> --verdict=<PASS|FAIL> [--residual=<text>] [--notes=<text>] [--json]
```

Fecha uma feature após QA sign-off. Atualiza três arquivos:

1. **`spec-<slug>.md`** — adiciona bloco `## QA Sign-off` e atualiza `gate_execution` no frontmatter
2. **`features.md`** — muda status para `done` ou `qa_failed`
3. **`project-pulse.md`** — zera `active_feature`, atualiza `last_gate`

**Exemplo (PASS):**

```bash
aioson feature:close . --feature=checkout --verdict=PASS
# Com residual (item não testado mas aceito):
aioson feature:close . \
  --feature=checkout \
  --verdict=PASS \
  --residual="Email delivery not tested E2E"
```

**Exemplo (FAIL):**

```bash
aioson feature:close . \
  --feature=checkout \
  --verdict=FAIL \
  --notes="Auth edge case missing — re-open after fix"
```

**Saída JSON:**

```json
{
  "ok": true,
  "feature": "checkout",
  "verdict": "PASS",
  "date": "2026-04-04",
  "residual": null,
  "updates": [
    "spec-checkout.md: added QA sign-off (2026-04-04, PASS)",
    "features.md: checkout → done (2026-04-04)",
    "project-pulse.md: updated active work"
  ]
}
```

---

## gate:check

```
aioson gate:check [path] --feature=<slug> --gate=<gate> [--json]
```

Verifica se um phase gate pode ser aprovado. Retorna `PASS` ou `BLOCKED` com lista de evidências.

**Gates aceitos:** `A` / `requirements`, `B` / `design`, `C` / `plan`, `D` / `execution`

**Pré-requisitos por gate:**

| Gate | Requer | Artefato obrigatório |
|---|---|---|
| A | — | `requirements-<slug>.md` ou `prd-<slug>.md` |
| B | Gate A | `spec-<slug>.md` |
| C | Gates A + B | `implementation-plan-<slug>.md` |
| D | Gates A + B + C | QA sign-off em `spec-<slug>.md` |

**Exemplo:**

```bash
aioson gate:check . --feature=checkout --gate=C --json
```

```json
{
  "ok": true,
  "gate": "C",
  "gate_name": "plan",
  "verdict": "PASS",
  "evidence": [
    "Gate A: approved",
    "Gate B: approved",
    "implementation-plan-checkout.md: found"
  ]
}
```

**Quando BLOCKED:**

```json
{
  "ok": false,
  "gate": "C",
  "verdict": "BLOCKED",
  "blockers": ["Gate B not approved — spec-checkout.md missing or gate_design not set"],
  "evidence": ["Gate A: approved"]
}
```

---

## artifact:validate

```
aioson artifact:validate [path] --feature=<slug> [--json]
```

Valida a cadeia completa de artefatos de uma feature. Verifica a existência de cada arquivo esperado e reporta o que está presente, ausente ou opcional.

**Cadeia verificada:**

```
project.context.md
  → prd-<slug>.md
    → sheldon-<slug>.md (opcional para MICRO)
      → requirements-<slug>.md
        → spec-<slug>.md
          → architecture.md
            → implementation-plan-<slug>.md
              → conformance-<slug>.yaml (somente MEDIUM)
```

**Saída:**

```json
{
  "ok": true,
  "feature": "checkout",
  "classification": "SMALL",
  "present": ["project.context.md", "prd-checkout.md", "spec-checkout.md"],
  "missing": ["implementation-plan-checkout.md"],
  "optional_missing": ["sheldon-checkout.md"],
  "chain_complete": false,
  "next_missing": "implementation-plan-checkout.md"
}
```

---

## workflow:execute

```
aioson workflow:execute [path] --feature=<slug> [--tool=<tool>] [--classification=<tier>] [--agentic] [--max-dev-qa-cycles=<n>] [--max-tester-cycles=<n>] [--max-pentester-cycles=<n>] [--dry-run] [--start-from=<agent>] [--json]
```

Monta e executa o plano de agentes para uma feature com base na classificação.

**Planos por tier:**

| Tier | Passos |
|---|---|
| MICRO | `@dev` |
| SMALL | `@product → @analyst → @dev → @qa` |
| MEDIUM | `@product → @analyst → @architect → gate:check C → @dev (por fase) → @qa` |

**Flags:**

| Flag | Descrição |
|---|---|
| `--tool=<tool>` | Ferramenta a usar (`claude`, `codex`, `opencode`) |
| `--classification=<tier>` | Override manual da classificação |
| `--agentic` | Emite/persiste `agentic_policy` para o gateway continuar handoffs determinísticos |
| `--max-dev-qa-cycles=<n>` | Limite do loop `@dev` ↔ `@qa` no modo agentic (padrão: 3) |
| `--max-tester-cycles=<n>` | Limite de correções após `@tester` no modo agentic (padrão: 3) |
| `--max-pentester-cycles=<n>` | Limite de correções após `@pentester` no modo agentic (padrão: 3) |
| `--dry-run` | Mostra o plano sem executar |
| `--start-from=<agent>` | Pula agentes anteriores ao agente dado |

**Exemplo dry-run:**

```bash
aioson workflow:execute . \
  --feature=checkout \
  --classification=SMALL \
  --agentic \
  --dry-run \
  --json
```

```json
{
  "ok": true,
  "dry_run": true,
  "feature": "checkout",
  "classification": "SMALL",
  "agentic_policy": {
    "enabled": true,
    "review_cycle": {
      "max_dev_qa_cycles": 3,
      "feature_close": "human_gate"
    }
  },
  "steps": [
    { "agent": "product", "skip": false, "reason": "prd not found" },
    { "agent": "analyst", "skip": false },
    { "agent": "dev", "skip": false },
    { "agent": "qa", "skip": false }
  ]
}
```

**Exemplo com retomada:**

```bash
# Feature travada em dev — pular product e analyst
aioson workflow:execute . \
  --feature=checkout \
  --tool=claude \
  --start-from=dev
```

---

## runner:queue:from-plan

```
aioson runner:queue:from-plan [path] --feature=<slug> [--plan=<path>] [--agent=<agent>] [--dry-run] [--json]
```

Extrai as fases de um plano de implementação e as enfileira no runner do AIOSON com prioridades correspondentes ao número da fase.

**Formato reconhecido:**

O arquivo deve conter headers `## Phase N: Título da fase` (onde N é um inteiro). Qualquer nível de heading funciona.

**Requer:** banco de runtime inicializado (`aioson runtime:init .` ou uso prévio do runner).

**Flags:**

| Flag | Descrição |
|---|---|
| `--feature=<slug>` | Lê `.aioson/context/implementation-plan-<slug>.md` |
| `--plan=<path>` | Caminho arbitrário para o arquivo de plano |
| `--agent=<name>` | Agente padrão para as tarefas enfileiradas |
| `--dry-run` | Lista as fases sem enfileirar |

**Exemplo:**

```bash
# Dry-run para ver as fases antes de enfileirar
aioson runner:queue:from-plan . --feature=checkout --dry-run

# Enfileirar todas as fases para o agente dev
aioson runner:queue:from-plan . --feature=checkout --agent=dev
```

**Saída (modo enfileirado):**

```json
{
  "ok": true,
  "feature": "checkout",
  "queued": [
    { "phase": 1, "title": "Create database migrations", "priority": 1 },
    { "phase": 2, "title": "Implement AddToCart action", "priority": 2 },
    { "phase": 3, "title": "Payment webhook handler", "priority": 3 }
  ]
}
```

---

## learning:auto-promote

```
aioson learning:auto-promote [path] [--threshold=<n>] [--dry-run] [--json]
```

Lê `project_learnings` do SQLite de runtime e promove automaticamente aprendizados de processo e qualidade de alta frequência para arquivos de regra em `.aioson/rules/`.

**Tipos promovidos:** `process`, `quality`
**Tipos não promovidos:** `domain` (anotados em `noted_items`, não viram regras)

**Threshold padrão:** 3 ocorrências

**Arquivo gerado:** `.aioson/rules/<type>-<slug>.md`

**Exemplo:**

```bash
# Ver o que seria promovido sem escrever nada
aioson learning:auto-promote . --threshold=3 --dry-run

# Promover com threshold mais alto
aioson learning:auto-promote . --threshold=5
```

**Saída:**

```json
{
  "ok": true,
  "dry_run": false,
  "threshold": 3,
  "eligible": 2,
  "promoted": 2,
  "skipped": 0,
  "noted": 1,
  "promoted_items": [
    { "title": "Commit after each atomic step", "type": "process", "file": ".aioson/rules/process-commit-after-each-atomic-step.md" },
    { "title": "Run tests before commit", "type": "process", "file": ".aioson/rules/process-run-tests-before-commit.md" }
  ],
  "noted_items": [
    { "title": "Cart uniqueness constraint", "type": "domain" }
  ]
}
```

---

## Fluxo completo de uma feature SMALL

```bash
# 1. Pré-voo: ver o estado antes de começar
aioson preflight . --agent=dev --feature=checkout

# 2. Classificar automaticamente
aioson classify . --feature=checkout

# 3. Verificar cadeia de artefatos
aioson artifact:validate . --feature=checkout

# 4. Checar gate C antes de começar dev
aioson gate:check . --feature=checkout --gate=C

# 5. Executar workflow (ou dry-run primeiro)
aioson workflow:execute . --feature=checkout --tool=claude --dry-run
aioson workflow:execute . --feature=checkout --tool=claude

# 6. Durante dev: salvar estado ao final de cada fase
aioson state:save . --feature=checkout --phase=2 --status=in_progress \
  --next="Phase 3: webhook" --spec-version=3
aioson pulse:update . --agent=dev --feature=checkout \
  --action="Phase 2 done" --next="Phase 3"

# 7. QA sign-off
aioson feature:close . --feature=checkout --verdict=PASS

# 8. Promover aprendizados para regras
aioson learning:auto-promote . --threshold=3
```

---

## Integração com a Regra dos 80%

Esses scripts foram criados conforme o **Plan 79 — SDD Automation Scripts**. A ideia central é:

- **80% do trabalho** de verificação, estado e validação é determinístico — scripts fazem melhor que LLMs
- **20% restantes** exigem raciocínio — reserve o contexto do agente para isso

**Economia estimada por feature:**

| Comando | Tokens economizados |
|---|---|
| `preflight` | 1.800–3.200 tokens (leitura de vários arquivos) |
| `classify` | 800–1.500 tokens (análise de scoring) |
| `gate:check` | 600–1.200 tokens (verificação de pré-requisitos) |
| `artifact:validate` | 500–900 tokens (varredura de cadeia) |
| `state:save` + `pulse:update` | 300–600 tokens (escrita de estado) |
| `feature:close` | 800–1.400 tokens (atualização de três arquivos) |
| **Total** | **4.800–8.800 por feature** |
