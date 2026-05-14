---
feature: active-learning-loop
phase: 3
slug: memory-archive-with-evolution-log
reviewer: qa
reviewed_at: 2026-05-14
verdict: PASS
gate: D
classification: MEDIUM
ac_coverage: 6/6
findings:
  critical: 0
  high: 0
  medium: 2
  low: 1
---

# QA Report — active-learning-loop Phase 3 (memory-archive-with-evolution-log) — 2026-05-14

## Resumo executivo

6/6 ACs (AC-ALL-301..306) cobertas por `tests/memory-archive.test.js` (18/18 verde).
Schema validity-window estendido com 9 colunas via ALTER TABLE idempotente + 3 índices
+ `PRAGMA user_version=3` short-circuit (1000 migration calls em ~12ms). Tier-2
contract enforced: hook block via `AIOSON_RUNTIME_HOOK==='1'` e notify-before-mutation
via `runNotify` in-process. Append-only invariant (BR-ALL-02) explicitamente testada.
Restore preserva history (entry `archived` mantém `end_at`; cria entry `restored` com
novo `start_at` — PMD-10). Concorrência testada via QA probes: 5 calls paralelas no
mesmo target → exatamente 1 success + 4 `already_archived` (atomicidade natural do
`fs.rename` + check em `findActiveEntry` é suficiente para Phase 3; lock primitive
formal fica em Phase 5 via DD-3).

**Veredicto Gate D: PASS.** 2 Medium + 1 Low como residual risks (não-blocantes).
Phase 3 está pronta para sign-off e Phase 4 (`doctor-curation-checks`) está desbloqueada.

## AC coverage

| AC | Descrição | Status |
|----|-----------|--------|
| AC-ALL-301 | `memory:archive` move artefato + `end_at=now()` em última entry ativa + cria entry `archived` | Covered (3 testes: rule, learning, brain) |
| AC-ALL-302 | Tier-2: notify `--level=warn` antes da execução; nunca auto-via-hook | Covered (hook env block + tier-2 notify pre-mutation tests) |
| AC-ALL-303 | `evolution_log` é append-only — nenhum UPDATE muta `start_at` ou `reason`; apenas `end_at` | Covered (explicit append-only assertion test) |
| AC-ALL-304 | `memory:restore` move de volta + cria entry `restored` com novo `start_at`; history preservada | Covered (test + QA-FIDELITY UTF-8 round-trip) |
| AC-ALL-305 | Integridade referencial — history resolvível via `evolution_log` join, não filesystem | Covered (payload_json carrega `archived_path` + `superseded_entry`) |
| AC-ALL-306 | `--dry-run` mostra ação sem mutar disco ou DB | Covered (archive + restore variants) |

## Risk-first checklist (Phase 3 scope)

| Risco | Resultado | Evidência |
|-------|-----------|-----------|
| Atomicidade FS + DB | ✓ Rollback funciona | QA-FS-ROLLBACK pin (DB-write failure → file restored) |
| Concorrência (race no mesmo target) | ✓ 1 success + N-1 no-op | QA-CONCURRENCY pin (5 paralelos) |
| Append-only invariant | ✓ Não há UPDATE em start_at/reason | dev AC-ALL-303 test |
| Tier-2 enforcement | ✓ Hook env bloqueia + notify pre-mutation | dev AC-ALL-302 (2 testes) |
| Path normalization | ✓ Forward-slashes em payload_json | QA-PATH-NORMALIZATION pin |
| UTF-8 / emoji fidelity | ✓ Byte-perfect round-trip | QA-FIDELITY pin |
| Idempotency | ✓ Re-archive retorna `already_archived` | dev EC-ALL-04 test |
| `--dry-run` zero-side-effect | ✓ Nem FS nem DB mutados | dev AC-ALL-306 (archive + restore variants) |
| Validation paths | ✓ missing_id, missing_reason, invalid_id, target_not_found, target_not_archived | dev tests |
| Migration idempotency | ✓ 15 colunas / 3 índices preservados em re-run | dev migration test |
| `user_version` short-circuit | ✓ 1000 chamadas = 12µs | smoke test em dev session |
| BR-ALL-08 payload cap (4KB) | N/A | payload Phase 3 é system-gerado, fields bounded (~400B); cap só relevante para `rule_loaded`/`brain_loaded` (Phase 1) |

## Findings

### Critical / High
_Nenhuma._

### Medium

#### [M-01] Tier-2 notify dispara em `--dry-run`
- **File**: `src/commands/memory-archive.js:74-93`, `src/commands/memory-restore.js:65-84`
- **Risk**: BR-ALL-06 diz "Antes de qualquer mutação ... emite notify". Em modo `--dry-run` não há mutação, mas o notify dispara antes da chamada para `archiveTarget`. Resultado: o `execution_events` recebe um `notify_warn` para uma operação que não vai mutar nada. Audit trail fica poluído com não-eventos.
- **Fix sugerido**: pular o notify quando `dryRun === true`, OU mudar o texto do notify para algo como `[dry-run] would archive {kind} "{slug}": {reason}` (claramente sinalizando intenção, não ação). O segundo é menos disruptivo.
- **Severidade**: Medium — UX/audit pollution, sem impacto em correctness.

#### [M-02] Tier-2 notify dispara em `target_not_found`
- **File**: `src/commands/memory-archive.js:74-93`, `src/commands/memory-restore.js:65-84`
- **Risk**: O notify é emitido ANTES de `archiveTarget`/`restoreTarget` rodar. Quando o target não existe (rule não está em disco, ou learning não está em DB), o notify já anunciou "archiving X" mas nenhuma mutação ocorre. Resultado: audit trail contém intent-to-archive que nunca aconteceu.
- **Fix sugerido**: validar a existência do target ANTES do notify (move o `resolveActiveTarget` para antes de `runNotify`), OU aceitar o trade-off (notify-then-attempt é defensável — "announce intent, then check"). Recomendação: validar antes para evitar audit noise.
- **Severidade**: Medium — UX/audit pollution; não bloqueia.

### Low

#### [L-01] Phase 1 stress test `QA-PERF-01` continua flaky em Windows
- **File**: `tests/qa-telemetry-foundation.test.js:30-60`
- **Observação**: já documentado nos Phase 1 + Phase 2 sign-offs como Windows-IO-sensitive. Phase 3 acrescenta `user_version` short-circuit ao migration runner (mitigação direta para o problema observado durante o desenvolvimento da Phase 3). Standalone profile = p99 94ms (dentro do SLA de 100ms); dentro de `node --test` runner = 94ms–229ms (variance ambiental).
- **Fix**: fora do escopo Phase 3. Quando `aioson` CLI estiver no PATH, dashboard fica visível e pode-se rastrear se a variance é máquina ou repo-wide. Não-blocante.

## Riscos residuais (documentados, não-blocantes)

- M-01, M-02 (notify timing em dry-run / target_not_found) — corrigíveis na próxima housekeeping
- L-01 (Phase 1 flake em Windows) — pre-existente
- Lock primitive formal para concorrência: Phase 3 funciona via atomicidade natural de `fs.rename` + `findActiveEntry` check. **Phase 5 (DD-3) introduz SQLite row-level lock para `feature:close`** — quando aterrissar, considerar se Phase 3 deve adotar o mesmo padrão para consistência.

## Verificação CLI

- `node --test tests/memory-archive.test.js` — 18/18 ✓ (dev)
- `node --test tests/qa-memory-archive.test.js` — 4/4 ✓ (QA pins: FS rollback, concurrency, fidelity, path normalization)
- `node --test tests/memory-search.test.js` — 17/17 ✓ (Phase 2 sem regressão)
- `node --test tests/qa-memory-search.test.js` — 3/3 ✓ (Phase 2 QA pin preservado)
- `node --test tests/telemetry-foundation.test.js` — 10/10 ✓ (Phase 1 sem regressão)
- `node --test tests/qa-telemetry-foundation.test.js` — flaky (PASS/FAIL/PASS); standalone profile dentro do SLA. Não é regressão da Phase 3.

## Recomendações de próximos agentes

- **@dev** (próxima slice) — Phase 4 (`doctor-curation-checks`) está desbloqueada por Phase 1 + Phase 3. ACs AC-ALL-401..406. Consume `evolution_log.event_type` + `execution_events.event_type IN ('rule_loaded','brain_loaded')` para os 3 doctor checks.
- **@validator** — `.aioson/plans/active-learning-loop/harness-contract.json` é stub (1 critério). Pode acionar `/validator` após Phase 6 para o gate final pré-`feature:close`. Não acionar ainda.
- **@pentester** — não acionado. memory:archive e memory:restore tocam filesystem mas não auth/secrets/uploads externos. Tier-2 contract já enforce-d (hook block + notify).

## Sumário

**0 Critical, 0 High, 2 Medium, 1 Low. ACs: 6/6 covered. Veredicto: PASS.**
Phase 3 aprovada para Gate D. Phase 4 (`doctor-curation-checks`) desbloqueada.
