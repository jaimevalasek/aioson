---
last_updated: 2026-06-23
active_feature: framework-integrations-docs-update
active_phase: 1
next_step: "framework-integrations-docs-update concluido. Proximo: manter novos docs oficiais de integrations no template e em MANAGED_FILES."
status: dev_complete
---

# Dev State

**Feature:** framework-integrations-docs-update
**Phase:** 1
**Status:** dev_complete
**Next step:** framework-integrations-docs-update concluido. Proximo: manter novos docs oficiais de integrations no template e em MANAGED_FILES.

## Context package

1. project.context.md
2. simple-plans/framework-integrations-docs-update.md

## History

- 2026-06-09: Fase 2 — human-gate + HUMAN_GATE (D4), criteria-runner (D7), harness:approve/reject/status, publish gate no feature:close, git:guard merge (REQ-20). Integração e2e: gate→approve→retomada, failure signature repeat, publish, REQ-20.
- 2026-06-10: phase 1 — Implementar Tema 1 na ordem do architecture.md §6: retro-sources.js (fixtures vazias primeiro, AC-2) -> retro-aggregate.js (AC-5/6) -> retro-render.js (AC-4) -> harness-retro.js + cli.js + i18n + piloto loop-guardrails (AC-1, AC-7..10) -> boundary rule + sheldon.md template-first (AC-11/16). Tema 2 depois (preview-artifact, AC-12..14). Decisoes fechadas: D1..D7 em architecture.md; nao redescobrir: execution_events sem coluna feature_slug (filtro payload_json.slug), attempts/ e devlogs vazios hoje, baseline suite 3104/3105
- 2026-06-10: phase 1 — Implementar Tema 1 na ordem do architecture.md §6: retro-sources.js (fixtures vazias primeiro, AC-2) -> retro-aggregate.js (AC-5/6) -> retro-render.js (AC-4) -> harness-retro.js + cli.js + i18n + piloto loop-guardrails (AC-1, AC-7..10) -> boundary rule + sheldon.md template-first (AC-11/16). Tema 2 depois (preview-artifact, AC-12..14). Decisoes D1..D7 fechadas em architecture.md; nao redescobrir: execution_events sem coluna feature_slug (filtro payload_json.slug), attempts/ e devlogs vazios hoje (fixtures sinteticas), baseline suite 3104/3105
- 2026-06-10: phase 1 — Implementar Tema 1 na ordem do architecture.md §6: retro-sources.js (fixtures vazias primeiro, AC-2) -> retro-aggregate.js (AC-5/6) -> retro-render.js (AC-4) -> harness-retro.js + cli.js + i18n + piloto loop-guardrails (AC-1, AC-7..10) -> boundary rule + sheldon.md template-first (AC-11/16). Tema 2 depois (preview-artifact, AC-12..14). Decisoes D1..D7 fechadas em architecture.md; nao redescobrir: execution_events sem coluna feature_slug (filtro payload_json.slug), attempts/ e devlogs vazios hoje (fixtures sinteticas), baseline suite 3104/3105
- 2026-06-10: phase 1 — Implementar Tema 1 na ordem do architecture.md §6: retro-sources.js (fixtures vazias primeiro, AC-2) -> retro-aggregate.js (AC-5/6) -> retro-render.js (AC-4) -> harness-retro.js + cli.js + i18n + piloto loop-guardrails (AC-1, AC-7..10) -> boundary rule + sheldon.md template-first (AC-11/16). Tema 2 depois (preview-artifact, AC-12..14). Decisoes D1..D7 fechadas em architecture.md §Feature Architecture RHO-lite; nao redescobrir: execution_events sem coluna feature_slug (filtro payload_json.slug), attempts/ e devlogs vazios hoje (fixtures sinteticas), baseline suite 3104/3105
- 2026-06-23: phase 1 — Criados 7 guias curados em `.aioson/docs/play/` para apps compativeis com AIOSON Play: entrada dos agentes, checklist de compatibilidade, manifest/runtime, LLM+DB+Data Bindings, auth/services/testing e mapa para os docs canonicos do `aioson-play`.
- 2026-06-23: phase 1 — `framework-integrations-docs-update` concluido: `.aioson/docs/integrations/dashboard-app-form-publish-mapping.md` agora tem frontmatter, foi adicionado ao template, registrado em `MANAGED_FILES`, e `tests/update.test.js` cobre update preservativo (oficial substitui, projeto extra permanece).
