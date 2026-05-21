---
feature_slug: operator-memory
schema_version: "1.2"
created_by: dossier-init
created_at: 2026-05-21T02:06:28.172Z
status: active
classification: MEDIUM
last_updated_by: dossier-init
last_updated_at: 2026-05-21T02:06:28.172Z
---
## Why

Developers usando AIOSON em múltiplas sessões / múltiplos harnesses (Claude Code, Codex, Gemini) e — crítico — em equipes onde vários devs operam o mesmo `.aioson/` precisam re-ditar decisões padrão (autonomia de commit/push, idioma, estilo de feedback, autorizações de tooling) toda sessão. Fricção recorrente; o esqueleto `.aioson/context/user-profile.md` existe há tempo mas nunca foi efetivamente plugado nos prompts dos agents. O auto-memory do Claude Code resolve parcialmente, mas é proprietário do harness — Codex e Gemini ficam fora.

## What

_(preencher manualmente — PRD não encontrado ou sem seção de Escopo)_

## Code Map

```yaml
files:
- path: src/operator-memory/identity.js
  role: core-module
  coupling_risk: low
  added_by: architect
  added_at: 2026-05-21T05:17:30.329Z
- path: src/operator-memory/storage.js
  role: core-module
  coupling_risk: medium
  added_by: architect
  added_at: 2026-05-21T05:17:30.657Z
- path: src/operator-memory/decision.js
  role: core-module
  coupling_risk: medium
  added_by: architect
  added_at: 2026-05-21T05:17:30.999Z
- path: src/operator-memory/loader.js
  role: core-module
  coupling_risk: medium
  added_by: architect
  added_at: 2026-05-21T05:17:31.328Z
- path: src/operator-memory/conflict.js
  role: core-module
  coupling_risk: medium
  added_by: architect
  added_at: 2026-05-21T05:17:31.678Z
- path: src/operator-memory/decay.js
  role: core-module
  coupling_risk: low
  added_by: architect
  added_at: 2026-05-21T05:17:32.001Z
modules: []
patterns: []
```

## Rules & Design-Docs aplicáveis

- [.aioson/rules/prd-section-ownership.md](.aioson/rules/prd-section-ownership.md) — Sheldon writes to sheldon-enrichment-{slug}.md + plans/{slug}/ — never modifies PRD sections owned by @product (Vision/Problem/Users) directly.

## Research Index

```yaml
researchs:
- slug: agent-memory-backends-2026
  verdict: confirmed
  agent_who_added: sheldon
  why_relevant: Validates PMD-01 hybrid SQLite+FTS5 storage, PMD-03 per-category TTL, PMD-04 10k cap, PMD-11 Zep validity-window pattern.
  added_at: 2026-05-21T05:01:32.295Z
  summary_path: researchs/agent-memory-backends-2026/summary.md
```

## Agent Trail

_(vazio — populado a partir da Phase 2)_

<!-- sha256:3d8f8d67feb18632af8121b2d5932c80879913d86ad397d62ef393a29723a672 -->
**2026-05-21T02:06:38.441Z** | @product | _What_

MVP: camada de memória por-operador multi-dev safe (sha256 email hash), 4 signal types auto-capture, threshold 2x promotion, 6 CLI commands, conflict policy project-rules-win, universal loading directive em CLAUDE.md/AGENTS.md. Constraints: machine-local v1, no cross-machine sync, no GUI.

<!-- sha256:7c762bae7ed4875b86c6b9d176313adc55dbab1a070ad4d74ebee540d239b448 -->
**2026-05-21T05:01:20.703Z** | @sheldon | _Agent Trail_

Sizing: 11. Decision: Path B (external phased plan). Plan: .aioson/plans/operator-memory/manifest.md. 5 phases progressive release v1.12.0->v1.16.0 (mirrors workflow-handoff-integrity DD-05). 12 PMDs (storage hybrid SQLite+markdown, LLM-driven divergence acknowledged, per-category TTL, 10k cap, AIOSON_OPERATOR_ID regex, 4 signal types, 2x threshold, silent audit, conflict binary V1, user-profile migration tied to features.md, Zep validity-window, telemetry via dossierTelemetry). 5 DDs deferred to @architect. Critical inception risk: Phase 3 universal directive flag-gated AIOSON_OPERATOR_MEMORY=true (default off until Phase 4 ships green).

<!-- sha256:739cf0a54937161044bb4abd7a36f8bc956df7530af6ced9a2b2dd63e6ecc58b -->
**2026-05-21T05:11:47.479Z** | @analyst | _Agent Trail_

Requirements + spec produzidos. Field-level schemas para 6 entities (PMD-AN-01 a PMD-AN-06). 4 NFRs (storage scaling, prompt budget, multi-dev isolation, decay correctness). 10 BRs + 10 ECs. 2 DDs deferidas para mim resolvidas (DD-08 schema completo, DD-09 MEMORY.md tier-based). 2 novas DDs surfadas para architect (DD-A1 atomic move, DD-A2 FTS5 migration). Classification MEDIUM mantida (sheldon override por cross-cutting + 5 phases).

<!-- sha256:fee8bba71f57449fada1d54afa58fd8ee7aa94eb97472fc52df44d802f1f77ef -->
**2026-05-21T05:17:46.374Z** | @architect | _Agent Trail_

Arquitetura definida: 7 DDs resolvidas (DD-01 minimal Zep, DD-02 16-char hash, DD-03 6k cross-cutting budget, DD-04 extend dossierTelemetry, DD-05 explicit op:migrate, DD-A1 file stays on archive transition, DD-A2 drop-rebuild FTS5). 12 novos modulos em src/operator-memory/ + 8 commands em src/commands/. 5 per-phase architecture sections com data flows ASCII. SQLite WAL + atomic-rename atomicity boundary. Universal directive ~210 tokens (sob cap 300).

<!-- sha256:5d0959f00919a57a7906fac7e88b6aa72217e43171f8639925e956fdd98e690b -->
**2026-05-21T05:24:08.452Z** | @pm | _Agent Trail_

Plano refinado. Stories: 29 implementation slices em 5 phases v1.12.0->v1.16.0. Prioridade: progressive release (DD-05 padrao workflow-handoff-integrity). PRD enriched com Delivery plan + 12 launch-tier ACs (per-phase 74 ACs em plans/). Checkpoints definidos por phase incluindo wiring audit update + npm test green + smoke green + git tag + STOP for npm publish manual.

## Revision Requests

_(vazio — populado a partir da Phase 2)_
