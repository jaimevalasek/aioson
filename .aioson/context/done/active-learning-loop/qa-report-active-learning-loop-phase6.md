---
feature: active-learning-loop
phase: 6
slug: inception-mirror-parity
reviewer: qa
reviewed_at: 2026-05-14
verdict: PASS
gate: D
classification: MEDIUM
ac_coverage: 4/5 covered + 1 deferred (user-approved)
findings:
  critical: 0
  high: 0
  medium: 1
  low: 1
  deferred: 1
---

# QA Report — active-learning-loop Phase 6 (inception-mirror-parity) — 2026-05-14

## Resumo executivo

Phase 6 ships os fixtures de inception que comprovam, em projeto greenfield
isolado, que a feature inteira opera identicamente ao próprio AIOSON repo (M6
do PRD — inception parity). 12/12 testes verdes do dev: 1 inception self-test
(AC-ALL-601), 4 parity tests (AC-ALL-602), 7 wiring + parity helper tests
(AC-ALL-603 + AC-ALL-605). QA regression suite `tests/qa-active-learning-loop-final.test.js`
6/6 pinning parity surgical/superset/config-key/invalid-json detection,
inception fixture isolation (project-root aios.sqlite intacto), e installer
update behavior (documented).

**AC-ALL-604** (docs em 4 idiomas) está **deferred** por solicitação explícita
do usuário — Sonnet 4.6 pass após Phase 6 QA aprovar. Não é um gap de QA;
é um item de escopo movido para outro pass.

**Veredicto Gate D Phase 6: PASS.** 0 Critical, 0 High, 1 Medium (installer
update overwrites user config — comportamento pre-existente, não regressão da
Phase 6), 1 Low, 1 Deferred (AC-ALL-604 docs).

## AC coverage

| AC | Descrição | Status |
|----|-----------|--------|
| AC-ALL-601 | Inception self-test: 5 fechamentos simulados → doctor zero `ok=false` curation | Covered (`tests/active-learning-loop-inception.test.js`) |
| AC-ALL-602 | Greenfield install carrega config + 3 placeholders + tier entries + 3 doctor checks + CLI verbs | Covered (`tests/inception-parity-active-learning-loop.test.js` 4 testes) |
| AC-ALL-603 | `sync-agents-preflight` detecta drift template/workspace | Covered (`tests/active-learning-loop-wiring.test.js` 2 testes + `tests/qa-active-learning-loop-final.test.js` 4 testes) |
| AC-ALL-604 | Documentação em pt/en/es/fr (README + uso + link PRD) | **Deferred** (per usuário; Sonnet 4.6 pass) |
| AC-ALL-605 | Wiring audit (cli registers, doctor wires, feature-close hooks, etc.) | Covered (`tests/active-learning-loop-wiring.test.js` 5 testes) |

## Risk-first checklist (Phase 6 scope)

| Risco | Resultado | Evidência |
|-------|-----------|-----------|
| Parity helper: surgical missing-verb detection | ✓ flags `autonomy_tier2_missing:memory:restore` | QA-PARITY-SURGICAL |
| Parity helper: superset tolerance (extras OK) | ✓ subset semantics correta | QA-PARITY-SUPERSET |
| Parity helper: config schema drift | ✓ flags missing keys + invalid JSON | QA-PARITY-CONFIG-MISSING-KEY, QA-PARITY-INVALID-JSON |
| Test isolation (project DB) | ✓ project-root aios.sqlite intacto | QA-INCEPTION-ISOLATION |
| Wiring audit completude | ✓ doctor / feature-close / runtime-store wires | dev wiring tests |
| Installer whitelist Behavior | ✓ `_archived/.gitkeep` copia em install | inception parity tests |
| Installer update preserva customizations | ⚠ NÃO preserva (pre-existing) | QA-INSTALLER-UPDATE-BEHAVIOR pin |
| Inception self-test deterministic | ✓ 5 fechamentos → doctor zero curation candidates | dev inception test |
| Plan adaptation: `template/src/` não existe | ✓ documented adaptation; parity pivota para `.aioson/` | spec Agent Trail + plan completion |

## Findings

### Critical / High
_Nenhuma._

### Medium

#### [M-01] `aioson update` mode sobrescreve customizations do usuário em `learning-loop.json` (pre-existing)
- **File**: `src/installer.js:208-222` (`shouldSkipTemplatePath`)
- **Risk**: A architecture spec promete "merge inteligente preservando user overrides" para `learning-loop.json`. A implementação atual do installer copia template → workspace em update mode, **sobrescrevendo todo o arquivo**. Backup vai para `.aioson/backups/{ts}/` quando `backupOnOverwrite` está ligado, mas o live config perde as customizations.
- **Comportamento atual** (pinado em `QA-INSTALLER-UPDATE-BEHAVIOR`):
  1. User customiza `learning-loop.json` (e.g., `enabled: false`, `timeout_ms: 9999`)
  2. `aioson update .` executa
  3. `learning-loop.json` volta aos defaults do template (`enabled: true`, `timeout_ms: 5000`)
- **Não é regressão da Phase 6**: a mesma politica aplica a TODOS arquivos `.aioson/config/*` (autonomy-protocol.json, scout-engine.json). Phase 6 só herda esta política.
- **Fix sugerido** (follow-up MICRO feature):
  1. Implementar `shouldMergeTemplatePath(rel)` que retorna `'json-merge'` para `.aioson/config/*.json`; o installer faz `lodash.merge(template, user)` ou similar.
  2. OR: adicionar entrada explícita em `shouldSkipTemplatePath` que protege user-customized configs (detectado via hash drift entre template e workspace).
- **Severidade**: Medium — afeta UX em projetos cliente que customizaram o loop, mas o impacto é mitigado pelos backups automáticos. Não bloqueia closure da feature.

### Low

#### [L-01] Phase 1 stress test `QA-PERF-01` continua flaky em Windows IO
- **File**: `tests/qa-telemetry-foundation.test.js`
- **Observação**: Recurrent ambient flake. Phase 6 não toca este path. Standalone profile within SLA.

### Deferred (não-blocantes)

#### [DEF-01] AC-ALL-604 — Documentação em 4 idiomas
- **Status**: deferred per usuário explícito ("No final poderia usar o sonnet 4.6 para atualizar toda a documentação em docs/pt e en?").
- **Escopo**: `docs/pt/active-learning-loop/`, `docs/en/active-learning-loop/`, `docs/es/`, `docs/fr/` — README explicando o loop + exemplo `memory:search`/`memory:archive` + link para PRD. Precedent: `docs/pt/living-memory/`.
- **Plano**: após Phase 6 QA approval, Sonnet 4.6 pass cobre as 4 línguas. Cobertura técnica (specs, PRD, agent trail, manifest, plans, decisões) está completa em pt-BR canônico já.
- **Impacto em closure**: nenhum — `aioson feature:close --slug=active-learning-loop --verdict=PASS` pode rodar agora; AC-ALL-604 é trackeable como follow-up.

## Riscos residuais (documentados, não-blocantes)

- M-01 (config overwrite no update) — applies broadly; follow-up MICRO feature recomendada.
- L-01 (Phase 1 flake) — ambiental.
- DEF-01 (docs deferred) — usuário authorized.
- **Cross-platform**: testes rodaram apenas em Windows neste ambiente. Linux/macOS matrix em CI valida-se com `npm test` — fora do escopo deste review.

## Verificação CLI

- `node --test tests/active-learning-loop-inception.test.js` — 1/1 ✓ (dev)
- `node --test tests/inception-parity-active-learning-loop.test.js` — 4/4 ✓ (dev)
- `node --test tests/active-learning-loop-wiring.test.js` — 7/7 ✓ (dev)
- `node --test tests/qa-active-learning-loop-final.test.js` — 6/6 ✓ (QA pins)
- Cumulative deterministic: **112/112** ✓ (Phase 1-6 dev + Phase 2-6 QA suites)

## Roll-up — feature-level QA summary (todas as 6 phases)

| Phase | Slug | Verdict | Phase ACs | Total Tests |
|-------|------|---------|-----------|-------------|
| 1 | telemetry-foundation | PASS | 101..105 (5/5) | 10 dev + 8 QA |
| 2 | memory-search-fts5 | PASS (after H-01 cycle 1) | 201..205 (5/5) | 17 dev + 3 QA |
| 3 | memory-archive-with-evolution-log | PASS | 301..306 (6/6) | 18 dev + 4 QA |
| 4 | doctor-curation-checks | PASS | 401..406 (6/6) | 18 dev + 6 QA |
| 5 | feature-close-distillation-hook | PASS (M-01 doc-vs-impl drift) | 501..506 (6/6) | 12 dev + 6 QA |
| 6 | inception-mirror-parity | PASS (M-01 installer update + DEF-01 docs) | 601..605 (4/5 covered + 1 deferred) | 12 dev + 6 QA |
| **TOTAL** | — | **6/6 PASS** | **31/32 ACs covered + 1 deferred** | **112/112** ✓ |

## Recomendações de próximos agentes / próximas ações

1. **Fechar a feature**: `aioson feature:close --slug=active-learning-loop --verdict=PASS` (or via `runFeatureClose` programmatically). Esse fechamento vai disparar o próprio hook da Phase 5 — **inception self-eat**: a feature usa o loop que ela mesma construiu para registrar seu próprio fechamento em `evolution_log`. Verificável pós-closure via `aioson memory:search` (depois de Phase 1 Living Memory acumular telemetria) e via `evolution_log` query.
2. **Docs pass (DEF-01)**: ativar Sonnet 4.6 para popular `docs/{pt,en,es,fr}/active-learning-loop/` com README + exemplos de uso + link PRD.
3. **Follow-up MICRO feature (M-01)**: implementar merge inteligente em `.aioson/config/*.json` para preservar customizations em `aioson update`. Aplica-se broadly (autonomy-protocol, scout-engine, learning-loop).
4. **@validator** — opcional. `harness-contract.json` é stub (1 critério); pode ser usado pré-`feature:close` mas não é mandatório dado que QA aprovou todas as 6 phases sequencialmente.
5. **@pentester** — não acionado em nenhuma phase. Surface da feature é CLI/SQLite local; sem auth/secrets/uploads externos. Aceitable.

## Sumário

**0 Critical, 0 High, 1 Medium (pre-existing installer policy), 1 Low (ambient flake), 1 Deferred (docs, user-approved).**
**ACs Phase 6: 4/5 covered + 1 deferred. Cumulative: 31/32 ACs across the feature + 1 deferred.**
**Veredicto: PASS.**

Phase 6 aprovada para Gate D. **Feature active-learning-loop está pronta para closure** (`aioson feature:close --slug=active-learning-loop --verdict=PASS`).
