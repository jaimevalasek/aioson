---
feature_slug: review-intelligence
schema_version: "1.2"
created_by: dossier-init
created_at: 2026-07-15T18:58:32.885Z
status: active
classification: MEDIUM
last_updated_by: dossier-init
last_updated_at: 2026-07-15T18:58:32.885Z
---
## Why

Os agentes já possuem pesquisa, perguntas orientadas e gates fortes, mas a autocrítica é desigual entre fases e parte das lacunas só aparece depois da implementação. Instruções genéricas como “pense melhor” não criam comportamento verificável, e o mesmo modelo pode confundir self-review com aprovação independente, transferindo ao usuário perguntas que o projeto ou a pesquisa já poderiam responder.

## What

_(preencher manualmente — PRD não encontrado ou sem seção de Escopo)_

## Code Map

```yaml
files:
- path: src/review-intelligence/profiles.js
  role: core-module
  coupling_risk: low
  added_by: dev
  added_at: 2026-07-15T20:03:51.542Z
- path: src/review-intelligence/contracts.js
  role: schema
  coupling_risk: medium
  added_by: dev
  added_at: 2026-07-15T20:03:51.870Z
- path: src/review-intelligence/storage.js
  role: store
  coupling_risk: medium
  added_by: dev
  added_at: 2026-07-15T20:03:52.204Z
- path: tests/review-intelligence.test.js
  role: test
  coupling_risk: medium
  added_by: dev
  added_at: 2026-07-15T20:03:52.531Z
- path: src/review-intelligence/engine.js
  role: core-module
  coupling_risk: medium
  added_by: dev
  added_at: 2026-07-15T20:34:24.751Z
- path: src/commands/review-intelligence.js
  role: command-entry
  coupling_risk: low
  added_by: dev
  added_at: 2026-07-15T20:34:25.523Z
- path: src/cli.js
  role: cli
  coupling_risk: high
  added_by: dev
  added_at: 2026-07-15T20:34:26.124Z
- path: tests/review-intelligence-cli.test.js
  role: test
  coupling_risk: medium
  added_by: dev
  added_at: 2026-07-15T20:34:26.722Z
- path: template/.aioson/skills/process/review-intelligence/SKILL.md
  role: integration
  coupling_risk: medium
  added_by: dev
  added_at: 2026-07-15T20:58:45.035Z
- path: template/.aioson/skills/process/review-intelligence/agents/openai.yaml
  role: config
  coupling_risk: low
  added_by: dev
  added_at: 2026-07-15T20:58:45.629Z
- path: template/.aioson/schemas/review-intelligence.schema.json
  role: schema
  coupling_risk: medium
  added_by: dev
  added_at: 2026-07-15T20:58:46.227Z
- path: src/constants.js
  role: config
  coupling_risk: medium
  added_by: dev
  added_at: 2026-07-15T20:58:46.846Z
- path: template/AGENTS.md
  role: config
  coupling_risk: low
  added_by: dev
  added_at: 2026-07-15T20:58:47.450Z
- path: template/.aioson/agents/briefing.md
  role: integration
  coupling_risk: low
  added_by: dev
  added_at: 2026-07-15T20:58:48.045Z
- path: template/.aioson/agents/briefing-refiner.md
  role: integration
  coupling_risk: low
  added_by: dev
  added_at: 2026-07-15T20:58:48.642Z
- path: template/.aioson/agents/product.md
  role: integration
  coupling_risk: medium
  added_by: dev
  added_at: 2026-07-15T20:58:49.281Z
- path: template/.aioson/agents/sheldon.md
  role: integration
  coupling_risk: medium
  added_by: dev
  added_at: 2026-07-15T20:58:49.888Z
- path: template/.aioson/agents/analyst.md
  role: integration
  coupling_risk: low
  added_by: dev
  added_at: 2026-07-15T20:58:50.489Z
- path: template/.aioson/agents/architect.md
  role: integration
  coupling_risk: low
  added_by: dev
  added_at: 2026-07-15T20:58:51.075Z
- path: template/.aioson/agents/scope-check.md
  role: integration
  coupling_risk: low
  added_by: dev
  added_at: 2026-07-15T20:58:51.674Z
- path: template/.aioson/agents/qa.md
  role: integration
  coupling_risk: medium
  added_by: dev
  added_at: 2026-07-15T20:58:52.257Z
- path: tests/review-intelligence-skill.test.js
  role: test
  coupling_risk: medium
  added_by: dev
  added_at: 2026-07-15T20:58:52.855Z
- path: docs/en/5-reference/cli-reference.md
  role: other
  coupling_risk: low
  added_by: dev
  added_at: 2026-07-15T21:13:27.488Z
- path: docs/pt/5-referencia/comandos-cli.md
  role: other
  coupling_risk: low
  added_by: dev
  added_at: 2026-07-15T21:13:28.082Z
- path: .aioson/context/features/review-intelligence/implementation-ledger.md
  role: other
  coupling_risk: low
  added_by: dev
  added_at: 2026-07-15T21:13:28.671Z
modules: []
patterns: []
```

## Rules & Design-Docs aplicáveis

_(vazio — populado a partir da Phase 2)_

## Agent Trail

_(vazio — populado a partir da Phase 2)_

<!-- sha256:a549b2250aed98b87bcffaaf924d04cbd9c418102b3abc22ed69a97dc974df4e -->
**2026-07-15T18:58:33.397Z** | @product | _What_

MVP: shared role-aware review skill plus additive review:prepare/check/status CLI, bounded self-review, independent downstream assurance, strict backward compatibility and full regression coverage.

<!-- sha256:72de1feeeb0e86fe9e8f6162be39a693eaf5906382170cbb843c66291fb1d821 -->
**2026-07-15T19:01:07.100Z** | @product | _Agent Trail_

PRD Review Intelligence aprovado: MEDIUM, skill compartilhada, CLIs aditivas e compatibilidade/regressão como contrato

<!-- sha256:b1943faf6caf49f36e205e85b7728726e5261ada2e0e7744b83d574851085760 -->
**2026-07-15T19:17:00.238Z** | @orchestrator | _Agent Trail_

Orchestration started. Streams: requirements, code map, architecture, implementation plan. Gates A/B/C pending consolidation.

<!-- sha256:732b15f822187bb1373e67c13bb3d3a5283769baf92f30bbae57c1ffcc7c716d -->
**2026-07-15T19:27:50.621Z** | @orchestrator | _Agent Trail_

Spec package consolidated. Requirements: 18; ACs: 24; Gates A/B/C: approved; readiness: ready; spec:analyze strict: 0 findings. Implementation is sequential in 4 phases.

<!-- sha256:20cb65e12638468d869384f7b0425eb71de0f7689c9970c41aa73ad26c5d50bf -->
**2026-07-15T19:29:19.647Z** | @orchestrator | _Agent Trail_

Pacote de especificacao MEDIUM consolidado com Gates A, B e C aprovados, contratos CLI aditivos e plano de regressao.

<!-- sha256:92f67b4e1f6a9fb8399d341dc76de73eb35b346cb88088334bbea77d490ec3ee -->
**2026-07-15T20:03:44.125Z** | @dev | _Agent Trail_

Slice: Phase 1 secure core landed; 10/10 focused tests, check-js and bound independent QA PASS. External QA automation recovered from Claude adapter invalid_arguments and one interrupted Codex attempt by using a focused bound prompt. Next: engine, command runners and additive CLI wiring.

<!-- sha256:36ed01f77915a44c4d68dfdb37ebd95cc5ad9e766de342fa83a00d56a4fffeb8 -->
**2026-07-15T20:34:33.936Z** | @dev | _Agent Trail_

Slice: Phase 2 engine and additive CLI surface landed; 26/26 focused tests, 67/67 legacy regression tests, check-js and bound independent QA PASS. One external QA attempt timed out without a report; a scope-disciplined retry completed PASS without source edits. Next: distributed skill, schema and eight compatible agent hooks.

<!-- sha256:a2c0b4c63f769e49cbd8770552362f9eda7f62d3755db98918764de08ed8136d -->
**2026-07-15T20:59:07.865Z** | @dev | _Agent Trail_

Slice: Phase 3 distributed review-intelligence skill, four progressive references, Draft 2020-12 schema, managed distribution and eight compatible hooks landed. 89/89 focused distribution/contract tests, check-js, skill validation/audit and bound independent QA PASS. Prompt budget regression was caught locally; hooks were compacted and @product/@sheldon budget was explicitly documented at 33 KB. Next: docs and full hardening.

<!-- sha256:c0d097876f4ce8defd0b44b93c28356b51b2b7534cfa1e1adc6f52043891ff05 -->
**2026-07-15T21:21:00.806Z** | @dev | _Agent Trail_

Slice: Phase 4 documentation, conformance and final hardening landed. Strict spec/artifact/ledger checks, 24/24 ACs, harness 10/10, lint, full npm test (3763 pass, 0 fail, 1 skip), audit:code with 0 HIGH, git diff --check, and bound independent QA (75/75 focused, PASS, zero findings) are green. Gate D remains pending for fresh harness validation and the official pentester/QA chain.

<!-- sha256:7480576f9b88c7943ba24caad9b43e0d0a5d46d31826a45243d72a64ba3702ac -->
**2026-07-15T21:28:43.479Z** | @dev | _Agent Trail_

Fresh-context harness validator returned PASS with 10/10 binary criteria; harness:apply-validation consumed the schema-valid output and set ready_for_done_gate=true. This closes the @dev technical done criterion but does not approve spec Gate D, which remains owned by the official pentester/QA chain.

<!-- sha256:b3a3ba11b2605145276d08066dd531ba2dfabb56b8dd3b6cace5c805c28a6dbd -->
**2026-07-15T21:28:59.399Z** | @dev | _Agent Trail_

Implemented review-intelligence: phase 4/4 complete; harness 10/10, full regression green, four phase reviews and fresh validator PASS

<!-- sha256:16068eec49209d4d437183f764f921efb2d824d51e34d5fef442516938352373 -->
**2026-07-15T22:35:15.347Z** | @qa | _Agent Trail_

Reviewed review-intelligence: 0 findings (0 high, 0 med)

## Revision Requests

_(vazio — populado a partir da Phase 2)_
