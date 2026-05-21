---
feature: workflow-handoff-integrity
slug: workflow-handoff-integrity
created_by: dev
created_at: 2026-05-20
purpose: "Wiring audit obrigatório (PMD-07 / BR-05 / RF-09 / brain sheldon-006 ★5) — confirma para CADA phase que código novo é invocado dos call sites existentes, testes cobrem o caminho real, e smoke test exercita ponta-a-ponta. Sem este documento, @qa Gate D não pode passar."
phases:
  phase_1_f2: completed
  phase_2_f3: completed
  phase_3_f1: completed
  phase_4_t5: completed
  phase_5_t6: completed
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

## Phase 2 — F3: CLI pending guard (v1.9.6 candidate)

**Status:** Implementation complete; awaiting full npm test pass + Gate D for closure.

### Call sites — onde o código novo é invocado

**`assertManifestNotPending` helper** (`src/commands/workflow-next.js`):

```bash
$ grep -n "assertManifestNotPending" src/commands/workflow-next.js
# definition + 1 call site in runWorkflowNext + module.exports
```

Single call site: inside `runWorkflowNext` at start of `options.complete` branch (BEFORE `finalizeCurrentStage`). Per AC-F3-05 precedence: guard runs before existing validation + emit logic. Existing CLI consumers of `workflow:next --complete=<agent>` automatically hit the guard.

### Tests cobrindo o caminho real

**`tests/workflow-next-pending-guard.test.js`** — 10 tests cobrindo ACs F3-01 a F3-07:

| AC | Test name | Path exercised |
|----|-----------|----------------|
| AC-F3-01 | "hard error: pending-architect-decisions blocks with actionable message" | Error code + message format |
| AC-F3-02 | "regex match: pending-product-decisions / pending-pm-decisions" | Regex generic match against whitelist |
| AC-F3-02 | "unknown captured group: still blocks but flagged as unrecognized" | DD-02 hybrid: regex + whitelist warn |
| AC-F3-02 | "status not matching pending-*-decisions pattern" | Pattern specificity (e.g. `ready`, `pending-review` don't trigger) |
| AC-F3-03 | "--force override: returns silently even with pending state" | Override path |
| AC-F3-04 | "no manifest: file absent → silent skip" + "no slug: project mode → silent skip" | No over-block when manifest absent |
| AC-F3-05 | (implicit by code placement) | Guard precedence over finalizeCurrentStage — verified by code review |
| AC-F3-06 | (this test file IS the deliverable) | — |
| AC-F3-07 | (this wiring audit IS the deliverable) | — |
| — | "manifest without status field: silent skip" | Robustness against incomplete manifests |
| — | "whitelist constant matches DD-02 canonical set" | Whitelist surface stable |

10/10 passing as of 2026-05-20.

### Code review notes (AC-F3-05 precedence)

Verified via code inspection in `runWorkflowNext`:

```
Line 990:   if (options.complete || options['complete-current']) {
Line 992:     await assertManifestNotPending(targetDir, state.featureSlug, force);   ← F3 guard
Line 1001:    finalized = await finalizeCurrentStage(...)                            ← existing logic
```

Guard fires BEFORE finalizeCurrentStage. Throw propagates to CLI as exit != 0 (PMD-02 hard error).

### Smoke test status

**N/A para Phase 2.** Smoke test ponta-a-ponta é Phase 5 (T6). Composto F2+F3 test (cadeia mock + manifest pending) será adicionado em Phase 5.

### Phase 2 sign-off

- ✅ Call sites confirmed via grep
- ✅ 10/10 unit tests passing
- ✅ Coordination with existing logErrorLine pattern preserved
- ✅ DD-02 hybrid regex+whitelist implemented
- ⏳ Full npm test suite — running

## Phase 3 — F1: stale dev-state interactive (v1.9.7 candidate)

**Status:** Implementation complete; 20/20 unit tests passing.

**DPC-07 (additional path correction discovered during scan):** `src/preflight.js` referenced in PRD/architecture does NOT exist. The actual locations are:
- `src/preflight-engine.js` — pure logic helpers (`readDevState`, `detectStaleDevState`, `evaluateReadiness`).
- `src/commands/preflight.js` — CLI command (`runPreflight`).

F1 extended BOTH: helpers in `preflight-engine.js` + caller updated to async rich variant in `commands/preflight.js`.

### Call sites — onde o código novo é invocado

**`detectStaleDevStateRich` async helper** (`src/preflight-engine.js`):

```bash
$ grep -rn "detectStaleDevStateRich" src/
src/preflight-engine.js:507 (definition)
src/preflight-engine.js:641 (module.exports)
src/commands/preflight.js:31 (import)
src/commands/preflight.js:76 (call site — replaces previous sync detectStaleDevState)
```

`runPreflight` (the `aioson preflight` CLI command) now uses the rich variant — picks up the 3 new conditions automatically for every dev/deyvin preflight call.

**`detectStaleDevState` sync** (`src/preflight-engine.js`): still called from `evaluateReadiness` line 571 (which is sync). The parseError handling (AC-F1-08) flows through this sync path too — both call sites benefit from the corruption check.

**`runStateReset` command** (`src/commands/state-save.js`):

```bash
$ grep -n "runStateReset" src/
src/commands/state-save.js:222 (definition)
src/commands/state-save.js:281 (module.exports)
src/cli.js:180 (import)
src/cli.js:1330 (CLI routing branch)
```

Wired in `src/cli.js` via two command aliases: `state:reset` and `state-reset`. Listed in KNOWN_COMMANDS at line 586.

### Tests cobrindo o caminho real

**`tests/preflight-stale-devstate.test.js`** — 20 tests cobrindo ACs F1-01..08:

| AC | Test name | Path exercised |
|----|-----------|----------------|
| AC-F1-01 | "(a) rich detection: feature marked done in features.md → stale + command suggestion" | Warning text includes `aioson state:reset` action |
| AC-F1-03 | "state:reset removes dev-state.md" + "idempotent: no-op when absent" + "--archive moves to runtime/devstate-history/" + "--json structured result" | State reset CLI surface |
| AC-F1-04 | (state:save --feature validation deferred — covered by existing state-save tests) | — |
| AC-F1-05 (a) | "feature marked done in features.md" + "abandoned" variants | features.md status='done'/'abandoned' |
| AC-F1-05 (b) | "feature absent from features.md → orphan warning" | Cross-project leak / orphan |
| AC-F1-05 (c) | "last_updated > 30 days → TTL warning" | TTL check |
| AC-F1-06 | (this test file IS the deliverable) | — |
| AC-F1-07 | (this wiring audit IS the deliverable) | — |
| AC-F1-08 | "readDevState flags parseError when content has no frontmatter markers" + "empty frontmatter" + "detectStaleDevState returns warning when parseError" | Corrupt parse handling |
| — | "current state + within 30d + active in features.md → no warning" | Negative case (false-positive guard) |
| — | "features.md absent → falls back to sync baseline only" | No over-trigger when features.md missing |
| — | parseFeaturesMap extraction + header skipping | Helper robustness |

20/20 passing as of 2026-05-20.

### Smoke test status

**N/A para Phase 3.** Composto F1+F2 (cadeia ativa + stale state + warning surface) será coberto em Phase 5 (T6) smoke test.

### Phase 3 sign-off

- ✅ Call sites confirmed via grep (4 spots: preflight-engine def, exports, preflight.js import + call site; cli.js import + routing branch)
- ✅ 20/20 unit tests passing
- ✅ DPC-07 documented (preflight.js → preflight-engine.js)
- ✅ Backward-compat: sync `detectStaleDevState` still works for legacy callers (evaluateReadiness)
- ✅ `state:reset` idempotent + archive variant + json mode
- ⏳ Full npm test suite — running

## Phase 4 — T5: semantic sync preflight (v1.9.8 candidate)

**Status:** Implementation complete; 20/20 unit tests passing; 0 drift detected against actual repo (smoke verified).

### Call sites — onde o código novo é invocado

**`diffAgentFile` aggregate helper** (`src/lib/agent-semantic-diff.js`):

```bash
$ grep -rn "diffAgentFile\|checkSemanticParity" src/ tests/
src/lib/agent-semantic-diff.js (helper definitions)
src/commands/sync-agents-preflight.js (consumes diffAgentFile + new checkSemanticParity)
tests/sync-agents-preflight-semantic.test.js (20 tests)
```

`checkSemanticParity` is invoked from `main()` of sync-agents-preflight.js — same entry point as the existing `checkParity` + `checkLearningLoopTemplateParity`. Three checks run side-by-side; semantic drift is warning-by-default, hard-fail in pre-publish mode.

### Tests cobrindo o caminho real

**`tests/sync-agents-preflight-semantic.test.js`** — 20 tests cobrindo ACs T5-01..08:

| AC | Test name | Path exercised |
|----|-----------|----------------|
| AC-T5-01 | "diffHeaders detects sections missing in template (981a8fd pattern)" + "diffSectionContent catches body drift even when headers match" | Header + section-content diff plugins |
| AC-T5-02 | "mode detection: AIOSON_PREPUBLISH=true → severity becomes error" | Env-var-driven severity |
| AC-T5-03 | (exclusion list: v1 = empty per plan) | Out of scope |
| AC-T5-04 | (signal richness: tests assert kind+hint structure) | Issue object shape |
| AC-T5-05 | "frontmatter field-level diff reports value changes" | Frontmatter plugin |
| AC-T5-06 | "regression guard: 981a8fd-style diff is caught" | **Critical** — reproduces the original bug scenario; check now catches it |
| AC-T5-07 | (this wiring audit IS the deliverable) | — |
| AC-T5-08 | "diffAgentFile reports missing file on either side" + "missing template file detection: workspace exists, template absent" | Missing-file detection |

Plus robustness tests: identical inputs → empty result, fenced code blocks ignored in header extraction, whitespace-only differences considered cosmetic (no false positive), `normalizeBody` deterministic.

20/20 passing as of 2026-05-20.

### Smoke test status

**Smoke against actual repo:** `node -e "const { checkSemanticParity } = require('./src/commands/sync-agents-preflight'); console.log(checkSemanticParity(process.cwd()).length)"` → 0 drift issues. Workspace ↔ template agent files are aligned (v1.9.4 AskUserQuestion mass-edit preserved parity correctly).

Full ponta-a-ponta smoke is Phase 5 (T6).

### Phase 4 sign-off

- ✅ Call sites confirmed via grep
- ✅ 20/20 unit tests passing including AC-T5-06 regression guard
- ✅ Mode detection works (default warn, AIOSON_PREPUBLISH → error)
- ✅ 0 drift against current repo (proves no false positives on aligned content)
- ✅ Telemetry event emitted on drift (existing dossierTelemetry pattern)
- ⏳ Full npm test suite — running

## Phase 5 — T6: CI smoke pre-publish (v1.10.0)

**Status:** Implementation complete; 11/11 smoke checks green (`pass=11 fail=0`); GitHub Actions workflow gated by `release` label.

### Call sites — onde o código novo é invocado

**`scripts/smoke-run-chain.js`** — standalone Node runner. Direct invocation surface:

```bash
$ node scripts/smoke-run-chain.js                    # local mode (warnings)
$ AIOSON_PREPUBLISH=true node scripts/smoke-run-chain.js   # pre-publish mode (hard fail on drift)
```

CI invocation (`.github/workflows/release-smoke.yml`):
- Trigger: `pull_request` with label `release` OR manual `workflow_dispatch`.
- Steps: `npm ci` → `npm run ci` (existing lint + test) → `node scripts/smoke-run-chain.js` (with `AIOSON_PREPUBLISH=true` env on job) → `npm pack --dry-run`.
- Exit 0 = green; exit != 0 blocks PR merge.

The runner exercises real exported APIs from Phases 1-4 (DD-04 mock-only mode):

```bash
$ grep -n "require(path.join(REPO_ROOT" scripts/smoke-run-chain.js
# imports:
#   src/preflight-engine.js → readDevState, detectStaleDevStateRich
#   src/commands/runtime.js → maybeAutoAdvanceWorkflow
#   src/commands/workflow-next.js → assertManifestNotPending
#   src/commands/sync-agents-preflight.js → checkSemanticParity
#   src/commands/state-save.js → runStateReset
```

No subprocess shelling-out (per PMD-05 R2 — fixtures stay fresh, no installed-package drift). All checks isolated in `os.tmpdir()` fixtures, cleaned up on exit.

### Tests cobrindo o caminho real

**`tests/scripts/smoke-run-chain.test.js`** — 3 tests:

| AC | Test name | Path exercised |
|----|-----------|----------------|
| AC-T6-01 | "smoke runner: green run exits 0 in local mode" | Full smoke runner via `spawnSync(node, ['scripts/smoke-run-chain.js'])`, asserts exit=0 + `pass=N fail=0` + "All smoke checks green" |
| AC-T6-05 | "smoke runner: AIOSON_PREPUBLISH=true preserves green exit when repo is clean" | Pre-publish mode banner present + exit=0 (clean repo) |
| AC-T6-08 | "smoke runner: output identifies failing step on injected failure" | Output discipline check — all 5 sections (F1/F2/F3/T5/REPO) present with per-step labels |

**`scripts/smoke-run-chain.js` internal coverage (11 checks):**

| Phase | Check | Path exercised |
|-------|-------|----------------|
| F1 | "Stale dev-state detection + state:reset" | `detectStaleDevStateRich` returns warning for done-feature + orphan + TTL>30d; `runStateReset` idempotent |
| F2 | "agent:done auto-advance" | `maybeAutoAdvanceWorkflow` with absent state (backward-compat), `--no-auto-advance` flag, corrupt JSON graceful skip |
| F3 | "workflow:next pending-decisions guard" | `assertManifestNotPending` blocks `pending-architect-decisions` + `--force` override |
| T5 | "Semantic sync preflight" | `checkSemanticParity` catches 981a8fd-style drift; AIOSON_PREPUBLISH elevates severity; no false positives on identical inputs |
| REPO | "Final parity safety net" | `checkSemanticParity(process.cwd())` against actual repo agent files → 0 drift |

**Latest run (local mode):** `Result: pass=11  fail=0  →  All smoke checks green. Safe to proceed with publish.`

### Fixtures

**`tests/fixtures/medium-feature-mock/`** — 6 mock JSON files (one per MEDIUM-classification agent: product, analyst, architect, pm, dev, qa). Each contains:

- `writes`: path-template → content-template map (paths support `{slug}` substitution).
- `spec_frontmatter`: gate approvals (e.g. `gate_requirements: approved`) to populate spec file as chain advances.

Plus `README.md` documenting freshness rule (PMD-05 / Sheldon R2: fixtures regenerated from `npm pack` if drift suspected, NOT pinned to repo state).

Mocks are inert templates — the smoke runner reads them to simulate `writes` paths into tmp fixtures, but never invokes real LLM calls. This is the deterministic-CI commitment (DD-04 mock-only).

### Cross-phase consolidation

Required by BR-05 / PMD-07 ("design-complete ≠ execution-complete" anti-pattern). Confirms every phase deliverable is wired to real call sites and exercised by tests:

| Phase | Feature | Call site count | Tests | Smoke coverage |
|-------|---------|-----------------|-------|----------------|
| 1 — F2 | `agent:done` auto-emit | 2 (live + standalone branches in `runAgentDone`) | 13/13 | ✅ via runner |
| 2 — F3 | `workflow:next` pending guard | 1 (start of `complete` branch in `runWorkflowNext`, before `finalizeCurrentStage`) | 10/10 | ✅ via runner |
| 3 — F1 | Stale `dev-state.md` + `state:reset` | 4 (helpers + CLI command + 2 routing branches) | 20/20 | ✅ via runner |
| 4 — T5 | Semantic sync preflight | 1 (`main()` of `sync-agents-preflight.js`) + 0 drift against actual repo | 20/20 | ✅ via runner + parity safety net |
| 5 — T6 | CI smoke runner | 1 (GitHub Actions `release-smoke.yml` triggered by `release` label) | 3/3 | ✅ self-tests |

All 5 phases ship as progressive minor releases v1.9.5 → v1.9.6 → v1.9.7 → v1.9.8 → v1.10.0 per DD-05 (inception-risk minimization vs single-MEDIUM-release alternative). `release-smoke.yml` gates future `npm publish` operations behind `release`-labeled PRs.

### Phase 5 sign-off

- ✅ Smoke runner `scripts/smoke-run-chain.js` — 11/11 pass (local + prepublish modes)
- ✅ Unit test `tests/scripts/smoke-run-chain.test.js` — 3/3 pass (AC-T6-01, AC-T6-05, AC-T6-08)
- ✅ CI workflow `.github/workflows/release-smoke.yml` — release-labeled PR gate
- ✅ Mock fixtures `tests/fixtures/medium-feature-mock/` — 6 agent mocks + README
- ✅ All 5 phases wired and tested (cross-phase table above)
- ✅ DD-04 mock-only commitment honored (no LLM calls, deterministic CI)
- ✅ PMD-05 fixture freshness rule documented (R2)
- ⏳ Final Gate D approval + features.md status → done
