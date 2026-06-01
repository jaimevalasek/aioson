---
feature_slug: cost-context-optimization
schema_version: "1.2"
created_by: dossier-init
created_at: 2026-06-01T17:12:35.604Z
status: active
classification: SMALL
last_updated_by: dossier-init
last_updated_at: 2026-06-01T17:12:35.604Z
bootstrap_hash: 5d4faf8ab68d
---
## Why

O AIOSON já tem bons mecanismos de memória, dossier, audit e context pack, mas hoje algumas medições e estados misturam superfícies diferentes. Isso faz o operador tomar decisões com números imprecisos e pode puxar contexto antigo, como `gemini-phaseout`, para trabalhos não relacionados.

## What

MVP: corrigir a base de medição e estado antes de reduzir prompts. Inclui lifecycle `paused`, guard de workflow para trocar corretamente entre project/feature, modos separados em `agent:audit`, novo `skill:audit`, warnings de drift em `context:health`, e testes focados. Fora do MVP: prompt slimming, sharded activation, provider tiering e `memory:trim --target-bytes`.

## Code Map

```yaml
files:
- path: .aioson/context/prd-cost-context-optimization.md
  added_at: 2026-06-01T17:12:35.604Z
- path: src/commands/workflow-next.js
  added_at: 2026-06-01T17:12:35.604Z
- path: tests/workflow-next.test.js
  added_at: 2026-06-01T17:12:35.604Z
- path: .aioson/context/features.md
  added_at: 2026-06-01T17:12:35.604Z
- path: .aioson/agents/product.md
  added_at: 2026-06-01T17:12:35.604Z
- path: template/.aioson/agents/product.md
  added_at: 2026-06-01T17:12:35.604Z
- path: src/commands/agent-audit.js
  role: command-entry
  added_by: dev
  added_at: 2026-06-01T17:33:58.908Z
- path: src/commands/skill-audit.js
  role: command-entry
  added_by: dev
  added_at: 2026-06-01T17:33:59.015Z
- path: src/commands/context-health.js
  role: command-entry
  added_by: dev
  added_at: 2026-06-01T17:33:59.035Z
- path: tests/agent-audit.test.js
  role: test
  added_by: dev
  added_at: 2026-06-01T17:33:59.045Z
- path: tests/skill-audit.test.js
  role: test
  added_by: dev
  added_at: 2026-06-01T17:33:59.084Z
- path: tests/context-health.test.js
  role: test
  added_by: dev
  added_at: 2026-06-01T17:33:59.146Z
- path: src/cli.js
  role: cli
  added_by: dev
  added_at: 2026-06-01T17:34:08.357Z
- path: src/parser.js
  role: cli
  added_by: dev
  added_at: 2026-06-01T17:34:08.380Z
- path: src/i18n/messages/en.js
  role: cli
  added_by: dev
  added_at: 2026-06-01T17:34:08.433Z
- path: src/i18n/messages/pt-BR.js
  role: cli
  added_by: dev
  added_at: 2026-06-01T17:34:08.454Z
modules:
- workflow-state-transition
- feature-registry-lifecycle
- audit-scope-measurement
- skill-cost-measurement
- context-drift-health
patterns:
- paused-feature-does-not-block
- stale-workflow-state-reset
- runtime-template-inception-scope-split
- advisory-drift-warning
```

## Rules & Design-Docs aplicáveis

_(populado via dossier:link-rule)_

## Agent Trail

- **2026-06-01T17:12:35.604Z** | @product | _prd_

<!-- sha256:ca36ecc65aaad6b8603dfdba006a13e0e3502dae2aa07b829aa4089ed3580728 -->
**2026-06-01T17:19:16.081Z** | @analyst | _Agent Trail_

Requirements mapped. Edge cases: 6. Pending items: agent audit modes, skill audit, context health drift warnings.

<!-- sha256:269c9e8eac96443495cdda51049e38146ac704b3d7e73ecf734a3324304d719b -->
**2026-06-01T17:34:21.021Z** | @dev | _Agent Trail_

Implemented measurement correctness: scoped agent:audit modes, skill:audit command, context:health driftWarnings, CLI help/parser wiring, and focused tests. Verification: node --check changed JS; node --test agent-audit, skill-audit, context-health, workflow-next suites; CLI JSON smoke checks passed.

<!-- sha256:5d45557ecfc4422d0504f4a39d0413fc0e457e00e13bfe850617e7017600c89f -->
**2026-06-01T17:40:27.733Z** | @pm | _Agent Trail_

Plano de implementação escrito e Gate C aprovado. Stories/ACs refinados no PRD. Prioridade: QA validar a fatia de measurement/state correctness.

<!-- sha256:0cb5192c65b9bc528c56f973baad43f65b1d0de649d1b4316047061faa1255e0 -->
**2026-06-01T18:08:01.287Z** | @qa | _Agent Trail_

QA completed. Verdict: PASS. Coverage: 14/14 requirements ACs covered; PRD rollup 6/6. Issues: none. Evidence: focused node:test suites and CLI JSON smoke checks passed.

## Revision Requests

_(vazio)_
