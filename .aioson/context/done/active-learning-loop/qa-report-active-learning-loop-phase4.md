---
feature: active-learning-loop
phase: 4
slug: doctor-curation-checks
reviewer: qa
reviewed_at: 2026-05-14
verdict: PASS
gate: D
classification: MEDIUM
ac_coverage: 6/6
findings:
  critical: 0
  high: 0
  medium: 0
  low: 1
---

# QA Report — active-learning-loop Phase 4 (doctor-curation-checks) — 2026-05-14

## Resumo executivo

6/6 ACs (AC-ALL-401..406) cobertas por `tests/doctor-curation-checks.test.js`
(18/18 verde). 3 novos doctor checks (`rule_staleness`, `learning_orphans`,
`distillation_lag`) wire-d em `runDoctor` ao nível `severity='warning'`. Pure
function `computeStalenessThreshold(featureCloseDates)` testada em isolation
(4 testes cobrindo edge cases + cadência típica + low-velocity + invalid input).
BR-ALL-11 MICRO opt-out e EC-ALL-11 fresh install ambos cobertos.

QA regression suite adicionada (`tests/qa-doctor-curation-checks.test.js`,
6/6 verde) pinning: performance budget (10k events, p99 < 200ms — medido **7ms**,
**28× headroom**), orphan match via `target_slug`-only payloads (legacy events
sem `target_path`), JSON shape (`report.livingMemory.curation`), flat-rule
convention (nested directories não enumeradas), `_archived/` excluído da
enumeração, fresh-install graceful degradation.

**Veredicto Gate D: PASS.** Zero Critical, zero High, zero Medium. 1 Low
informacional (Phase 1 stress flake recorrente, ambiental). Phase 5
(`feature-close-distillation-hook`) está desbloqueada.

## AC coverage

| AC | Descrição | Status |
|----|-----------|--------|
| AC-ALL-401 | `rule_staleness` fires para rules sem `rule_loaded` em últimas N features | Covered + NULL feature_slug semantics |
| AC-ALL-402 | `learning_orphans` fires para learnings promovidos sem `rule_loaded` posterior | Covered (com / sem orphan; com / sem promoted learnings) |
| AC-ALL-403 | `distillation_lag` fires com ≥5 closed features e <N auto_distillation | Covered (fires + under-threshold no-op) |
| AC-ALL-404 | 3 checks ao nível `severity='warning'`; `doctor.ok` não afetado | Covered |
| AC-ALL-405 | `aioson doctor --json` inclui new checks com schema documentado | Covered (`{id, severity, key, params, ok, hintKey?}`) + `livingMemory.curation` summary |
| AC-ALL-406 | i18n keys presentes em en, pt-BR, es, fr | Covered (require() validation × 4 locales) |

## Risk-first checklist (Phase 4 scope)

| Risco | Resultado | Evidência |
|-------|-----------|-----------|
| Performance @ 10k events | ✓ p99 = 7ms / budget 200ms | QA-PERF-04 pin |
| MICRO opt-out (BR-ALL-11) | ✓ 3 checks emit `*_skipped_micro` | dev test |
| Fresh install (EC-ALL-11) | ✓ ok=true para todos os 3 | dev + QA pins |
| Threshold pure function | ✓ 4 testes (edge cases, cadência típica, low-velocity, invalid) | dev test |
| Orphan match via `target_slug` only | ✓ basename derivation funciona | QA-ORPHAN-MATCH pin |
| Doctor JSON shape | ✓ `livingMemory.curation` exposed | QA-JSON-SHAPE pin |
| Rule enumeration: flat-only | ✓ documented; nested files NOT counted | QA-FLAT-CONVENTION pin |
| `_archived/` exclusão | ✓ directory filter (`e.isFile()`) | QA-EXCLUDE-ARCHIVED-DIR pin |
| Index utilization | ✓ `idx_execution_events_context_load` ativo | implicit via p99 perf |
| i18n × 4 locales | ✓ 36 strings (9 keys × 4 idiomas) | dev test |

## Findings

### Critical / High / Medium
_Nenhuma._

### Low

#### [L-01] Phase 1 stress test `QA-PERF-01` continua flaky em Windows
- **File**: `tests/qa-telemetry-foundation.test.js:30-60`
- **Observação**: Sem mudanças desde Phase 2 / Phase 3. Pre-existente, ambiental. Phase 4 não toca este caminho. Standalone profile = within SLA.
- **Fix**: fora do escopo Phase 4.

## Riscos residuais (documentados, não-blocantes)

- L-01 acima.
- **Flat-rule convention**: `listRuleSlugs` enumera apenas `.aioson/rules/*.md` (top-level). Nested rules (e.g., `.aioson/rules/squad/foo.md`) NÃO são consideradas pelos checks. **Isso é consistente** com `learning-auto-promote.js#RULES_DIR='.aioson/rules'` (que escreve flat). Se em algum momento o framework adotar nested rules como convenção, `listRuleSlugs` precisa de extensão. Documented as known limit.
- **Cross-platform path matching em `assessLearningOrphans`**: o match `target_path = promoted_to` é literal. Phase 1 garante `payload.target_path` em forward-slash (EC-ALL-13). Se Phase 5 (não shipada) escrever `promoted_to` com `\\` em Windows, a janela `target_path = ?` falharia. Fallback `target_slug = basename` mitiga (e está testado em QA-ORPHAN-MATCH). Forward-compat OK.

## Verificação CLI

- `node --test tests/doctor-curation-checks.test.js` — 18/18 ✓ (dev)
- `node --test tests/qa-doctor-curation-checks.test.js` — 6/6 ✓ (QA pins)
- `node --test tests/telemetry-foundation.test.js` — 10/10 ✓ (Phase 1 sem regressão)
- `node --test tests/memory-search.test.js` — 17/17 ✓ (Phase 2 sem regressão)
- `node --test tests/qa-memory-search.test.js` — 3/3 ✓
- `node --test tests/memory-archive.test.js` — 18/18 ✓ (Phase 3 sem regressão)
- `node --test tests/qa-memory-archive.test.js` — 4/4 ✓
- **Total deterministic suites: 76/76** ✓

## Recomendações de próximos agentes

- **@dev** (próxima slice) — Phase 5 (`feature-close-distillation-hook`) é a última phase funcional antes do gate de inception. ACs AC-ALL-501..506. Consome DD-2 (foreground 5s) + DD-3 (SQLite row lock) dos decision files. Hook em `feature:close` que orquestra `pattern:detect` + `learning:auto-promote` + write-back. Tier-2 notify pós-hook com summary.
- **@validator** — não acionar ainda; `harness-contract.json` é stub. Acionar após Phase 6 (`inception-mirror-parity`) para Gate final pré-`feature:close`.
- **@pentester** — não acionado. Doctor checks são read-only (SQLite SELECT + FS read); sem auth/secrets/uploads.

## Sumário

**0 Critical, 0 High, 0 Medium, 1 Low. ACs: 6/6 covered. Veredicto: PASS.**
Phase 4 aprovada para Gate D. Phase 5 (`feature-close-distillation-hook`) desbloqueada.
