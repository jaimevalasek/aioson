---
feature_slug: lay-user-agent-mode
schema_version: "1.2"
created_by: dossier-init
created_at: 2026-05-16T18:37:57.547Z
status: active
classification: MEDIUM
last_updated_by: dossier-init
last_updated_at: 2026-05-16T18:37:57.547Z
---
## Why

Os agentes AIOSON atuais foram afinados para o único persona declarado no PRD principal — "Desenvolvedor". Floodam perguntas técnicas em batches de 5+ sem opção recomendada, em linguagem de engenharia (`MICRO`/`Gate D`/`tier3`/`circuit_open`). Uma pessoa não-técnica trava na primeira rodada porque não tem como decidir entre alternativas que não entende, e a infraestrutura para diferenciar comportamento por perfil de usuário (`profile` field em `project.context.md` aceita `beginner`/`developer`/`team`) existe mas é decorativa — nenhum agente lê esse campo hoje.

## What

_(preencher manualmente — PRD não encontrado ou sem seção de Escopo)_

## Code Map

```yaml
files:
- path: template/.aioson/skills/process/decision-presentation/SKILL.md
  role: config
  added_at: 2026-05-16T20:25:50.428Z
- path: src/constants.js
  role: config
  added_at: 2026-05-16T20:25:57.955Z
- path: template/.aioson/skills/process/decision-presentation/references/jargon-map.en.yaml
  role: config
  added_at: 2026-05-16T20:26:10.331Z
- path: template/.aioson/skills/process/decision-presentation/references/jargon-map.pt-BR.yaml
  role: config
  added_at: 2026-05-16T20:26:10.702Z
- path: template/.aioson/agents/neo.md
  role: config
  added_at: 2026-05-16T20:52:12.971Z
- path: template/.aioson/agents/setup.md
  role: config
  added_at: 2026-05-16T20:52:13.265Z
- path: template/.aioson/agents/product.md
  role: config
  added_at: 2026-05-16T20:52:13.560Z
- path: template/.aioson/agents/dev.md
  role: config
  added_at: 2026-05-16T20:52:13.876Z
- path: template/.aioson/agents/deyvin.md
  role: config
  added_at: 2026-05-16T20:52:14.161Z
- path: src/migrations/profile-rename.js
  role: config
  added_at: 2026-05-16T20:52:14.466Z
- path: src/constants.js
  role: config
  added_at: 2026-05-16T20:52:14.761Z
- path: src/onboarding.js
  role: config
  added_at: 2026-05-16T20:52:15.058Z
- path: src/commands/setup-context.js
  role: config
  added_at: 2026-05-16T20:52:15.353Z
- path: src/updater.js
  role: config
  added_at: 2026-05-16T20:52:15.653Z
- path: src/jargon-leak-doctor.js
  role: core-module
  added_at: 2026-05-17T06:15:08.421Z
- path: src/doctor.js
  role: core-module
  added_at: 2026-05-17T06:15:08.764Z
- path: tests/jargon-leak-doctor.test.js
  role: core-module
  added_at: 2026-05-17T06:15:09.088Z
modules: []
patterns: []
```

## Rules & Design-Docs aplicáveis

_(vazio — populado a partir da Phase 2)_

## Research Index

```yaml
researchs:
- slug: lay-user-agent-mode-2026
  verdict: has-alternatives
  agent_who_added: sheldon
  why_relevant: Validates persona at market level (63% non-devs), surfaces 2 new decisions (task-mode vs identity-mode; beginner label vs creator/vibe), reinforces migration narrative beginner→developer.
  added_at: 2026-05-16T18:55:19.089Z
  summary_path: researchs/lay-user-agent-mode-2026/summary.md
```

## Agent Trail

_(vazio — populado a partir da Phase 2)_

<!-- sha256:b4504b91ba5f0d65e6470c2b3c8a020264bd577802fed137a017a9eb9ea7c132 -->
**2026-05-16T18:38:10.153Z** | @product | _What_

MVP: skill decision-presentation + jargon dictionary (en+pt-BR) + mandatory loading in 5 agents (neo|setup|product|dev|deyvin, neo already done via 72751cb) + profile-aware mode (beginner default) + doctor check jargon_leak_detection. Constraints: classification SMALL (@analyst may escalate to MEDIUM if entity surface deeper than estimated).

<!-- sha256:ce9ca496e742273d6b4583a72fcfa4031b161feaa1d2d75ed012c02e897d7698 -->
**2026-05-16T19:01:36.680Z** | @sheldon | _Agent Trail_

Sizing: 4 (Path A in-place + Delivery plan, score 4-6 range). Decision: in-place enrichment + 3-phase Delivery plan section. SMALL classification preserved. 9 gaps applied (3 P0 + 6 P1), 3 P2 deferred. Research has-alternatives (lay-user-agent-mode-2026): market signal +63% non-dev validated; surfaced identity-mode vs task-mode decision; reinforced migration narrative. Brain patterns 002+004+006 applied. progress.json initialized; harness-contract.json removed (SMALL rule). Next: @analyst Gate A.

<!-- sha256:1f00c6afb8dae8dd2b0fc9c3abfbed23c782b39c8db091dfe2b733425fce85c2 -->
**2026-05-16T19:08:39.692Z** | @analyst | _Agent Trail_

Requirements mapped: 16 binary ACs, 9 business rules, 11 edge cases, 4 entities (skill/dict/doctor-check/profile-rename). Decisions closed: Q7

<!-- sha256:439dd11769ec354ce1d9258dd4f74e994b53e0c79ee9b11e6f931f23a9f75c75 -->
**2026-05-16T20:25:19.071Z** | @dev | _Agent Trail_

Phase 1 Foundation completa. 3 arquivos novos (SKILL.md 119 LOC + 2 jargon-map YAML com 20 termos cada) em template/.aioson/skills/process/decision-presentation/ e workspace mirror (byte-identical via diff -r). MANAGED_FILES estendido em src/constants.js (3 entries). Test suite: 2456 pass / 1 fail (known flake telemetry-foundation perf-bound) / 1 skip — sem regressão. Phase 1 Gate: skill loadable + YAML parseable + zero behavior change. Code Map: 4 paths managed-file-tracked. Next: Phase 2 (agent integration — preflight + hard constraint em @setup/@product/@dev/@deyvin; @neo já feito em 72751cb).

<!-- sha256:189361d63482a9b804e39ba4428b72609a3c83c324fd10b550be03a767eb8b5e -->
**2026-05-16T20:52:03.096Z** | @dev | _Agent Trail_

Phase 2 Agent Integration complete. 5 kernels edited (workspace + template byte-identical via diff -q): @neo +394b @setup +391b @product +656b @dev +394b @deyvin +395b. Each got skill preflight load + hard-constraint NEVER multiple open questions/AskUserQuestion. @product cadence rule made profile-aware (creator

<!-- sha256:8676ae3e2adf79f179610153f31102b7f326e4a251a75c6451d1c3e9b4d48c19 -->
**2026-05-17T06:15:01.611Z** | @dev | _Agent Trail_

Phase 3 Verification complete. New module src/jargon-leak-doctor.js (~210 LOC pure-where-possible) wired in src/doctor.js runDoctor as severity

<!-- sha256:93207239dbc9dc388a2a0660b665bbb10f35bf72b565c3f70406d93cfe4eda18 -->
**2026-05-17T06:21:44.945Z** | @qa | _Agent Trail_

QA concluido — Verdict PASS. Cobertura: 13/16 AC fully covered + 2 partial + 1 deferred (AC-LUM-15 by design). Findings: 0 Critical, 0 High, 4 Medium, 2 Low (todos documentados como residual risks no spec.md "## QA sign-off"). Test suite: 2481 pass / 0 fail / 1 skip — melhorou vs baseline. Pentester NAO recomendado (zero sensitive surface). Tester NAO recomendado (cobertura razoavel para SMALL). Validator NAO aplicavel (SMALL nao tem harness-contract). Feature pronta para feature:close.

## Revision Requests

_(vazio — populado a partir da Phase 2)_
