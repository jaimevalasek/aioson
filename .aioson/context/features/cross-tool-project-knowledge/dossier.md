---
feature_slug: cross-tool-project-knowledge
schema_version: "1.2"
created_by: dossier-init
created_at: 2026-05-23T03:37:25.784Z
status: active
classification: SMALL
last_updated_by: dossier-init
last_updated_at: 2026-05-23T03:37:25.784Z
---
## Why

Achados técnicos não-óbvios sobre o stack (gotchas, fix-recipes) emergem com custo alto durante sessões de dev — ex.: *"OpenClaw 2026.5.19 envia `X-Frame-Options` + CSP `frame-ancestors 'none'` hardcoded; patch in-process via `PostInstallPatch::OpenclawAllowIframe`"* ou *"Tauri no Windows não usa job objects, child processes viram órfãos; Paperclip postgres deixa shared memory block FATAL `pre-existing shared memory`"*.

Hoje esses achados:

1. Ficam capturados no auto-memory do Claude Code (`~/.claude/projects/{slug}/memory/`) — **invisíveis a Codex/OpenCode** no mesmo projeto.
2. Quando o AIOSON captura via `active-learning-loop`, vivem em SQLite (`project_learnings` + FTS5) — acessíveis via `aioson memory:search`, mas o harness teria que chamar a CLI a cada preflight para ler. Codex/OpenCode hoje não fazem essa chamada.
3. A `operator-memory` (DONE v1.16.0) cobre preferências do operador, não fatos técnicos sobre stack — esse é o gap deste PRD.

O usuário confirmou a dor explicitamente na sessão de descoberta (`@dev` em `aioson-play`, 2026-05-21): *"realmente está funcionando este aprendizado para quando é claude code, codex e opencode?"*.

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

<!-- sha256:baf858966b40814a1de0ea28c4fa0dcf6628ac8237fdbacdf75759e0ddfe1c17 -->
**2026-05-23T03:37:49.657Z** | @product | _What_

MVP: extend active-learning-loop com materializacao disk-first em .aioson/learnings/{gotchas,recipes}/ + INDEX.md regenerator + diretiva universal em CLAUDE.md/AGENTS.md/OPENCODE.md + capture sinais novos (gotcha, resolution) + learning:import-from-claude one-shot + inception mirror. Constraints: NAO criar novo CLI namespace (evita colisao com aioson learning existente); reusa schema project_learnings + memory:archive + feature:close hook; storage committed default; 2 categorias V1 (gotchas/, recipes/); 2 sinais V1 (gotcha, resolution); inception parity igual active-learning-loop Phase 6.

## Revision Requests

_(vazio — populado a partir da Phase 2)_
