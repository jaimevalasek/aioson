---
last_updated: 2026-06-24
active_feature: design-skills-quality
active_phase: 1
next_step: "Optional QA/sample-generation visual pass for cognitive-core-ui after layout hardening."
status: done
---

# Dev State

**Feature:** design-skills-quality
**Status:** done
**Next step:** Optional QA/sample-generation visual pass for cognitive-core-ui after layout hardening.

## Context package

1. project.context.md
2. simple-plans/design-skills-quality.md

## History

- 2026-06-10: phase 1 — Implementar Tema 1 na ordem do architecture.md §6: retro-sources.js (fixtures vazias primeiro, AC-2) -> retro-aggregate.js (AC-5/6) -> retro-render.js (AC-4) -> harness-retro.js + cli.js + i18n + piloto loop-guardrails (AC-1, AC-7..10) -> boundary rule + sheldon.md template-first (AC-11/16). Tema 2 depois (preview-artifact, AC-12..14). Decisoes D1..D7 fechadas em architecture.md §Feature Architecture RHO-lite; nao redescobrir: execution_events sem coluna feature_slug (filtro payload_json.slug), attempts/ e devlogs vazios hoje (fixtures sinteticas), baseline suite 3104/3105
- 2026-06-23: phase 1 — Criados 7 guias curados em `.aioson/docs/play/` para apps compativeis com AIOSON Play: entrada dos agentes, checklist de compatibilidade, manifest/runtime, LLM+DB+Data Bindings, auth/services/testing e mapa para os docs canonicos do `aioson-play`.
- 2026-06-23: phase 1 — `framework-integrations-docs-update` concluido: `.aioson/docs/integrations/dashboard-app-form-publish-mapping.md` agora tem frontmatter, foi adicionado ao template, registrado em `MANAGED_FILES`, e `tests/update.test.js` cobre update preservativo (oficial substitui, projeto extra permanece).
- 2026-06-24: phase 1 — `design-skills-quality` concluido: 20 design skills com frontmatter valido, gates de qualidade adicionados, referencias conflitantes de fundos isolados substituidas por ambient fields, template/workspace sincronizados, `MANAGED_FILES` cobre todos os arquivos enviados, e testes/validacoes passaram.
- 2026-06-24: phase 1 — `cognitive-core-ui` hardening concluido depois de output visual quebrado: substituidos shells flex/calc por grid com `minmax(0, ...)`, grids `auto-fit`, scroll panes com `min-width/min-height: 0`, sidebars/rails responsivos, tracking zerado, auth glow por ambient field, e referencias workspace/template mantidas em paridade.
- 2026-06-24: phase 1 — follow-up visual `cognitive-core-ui` concluido: previews antigos em `docs/design-previews` reescritos, CSS compartilhado criado, exemplos cockpit/website/list-detail/auth/settings adicionados, screenshots desktop/mobile avaliados, e checagem Playwright confirmou 12/12 sem overflow horizontal.
- 2026-06-24: phase 1 — exemplo Kanban `cognitive-core-ui` adicionado em `docs/design-previews`: board responsivo com metricas, colunas, cards, owners e WIP; indice atualizado para 22 previews; screenshots desktop/mobile e checagem de overflow passaram.
