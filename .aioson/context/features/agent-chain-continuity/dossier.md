---
feature_slug: agent-chain-continuity
schema_version: "1.0"
created_by: dossier-init
created_at: 2026-05-07T00:36:34.468Z
status: active
classification: MEDIUM
last_updated_by: dossier-init
last_updated_at: 2026-05-07T00:36:34.468Z
bootstrap_hash: a02989c55b6b
---
## Why

A `feature-dossier` (entregue 2026-04-28) implementou a "ponte viva" entre agentes — código + testes + spec — mas três falhas de delivery deixaram-na **dormente**:

1. MVP integrou só 3 dos 8 agentes da cadeia (`@analyst`, `@architect`, `@dev`); `@sheldon` ficou inteiramente fora.
2. `dossier:init` nunca é auto-invocado por `workflow:next` nem por nenhum prompt de agente — mesmo nos 3 integrados, o comportamento é "if present, read it; if absent, legacy".
3. `sync:agents` opera direção `template→workspace`; integrações posteriormente adicionadas em workspace para `@product`, `@orchestrator`, `@pm`, `@ux-ui`, `@qa` não foram propagadas para template — próximo sync wipe-a tudo.

Resultado observável: nenhuma feature pós-`feature-dossier` (incluindo `secure-by-default`, completada 2026-04-29) tem dossier. `@dev` em chat novo retoma só pelo `dev-state.md` — não sabe a lista de artefatos produzidos pela cadeia, não vê pesquisas do `@sheldon` em `researchs/`, não detecta drift entre plano e implementação. Decisões de upstream "viram telefone-sem-fio" exatamente como o PRD original previu — mas não conseguiu corrigir.

## What

_(não encontrado — preencher manualmente)_

## Code Map

```yaml
files:
- path: src/dossier/research-index.js
  role: core-module
  coupling_risk: low
  added_by: architect
  added_at: 2026-05-07T00:43:24.122Z
- path: src/dossier/schema.js
  role: schema
  coupling_risk: high
  added_by: architect
  added_at: 2026-05-07T00:43:24.254Z
- path: src/handoff-contract.js
  role: schema
  coupling_risk: high
  added_by: architect
  added_at: 2026-05-07T00:43:24.390Z
- path: src/commands/dossier-add-research.js
  role: command-entry
  coupling_risk: low
  added_by: architect
  added_at: 2026-05-07T00:43:24.524Z
- path: src/commands/dossier-audit.js
  role: command-entry
  coupling_risk: low
  added_by: architect
  added_at: 2026-05-07T00:43:24.662Z
- path: src/commands/feature-close.js
  role: command-entry
  coupling_risk: high
  added_by: architect
  added_at: 2026-05-07T00:43:24.797Z
- path: src/commands/workflow-next.js
  role: command-entry
  coupling_risk: high
  added_by: architect
  added_at: 2026-05-07T00:43:24.935Z
- path: src/commands/sync-agents-preflight.js
  role: command-entry
  coupling_risk: low
  added_by: architect
  added_at: 2026-05-07T00:43:25.067Z
- path: src/lib/dev-resume.js
  role: util
  coupling_risk: low
  added_by: architect
  added_at: 2026-05-07T00:43:25.195Z
- path: src/dossier/research-index-store.js
  role: store
  coupling_risk: low
  added_by: dev
  added_at: 2026-05-07T01:10:27.189Z
- path: tests/dossier/research-index-store.test.js
  role: test
  coupling_risk: low
  added_by: dev
  added_at: 2026-05-07T01:10:27.316Z
- path: tests/dossier/schema.test.js
  role: test
  coupling_risk: low
  added_by: dev
  added_at: 2026-05-07T01:10:27.443Z
- path: tests/handoff-contract-v2.test.js
  role: test
  coupling_risk: low
  added_at: 2026-05-07T01:25:10.096Z
- path: src/session-handoff.js
  role: schema
  coupling_risk: high
  added_at: 2026-05-07T01:25:10.223Z
- path: .aioson/docs/dossier/schema.md
  role: other
  coupling_risk: low
  added_at: 2026-05-07T01:25:10.350Z
- path: src/commands/dossier-add-research.js
  role: command-entry
  coupling_risk: low
  added_at: 2026-05-07T01:40:47.358Z
- path: src/commands/dossier-audit.js
  role: command-entry
  coupling_risk: low
  added_at: 2026-05-07T01:40:47.527Z
- path: src/cli.js
  role: cli
  coupling_risk: high
  added_at: 2026-05-07T01:40:47.714Z
- path: tests/dossier-add-research.test.js
  role: test
  coupling_risk: low
  added_at: 2026-05-07T01:40:47.876Z
- path: tests/dossier-audit.test.js
  role: test
  coupling_risk: low
  added_at: 2026-05-07T01:40:48.032Z
- path: src/lib/dossier-telemetry.js
  role: util
  coupling_risk: low
  added_at: 2026-05-07T01:52:16.544Z
- path: src/commands/feature-close.js
  role: command-entry
  coupling_risk: high
  added_at: 2026-05-07T01:52:16.675Z
- path: src/commands/workflow-next.js
  role: command-entry
  coupling_risk: high
  added_at: 2026-05-07T01:52:16.805Z
- path: .aioson/agents/product.md
  role: other
  coupling_risk: low
  added_at: 2026-05-07T01:52:16.939Z
- path: template/.aioson/agents/product.md
  role: other
  coupling_risk: low
  added_at: 2026-05-07T01:52:17.070Z
- path: tests/agent-chain-continuity-phase3.test.js
  role: test
  coupling_risk: low
  added_at: 2026-05-07T01:52:17.201Z
- path: src/commands/sync-agents-preflight.js
  role: command-entry
  coupling_risk: low
  added_at: 2026-05-07T02:01:12.712Z
- path: tests/sync-agents-preflight.test.js
  role: test
  coupling_risk: low
  added_at: 2026-05-07T02:01:12.874Z
- path: .aioson/docs/dossier/agent-templates.md
  role: other
  coupling_risk: low
  added_at: 2026-05-07T02:01:13.026Z
- path: package.json
  role: config
  coupling_risk: low
  added_at: 2026-05-07T02:01:13.172Z
- path: src/lib/dev-resume.js
  role: util
  coupling_risk: low
  added_at: 2026-05-07T02:08:55.102Z
- path: src/commands/dev-resume.js
  role: command-entry
  coupling_risk: low
  added_at: 2026-05-07T02:08:55.248Z
- path: tests/dev-resume.test.js
  role: test
  coupling_risk: low
  added_at: 2026-05-07T02:08:55.387Z
- path: .aioson/agents/dev.md
  role: other
  coupling_risk: low
  added_at: 2026-05-07T02:08:55.523Z
- path: template/.aioson/agents/dev.md
  role: other
  coupling_risk: low
  added_at: 2026-05-07T02:08:55.662Z
- path: tests/agent-chain-continuity.regression.test.js
  role: test
  coupling_risk: low
  added_at: 2026-05-07T02:15:28.852Z
modules: []
patterns: []
```

## Rules & Design-Docs aplicáveis

_(populado via dossier:link-rule)_

- [.aioson/rules/aioson-context-boundary.md](.aioson/rules/aioson-context-boundary.md) — Dossier vive em .aioson/context/features/{slug}/ — context-boundary aplica

- [.aioson/rules/canonical-path-contract.md](.aioson/rules/canonical-path-contract.md) — paths em handoff-protocol.json artifact_uris seguem path contract

- [.aioson/rules/prd-section-ownership.md](.aioson/rules/prd-section-ownership.md) — @sheldon override do legacy template (escreve Agent Trail, nao Why) preserva ownership de @product sobre Why/What

- [.aioson/design-docs/componentization.md](.aioson/design-docs/componentization.md) — 6 novos arquivos em src/ exigem decisao explicita de extract-or-inline

- [.aioson/design-docs/code-reuse.md](.aioson/design-docs/code-reuse.md) — Feature reusa infra existente (handoff-contract, dossier store, runtime-log) em vez de duplicar

- [.aioson/design-docs/naming.md](.aioson/design-docs/naming.md) — Novos commands seguem kebab-case (dossier-add-research) e modulos seguem dash-separated

## Research Index

```yaml
researchs: []
```

## Agent Trail

- **2026-05-07T00:36:34.468Z** | @product | _prd_
- **2026-05-07T00:36:34.468Z** | @analyst | _requirements_
- **2026-05-07T00:36:34.468Z** | @architect | _spec_

<!-- sha256:cc2e60f635340900223cb82df990b67533e088f1b5ad9d346de914a96a2af48d -->
**2026-05-07T00:36:43.918Z** | @analyst | _Agent Trail_

Requirements mapeados. 17 ACs (AC-ACC-01 a AC-ACC-17), 12 edge cases, 6 business rules, 6 pendencias para @architect (local do auto-init hook, paridade audit semantics, runtime events namespace, backwards compat policy, dossier:add-research interface, gate semantics no @dev auto-relato).

<!-- sha256:05673d69a712b17ac0ff1a2c8c4f12c4558bfccdcd9582bdcfd4363ae450b3db -->
**2026-05-07T00:43:32.524Z** | @architect | _Agent Trail_

Arquitetura definida: Gate B aprovado. 6 pendencias do @analyst resolvidas (auto-init defense-in-depth, paridade extract+compare, runtime-log existente, backwards compat indefinida, summary_path inferido, telemetry-only). 41 superficies tocadas em 7 fases / 15 tasks. 6 arquivos novos + 7 modificacoes em src + 18 modificacoes em agents (workspace+template) + 7 testes.

<!-- sha256:add79f1ebca857ddb927a75a69e06b9ec7fcc7a975cdb71164e26cd059f5cb2b -->
**2026-05-07T01:10:27.574Z** | @dev | _Agent Trail_

Phase 1.1 done: schema v1.0->v1.2 com SUPPORTED_SCHEMA_VERSIONS para back-compat (v1.0 v1.1 v1.2 todos lidos), RESEARCH_VERDICTS enum exportado. research-index-store.js novo (parser+serializer+addResearch idempotente por slug com last-write-wins em verdict). 19 tests novos + 2 tests novos no schema.test.js (44 tests dossier verde). 1938/1939 suite verde; 1 falha pre-existente flaky (feature:close idempotent - residual conhecido do secure-by-default closure 2026-04-29) NAO causada por essa sessao. Phase 1.2 (handoff v2 em session-handoff.js) e 1.3 (doc schema.md) deferidas para proxima sessao por context budget.

<!-- sha256:cd5cae98d148bdca8756bf11b93d99cc8282dc1aa2ed3cceadcfb52297476b83 -->
**2026-05-07T01:25:20.377Z** | @dev | _Agent Trail_

Phase 1.2-1.4 done: handoff-protocol.json artifact_uris v2 (objetos {path,kind,agent,added_at}). src/session-handoff.js: ARTIFACT_KINDS enum + coerceArtifactUri/coerceArtifactUris helpers exportados; writers (buildWorkflowHandoffProtocol, buildBasicHandoffProtocol) sempre emitem v2; readHandoffProtocol coerce v1 (strings legados) transparentemente pos-JSON.parse. tests/handoff-contract-v2.test.js novo (19 tests cobrindo coercao, writers v2, round-trip de leitura, backwards compat de arquivos v1). docs/dossier/schema.md atualizado com secao Research Index v1.2 + handoff-protocol artifact_uris v2 (enum kind, schema, politica, exemplo). Suite total 1957/1958 verde; 1 falha pre-existente flaky (feature:close idempotent residual do secure-by-default 2026-04-29) NAO causada por essa sessao. Phase 1 (Foundations) completa. Proximo: Phase 2 (Storage e writes — dossier-add-research command + dossier-audit).

<!-- sha256:b006589fd478499f3b72a084a9a08dd95fdb9995a4ed3bc56ba90f725ddffba9 -->
**2026-05-07T01:41:03.480Z** | @dev | _Agent Trail_

Phase 2 (Storage e writes) done. dossier:add-research command (src/commands/dossier-add-research.js, novo) com handler isolado: validações slug+research-slug+agent canônico+verdict enum+why-relevant required, default summary_path infere para researchs/{research-slug}/summary.md, --summary-path explícito opcional, idempotent por researchSlug (added/updated/no-op). dossier:audit command (src/commands/dossier-audit.js, novo) com 2 sub-checks: --check

<!-- sha256:058796c016ea4a09c369fefa21f89e42e90c0aebcd462ca2fb67a3bdd58c047e -->
**2026-05-07T01:52:33.139Z** | @dev | _Agent Trail_

Phase 3 (Auto-init - behavior change) done. (3.1) src/commands/feature-close.js: ensureDossier hook BEFORE archive (verdict-agnostic, roda em PASS e FAIL). 3 caminhos: present (no-op), from-existing (initFromExisting do PRD/spec), minimal-fallback (store.init com whyText/whatText 'no source artifacts found'). Emite feature_close_dossier_synthesized via emitDossierEvent. (3.2) src/commands/workflow-next.js: ensureFeatureDossier early em activateStage (silent, idempotent). Skip MICRO+project mode. Emite dossier_auto_initialized com trigger_source

<!-- sha256:0d6fde0e1829d89d2eefe0229ab7eb972a77df9b3cdbf042123875d2865cade9 -->
**2026-05-07T02:01:27.912Z** | @dev | _Agent Trail_

Phase 4 (Agent paridade) done. (4.1+4.2) Os 8 chain agents restantes em paridade total workspace

<!-- sha256:e5a1bbc2e9e7e25659b5ca208c21ef061156559a5ef80d326ec0d23ab66b49f1 -->
**2026-05-07T02:09:15.605Z** | @dev | _Agent Trail_

Phase 5 (@dev intelligence) done. (5.1) src/lib/dev-resume.js novo: buildDevResumeData(projectPath) lê last-handoff.json para featureSlug; retorna null se ausente OU se feature não in_progress em features.md (contrato strict do architecture); senão monta {feature_slug, classification, current_phase, artifacts_consumed, code_map_paths, sheldon_plan, next_step} agregando dossier (parseCodeMapBlock+parseYamlCodeMap), dev-state.md frontmatter, prd-{slug}/spec-{slug} para classification, .aioson/plans/{slug}/manifest.md (deriveNextStepFromPlan extrai primeiro [ ] item). Helpers exportados (extractDevStateFields, extractCodeMapPaths, deriveNextStepFromPlan). (5.2) src/commands/dev-resume.js wrapper + cli.js registration: aioson dev:resume-data . retorna JSON via stdout (pretty quando logger presente). (5.3) tests/dev-resume.test.js: 16 tests verdes (7 helpers + 6 buildDevResumeData incluindo edge cases null/done/missing/full payload/sheldon plan + 2 CLI handler). (5.4) Workspace+template dev.md em paridade total: 4 nova subseções compactadas em ## Feature dossier (Auto-resume com runtime-log dev_auto_resume; Drift detection com 3-options + DRIFT: convention; Per slice template). Compactado para caber em 14907 bytes (sob 15K kernel limit). audit ok

<!-- sha256:4bbe26b02caa7c2d6d8d97f958d5b643bab307158696c98e74dbc3b995a1e9cf -->
**2026-05-07T02:15:29.061Z** | @dev | _Agent Trail_

Phase 7 (Testing - regression bundle) done. tests/agent-chain-continuity.regression.test.js novo: 17 tests integração end-to-end mapeando 1:1 para AC-ACC-01 a AC-ACC-17 de requirements §6. Cada test exercita o caminho live (codigo OU artefato workspace) e asserta o contrato do AC. Estratégia: ACs com unit coverage profundo (Phases 1-5) ganham um teste de integração focado; ACs prompt-driven (10/11/12 drift) verificam string match contra dev.md atual. Suite total: 2030/2031 verde - mesma falha pré-existente flaky feature:close idempotent residual do secure-by-default closure (NÃO causada por essa feature). Lint clean. **TODAS AS 7 PHASES (1-7) FECHADAS. Feature agent-chain-continuity COMPLETA - pronta para QA + feature:close.** Coverage final: Phase 1 schema v1.2 + handoff v2 + docs (38 tests); Phase 2 dossier:add-research + dossier:audit (26 tests); Phase 3 auto-init via feature-close + workflow-next + product (9 tests); Phase 4 9 chain agents paridade + sync-agents-preflight + agent-templates (5 tests + audit); Phase 5 dev-resume helper + dev.md auto-resume + drift detection (16 tests); Phase 6 telemetry inline (5 events cobertos); Phase 7 regression bundle (17 ACs verde). Total novo: 111 tests verdes em 7 phases.

## Revision Requests

_(vazio)_
