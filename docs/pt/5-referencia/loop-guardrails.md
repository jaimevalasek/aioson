# Loop Guardrails — Contrato verificável para o self:loop

> Controla o loop autônomo com fronteira de arquivos, orçamento aplicado, gates humanos e critérios avaliados — sem criar subsistemas novos.

Introduzido na v1.22.0. O `self:loop` existente ganhava cap de iterações e circuit-breaker, mas nada impedia o agente de alterar arquivos fora do escopo, o `cost_ceiling_tokens` existia no schema e nunca era aplicado, e não havia aprovação humana no meio do loop. Os guardrails resolvem isso de forma retrocompatível: contratos antigos continuam válidos.

---

## O que são os guardrails

Quatro camadas que o preflight do `self:loop` ativa automaticamente quando o `harness-contract.json` as declara (ou usa os defaults):

| Camada | O que faz |
|---|---|
| **Scope guard** | Valida os arquivos alterados em cada iteração contra globs. Violação pausa o loop. |
| **Budget enforcement** | Aplica `cost_ceiling_tokens` e `max_runtime_minutes`. 80% → warning; 100% → pausa. |
| **Human gates** | Detecta alterações em áreas sensíveis (pagamentos, auth, migrations) e pausa o loop até decisão humana. |
| **Criteria evaluation** | Executa comandos de verificação por critério; mesma assinatura de falha 2× → escala para humano. |

---

## Campos novos no harness-contract.json

```json
{
  "feature": "minha-feature",
  "contract_mode": "safe",
  "governor": {
    "max_steps": 10,
    "cost_ceiling_tokens": 200000,
    "max_runtime_minutes": 30,
    "max_changed_files": 20,
    "max_diff_lines": 1500
  },
  "allowed_files": ["src/modules/checkout/**", "tests/checkout/**"],
  "forbidden_files": ["src/modules/auth/**"],
  "human_gate": {
    "required_for": ["payment_logic_change", "database_destructive_change"]
  },
  "criteria": [
    {
      "id": "tests-pass",
      "description": "Suíte de testes passa sem erros",
      "binary": true,
      "verification": { "command": "npm test", "timeout_ms": 60000 }
    }
  ]
}
```

Campos novos são **todos opcionais**. Contratos existentes sem eles continuam válidos: o scope guard aplica só os defaults proibidos, sem gates e sem orçamento.

---

## Presets de contract_mode

Em vez de configurar cada campo do `governor` manualmente, use um preset:

| Modo | max_steps | cost_ceiling_tokens | max_runtime_minutes | max_changed_files |
|---|---|---|---|---|
| `balanced` (padrão) | — | — | — | — |
| `safe` | 10 | 200.000 | 30 min | 20 |
| `builder` | 30 | 1.000.000 | 120 min | 60 |
| `autopilot` | 50 | 3.000.000 | 360 min | — |

Valor explícito no `governor` sempre vence o preset. `balanced` mantém o comportamento anterior.

---

## Scope guard

### Globs proibidos por padrão (não-removíveis)

```
.env*      *.pem      *.key      secrets/**
.git/**    node_modules/**      package-lock.json
yarn.lock  pnpm-lock.yaml       npm-shrinkwrap.json    bun.lockb
```

Esses defaults são aplicados mesmo quando `forbidden_files` está ausente no contrato.

### Campos

- `allowed_files[]` — globs de arquivos que o loop pode alterar. Quando ausente, qualquer arquivo fora dos defaults proibidos é permitido.
- `forbidden_files[]` — globs proibidos adicionais (mergeados com os defaults).

### O que acontece numa violação

1. Loop pausa com evento `scope_violation` listando os arquivos fora dos globs.
2. A próxima iteração recebe instrução de reverter e refazer dentro do escopo.
3. Reincidência: circuito abre e escala para humano.

---

## Human gates

### Temas disponíveis

| Tema | Paths monitorados (override possível) |
|---|---|
| `payment_logic_change` | `**/billing/**`, `**/payment/**` |
| `auth_permission_change` | `**/auth/**` |
| `database_destructive_change` | `**/migrations/**` |
| `publish` | (gate de comando — detectado em `feature:close`, não por diff) |

### Ciclo de gate

```
Loop detecta diff em migrations/** → HUMAN_GATE
  ↓
process.exitCode = persistido em .aioson/plans/{slug}/gates/{id}.json
  ↓
aioson harness:approve . --slug=billing --gate=migration-1
  ↓  (ou harness:reject --reason="reverter mudança")
Loop retoma da iteração atual
```

### Comandos

```bash
# Aprovar gate pendente
aioson harness:approve . --slug=<feature> --gate=<id>

# Rejeitar (encerra a tentativa, requer motivo)
aioson harness:reject . --slug=<feature> --gate=<id> --reason="..."

# Listar gates pendentes / estado do loop
aioson harness:status . --slug=<feature>
aioson harness:status . --slug=<feature> --json
```

---

## Budget enforcement

```json
"governor": {
  "cost_ceiling_tokens": 500000,
  "max_runtime_minutes": 60
}
```

- 80% dos tokens → warning em evento, loop continua.
- 100% → pausa com resumo do que foi feito e do que falta. Edite o contrato e reexecute.
- `max_runtime_minutes` → pausa quando o wall-clock ultrapassa o limite.

A estimativa de tokens é best-effort (heurística chars/4 sobre o output do agente, erro típico 5–15%). É uma guarda de parada, não contabilidade exata.

---

## Criteria evaluation

Cada critério pode declarar um comando de verificação:

```json
{
  "id": "lint",
  "description": "Sem erros de lint",
  "verification": { "command": "npm run lint", "timeout_ms": 30000 }
}
```

- O comando roda via `sandbox:exec` (timeout, kill de process tree) após cada iteração.
- Logs gravados em `.aioson/plans/{slug}/attempts/{n}/checks/{id}.log`.
- **Mesma assinatura de falha por 2 tentativas consecutivas** → circuito abre e escala para humano (detecção de loop estéril).

---

## Artefatos por tentativa

Cada iteração produz:

```
.aioson/plans/{slug}/attempts/{n}/
  changed-files.json   # arquivos alterados nesta tentativa
  diff.patch           # patch da tentativa (arquivos rastreados)
  checks/
    {criterion-id}.log # stdout/stderr + exit_code de cada verificação
```

Esses artefatos são o insumo do `@qa` e do `@validator` — sem precisar reconstruir o que aconteceu.

---

## harness:status — visão do loop

```bash
aioson harness:status . --slug=<feature>
```

Exibe:
- Estado do circuito (open / closed / half-open)
- Iteração atual / máximo
- Budget: tokens estimados, tempo decorrido
- Checks da última tentativa: passados / falhos
- Última assinatura de falha
- Gates pendentes
- Próxima ação recomendada

---

## git:guard (camada 2)

O `git:guard` lê os `forbidden_files` do contrato ativo e os aplica como política de pre-commit. Uma segunda barreira: mesmo que o scope guard não capture algo (ex: commit manual fora do loop), o hook bloqueia.

```bash
aioson git:guard .   # inspecionar política ativa
```

---

## Retrocompatibilidade

- Contratos sem os novos campos: scope guard aplica defaults, sem orçamento, sem gates. ✅
- Nenhum comando existente mudou de assinatura. ✅
- Contratos novos com agentes mais antigos que não conhecem os guardrails: campos ignorados silenciosamente pelo agente, mas o CLI ainda aplica as checagens no preflight. ✅

---

## Próximos passos

- [Referência de todos os comandos](./comandos-cli.md#harness)
- [Motor Hardening](./motor-hardening.md) — gates técnicos e auto-cura
- [Sandbox de Execução](./sandbox.md) — como os comandos de verificação rodam
- [Retrospectiva de loop](./harness-retro.md) — minerar o histórico de falhas de uma feature
