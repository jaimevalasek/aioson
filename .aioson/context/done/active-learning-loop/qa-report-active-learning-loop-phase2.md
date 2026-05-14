---
feature: active-learning-loop
phase: 2
slug: memory-search-fts5
reviewer: qa
reviewed_at: 2026-05-14
re_verified_at: 2026-05-14
verdict: PASS
gate: D
classification: MEDIUM
ac_coverage: 5/5
findings:
  critical: 0
  high: 0
  high_resolved: 1
  medium: 2
  low: 2
---

> **Update (2026-05-14 — @qa re-verification, end of auto-cycle cycle 1):**
> H-01 fix applied by @dev landed cleanly. Regression suite `tests/qa-memory-search.test.js`
> 3/3 green; Phase 2 acceptance suite `tests/memory-search.test.js` 17/17 green (zero
> regression); Phase 1 suites `tests/telemetry-foundation.test.js` 10/10 + `tests/qa-telemetry-foundation.test.js`
> 8/8 green. **Verdict flipped FAIL → PASS.** `.aioson/runtime/qa-dev-cycle.json` cleared per
> qa.md reset rule. M-01/M-02/L-01/L-02 remain documented as residual risks (non-blocking).

# QA Report — active-learning-loop Phase 2 (memory-search-fts5) — 2026-05-14

## Resumo executivo

5/5 ACs (AC-ALL-201..205) endereçadas pelo suite `tests/memory-search.test.js`
(17/17 verde). Implementação refina o guardrail DD-4 #2 de "phrase-only" para
"token-AND" — refinamento documentado no Agent Trail do spec, com motivo
auditável (precision ≤7/10 no literal phrase-only). EC-ALL-08 está
**parcialmente coberto**: special chars, length cap e empty/whitespace estão
verdes; o subcaso em que toda a query é stripada para vazio crasha o CLI
(`fts5: syntax error near ""`). Esse é o único bloqueador.

**Veredicto Gate D: FAIL** (1 High pendente). Auto-cycle qa→dev autorizado
(sem keywords Critical security).

## AC coverage

| AC | Descrição | Status |
|----|-----------|--------|
| AC-ALL-201 | `memory:search` retorna top-N hits com `target_type, target_id, snippet, score, feature_slug, status` | Covered (test 1+2) |
| AC-ALL-202 | Cobre rules promovidas (target_type=rule) + active learnings; brains fora em V1 | Covered (test 3 — single-token sub-assertions) |
| AC-ALL-203 | Triggers mantêm sync FTS5 em INSERT/UPDATE/DELETE | Covered (test 4 — todos os 3 ramos) |
| AC-ALL-204 | Entries `end_at` populado excluídos por padrão; `--include-archived` opt-in | Covered (test 5) — semantic gap em [[M-02]] |
| AC-ALL-205 | Fixture com 10 queries; ≥8 retornam ≥1 hit relevante | Covered (test 6) — 10/10 (acima do baseline) |

## DD-4 guardrail conformance

| # | Guardrail | Status | Nota |
|---|-----------|--------|------|
| 1 | Bind parameters apenas | ✓ Conforme | `db.prepare(sql).all(...bindings)` |
| 2 | Sanitização — phrase-query default | ⚠ Refinado | Token-AND ao invés de phrase-only literal; envelope de segurança preservado. Doc drift em [[M-01]] |
| 3 | Length cap 500 chars | ✓ Conforme | Testado |
| 4 | Empty/whitespace rejeitado | ⚠ Parcial | Cobre input vazio; **não cobre** input que reduz a vazio após strip → [[H-01]] |
| 5 | `ORDER BY rank ASC` mandatório | ✓ Conforme | Testado |
| 6 | Default `end_at IS NULL` (Phase 3) | ✓ Conforme | Phase 2 usa `status IN ('active','promoted')` como proxy; comentado p/ swap em Phase 3 |
| 7 | `snippet(project_learnings_fts, -1, ...)` | ✓ Conforme | Delim. `« »` strip em text mode, preservado em JSON |
| 8 | Search é silent (no `runtime:emit`) | ✓ Conforme | Nenhum emit no caminho de busca |
| 9 | JSON output schema fixo | ✓ Conforme + extras | Contrato `{ok, query, result_count, results[]}` cumprido; adiciona `surface`, `limit` (forward-compat) |
| 10 | i18n keys × 4 locales | ✓ Conforme | `query_empty, query_too_long, invalid_surface, no_results, results_header, snippet_truncated` × en/pt-BR/es/fr |

## Findings

### High

#### [H-01] `memory:search` lança SQLITE_ERROR quando a query reduz a vazio após sanitização
- **File**: `src/learning-loop-fts5.js:94-114` (`searchProjectLearnings`) + `src/commands/memory-search.js:80-101`
- **Risk**: Usuário envia `+ - * ( ) ^ :`, `***`, `"""` ou similar → `sanitizeFtsQuery` retorna `''` → `MATCH ''` → SQLite lança `fts5: syntax error near ""`. Exceção propaga acima de `searchProjectLearnings`; o `try/finally` em `runMemorySearch` só garante `db.close()`. Em CLI normal vira stack trace; em `--json` o objeto `{ ok:false, reason }` esperado nunca aparece.
- **Fix**: Detectar `sanitized === ''` após `sanitizeFtsQuery` (ou capturar SQLITE_ERROR em try/catch dentro de `searchProjectLearnings`) e retornar `{ ok: false, reason: 'query_unparseable' }`. Adicionar i18n `memory_search.query_unparseable` em 4 locales. Mapear em `runMemorySearch` igual a `query_too_long`.
- **Test written**: `tests/qa-memory-search.test.js` — 3/3 vermelho (`SQLITE_ERROR`) hoje, espera-se verde pós-fix.
- **Plano**: `.aioson/plans/active-learning-loop/corrections-2026-05-14-phase2.md#H-01`.

### Medium

#### [M-01] DD-4 doc-drift — `decision-search-ranking.md` ainda descreve "phrase-only"
- **File**: `.aioson/plans/active-learning-loop/decision-search-ranking.md:43-45`
- **Risk**: Spec Agent Trail registra o refinamento (literal phrase-only ≤7/10; token-AND atinge 10/10), mas a decisão canônica DD-4 não foi atualizada. Re-leitura por @architect/@analyst futuros vai usar a versão obsoleta como verdade.
- **Fix**: Adicionar subseção "Refinement adopted at implementation time" no fim de `decision-search-ranking.md` explicando o que mudou, por que e que o envelope de segurança é o mesmo. Preservar histórico original (consistente com PMD-6 append-only).

#### [M-02] `--include-archived` semântica ambígua em Phase 2
- **File**: `src/learning-loop-fts5.js:55-71`
- **Risk**: O flag implica "include archived" mas o filtro real (`status NOT IN ('active','promoted')`) também retorna `status='stale'` e demais não-canônicos. Phase 3 (validity-window) resolve, mas até lá há divergência entre nome e efeito.
- **Fix**: Documentar transitional behavior no help OU em Phase 3 renomear a flag para algo neutro / adicionar alias.

### Low

#### [L-01] Sem stress test de latência p99 (≤50ms @ 1000 entries)
- **File**: `tests/memory-search.test.js` (suite atual)
- **Observação**: Plan-memory-search-fts5.md pediu p99 ≤50ms @ 1000 entries; dev shipou só testes funcionais. Phase 1 tem stress test de telemetria (`tests/qa-telemetry-foundation.test.js`) — Phase 2 não.
- **Fix**: Estender suite com fixture ≥1000 entries e medir percentis. Não-bloqueante.

#### [L-02] `aioson` CLI ausente do PATH (recorrência do L-01 da Phase 1)
- **Observação**: Mesma situação reportada em `corrections-2026-05-14.md`. `aioson workflow:next --complete=qa`, `aioson preflight`, `aioson security:audit`, `aioson agent:done` não rodam neste host. Dashboard segue cego.
- **Fix**: `npm link` no repo antes de Phase 3 (fora do escopo desta Phase).

## Riscos residuais (documentados, não bloqueiam pós-fix de H-01)

- M-01, M-02, L-01, L-02 acima.
- Token-AND sanitização perde precisão em queries com operadores intencionais
  (ex.: `foo+bar` → search por `foobar`). Documentado como token-AND behavior;
  reabertura de DD-4 V2 só se a métrica fixture cair ≤7/10 (já definida no
  decision-search-ranking.md).
- `--include-archived` em Phase 2 atua sobre `status` em vez de `end_at` —
  forward-compatible com Phase 3 sem mudança de API.

## Recomendações de próximos agentes

- **@dev** (auto-cycle ativo) — aplicar H-01 conforme `corrections-2026-05-14-phase2.md`, rodar `tests/qa-memory-search.test.js` até verde, rodar `tests/memory-search.test.js` para confirmar zero regressão; retornar a @qa para re-verificação Phase 2.
- **@validator** — após PASS em Phase 2, `.aioson/plans/active-learning-loop/harness-contract.json` é stub (1 critério). Pode acionar `/validator` após todas as phases shipped para o gate final pré-`feature:close`.
- **@tester** — não acionado nesta phase (cobertura funcional adequada; lacuna é apenas no stress test L-01).
- **@pentester** — não acionado (memory:search não toca auth/secrets/uploads; SQL injection já coberta por bind params + sanitização).

## Verificação CLI

- `node --test tests/memory-search.test.js` — 17/17 ✓
- `node --test tests/telemetry-foundation.test.js tests/qa-telemetry-foundation.test.js` — 18/18 ✓ (Phase 1 sem regressão)
- `node --test tests/qa-memory-search.test.js` — 0/3 ✗ (esperado — pin do H-01; vira ✓ após o fix)

## Sumário

**Inicial: 1 High, 2 Medium, 2 Low. ACs: 5/5 covered. Veredicto inicial: FAIL (H-01).**
**Re-verificação: H-01 resolvido por @dev em auto-cycle cycle 1; 0 High remaining; 2 Medium + 2 Low residuais (não-blocantes). Veredicto final: PASS.**
Auto-cycle qa→dev encerrado (cycle 1 of 2 consumido; state limpo).
