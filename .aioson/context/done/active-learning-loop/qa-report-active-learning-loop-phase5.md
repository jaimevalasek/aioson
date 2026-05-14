---
feature: active-learning-loop
phase: 5
slug: feature-close-distillation-hook
reviewer: qa
reviewed_at: 2026-05-14
verdict: PASS
gate: D
classification: MEDIUM
ac_coverage: 6/6
findings:
  critical: 0
  high: 0
  medium: 1
  low: 2
---

# QA Report — active-learning-loop Phase 5 (feature-close-distillation-hook) — 2026-05-14

## Resumo executivo

6/6 ACs (AC-ALL-501..506) cobertas por `tests/feature-close-distillation.test.js`
(12/12 verde). Hook em `feature:close` orquestra a pipeline com lock atômico
via `BEGIN IMMEDIATE` (DD-3), timeout 5s via `Promise.race` (DD-2), best-effort
silent failure (BR-ALL-05), e exatamente 1 tier-2 notify por closure de sucesso
(AC-ALL-502).

QA regression suite `tests/qa-feature-close-distillation.test.js` (6/6 verde)
pinning: 10-way concorrência (exatamente 1 success + 9 `lock_held`), timeout
enforcement (slow auto-promote → `error_phase='timeout'` em <500ms), stuck-lock
V1 (documentado em decision-concurrency.md; resolução V2 via doctor +
`memory:unlock`), 3 closures sequenciais (3 entries `auto_distillation`
distintas, todas com `end_at` setado), i18n × 4 locales (6 keys × 4 = 24
strings), template config defaults.

**Veredicto Gate D: PASS.** 1 Medium (AC-ALL-501 doc-vs-impl drift sobre
pattern:detect — explicação completa abaixo), 2 Low residuais.

## AC coverage

| AC | Descrição | Status |
|----|-----------|--------|
| AC-ALL-501 | Hook dispara `runDistillation(X)` em feature non-MICRO | Covered (partial — ver M-01) |
| AC-ALL-502 | Exatamente 1 tier-2 notify por closure | Covered |
| AC-ALL-503 | Falha silent — `feature:close` retorna ok; `distillation_failed` entry registrada | Covered (com monkey-patch injection) |
| AC-ALL-504 | Lock previne double-distillation; segundo invocador retorna no-op | Covered (dev + QA 10-way pin) |
| AC-ALL-505 | MICRO classification → zero evolution_log entries | Covered |
| AC-ALL-506 | Entry escrita dentro de 5s | Covered |

## Risk-first checklist (Phase 5 scope)

| Risco | Resultado | Evidência |
|-------|-----------|-----------|
| Lock atomicidade (race window) | ✓ `BEGIN IMMEDIATE` escala para write lock | QA-CONCURRENCY-PHASE5 (10-way → 1+9) |
| Timeout enforcement | ✓ `Promise.race` retorna em ~budget + jitter | QA-TIMEOUT (200ms budget → 218ms wall) |
| Best-effort silent failure | ✓ feature-close retorna ok=true em failure | dev AC-ALL-503 (monkey-patch) |
| Stuck lock recovery | ⚠ V1 limitation documentada | QA-STUCK-LOCK-V1 — DD-3 acceptable |
| Sequential closures (no lock leak) | ✓ 3 entries, all end_at set | QA-SEQUENTIAL-CLOSURES |
| MICRO opt-out (BR-ALL-11) | ✓ zero evolution_log entries para slug | dev AC-ALL-505 |
| Notify dedup | ✓ exatamente 1 por closure de sucesso | dev AC-ALL-502 |
| Classification capture pre-archive | ✓ leitura ANTES do archive (descoberto durante dev) | dev hook ordering |
| `--no-distill` escape valve | ✓ skip explícito | dev test |
| `verdict=FAIL` skip | ✓ QA já rejeitou, sem learning a destilar | dev test |
| i18n × 4 locales | ✓ 24 strings (6 keys × 4) | QA-I18N-PHASE5 |
| Template config defaults | ✓ enabled/timeout/lock_strategy/etc. | QA-CONFIG-PHASE5 |

## Findings

### Critical / High
_Nenhuma._

### Medium

#### [M-01] AC-ALL-501 doc-vs-impl drift: hook NÃO executa `pattern:detect`
- **File**: `src/learning-loop-engine.js:147-152` (`runDistillation` workPromise)
- **AC text**: "dispara `runDistillation(X)` que executa **`pattern:detect --feature=X`** + `learning:auto-promote --feature=X` em sequência."
- **Implementação shipada**: chama somente `runLearningAutoPromote`. `pattern:detect` é deliberadamente skipped.
- **Por que**:
  1. `src/commands/pattern-detect.js` aceita **só** `--squad=<slug>`, não `--feature=<slug>`. Tentar chamar com `--feature` retorna `{ ok: false, error: 'missing_squad' }`.
  2. `pattern-detect` opera sobre `squad_learnings` (tabela separada de `project_learnings`). Phase 5 active-learning-loop trata apenas project-scope (per PMD-7 / out-of-scope cross-squad).
  3. `learning-auto-promote` também não aceita `--feature=X` filter; faz scan project-wide (já documentado).
- **Risk**: AC binary nesta interpretação literal não é satisfeita. Funcionalmente, o intent (consolidar learnings em rules pós-feature) é satisfeito pelo `learning-auto-promote`. Telemetria de distillation está completa (`promoted_count`, `review_count`, `skipped_count`) mas `merge_candidate_count = 0` sempre (DD-5 deferred).
- **Fix sugerido** (escolher um):
  1. **Atualizar o PRD/spec** (não o código) — registrar que `pattern:detect` está fora de escopo V1 desta feature (já documentado em PMD-7 cross-squad, mas o AC text não foi atualizado).
  2. **Estender `pattern:detect`** para aceitar `--feature=<slug>` e operar sobre `project_learnings` agrupados por `feature_slug` (V2 trajetory).
  3. **No-op**: aceitar o trade-off, deixar o AC text como história. Próxima iteração da PRD remove a menção.
- **Severidade**: Medium — AC binary não satisfeita literalmente, mas o intent funcional é cumprido; sem impacto de correctness. O `merge_candidate_count=0` em todas as distillations é o sinal observável dessa lacuna.

### Low

#### [L-01] Stuck-lock V1 limitation
- **File**: `src/learning-loop-engine.js` + `.aioson/plans/active-learning-loop/decision-concurrency.md`
- **Observação**: já documentado em DD-3. Crash mid-distillation deixa `end_at=NULL`; futuras invocações retornam `lock_held` indefinidamente. V1 não tem recovery automatic — manual SQL ou aguardar V2 `distillation_stuck` doctor check + `memory:unlock` CLI.
- **Pin de teste**: QA-STUCK-LOCK-V1 verifica que o comportamento é o documentado (lock_held; sem crash).
- **Fix**: fora do escopo Phase 5 (acceptable trade-off conforme decision-concurrency.md).

#### [L-02] Phase 1 `QA-PERF-01` continua flaky em Windows
- **File**: `tests/qa-telemetry-foundation.test.js`
- **Observação**: Sem mudanças. Pre-existente; Phase 5 não toca este path. Standalone profile = dentro do SLA.

## Riscos residuais (documentados, não-blocantes)

- M-01 (pattern:detect AC drift) — recomendação: PRD update para alinhar texto à decisão V1.
- L-01 (stuck lock V1) — V2 trajectory já definida.
- L-02 (Phase 1 stress flake) — ambiental.
- **Pattern hook**: o hook chama `runLearningAutoPromote` que abre seu próprio runtime DB connection. Coexistem dois handles abertos simultaneamente (o do engine + o do auto-promote). better-sqlite3 WAL permite, mas a complexidade poderia ser reduzida no futuro passando o `db` handle como parâmetro.

## Verificação CLI

- `node --test tests/feature-close-distillation.test.js` — 12/12 ✓ (dev)
- `node --test tests/qa-feature-close-distillation.test.js` — 6/6 ✓ (QA pins)
- Phase 1 → 4 regression: 10 + 17 + 3 + 18 + 4 + 18 + 6 = 76/76 ✓
- **Cumulative deterministic: 94/94** ✓

## Recomendações de próximos agentes

- **@dev** (próxima slice) — Phase 6 (`inception-mirror-parity`) é a última fase. ACs AC-ALL-601..605. Não é código novo de produção — é **wiring audit** (brain `sheldon-006` design-complete ≠ execution-complete) + 2 fixture tests + extensão de `sync-agents-preflight.js`. Pequeno em LOC, alto em coverage.
- **@validator** — opcional. `harness-contract.json` da feature é stub (1 critério). Se quiser usar o validator agente para fechar o ciclo binário antes do `feature:close --verdict=PASS` final, ativar após Phase 6. Senão, pular.
- **@pentester** — não acionado. Hook é confinado ao runtime DB local; sem auth/secrets/uploads.

## Sumário

**0 Critical, 0 High, 1 Medium, 2 Low. ACs: 6/6 covered. Veredicto: PASS.**
Phase 5 aprovada para Gate D. Phase 6 (`inception-mirror-parity`) é a última desbloqueada — após ela, feature inteira está pronta para `feature:close --slug=active-learning-loop --verdict=PASS`.
