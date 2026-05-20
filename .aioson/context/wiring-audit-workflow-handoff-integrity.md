---
feature: workflow-handoff-integrity
slug: workflow-handoff-integrity
created_by: dev
created_at: 2026-05-20
purpose: "Wiring audit obrigatório (PMD-07 / BR-05 / RF-09 / brain sheldon-006 ★5) — confirma para CADA phase que código novo é invocado dos call sites existentes, testes cobrem o caminho real, e smoke test exercita ponta-a-ponta. Sem este documento, @qa Gate D não pode passar."
phases:
  phase_1_f2: completed
  phase_2_f3: pending
  phase_3_f1: pending
  phase_4_t5: pending
  phase_5_t6: pending
---

# Wiring Audit — Workflow Handoff Integrity

> **Por que existe:** evita o anti-pattern documentado em brain sheldon-006 ★5 ("design-complete ≠ execution-complete"). Sem audit, é fácil shippar código sem que call sites existentes o invoquem — exatamente o que aconteceu em `@validator` (orfanado por semanas) e na migração 981a8fd (workspace pm.md atualizado mas template+test esquecidos).
>
> **Gate D blocker:** este documento DEVE ter entrada para cada phase entregue antes de Gate D approve. `@qa` lê esta seção para verificar wiring real, não apenas existência de arquivos.

## Phase 1 — F2: agent:done auto-emit (v1.9.5 candidate)

**Status:** Implementation complete; awaiting full npm test pass + Gate D for closure.

### Call sites — onde o código novo é invocado

**`maybeAutoAdvanceWorkflow` helper** (`src/commands/runtime.js:1338`):

```bash
$ grep -n "maybeAutoAdvanceWorkflow" src/commands/runtime.js
1226:      await maybeAutoAdvanceWorkflow({ targetDir, normalizedAgent, options, logger, t });   # live session branch
1286:    await maybeAutoAdvanceWorkflow({ targetDir, normalizedAgent, options, logger, t });     # standalone branch
1309: * maybeAutoAdvanceWorkflow — F2 (workflow-handoff-integrity v1.9.5)                       # doc comment
1338:async function maybeAutoAdvanceWorkflow({ targetDir, normalizedAgent, options = {}, logger, t }) { ... }   # definition
2227:  maybeAutoAdvanceWorkflow,                                                                # module.exports
```

Ambos os call sites estão em `runAgentDone`, cobrindo as 2 branches do agent:done lifecycle (live session via `aioson live:start`/`agent:prompt` AND standalone via direct invocation). Nenhum agent:done path bypass — confirmado por inspeção do código de `runAgentDone`.

**`getCanonicalArtifactsForAgent` helper** (`src/handoff-contract.js`):

```bash
$ grep -rn "getCanonicalArtifactsForAgent" src/ tests/
src/handoff-contract.js:421:async function getCanonicalArtifactsForAgent(agent, targetDir, state) {   # definition
src/handoff-contract.js:437:  getCanonicalArtifactsForAgent,                                          # module.exports
src/commands/runtime.js:1395:    const { getCanonicalArtifactsForAgent } = require('../handoff-contract');   # lazy require em maybeAutoAdvanceWorkflow
```

Único call site: dentro de `maybeAutoAdvanceWorkflow` (lazy require pattern para evitar circular dependency entre runtime.js e handoff-contract.js).

### Tests cobrindo o caminho real

**`tests/agent-done-auto-emit.test.js`** — 13 tests cobrindo ACs F2-01 a F2-10:

| AC | Test name | Path exercised |
|----|-----------|----------------|
| AC-F2-01 | "AC-F2-01 happy path: artifact present + active workflow → advances + writes last_workflow_event_at" | Full happy path through maybeAutoAdvanceWorkflow → runWorkflowNext |
| AC-F2-02 | "AC-F2-02 backward-compat: workflow.state.json absent → skip auto-advance, no warning" | Early return `no_active_workflow` |
| AC-F2-03 | "AC-F2-03 opt-out: --no-auto-advance flag" + camelCase alias | Early return `opt-out` |
| AC-F2-04 | "AC-F2-04 telemetry order" | Placeholder — verified by code review (see § Code review notes) |
| AC-F2-05 | "AC-F2-05 idempotency: re-execution within 1s window" + "past 1s window" | Idempotency guard logic |
| AC-F2-06 | "AC-F2-06 no canonical artifact: @dev empty contract" + "artifact missing on disk" | CONTRACTS lookup with empty/missing artifacts |
| AC-F2-07 | (meta-AC: this test file IS the deliverable) | — |
| AC-F2-08 | (meta-AC: this wiring audit IS the deliverable) | — |
| AC-F2-09 | "AC-F2-09 graceful degradation: corrupt workflow.state.json" + "json mode suppresses warning" | Corrupted JSON parse fail |
| AC-F2-10 | "AC-F2-10 unknown agent: not in handoff-contract CONTRACTS" | CONTRACTS lookup returns null |

13/13 passing as of 2026-05-20 (confirmed via `node --test tests/agent-done-auto-emit.test.js`).

### Code review notes (AC-F2-04 not auto-testable)

**AC-F2-04** asserts: "telemetry SQLite (`agent_events` row) é gravado ANTES de chamar `runWorkflowNext`". Não há fixture de teste capaz de race-condition assertar isto sem interceptar chamadas internas. Verificação via inspeção do código em `runAgentDone`:

- Live session branch (linha 1198): `appendRunEvent(db, { eventType: 'agent_done', ... })` precede a chamada em linha 1226 (`maybeAutoAdvanceWorkflow`).
- Standalone branch (linha 1242): `logAgentEvent(db, runtimeDir, { type: 'completed', ... })` precede a chamada em linha 1286 (`maybeAutoAdvanceWorkflow`).

`@qa` deve confirmar este ordering via leitura direta do código em Gate D review. Marcado como manual checklist item.

### Smoke test status

**N/A para Phase 1.** Smoke test ponta-a-ponta é Phase 5 (T6). Quando T6 ship, smoke test exercita F2 auto-advance como parte da cadeia mock greenfield.

Interim manual smoke recomendado antes de v1.9.5 publish:
1. Em fixture greenfield: `npm pack` no source, `npm install` no fixture, `aioson setup .`
2. Criar feature mock simples (PRD + spec + requirements skeleton)
3. Rodar `aioson workflow:next .` para começar
4. Em cada agente da cadeia: invocar `aioson agent:done . --agent=<X>` e verificar:
   - `workflow:status` avança automaticamente
   - `workflow.state.json` ganha campo `last_workflow_event_at`
   - Re-execução de `agent:done` para mesmo agente NÃO duplica event (idempotency)
5. Testar opt-out: `aioson agent:done . --agent=<X> --no-auto-advance` → pointer não avança

### Phase 1 sign-off

- ✅ Call sites confirmed via grep
- ✅ 13/13 unit tests passing
- ✅ Backward-compat baseline locked (tests/baselines/agent-done-stdout.txt)
- ✅ Code review checklist documented (AC-F2-04 ordering)
- ⏳ Full npm test suite — running
- ⏳ Manual smoke em fixture greenfield (recomendado antes de tag v1.9.5)

## Phase 2 — F3: CLI pending guard (v1.9.6 — pending)

_Será preenchido quando Phase 2 implementar._

## Phase 3 — F1: stale dev-state interactive (v1.9.7 — pending)

_Será preenchido quando Phase 3 implementar._

## Phase 4 — T5: semantic sync preflight (v1.9.8 — pending)

_Será preenchido quando Phase 4 implementar._

## Phase 5 — T6: CI smoke pre-publish (v1.10.0 — pending)

_Será preenchido quando Phase 5 implementar. Cross-phase wiring audit final consolida confirmação de TODAS as 5 phases via smoke test passing._
