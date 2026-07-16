---
feature_slug: briefing-refiner
schema_version: "1.2"
created_by: dossier-init
created_at: 2026-06-08T16:15:04.665Z
status: active
classification: SMALL
last_updated_by: dev
last_updated_at: 2026-06-08T18:25:07.698Z
---
## Why

Hoje o `@briefing` já cria arquivos Markdown estruturados, mas a revisão humana ainda acontece de forma linear, em chat ou edição manual do Markdown. Isso dificulta enxergar ambiguidades, redundâncias, decisões pendentes e o impacto do que será feito antes de aprovar o briefing para virar PRD.

## What

MVP: adicionar o agente `@briefing-refiner` entre `@briefing` e `@product`, com geração de `review.html`, persistência estruturada em `refinement-feedback.json`, reaplicação confirmada no `briefings.md` e auditoria em `refinement-report.md`.

Constraints: não criar PRD, não aprovar briefing automaticamente, não depender de serviço externo e não permitir consumo direto de briefing por `@dev`.

## Code Map

```yaml
files:
- path: template/.aioson/agents/briefing-refiner.md
  role: other
  coupling_risk: high
  added_at: 2026-06-08T17:18:09.335Z
- path: src/commands/briefing.js
  role: command-entry
  coupling_risk: medium
  added_at: 2026-06-08T17:18:09.374Z
- path: src/lib/briefing-refiner/
  role: core-module
  coupling_risk: medium
  added_at: 2026-06-08T17:18:09.393Z
- path: src/lib/briefing-refiner/briefing-registry.js
  role: core-module
  coupling_risk: medium
  added_by: dev
  added_at: 2026-06-08T18:25:07.401Z
- path: src/lib/briefing-refiner/briefing-sections.js
  role: core-module
  coupling_risk: medium
  added_by: dev
  added_at: 2026-06-08T18:25:07.430Z
- path: src/lib/briefing-refiner/feedback-schema.js
  role: core-module
  coupling_risk: medium
  added_by: dev
  added_at: 2026-06-08T18:25:07.460Z
- path: src/lib/briefing-refiner/review-html.js
  role: core-module
  coupling_risk: medium
  added_by: dev
  added_at: 2026-06-08T18:25:07.489Z
- path: src/lib/briefing-refiner/refinement-report.js
  role: core-module
  coupling_risk: medium
  added_by: dev
  added_at: 2026-06-08T18:25:07.505Z
- path: src/lib/briefing-refiner/apply-feedback.js
  role: core-module
  coupling_risk: medium
  added_by: dev
  added_at: 2026-06-08T18:25:07.519Z
modules: []
patterns: []
```

## Rules & Design-Docs aplicáveis

- [.aioson/rules/aioson-context-boundary.md](.aioson/rules/aioson-context-boundary.md) — Refinement feedback JSON must stay under .aioson/briefings, not .aioson/context

- [.aioson/rules/agent-structural-contract.md](.aioson/rules/agent-structural-contract.md) — New official agent must follow language boundary, required sections, observability and template/workspace parity

## Research Index

```yaml
researchs:
- slug: file-system-access-api-2026
  verdict: has-alternatives
  agent_who_added: sheldon
  why_relevant: Defines review.html persistence constraints and export fallback requirement
  added_at: 2026-06-08T16:24:56.867Z
  summary_path: researchs/file-system-access-api-2026/summary.md
- slug: local-html-editable-review-ui-2026
  verdict: confirmed
  agent_who_added: sheldon
  why_relevant: Validates contenteditable/input model for local editable review UI
  added_at: 2026-06-08T16:24:57.165Z
  summary_path: researchs/local-html-editable-review-ui-2026/summary.md
```

## Agent Trail

_(vazio — populado a partir da Phase 2)_

<!-- sha256:131bfac8e4b6613b9038b8d864188316a868996f8b7c482c68ad57d190719eb0 -->
**2026-06-08T16:15:04.739Z** | @product | _What_

MVP: add @briefing-refiner between @briefing and @product, with review.html, refinement-feedback.json, confirmed markdown reapplication, and refinement-report.md. Constraints: no PRD creation, no auto-approval, no external service dependency.

<!-- sha256:bae7711c88ecb87cbb7aabffa242d91f5f650eb69e8a4a87bab31173cd36a7d3 -->
**2026-06-08T16:24:57.262Z** | @sheldon | _Agent Trail_

Sizing: 4. Decision: Path A in-place enrichment; no external phased plan. PRD unchanged pending user confirmation. Key gaps: persistence fallback, feedback schema, approved-briefing mutation rule, template/workspace parity.

<!-- sha256:115c43f3a383de4fbb1b3afe8c380ed92dd5bf82a0fac6c5e4f99899dc3a5ab1 -->
**2026-06-08T16:29:22.958Z** | @analyst | _Agent Trail_

Requirements mapped. Entities: 6. Business rules: 17. Acceptance criteria: 17. Edge cases: 10. Gate A approved; next @scope-check or @architect.

<!-- sha256:08d42a13c0fe217daf1bc9500ced92e0db33c83e4b56a24145179b940cd4bdac -->
**2026-06-08T17:02:07.612Z** | @scope-check | _Agent Trail_

Pre-dev scope check approved. PRD, Sheldon enrichment, requirements and spec align. Non-blocking architect request: choose reapproval status contract and real routing registry files.

<!-- sha256:89d5f039c364b55a777f1627bf4ba4ce3b48687764ae8b74eb53090a82a21ae6 -->
**2026-06-08T17:16:56.323Z** | @architect | _Agent Trail_

Arquitetura definida: prompt-first agent, helpers in src/lib/briefing-refiner, constants registry update, existing briefing approve/unapprove reused, approved modified briefings return to draft, Gate B approved.

<!-- sha256:774a69d6923099754d2974fe0b583f8a79e1947eb641a806bb2c2e646d009f83 -->
**2026-06-08T17:22:47.748Z** | @discovery-design-doc | _Agent Trail_

Discovery & design doc: feature-scoped design-doc and readiness package written with exact implementation paths, reuse decisions, warnings, and @dev handoff. Readiness: medium. Next: dev.

<!-- sha256:d760f92d43b94e2a2f634953336a7724bd0904295e7c63a9edcdde4693a67d69 -->
**2026-06-08T17:59:37.357Z** | @pm | _Agent Trail_

Implementation plan written. Phases: 5. Gate C approved. @dev preflight: READY_WITH_WARNINGS; stale dev-state warning only.

<!-- sha256:0751e5dfd084407237fba9c2806254d5185b0f0198caa4713cdabd6ee9ac78f5 -->
**2026-06-08T18:03:11.744Z** | @orchestrator | _Agent Trail_

Orchestration reviewed. Lanes: 0 new. Gate C: approved. Decision: sequential @dev execution; existing parallel workspace belongs to an older design-governance cycle and must not be reused.

<!-- sha256:97b7b3dd699f1c103242c9d49176c44182d258cbfd6bba8e9395ed613f5134e5 -->
**2026-06-08T18:07:06.314Z** | @scope-check | _Agent Trail_

Final pre-dev scope check approved. Intent, requirements, design, implementation plan and orchestration align. Gate A/B/C approved. Next: @dev. Warnings: conformance artifact missing in artifact:validate; stale dev-state must be ignored.

<!-- sha256:e76b8618c68532a74e7b469ab07e2b95bfb81973b4c39d040733945862cbbeca -->
**2026-06-08T18:25:07.698Z** | @dev | _Agent Trail_

Implementation completed: briefing-refiner prompt registered, registry extracted, review HTML/feedback/report helpers added, confirmed apply flow implemented, approved briefings return to draft, and focused regression/lint passed.

<!-- sha256:0c56fb9df58412e9d5e66adb98be3b9dffd1e295c511ce165aebafc140bf3f67 -->
**2026-06-08T18:41:46.109Z** | @qa | _Revision Requests_

Gate D blocked: AC-008 declined-feedback path returns confirmation_required without writing refinement-report.md skipped changes. @dev should implement declined report support and add a regression test.

<!-- sha256:9542c1935b5b12783aea5f14184a2d762a78c0f88cdf1475d68ce40433439f30 -->
**2026-06-08T18:45:52.422Z** | @analyst | _Agent Trail_

Conformance contract generated after QA: .aioson/context/conformance-briefing-refiner.yaml now maps all 17 ACs into machine-readable preconditions/actions/outcomes. Artifact chain is VALID; Gate D remains blocked by AC-008 for @dev.

<!-- sha256:ed5ea95b290574bc295416c058603453976111e5b443640303784e3a58feec71 -->
**2026-06-08T19:10:45.396Z** | @dev | _Agent Trail_

AC-008 fixed: added applyDeclinedFeedback to validate feedback, keep briefings.md unchanged, and write refinement-report.md with status declined and skipped changes. Regression test added. Focused tests, lint, artifact validation and isolated flaky reruns passed; npm test full run hit unrelated temp cleanup/perf flakes.

<!-- sha256:e7a09e8cdb4e9eda43b2b27021620bf91703f5fc5545b9c53b5ebcb22b329737 -->
**2026-06-08T20:36:58.469Z** | @qa | _Agent Trail_

QA completed. Verdict: PASS. Gate D approved. AC: 17/17 covered. Security: SF-01 high path-traversal + SF-02/03/04/06 low verified fixed (regression-tested); SF-05 info accepted as residual. Tests 23/23, lint pass, artifact chain VALID.

## Revision Requests

_(vazio — populado a partir da Phase 2)_
