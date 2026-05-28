---
feature_slug: agent-orchestration-v2
schema_version: "1.2"
created_by: dossier-init
created_at: 2026-05-27T19:30:08.665Z
status: active
classification: MEDIUM
last_updated_by: dossier-init
last_updated_at: 2026-05-27T19:30:08.665Z
---
## Why

When a workflow fails or is interrupted after multiple agents have completed, `workflow:heal` reconstructs state from artifacts but cannot resume from the exact agent context — re-execution costs 70-80% redundant tokens. Downstream agents receive handoff artifacts (spec.md, dev-state.md) that capture WHAT was decided but not WHY alternatives were rejected, leading to re-asked questions. Operator decisions captured via `op:capture` are an unindexed append-only log — no way to query "all decisions on feature X" or "what did the user decide about testing patterns?"

## What

_(preencher manualmente — PRD não encontrado ou sem seção de Escopo)_

## Code Map

```yaml
files: []
modules: []
patterns: []
```

## Rules & Design-Docs aplicáveis

_(vazio — populado a partir da Phase 2)_

## Agent Trail

_(vazio — populado a partir da Phase 2)_

<!-- sha256:58d30989b0dbbd5564d63ea12bb8ad60c7abd082ba836dc78a298f3c211ad014 -->
**2026-05-27T19:30:15.711Z** | @product | _What_

MVP: checkpoint-at-gate (M1), decision rationale in handoffs (M2), scoped operator memory (M3). Classification SMALL.

<!-- sha256:8e0e261d5ef6618c1aabfc96685b27bfe2d927fc2b28b26f58458a5a9309b5d8 -->
**2026-05-27T19:42:07.093Z** | @sheldon | _Agent Trail_

Sizing: 1+ (SMALL confirmed). Decision: in-place (Path A). 6 improvements applied (2 critical, 4 important). Q1+Q2 closed. AC-AUDIT 7 items added per sheldon-006.

<!-- sha256:ba48ed2e7ce3f143c0655e50810005abfcc131b4bd8fa83a3a40f146c4e2242e -->
**2026-05-27T19:50:35.847Z** | @analyst | _Agent Trail_

Requirements mapeados: 9 BRs, 8 ECs, 0 new tables, 3 schema extensions (checkpoint JSON, last-handoff.json, operator-memory ALTER TABLE). Classification SMALL confirmed.

## Revision Requests

_(vazio — populado a partir da Phase 2)_
