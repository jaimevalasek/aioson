---
generated: "2026-05-21T23:50:00.000Z"
framework: "Node.js"
test_runner: "node:test"
agent: "tester"
scope: "Neural Chain feature (Phase 1, Slices 1-6) — post Gate D inventory"
supersedes: "2026-05-14 squad audit inventory (closed)"
---

# Test Inventory — Neural Chain (post Gate D)

QA Gate D passou com PASS + 2 Medium findings residuais. Este inventário re-mapeia source ↔ test scoped à feature `neural-chain` (não ao projeto inteiro) e antecipa Phase 2 risk mapping para gap-fill.

## Summary

- Feature: `neural-chain` (classification SMALL, Phase 1 shipped v1.17.0)
- Total source files scanned: **6** (5 lib em `src/neural-chain-*.js` + 1 CLI em `src/commands/chain-audit.js`)
- Files with full coverage: **6** (all)
- Files with partial coverage: **0**
- Files with no coverage: **0**
- Total tests: **81/81 verde** (1.31s)
- Source LOC vs test LOC: 1252 vs 2021 (ratio 1.61 — above industry baseline 1.0)

## Coverage map

| Source file | Test file | Test count | Status |
|---|---|---|---|
| `src/neural-chain-migration.js` (61 LOC) | `tests/neural-chain-migration.test.js` (332 LOC) | 11 | ✓ covered |
| `src/neural-chain-git-ingest.js` (271 LOC) | `tests/neural-chain-git-ingest.test.js` (315 LOC) | 12 | ✓ covered |
| `src/commands/chain-audit.js` (135 LOC) | `tests/chain-audit.test.js` (263 LOC) | 9 | ✓ covered |
| `src/neural-chain-agent-ingest.js` (385 LOC) | `tests/neural-chain-agent-ingest.test.js` (298 LOC) | 12 | ✓ covered |
| `src/neural-chain-noise-file.js` (311 LOC) | `tests/neural-chain-noise-file.test.js` (367 LOC) | 14 | ✓ covered |
| `src/neural-chain-config.js` (89 LOC) | `tests/neural-chain-autonomy.test.js` (446 LOC, classifier+config combined) | 23 | ✓ covered |

Note: `classifyImpact` + `isTestFileFor` (em `agent-ingest.js`) e `readChainConfig` (em `neural-chain-config.js`) compartilham `tests/neural-chain-autonomy.test.js`. Não há source file órfão sem teste.

## BR ↔ test traceability (11 BRs)

| BR | Test location | Status |
|---|---|---|
| **BR-NC-01** Confidence ranking (saturation 10/5; max(c_git, c_event)) | `git-ingest:177` saturation 10; `agent-ingest:74,102` saturation 5 | ⚠ **partial** — `max(c_git, c_event)` combination não tem teste (porque não implementado — M-02 QA finding) |
| **BR-NC-02** Threshold rules autonomy=standard | `autonomy:120-180` rules (a)+(c) 4 tests | ⚠ **partial** — rule (b) literal identifier match deferida M1.5/M2 (não testada porque não implementada) |
| **BR-NC-03** Autonomy mode semantics | `autonomy:120-200` 3-modes × 7 combos | ✓ covered |
| **BR-NC-04** Auto-correção via handoff TODO (não execução) | **implícito** — nenhum teste explicitamente verifica "audit não escreve em source files" | ⚠ **gap** — invariant test ausente (ver Risk priorities) |
| **BR-NC-05** Hook granularidade per-session | `agent-ingest:228-265` (1 audit per session via runChainHookOnAgentDone) | ✓ covered |
| **BR-NC-06** Noise file lifecycle | `noise-file:74-310` (write/read/delete) 13 tests | ✓ covered |
| **BR-NC-07** Validity-window discipline | `agent-ingest:102` UPSERT increments hit_count; `migration:280-305` schema CHECKs | ✓ covered |
| **BR-NC-08** Hard cap 10k via archive oldest | `git-ingest:200`; `agent-ingest:146` 2 tests | ✓ covered |
| **BR-NC-09** File-level granularidade M1 (no `:symbol`) | `noise-file:88` regex anti-`:symbol` em writeNoiseFile shape test | ✓ covered |
| **BR-NC-10** Telemetry obligation | `chain-audit:117` 1 event per invocation; `autonomy:295` payload completeness | ⚠ **partial** — schema completeness check existe mas não valida TODOS os fields BR-NC-10 spec (feature_slug, source_files, tokens_used, duration_ms, error) |
| **BR-NC-11** Audit failure non-blocking | `agent-ingest:267` never throws on invalid db; chain-audit failure path inferido | ⚠ **partial** — EC-NC-04 retry/backoff não implementado (M-01 QA finding); single-attempt fail-safe testado mas não retry |

## EC ↔ test traceability (10 ECs)

| EC | Test location | Status |
|---|---|---|
| **EC-NC-01** File renamed → órfão | — | OUT-OF-SCOPE V1 (accepted as noise per requirements) |
| **EC-NC-02** File deletado → órfão | — | OUT-OF-SCOPE V1 |
| **EC-NC-03** First ingest never-seen file | `git-ingest:177` + `agent-ingest:74` initial confidence | ✓ covered |
| **EC-NC-04** SQLite locked retry 3x | — | ⚠ **gap** — retry/backoff não implementado (M-01); só single-attempt fail-safe |
| **EC-NC-05** Agent event sem source_files no-op | `agent-ingest:57,199` 3 tests | ✓ covered |
| **EC-NC-06** Bootstrap sem git history | `git-ingest:269,287` 2 tests | ✓ covered |
| **EC-NC-07** Config sem `chain_auto_threshold` default | `autonomy:67-100` 4 tests | ✓ covered |
| **EC-NC-08** Squad concurrent edits | — | OUT-OF-SCOPE V1 |
| **EC-NC-09** Noise file YAML corrupted | `noise-file:222` 1 test | ✓ covered |
| **EC-NC-10** Race delete idempotent | `noise-file:250` 1 test | ✓ covered |

## Risk priorities (Phase 2 risk mapping)

Ordenado por severidade × probabilidade × dano:

### Tier A (HIGH-value gap-fill — testes valem ser escritos)

**A.1 — BR-NC-04 anti-execution invariant test (NEW)**
- **Risco:** se algum dia algum slice futuro acidentalmente adicionar `fs.writeFileSync` fora de `.aioson/context/noises/`, audit code pode começar a modificar source files do usuário — violação direta do contrato fundamental "audit nunca modifica código". Sem teste guard, regressão silenciosa possível.
- **Probabilidade hoje:** zero (grep confirma único `fs.writeFileSync` em `noise-file.js:139` para `.aioson/context/noises/`). Mas a feature está em M1; M1.5/M2 vão expandir surface area.
- **Dano:** ALTO se ocorrer — código de usuário modificado sem rastro auditável é exatamente o anti-pattern que neural-chain existe pra prevenir, e ironicamente ele próprio cometeria.
- **Teste proposto:** static analysis test que grep'a `fs.writeFile|writeFileSync|unlink|appendFile|rmSync` em `src/neural-chain-*.js` + `src/commands/chain-audit.js`; asserta zero matches OU paths sempre começam com `.aioson/context/noises/` (via inspeção da string literal no contexto da call). É um meta-test de invariant arquitetural.

**A.2 — BR-NC-10 telemetry payload schema completeness (NEW)**
- **Risco:** BR-NC-10 spec lista payload fields `{feature_slug, source_files, impacts_found, auto_fixable_count, noise_file, tokens_used, duration_ms, error}`. Atual emit varia entre call sites (chain-audit.js vs agent-ingest.js) e nem todos os fields são populados consistentemente. Sem schema validation, drift entre call sites passa silencioso.
- **Probabilidade:** ALTA — Slice 6 já mostrou drift (algumas events emitem `auto_fixable_count`, outras `null`).
- **Dano:** MÉDIO — `aioson chain:stats` (Should-have, futuro) vai assumir schema; queries vão quebrar quando faltar field.
- **Teste proposto:** após qualquer `runChainHookOnAgentDone` ou `runChainAudit`, validar que CADA `execution_events` row com `event_type='chain_audit'` tem TODOS os fields requeridos no payload_json (mesmo que null/0). Test fixture genérica reusável.

### Tier B (MEDIUM-value — discretionary)

**B.1 — classifyImpact property-based test (fast-check dep)**
- Adiciona dependency. Atual teste cobre 7 combinações manuais; property test daria invariants (guarded ⇒ sempre noise; standard match ⇒ AUTO-FIXABLE; autonomous ⇒ nunca null marker; classification ∈ canonical set).
- **Skip por enquanto** — coverage suficiente, adicionar dep é custo desproporcional.

**B.2 — Mutation testing em classifyImpact + maybeDeleteNoiseFile (Stryker)**
- Stryker dep + config. Critical paths per @tester ladder: `maybeDeleteNoiseFile` é irreversível, `classifyImpact` é state-machine decisão.
- **Skip por enquanto** — sem Stryker baseline no repo; adicionar é projeto separado.

### Tier C (LOW-value — not worth)

**C.1 — writeNoiseFile collision overwrite** — V1 acceptable per spec.
**C.2 — chain:audit --feature flag integration** — flag só vai pra payload, low risk.
**C.3 — Windows EBUSY em maybeDeleteNoiseFile unlinkSync** — caller best-effort wraps.

## Strategy hypothesis (confirm com user em Phase 3)

**Risk-first Gap Filling** com escopo TIGHT: apenas A.1 + A.2 (2 testes novos, ambos defensivos de invariants críticos). Não introduzir novas dependencies. Não tocar production code.

Test smell self-audit em paralelo: rodar checklist sobre os 81 tests existentes; documentar achados em test-plan.md (sem refactor — só documentar).

Justificativa do escopo tight:
- QA já passou com Verdict PASS
- 2 Medium findings residuais (M-01 + M-02) são **implementation gaps** (não test gaps) — pertencem ao @dev
- Cobertura quantitativa já está alta (ratio 1.61)
- Os 2 gaps reais (A.1 invariant + A.2 telemetry schema) são defensivos pra prevenir regressões futuras, não compensação de cobertura ausente
- "Small project, small solution" (golden rule projeto) — não inflar scope com mutation testing + property-based sem dor real
