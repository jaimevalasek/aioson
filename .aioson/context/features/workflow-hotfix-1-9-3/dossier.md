---
feature_slug: workflow-hotfix-1-9-3
schema_version: "1.2"
created_by: dossier-init
created_at: 2026-05-19T16:02:50.323Z
status: active
classification: SMALL
last_updated_by: dossier-init
last_updated_at: 2026-05-19T16:02:50.323Z
bootstrap_hash: dc9ffb837382
---
## Why

A v1.9.2 deixou um **deadlock estrutural** para features MEDIUM:

- O plan `.aioson/plans/sdlc-process-upgrade/plan-implementation-plan-ownership.md` (committed em `981a8fd`) declara `@pm` como owner canônico do `implementation-plan-{slug}.md`.
- O commit `981a8fd` atualizou `.aioson/agents/pm.md` (workspace) para refletir esse contrato.
- **Mas não tocou em** `template/.aioson/agents/pm.md`, `tests/agent-runtime-alignment.test.js`, nem nos demais arquivos candidatos listados no próprio plan (`artifact-map.md`, `handoff-contract.js`, `artifact-validate.js`).
- O commit `ca15f55` (Phase 4 chain-continuity, 2026-05-06) tentou re-sincronizar agent files mas só pegou a seção `## Feature dossier`; pm.md ficou desalinhado.

Consequência observada em `aioson-com` (2026-05-19):

1. `/architect` rotear corretamente para `/pm` (per AC-SDLC-15).
2. `/pm` lê seu prompt template (legacy "do not silently create implementation-plan") e recusa produzir.
3. `aioson gate:check` bloqueia Gate C porque o arquivo não existe.
4. Deadlock — usuário sem caminho automático para destravar.

Mesma classe de bug atinge qualquer projeto fresh vindo de `aioson update` para 1.9.2.

## What

_(não encontrado — preencher manualmente)_

## Code Map

```yaml
files: []
modules: []
patterns: []
```

## Rules & Design-Docs aplicáveis

_(populado via dossier:link-rule)_

## Agent Trail

- **2026-05-19T16:02:50.323Z** | @product | _prd_
- **2026-05-19T16:02:50.323Z** | @analyst | _requirements_
- **2026-05-19T16:02:50.323Z** | @sheldon | _sheldonEnrichment_
- **2026-05-19T16:02:50.323Z** | @architect | _spec_

## Revision Requests

_(vazio)_
