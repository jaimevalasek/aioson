---
feature_slug: deyvin-density
schema_version: "1.2"
created_by: dossier-init
created_at: 2026-05-11T19:30:35.617Z
status: active
classification: MEDIUM
last_updated_by: dossier-init
last_updated_at: 2026-05-11T19:30:35.617Z
bootstrap_hash: 99d244a421f8
---
## Why

`@deyvin` currently activates with a soft bootstrap gate (`if available`) and no explicit escalation rubric. Result: the agent skips `aioson memory:status`, reasons from auto-memory or chat-only context, and occasionally drifts from project reality. A real failure happened on 2026-05-11 — deyvin missed the Living Memory feature shipped the night before because it never read `bootstrap/*.md`. Existing CLAUDE.md rules push out-of-scope work to wrong agents (e.g., `/sheldon` for code analysis) because deyvin's own routing logic is implicit, not codified.

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

- **2026-05-11T19:30:35.617Z** | @product | _prd_

## Revision Requests

_(vazio)_
