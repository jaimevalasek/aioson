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

- [.aioson/rules/security-baseline.md](.aioson/rules/security-baseline.md) — M5 import-from-claude le ~/.claude/ filesystem (path handling) + learnings committed contem PII potencial (trust-user V1)

## Agent Trail

_(vazio — populado a partir da Phase 2)_

<!-- sha256:baf858966b40814a1de0ea28c4fa0dcf6628ac8237fdbacdf75759e0ddfe1c17 -->
**2026-05-23T03:37:49.657Z** | @product | _What_

MVP: extend active-learning-loop com materializacao disk-first em .aioson/learnings/{gotchas,recipes}/ + INDEX.md regenerator + diretiva universal em CLAUDE.md/AGENTS.md/OPENCODE.md + capture sinais novos (gotcha, resolution) + learning:import-from-claude one-shot + inception mirror. Constraints: NAO criar novo CLI namespace (evita colisao com aioson learning existente); reusa schema project_learnings + memory:archive + feature:close hook; storage committed default; 2 categorias V1 (gotchas/, recipes/); 2 sinais V1 (gotcha, resolution); inception parity igual active-learning-loop Phase 6.

<!-- sha256:5918596abf8e90e4b55b1dfd07e397b970f69118eae3b2ea2073095f85b5f277 -->
**2026-05-30T18:20:07.430Z** | @analyst | _Agent Trail_

Requirements + spec produzidos (Gate A). SMALL, estende active-learning-loop. Decisoes: Q-CTPK-01 ADD COLUMN kind (FTS5-safe, nao recreate); Q-CTPK-02 materializacao so em feature:close (hook runDistillation sob lock); Q-CTPK-03 PII trust-user V1. Correcoes vs PRD: nao existe verbo learning capture (captura via devlog -> upsertProjectLearning); memory-capture-directive e da operator-memory, M1 cria learning-capture-directive.md novo. 11 BRs, 10 ECs. Q-CTPK-04/05/06 deferidas a V2. Next: @dev.

<!-- sha256:7d5e1802818ef0ca9824ab15e70be5d3ad90a6d0016fb1afe504ed758cddf824 -->
**2026-05-30T18:37:42.084Z** | @dev | _Agent Trail_

Slice 1 (schema + M1 capture) LANDED. project_learnings.kind via migration Phase 4 (SCHEMA_VERSION 3->4, idempotent ALTER, FTS5 untouched) + base CREATE TABLE. devlog parser maps [gotcha]/[resolution] -> type=quality+kind; upsertProjectLearning app-level allow-list + non-clobber enrichment. New learning-capture-directive.md (template). 9 tests green; 30 affected suites pass (only pre-existing AC-P1-07 fails, confirmed via stash). Next: Slice 2 = M2 materialization hook in runDistillation + M3 INDEX.md regenerator.

<!-- sha256:283b984d696b6d7759d3b0b83065ad03eb0c0c3508b84fc98061af1117f875eb -->
**2026-05-30T19:05:35.889Z** | @dev | _Agent Trail_

Slice 2 (M2 materialize + M3 INDEX) LANDED. New src/learning-materialize.js: materializeLearnings writes active gotcha/resolution to .aioson/learnings/{gotchas,recipes}/{slug}.md + regenerates INDEX.md (category ASC, updated_at DESC, <=200 char). Idempotent (rewrite only if newer), EC-CTPK-05 collision disambig, EC-CTPK-09 orphan cleanup (user files safe), EC-CTPK-02 no-op. Hooked into runDistillation (best-effort, never breaks feature:close). +5 tests (14 total green); 13 distillation/learning suites (118 tests) pass. Full suite running. Next: Slice 3 = M4 universal loading directive in CLAUDE.md/AGENTS.md/OPENCODE.md.

<!-- sha256:21b63aadc43d81dfba135faf1aed37bc13b591649f4639a89ecd10ae1d4a1b17 -->
**2026-05-30T20:06:34.768Z** | @pm | _Agent Trail_

Plano de implementacao Gate C aprovado. Phases: 4. Prioridade: M4 universal loading directive, depois M5 import-from-claude, M6 inception parity.

<!-- sha256:6613b81d9e6bd3155e060dcb63414d5a5f92f8871c432a65142845c8b6456b24 -->
**2026-05-30T20:07:48.604Z** | @pm | _Agent Trail_

Correcao de Gate C: implementation plan foi escrito, mas gate:approve C bloqueou porque Gate B esta pending. Proximo formal: @architect fechar Gate B; depois @pm reaprova Gate C.

<!-- sha256:07c3afe97332880456950532dee64c67b490459deeaea129dfc6a6fdded16d1b -->
**2026-05-30T20:13:57.480Z** | @dev | _Agent Trail_

Slice 3 / M4 LANDED: canonical Project knowledge directive added to AGENTS.md, CLAUDE.md, OPENCODE.md and template mirrors. .gemini untouched per BR-CTPK-06. Next: M5 import-from-claude.

<!-- sha256:a8038644b9a4dcea09297f2311e84ec4dfe8ce957cb8ddfaa407005d0832f47e -->
**2026-05-30T20:18:16.247Z** | @dev | _Agent Trail_

Slice 4 / M5 LANDED: learning --sub=import-from-claude with safe Claude memory read, dry-run no mutation, --select import path, operator-preference filtering, and CLI --sub dispatch fix. Tests now 16/16. Next: M6 inception parity + .gitkeep placeholders.

<!-- sha256:881e50d6b40bc13006d0b2c207ce206271c6cd40320907e5933313e0a37dab9b -->
**2026-05-30T20:22:50.798Z** | @dev | _Agent Trail_

Slice 5 / M6 LANDED: inception parity test added for greenfield setup placeholders, universal directive in supported harness entrypoints, Gemini exclusion, and learning --sub=import-from-claude wiring. Added workspace/template .aioson/learnings/{gotchas,recipes}/.gitkeep placeholders. Focused verification green. Next: @qa Gate D.

## Revision Requests

- 2026-05-30 — Investigate `aioson update` memory boundaries: update should refresh managed/template/config surfaces, but should not mutate living memory (`.aioson/brains/*`, project learnings, bootstrap/current-state) except explicit managed placeholders. Review why `.aioson/brains/_index.json` and `.aioson/brains/sheldon/architecture-decisions.brain.json` changed during the accidental update/recovery pass and decide whether this is expected migration, stale local drift, or an update bug.

## Code Map

```yaml
files:
- path: src/runtime-store.js
  role: store
  added_by: dev
  added_at: 2026-05-30T18:38:30.583Z
- path: src/learning-loop-migration.js
  role: schema
  added_by: dev
  added_at: 2026-05-30T18:38:30.889Z
- path: src/commands/devlog-process.js
  role: command-entry
  added_by: dev
  added_at: 2026-05-30T18:38:31.204Z
- path: template/agents/_shared/learning-capture-directive.md
  role: config
  added_by: dev
  added_at: 2026-05-30T18:38:31.513Z
- path: tests/cross-tool-project-knowledge.test.js
  role: test
  added_by: dev
  added_at: 2026-05-30T18:38:31.819Z
- path: src/learning-materialize.js
  role: core-module
  added_by: dev
  added_at: 2026-05-30T19:05:36.502Z
- path: src/learning-loop-engine.js
  role: core-module
  added_by: dev
  added_at: 2026-05-30T19:05:37.270Z
- path: AGENTS.md
  role: harness-entrypoint
  added_by: dev
  added_at: 2026-05-30T17:12:43.696-03:00
- path: CLAUDE.md
  role: harness-entrypoint
  added_by: dev
  added_at: 2026-05-30T17:12:43.696-03:00
- path: OPENCODE.md
  role: harness-entrypoint
  added_by: dev
  added_at: 2026-05-30T17:12:43.696-03:00
- path: template/AGENTS.md
  role: template-entrypoint
  added_by: dev
  added_at: 2026-05-30T17:12:43.696-03:00
- path: template/CLAUDE.md
  role: template-entrypoint
  added_by: dev
  added_at: 2026-05-30T17:12:43.696-03:00
- path: template/OPENCODE.md
  role: template-entrypoint
  added_by: dev
  added_at: 2026-05-30T17:12:43.696-03:00
- path: src/learning-import-claude.js
  role: core-module
  added_by: dev
  added_at: 2026-05-30T17:17:36.516-03:00
- path: src/commands/learning.js
  role: command-entry
  added_by: dev
  added_at: 2026-05-30T17:17:36.516-03:00
- path: src/cli.js
  role: command-routing
  added_by: dev
  added_at: 2026-05-30T17:17:36.516-03:00
- path: src/i18n/messages/en.js
  role: i18n
  added_by: dev
  added_at: 2026-05-30T17:17:36.516-03:00
- path: src/i18n/messages/pt-BR.js
  role: i18n
  added_by: dev
  added_at: 2026-05-30T17:17:36.516-03:00
- path: src/i18n/messages/es.js
  role: i18n
  added_by: dev
  added_at: 2026-05-30T17:17:36.516-03:00
- path: src/i18n/messages/fr.js
  role: i18n
  added_by: dev
  added_at: 2026-05-30T17:17:36.516-03:00
- path: tests/inception-parity-cross-tool-project-knowledge.test.js
  role: test
  coupling_risk: low
  added_by: dev
  added_at: 2026-05-30T20:23:01.233Z
- path: template/.aioson/learnings/gotchas/.gitkeep
  role: config
  coupling_risk: low
  added_by: dev
  added_at: 2026-05-30T20:23:01.535Z
- path: template/.aioson/learnings/recipes/.gitkeep
  role: config
  coupling_risk: low
  added_by: dev
  added_at: 2026-05-30T20:23:01.826Z
- path: .aioson/learnings/gotchas/.gitkeep
  role: config
  coupling_risk: low
  added_by: dev
  added_at: 2026-05-30T20:23:02.122Z
- path: .aioson/learnings/recipes/.gitkeep
  role: config
  coupling_risk: low
  added_by: dev
  added_at: 2026-05-30T20:23:02.419Z
modules: []
patterns: []
```
