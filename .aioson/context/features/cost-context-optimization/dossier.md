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
modules:
- workflow-state-transition
- feature-registry-lifecycle
patterns:
- paused-feature-does-not-block
- stale-workflow-state-reset
```

## Rules & Design-Docs aplicáveis

_(populado via dossier:link-rule)_

## Agent Trail

- **2026-06-01T17:12:35.604Z** | @product | _prd_

<!-- sha256:ca36ecc65aaad6b8603dfdba006a13e0e3502dae2aa07b829aa4089ed3580728 -->
**2026-06-01T17:19:16.081Z** | @analyst | _Agent Trail_

Requirements mapped. Edge cases: 6. Pending items: agent audit modes, skill audit, context health drift warnings.

## Revision Requests

_(vazio)_
