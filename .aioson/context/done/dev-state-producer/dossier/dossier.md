---
feature_slug: dev-state-producer
schema_version: "1.2"
created_by: dossier-init
created_at: 2026-05-17T07:02:53.957Z
status: active
classification: MEDIUM
last_updated_by: dossier-init
last_updated_at: 2026-05-17T07:02:53.957Z
bootstrap_hash: c8107d3e560d
---
## Why

O contrato de `dev-state.md` (definido em `.aioson/agents/dev.md:42-49`) existe como **consumidor sem produtor**: o `@dev` é instruído a ler o arquivo como input canônico em cold-start, mas nenhum agente upstream foi instruído a escrevê-lo. Em 2026-05-16, na feature `lay-user-agent-mode` shipada nesta mesma sessão, o `@dev` caiu em cold-start após `@briefing → @product → @sheldon → @analyst → /clear` exatamente por causa desse gap. O workaround foi o `@product` escrever `dev-state.md` a mão antes de ativar o `@dev` — sustentável uma vez, insustentável como pattern.

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

- **2026-05-17T07:02:53.957Z** | @product | _prd_
- **2026-05-17T07:02:53.957Z** | @architect | _spec_

## Revision Requests

_(vazio)_
