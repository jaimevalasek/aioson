---
phase: 5
slug: t6-ci-smoke-pre-publish
parent_manifest: .aioson/plans/workflow-handoff-integrity/manifest.md
severity: high
estimated_sessions: 2-3
suggested_release: v1.10.0
depends_on: [phase 1 — F2 stable, phase 2 — F3 stable, phase 4 — T5 stable]
---

# Phase 5 — T6: CI smoke test ponta-a-ponta pre-publish

## Scope

Adicionar GitHub Actions workflow que, em PRs com label `release`, executa smoke test ponta-a-ponta:

1. `npm pack` em current source → tarball
2. `npm install <tarball>` em diretório temporário greenfield
3. `aioson setup .` no greenfield
4. Executar cadeia mock `/briefing → /product → /sheldon → /architect → /pm → /dev` em feature MEDIUM com mocks de decisões
5. Verificar `aioson workflow:status` chega em `[>] @dev` sem drift e sem Gate bloqueado
6. Verificar artefatos canônicos existem no path correto
7. Rodar T5 semantic check em pre-publish mode (hard fail)

Falha de qualquer step bloqueia o PR de merge → `npm publish` não pode acontecer.

**Última defesa estrutural:** mesmo se F2/F3/T5 falham em catch um drift, T6 pega ponta-a-ponta antes do release atingir users.

## New or modified entities

Nenhuma entidade de domínio. Mudanças em código:

- `.github/workflows/release-smoke.yml` (novo)
- `tests/fixtures/medium-feature-mock/` (novo) — fixture com mocks de input para cadeia
- `scripts/smoke-run-chain.js` (novo) — orchestra a cadeia mock dentro do CI runner
- Possivelmente um harness mode minimal para fazer agents rodarem sem LLM real (já existe? auditar)

## User flows covered

- **PRD Flow 4** — CI rejeita publish com drift estrutural (closure do flow)
- Wiring audit completo de todas as phases anteriores (smoke test passing = todas as outras phases wiring-audited)

## Acceptance criteria

- **AC-T6-01 (workflow exists):** `.github/workflows/release-smoke.yml` existe, é triggered em PRs com label `release` (ou env override `force_smoke=true`).
- **AC-T6-02 (npm pack + setup):** workflow executa `npm pack` no source HEAD do PR + `aioson setup .` em diretório temporário do runner. Setup completa sem erro.
- **AC-T6-03 (mock fixture):** fixture `tests/fixtures/medium-feature-mock/` contém:
  - decision mocks de cada agente (`mock-briefing.json`, `mock-product.json`, etc.)
  - feature slug `mock-medium-smoke` reservado
  - script `smoke-run-chain.js` orchestra cadeia consumindo os mocks
- **AC-T6-04 (chain success):** após cadeia mock, `aioson workflow:status` no fixture greenfield reporta `[>] @dev` sem drift. Artefatos canônicos (`prd-mock-medium-smoke.md`, `requirements-...`, `spec-...`, `manifest.md`, `implementation-plan-...`) existem em paths corretos.
- **AC-T6-05 (T5 integration):** workflow seta env `AIOSON_PREPUBLISH=true` antes de rodar T5 semantic preflight. Hard fail no preflight aborta workflow.
- **AC-T6-06 (fixture freshness per Sheldon R2):** fixture NÃO é pinada no repo state — fixture content é template content current via `npm pack`. Apenas as mocks de decision são pinadas. Garante zero drift entre source canônico e fixture base.
- **AC-T6-07 (timeout/cost guard):** workflow tem timeout 10min total. Se chain mock leva mais que isso, fail com mensagem clara (provavelmente bug em chain ou regressão de performance).
- **AC-T6-08 (failure clarity):** mensagem de falha indica EXATAMENTE qual step falhou (npm pack, setup, agent X em phase Y, workflow status drift, artefato Z missing). Não "smoke test failed".
- **AC-T6-09 (test em local repo):** workflow files passam `actionlint` (se instalado) ou validation equivalente. Smoke script tem teste unitário próprio em `tests/scripts/smoke-run-chain.test.js`.
- **AC-T6-10 (wiring audit per PMD-07):** confirmar que workflow trigger funciona: PR mock com label `release` realmente dispara o workflow. Verificado uma vez em PR rascunho antes do release de v1.10.0.

## Implementation sequence

1. Criar fixture `tests/fixtures/medium-feature-mock/` com mocks mínimos.
2. Criar `scripts/smoke-run-chain.js` que orchestra cadeia consumindo mocks (precisa de harness sem LLM — investigar se existe; se não, definir contract de mock-only mode).
3. Local test do script: rodar manualmente em greenfield → cadeia completa sem drift.
4. Criar `.github/workflows/release-smoke.yml` chamando o script.
5. Adicionar AC-T6-05 T5 integration step.
6. Test do workflow em PR draft com label `release`.
7. Documentar processo de release em `docs/RELEASE.md` (ou similar) — explicar gate `release` label.
8. Wiring audit: confirmar workflow trigger + script execution + T5 integration.

## External dependencies

- **Phase 1 (F2) released e estável** — smoke test depende de auto-emit funcionar.
- **Phase 2 (F3) released e estável** — smoke test prova que guard NÃO over-blocks (mock manifest não tem pending → workflow:next avança).
- **Phase 4 (T5) released e estável** — workflow chama T5 em pre-publish mode (AC-T6-05).
- **GitHub Actions runners** — assume ubuntu-latest. Pode precisar pin se runtime depender de versão específica de Node.
- **npm registry access** — somente para `npm pack`, não publish. OK em PR context.

## Notes for @dev

- DD-04 (qual harness rodar) é decisão de `@architect`. Mock-only mode (sem LLM real) é proposta default — barato, rápido, determinístico. Trade-off: não pega bugs de prompt drift; isso é coberto por F2/F3/T5.
- Se mock-only mode não existir no harness contract atual, precisa de adição. Investigar primeiro antes de assumir.
- Fixture greenfield é IMPORTANT — não confundir com fixture existing-project. Garante que setup + cadeia funcionam do zero.
- T6 é o release valve final — se ele falha, publish não acontece. Não relaxe ACs.

## Notes for @qa

- Test composto F2 + F3 + T5 + T6: cadeia mock roda → cada phase ativa → workflow chega em [>] @dev → T5 ativa em pre-publish mode → workflow completa sem fail.
- Test de regressão: inject diff conhecido (similar 981a8fd) → T5 hard fail → workflow aborta com mensagem clara → publish não acontece.

## Phase-specific reference sources

- Briefing Theme 6 (dogfood gate)
- PRD T6 must-have + Sheldon R2 enrichment (fixture freshness)
- Briefing G14 (auditoria de outras migrações — pode informar fixture design)
- Plan: phase 1 (F2 dependency), phase 2 (F3 dependency), phase 4 (T5 dependency)
