---
feature_slug: deyvin-subtask-scout
schema_version: "1.2"
created_by: dossier-init
created_at: 2026-05-14T01:52:41.968Z
status: active
classification: MEDIUM
last_updated_by: dossier-init
last_updated_at: 2026-05-14T01:52:41.968Z
bootstrap_hash: fd9431d06f12
---
## Why

The `deyvin-density` Scope decision rubric (line 111) explicitly states: *"Diagnosis ambiguous; needs survey of >5 files or tracing a runtime flow → Spawn sub-task scout (deferred to `deyvin-subtask-scout`; until shipped: pause and ask the user)."*

Without a scout primitive, `@deyvin` has two bad options when this row triggers:

1. **Read all the files inline** — burns the parent context (often ≥10k tokens), pollutes the agent's working memory, and forces the next user turn to compete with stale survey content.
2. **Hand off to `/architect` or pause** — overshoots the actual need (most surveys don't require architectural decisions, just "which file does X live in and why does it break Y") and breaks the conversation flow with a full agent switch.

The same pattern would help `@dev` and `@qa` too, but scope creep risk is real. V1 is `@deyvin`-only with a clear extension path.

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

- **2026-05-14T01:52:41.968Z** | @product | _prd_
- **2026-05-14T01:52:41.968Z** | @analyst | _requirements_
- **2026-05-14T01:52:41.968Z** | @sheldon | _sheldonEnrichment_
- **2026-05-14T01:52:41.968Z** | @architect | _spec_

## Revision Requests

_(vazio)_
