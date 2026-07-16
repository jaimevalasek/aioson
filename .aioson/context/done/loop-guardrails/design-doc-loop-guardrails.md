---
description: "Loop Guardrails — pacote técnico para implementar scope guard, orçamento, human gates e criteria no self:loop"
scope: "loop-guardrails"
agents: [dev, qa]
feature: loop-guardrails
created_at: 2026-06-09
readiness: ready_with_warnings
sources:
  - .aioson/context/prd-loop-guardrails.md
  - .aioson/context/requirements-loop-guardrails.md
  - .aioson/context/scope-check-loop-guardrails.md
  - .aioson/context/sheldon-enrichment-loop-guardrails.md
  - .aioson/context/architecture.md
  - .aioson/context/spec-loop-guardrails.md
  - .aioson/context/features/loop-guardrails/dossier.md
---

# Design Doc — Loop Guardrails

## Problem Statement

Evoluir `self:loop` + `harness-contract.json` para um loop controlado por contrato verificável: fronteira de arquivos (scope guard com defaults proibidos não-removíveis), orçamento aplicado (`cost_ceiling_tokens` via chars/4 + `max_runtime_minutes`), gates humanos persistidos (`HUMAN_GATE` + `harness:approve`/`reject`) e `criteria[].verification` avaliados deterministicamente via sandbox — sem subsistema novo, em 2 fases, com retrocompatibilidade total (REQ-11).

## Defined Decisions

Todas as decisões de produto e arquitetura estão fechadas. Índice (não reabrir):

- **D1** — glob matcher próprio (`src/harness/glob-match.js`), subset estrito `**`/`*`/`?`; schema rejeita sintaxe fora do subset; `picomatch` é upgrade path documentado.
- **D2** — EC-2 fechada: baseline grava `git hash-object` dos dirty paths que casam `forbidden_files`; re-hash por tentativa; hash mudou → `scope_violation`.
- **D3** — orçamento lê acumulador em `progress.json` (`budget: { tokens_estimated, warned_80, run_started_at, run_id }`); SQLite (`execution_events.token_count`) é só telemetria, nunca enforcement.
- **D4** — `HUMAN_GATE` vive no circuit-breaker: `progress.status='human_gate'` + `pending_gates[]`; `cb.check()` nega com `reason='human_gate_pending'`; entrar no gate encerra o processo; retomada = re-executar `self:loop` (gates `pending` reapresentados antes de nova detecção — EC-9).
- **D5** — ordem do hook pós-attempt: artifacts → scope guard + re-hash D2 → diff limits → human gates → criteria checks → budget/runtime. Registrar primeiro, julgar depois.
- **D6** — eventos via `insertExecutionEvent` (`src/runtime-store.js:823`), sempre `try/catch` best-effort — telemetria nunca quebra o loop.
- **D7** — assinatura de falha: `sha1(criterion_id + exitCode + primeira linha não-vazia de stderr normalizada)`; persistida em `progress.json.failure_signatures[]`; 2 ocorrências no run (não consecutivas) → `failure_signature_repeat` + parada.
- Detecção de mudanças: `git status --porcelain` atual − `dirty_paths` do baseline; nunca `git diff --name-only` (não vê untracked — EC-1). Paths normalizados `/` antes do matching (EC-6).
- Deny vence allow (REQ-5); defaults proibidos sempre aplicados e não-removíveis (REQ-4).
- Tema `publish` é gate de comando interceptando `feature:close`, nunca diff (REQ-13).
- Presets `safe`/`builder`/`autopilot` preenchem valores do governor não definidos; valor explícito vence; `BALANCED` segue default (REQ-19).

Schemas completos (campos, tipos, constraints): `requirements-loop-guardrails.md` §2. Não redefinir.

## Implementation Paths

Verificado contra o código em 2026-06-09 — todos os anchors existem:

| Anchor | Verificação |
|---|---|
| `src/commands/self-implement-loop.js:224` | `runVerification` no Step 2 do `for`; hook pós-attempt entra após esta linha. Preflight entra antes do `for` (linha ~187) |
| `src/sandbox.js:126` | `executeInSandbox(command, opts)` confirmado |
| `src/runtime-store.js:741` | coluna `token_count` (migration idempotente) confirmada; `insertExecutionEvent` em `:823` |
| `src/harness/` | contém apenas `circuit-breaker.js` (115 linhas) — os 8 módulos novos não colidem com nada |
| `src/cli.js` | padrão de registro confirmado (`harness:init`/`harness-init` etc., linhas 396–401 e 1253+) |
| `src/commands/harness.js` | `runHarnessInit` gera o template do contrato (linha 33) — recebe os campos novos |
| `src/commands/feature-close.js` | existe (535 linhas) — ponto do gate `publish` |
| `src/commands/git-guard.js` | existe (149 linhas) — should-have REQ-20 |

Criar — Fase 1:

```text
src/harness/glob-match.js
src/harness/contract-schema.js
src/harness/git-baseline.js
src/harness/scope-guard.js
src/harness/budget-guard.js
src/harness/attempt-artifacts.js
tests/harness-glob-match.test.js
tests/harness-contract-schema.test.js
tests/harness-scope-guard.test.js
tests/harness-budget-guard.test.js
tests/self-loop-guardrails.test.js     # integração com violação proposital (success metric do PRD)
```

Criar — Fase 2:

```text
src/harness/human-gate.js
src/harness/criteria-runner.js
src/commands/harness-gate.js           # harness:approve / harness:reject
src/commands/harness-status.js         # harness:status [--json]
tests/harness-human-gate.test.js
tests/harness-criteria-runner.test.js
```

Alterar:

```text
src/commands/self-implement-loop.js    # F1: preflight (validate + baseline) + hook pós-attempt (D5)
src/commands/harness.js                # F1: campos novos no template de harness:init
src/harness/circuit-breaker.js         # F2: estado HUMAN_GATE (D4)
src/commands/feature-close.js          # F2: interceptação do gate `publish` (REQ-13)
src/cli.js                             # F2: registrar harness:approve / harness:reject / harness:status
src/commands/git-guard.js              # F2 should-have: merge de forbidden_files do contrato ativo (REQ-20)
```

Runtime artifacts criados em execução (sem código novo além dos writers): `.aioson/plans/{slug}/baseline.json`, `attempts/{n}/{changed-files.json,checks/,diff.patch}`, `gates/{id}.json` — schemas em requirements §2.2–§2.4.

## Reuse Decisions

- **Reusar** `executeInSandbox` (`src/sandbox.js:126`) no `criteria-runner` — timeout, kill de process tree e captura já resolvidos (EC-7). Não criar runner.
- **Reusar** `insertExecutionEvent` (`src/runtime-store.js:823`) para os 10 tipos de evento novos — coluna `type` é texto livre, zero migration.
- **Estender** `circuit-breaker.js` — não substituir; `HUMAN_GATE` é um estado a mais no `check()`.
- **Estender** `progress.json` por slug — acumulador de budget (D3), `pending_gates[]` (D4), `failure_signatures[]` (D7). Hoje o arquivo tem `feature/phase/status/completed_steps/last_error/session_count/last_updated/circuit_state`; campos novos são aditivos.
- **Não tocar** em `template/` — toda a feature é `src/` + testes. Inception rule só se aplicaria se prompts de agentes fossem ajustados (não são, nesta feature).
- **Distinção `harness:validate` vs `contract-schema.js`**: `runHarnessValidate` (em `harness.js:220`) valida *implementação contra criteria* via validator prompt/output — é outra responsabilidade. A validação de *schema do contrato* (REQ-1) vive em `contract-schema.js` e é chamada pelo preflight do `self:loop` e pelo `harness:init`. Não fundir as duas; nomear mensagens de erro de forma a não confundir ("contract schema invalid" vs "validation verdict").

## Componentization & Split Notes

- `self-implement-loop.js` tem ~300 linhas; o wiring do preflight + hook deve ser **fino** (chamadas a funções dos módulos `src/harness/`, sem lógica inline) — alvo: ≤ +80 linhas no command. Toda lógica de guard testável vive nos módulos puros.
- Módulos `src/harness/*` puros: recebem paths/objetos, retornam resultados; I/O git isolado em `git-baseline.js` (única fronteira `child_process` da Fase 1, além do sandbox).
- `harness-gate.js` e `harness-status.js` são commands separados (padrão 1 arquivo/comando do repo) — não inflar `harness.js` (269 linhas) com gates.
- `cli.js` (1630 linhas) recebe só registro no padrão existente — nenhuma lógica.
- `attempt-artifacts.js` é o único writer de `attempts/{n}/` — scope guard e criteria-runner entregam dados a ele, não escrevem direto.

## Wiring Contracts

**Preflight** (antes do `for`, `self-implement-loop.js`):
1. `contractSchema.validate(contract)` → erro explícito `{ field, reason }` encerra antes de qualquer execução (REQ-1); `allowed_files: []` → warning + tratado como ausente (EC-5).
2. `gitBaseline.capture(targetDir, planDir)` → grava `baseline.json` (HEAD, dirty_paths, hashes D2) (REQ-2); warning para dirty path proibido.
3. Gates `pending` existentes → reapresentar e encerrar (EC-9), antes de iniciar run novo.
4. Run novo → zerar acumulador de budget em `progress.json` (`run_id` novo).

**Hook pós-attempt** (após `self-implement-loop.js:224`, ordem D5 fixa):
1. `attemptArtifacts.write(n, changedSet, checks, diff)` — sempre, mesmo em falha.
2. `scopeGuard.check(changedSet, contract)` + re-hash D2 → violação: evento `scope_violation`, pausa, feedback de rollback; reincidência abre circuito (REQ-6).
3. Diff limits `max_changed_files`/`max_diff_lines` (REQ-10).
4. `humanGate.detect(changedSet, contract)` → um gate por tema, `status='human_gate'`, processo encerra (REQ-12).
5. `criteriaRunner.run(criteria, sandbox)` → logs em `checks/{id}.log`; assinatura D7 (REQ-16/17).
6. `budgetGuard.check(progress, contract)` → 80% warning (1x por run), 100% pausa; `max_runtime_minutes` na fronteira (REQ-7/8, EC-11).

## Test Plan for @dev

`node:test` com fixtures git temporárias (repo `git init` em tmp dir, padrão já usado na suíte):

- glob-match: subset `**`/`*`/`?` nos dois separadores (EC-6); rejeição de extglob.
- contract-schema: campo desconhecido/tipo errado → erro com nome do campo; contrato antigo válido (EC-12); presets REQ-19 (explícito vence preset); `allowed_files: []` → warning (EC-5).
- git-baseline: untracked detectado (EC-1); dirty paths excluídos (EC-2); rename conta ambos paths (EC-3); deleção conta (EC-4); hashes D2.
- scope-guard: deny vence allow (REQ-5); defaults não-removíveis (REQ-4); diff limits (REQ-10).
- budget-guard: 80/100% na mesma tentativa emite os dois eventos em ordem e pausa uma vez (EC-11); `null` = sem enforcement; legados `token_count` null (EC-10).
- human-gate: detecção por tema; múltiplos temas = múltiplos gates; approve/reject idempotentes (REQ-14); approve sem gate/loop → erro sem efeito colateral (EC-8); retomada pós-Ctrl+C (EC-9).
- criteria-runner: timeout = check falho com assinatura própria (EC-7); assinatura 2x não-consecutiva para o run (EC-13).
- Integração (`self-loop-guardrails.test.js`): violação proposital detectada e loop pausado antes de `feature:close` — success metric nº 1 do PRD.
- Retrocompat: `npm test` verde ao fechar cada fase (REQ-11).

## Risks and Warnings

- **`workflow.state.json` dessincronizado**: `next` ainda aponta `architect` e `completed` não inclui `architect`, mas Gate B está aprovado (pulse + dossier + architecture.md). Causa provável: sessão do @architect não rodou `aioson workflow:next . --complete`. Não bloqueia @dev em modo direto; sincronizar via CLI antes de sessão tracked.
- **Dossier marca `classification: MEDIUM`** — herança do projeto; a feature é SMALL (requirements §9). Não exigir conformance YAML.
- **`executeAgent` é síncrono e o output do agente é a fonte do chars/4** — confirmar no wiring que `agentResult` expõe o output bruto para estimativa; se só expõe truncado, estimar sobre o que existir e documentar no spec (estimativa honesta > nenhuma, decisão do PRD).
- **`feature-close.js` (535 linhas)** — interceptação do gate `publish` deve ser early-return pequeno chamando `human-gate.js`, não lógica nova no arquivo.
- **Naming**: não confundir `harness:validate` (verdict de implementação) com validação de schema (preflight). Mensagens de erro distintas.

## Handoff to @dev

`@dev` implementa sem decisões de produto pendentes, na sequência do `architecture.md` §7 (Fase 1 passos 1–6, Fase 2 passos 7–10). Cada fase fecha com `npm test` verde + testes da própria fase. `git:guard` merge (passo 10) é should-have — pode ser cortado se a fase apertar, registrando no spec. Atualizar `spec-loop-guardrails.md` (seções "What was built" e decisões novas) ao final de cada fase.
