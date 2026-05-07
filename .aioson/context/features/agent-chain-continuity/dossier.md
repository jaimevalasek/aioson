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

## Revision Requests

_(vazio)_
