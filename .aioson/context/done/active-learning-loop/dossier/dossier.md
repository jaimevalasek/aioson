---
feature_slug: active-learning-loop
schema_version: "1.2"
created_by: dossier-init
created_at: 2026-05-14T02:39:55.355Z
status: active
classification: MEDIUM
last_updated_by: dossier-init
last_updated_at: 2026-05-14T02:39:55.355Z
---
## Why

AIOSON acumula learnings, rules e brain nodes a cada feature, mas o loop está aberto em três pontos: (1) distillation (`learning:evolve`, `pattern:detect`, `learning:auto-promote`) só roda manualmente, (2) não há telemetria de **uso real** de rules e brain nodes — quality scores e frequência são estáticos ou só refletem criação, e (3) não há mecanismo de archive proposto pelo sistema. Em projetos MEDIUM/large, isso vira prompt-budget desperdiçado em rules que ninguém carrega há 5 features e dor de curadoria que o autor do vídeo do Hermes explicitamente cita ("tenho tantas skills e algumas são parecidas — como refinar?").

## What

_(preencher manualmente — PRD não encontrado ou sem seção de Escopo)_

## Code Map

```yaml
files:
- path: src/learning-loop-engine.js
  role: core-module
  coupling_risk: high
  added_by: architect
  added_at: 2026-05-14T03:36:36.309Z
- path: src/learning-loop-migration.js
  role: store
  coupling_risk: high
  added_by: architect
  added_at: 2026-05-14T03:36:36.607Z
- path: src/learning-loop-fts5.js
  role: util
  coupling_risk: medium
  added_by: architect
  added_at: 2026-05-14T03:36:36.931Z
- path: src/learning-loop-archive.js
  role: io-layer
  coupling_risk: medium
  added_by: architect
  added_at: 2026-05-14T03:36:37.253Z
- path: src/learning-loop-schemas.js
  role: schema
  coupling_risk: low
  added_by: architect
  added_at: 2026-05-14T03:36:37.650Z
- path: src/commands/memory-search.js
  role: command-entry
  coupling_risk: medium
  added_by: architect
  added_at: 2026-05-14T03:36:38.098Z
- path: src/commands/memory-archive.js
  role: command-entry
  coupling_risk: high
  added_by: architect
  added_at: 2026-05-14T03:36:38.421Z
- path: src/commands/memory-restore.js
  role: command-entry
  coupling_risk: medium
  added_by: architect
  added_at: 2026-05-14T03:36:38.716Z
- path: src/commands/context-load.js
  role: command-entry
  coupling_risk: medium
  added_by: architect
  added_at: 2026-05-14T03:36:39.042Z
- path: src/doctor.js
  role: core-module
  coupling_risk: medium
  added_by: architect
  added_at: 2026-05-14T03:36:39.350Z
- path: src/commands/feature-close.js
  role: command-entry
  coupling_risk: high
  added_by: architect
  added_at: 2026-05-14T03:36:39.637Z
- path: src/runtime-store.js
  role: store
  coupling_risk: high
  added_by: architect
  added_at: 2026-05-14T03:36:39.953Z
modules: []
patterns: []
```

## Rules & Design-Docs aplicáveis

- [.aioson/rules/security-baseline.md](.aioson/rules/security-baseline.md) — Tier-2 archive (BR-01,06) + SQL injection guard (EC-08) + Article VII Zero Trust

- [.aioson/rules/disk-first-artifacts.md](.aioson/rules/disk-first-artifacts.md) — Archive files moved to _archived/, evolution_log persisted; nothing chat-only

- [.aioson/rules/canonical-path-contract.md](.aioson/rules/canonical-path-contract.md) — Archive folder convention _archived/YYYY-MM-DD must follow canonical paths

- [.aioson/rules/data-format-convention.md](.aioson/rules/data-format-convention.md) — JSON schemas: learning-loop.json, payload_json for events, evolution_log entries

- [.aioson/design-docs/folder-structure.md](.aioson/design-docs/folder-structure.md) — 9 new src/ files + commands/; flat root vs lib/ debate resolved by precedent (sub-task-engine pattern)

- [.aioson/design-docs/file-size.md](.aioson/design-docs/file-size.md) — 9 new files; estimates 100-350 lines each, all under 500 threshold; split protocol if exceeded

- [.aioson/design-docs/naming.md](.aioson/design-docs/naming.md) — learning-loop-{responsibility}.js prefix pattern; memory-{action}.js for commands

- [.aioson/design-docs/componentization.md](.aioson/design-docs/componentization.md) — Engine split criteria documented; pure functions isolated for testability

- [.aioson/design-docs/code-reuse.md](.aioson/design-docs/code-reuse.md) — Reuses runtime-store appendRunEvent, notify, learning-evolve, pattern-detect; zero new deps

## Research Index

```yaml
researchs:
- slug: hermes-agent-architecture-2026
  verdict: has-alternatives
  agent_who_added: sheldon
  why_relevant: Confirms SQLite+FTS5 as industry baseline. Hermes uses 5+ tool-calls trigger; AIOSON's feature:close is SDD-aligned alternative. Validates no-LLM-in-loop divergence.
  added_at: 2026-05-14T02:54:47.804Z
  summary_path: researchs/hermes-agent-architecture-2026/summary.md
- slug: anthropic-dreaming-2026
  verdict: has-alternatives
  agent_who_added: sheldon
  why_relevant: CRITICAL: Dreaming shipped May 6 2026, 7 days before this PRD. AIOSON edges: harness-agnostic, project-scoped, tier-2 archive, inception self-test. PRD needs Differentiation.
  added_at: 2026-05-14T02:54:48.165Z
  summary_path: researchs/anthropic-dreaming-2026/summary.md
- slug: agent-memory-backends-2026
  verdict: confirmed
  agent_who_added: sheldon
  why_relevant: Confirms FTS5+SQLite V1 baseline. V2 trajectory: sqlite-vec, per-category half-life (identity 1y vs integration 1mo), Zep validity-window pattern.
  added_at: 2026-05-14T02:54:48.551Z
  summary_path: researchs/agent-memory-backends-2026/summary.md
- slug: skill-consolidation-patterns-2026
  verdict: has-alternatives
  agent_who_added: sheldon
  why_relevant: Auto Dream pattern: per-file size budget (<200 lines), richer signal extraction (corrections, recurring themes). AIOSON missing both — doctor could enforce per-layer size.
  added_at: 2026-05-14T02:54:48.882Z
  summary_path: researchs/skill-consolidation-patterns-2026/summary.md
```

## Agent Trail

_(vazio — populado a partir da Phase 2)_

<!-- sha256:015bb4b05c0b7a901633f230d7b7f8c3a26edb23ed5e5a719c79ca09a56be8cf -->
**2026-05-14T02:40:05.073Z** | @product | _What_

MVP: close AIOSON's learning loop via feature:close auto-distillation hook (M1), rule/brain usage telemetry in new context_load_events SQLite table (M2), three new doctor checks rule_staleness/learning_orphans/distillation_lag (M3), memory:search with FTS5 over content_items+learnings (M4), memory:archive tier-2 human-approved (M5), and inception mirror src/ <-> template/ (M6). Out of scope: auto-archive without human, auto-merge of brains, LLM clustering, cross-project memory, multi-channel gateway, FTS over brains, skill consolidation in template. Constraint: distillation runs at feature:close not agent:done; archive is always tier 2; heuristics only, no LLM in the loop logic.

<!-- sha256:d96e74bb55598e27f55b410ee74970dd52f71463c30ad52efd53a6d290b709f0 -->
**2026-05-14T03:20:43.824Z** | @sheldon | _Agent Trail_

Sizing: 15 (entities 6, phases 6, integrations 0, flows 4, ACs ~30). Decision: path-b-external-phased. Plan: .aioson/plans/active-learning-loop/manifest.md (6 phases, 10 PMDs, 5 DDs). 14/14 improvements applied. Critical recalibration: Anthropic Dreaming shipped 6-mai-2026 — added Differentiation section. M2 reuses execution_events (no schema migration). M5 uses Zep validity-window. MICRO out-of-scope. DD-1..DD-5 deferred to @architect.

<!-- sha256:f3b94f0721fd46013c5b6b9c4968265b2a7606b79fffa6f855e2c73984416f4f -->
**2026-05-14T03:29:50.033Z** | @analyst | _Agent Trail_

Requirements: 3 new entities (FTS5 virtual table, learning-loop.json config, archive folders), 2 extended tables (evolution_log +9 cols, execution_events new event_types). 4 indexes. 12 BRs. 15 edge cases. 30 binary ACs mapped to 6 phases. DD-1..DD-5 recommendations provided to @architect.

<!-- sha256:8b8a83ee01287d882843027c26e50cddbbb5a15b613eee3421783889188166ac -->
**2026-05-14T03:36:56.991Z** | @architect | _Agent Trail_

Architecture: 9 new src files + 4 modified + 6 phase concerns mapped. DDs: DD-1 CLI verb context:load. DD-2 foreground 5s (OVERRIDE analyst bg). DD-3 SQLite row INSERT+UPDATE. DD-4 BM25. DD-5 defer to brain-curation feature. 8 inception parity verification points. Hook+lock sequence diagrammed.

<!-- sha256:ae11fc9798b7b93c6d3e17761a7d12dce5c59e1cd6e33ab6d018a1992fde0c4b -->
**2026-05-14T03:47:46.175Z** | @dev | _Agent Trail_

Session prep only: reflect-prompt do architect processado (current-state.md atualizado). dev-state.md preparado para Phase 1 telemetry-foundation com checklist de 14 steps, minimum context package (4 files), Gate C workaround documentado (Sheldon plan canonical per RDA-04). Nenhum codigo escrito - pausado para fresh chat preservar slice discipline.

## Revision Requests

_(vazio — populado a partir da Phase 2)_
