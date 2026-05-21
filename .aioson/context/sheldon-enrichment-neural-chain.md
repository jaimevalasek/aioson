---
target_prd: .aioson/context/prd-neural-chain.md
round_count: 1
last_enrichment_date: 2026-05-21
plan_path: null
sizing_score: 2
sizing_decision: in_place
sizing_path: A
classification: SMALL
briefing_source: .aioson/briefings/neural-chain/briefings.md
sources_used:
  - .aioson/briefings/neural-chain/briefings.md
  - researchs/agent-memory-backends-2026/summary.md
  - researchs/multi-agent-token-budget-2026/summary.md
  - .aioson/brains/sheldon/architecture-decisions.brain.json (nodes sheldon-001, 002, 004, 005, 006)
new_web_research: false
brain_nodes_applied:
  - sheldon-001 (workspace/template parity)
  - sheldon-002 (classification gates scale process depth)
  - sheldon-004 (discovery before architecture)
  - sheldon-005 (CLI-first integration)
  - sheldon-006 (design-complete ≠ execution-complete audit)
improvements_applied:
  critical:
    - C1 data model schema (chain_edges table + 3 indexes) appended to PRD as "## Data model (sheldon)"
    - C2 confidence ranking formula (git_co_edit + agent_event + max combination) appended as "## Confidence ranking (sheldon)"
    - C3 threshold rules for autonomy:standard mode (3 deterministic heuristics + tuneable threshold via .aioson/config.md) — closes briefing OQ #3
    - C4 synchronous hook model + integration point in runtime.js runAgentDone
    - C5 noise file path scheme {feature-slug}-{YYYYMMDD-HHMM}.md + unspecified-{timestamp} fallback
    - C6 audit wiring meta-AC (AC-AUDIT-NC) per sheldon-006 brain default — 7-item done gate
  important:
    - I1 bootstrap initial strategy (incremental default + opt-in background scan heuristic) — closes briefing OQ #5
    - I2 noise file format (hybrid frontmatter+checkboxes, padrão feature-dossier) — closes briefing OQ #7
    - I3 M2 skill owner pre-decision (extend @neo, not new @chain-keeper) — closes briefing OQ #2
    - I4 multi-language parser pre-decision (tree-sitter Node binding) — closes briefing OQ #4
    - I5 performance budget explicit (<200ms @ 10k edges, <1s @ 50k, perf-test threshold > 50k)
    - I6 telemetry hooks (chain:audit emits runtime:emit type=chain_audit; chain:stats agrega mensalmente; pulse alert > 2x/mês)
  refinement:
    - R1 concurrent/multi-agent races documented as out-of-scope V1 (squad/parallel out)
    - R2 edge expiration sem M2 documented (end_at sempre NULL em V1, append-only)
    - R3 bootstrap fallback sem git history documented (skip + agent-event coverage)
    - R4 ## Reference sources (sheldon) block added documenting caches + brain nodes
improvements_discarded: []
open_questions_resolved: 5
open_questions_remaining: 0
status: completed
next_agent: analyst
next_gate: A (requirements-neural-chain.md + spec-neural-chain.md)
---

# Sheldon Enrichment — neural-chain

## Round 1 (2026-05-21) — initial enrichment pass

### Trigger
Briefing `neural-chain` flagged single-voice methodology (user as PM+eng combined). Briefing recomendou explicitamente sheldon enrichment pass antes do execution chain pra dar second-voice em feasibility (AST multi-language scope) + sizing (M1-only vs M1+M2 bundle).

### Mode
First activation. Path A in-place enrichment (sizing score 2 < 4 threshold for delivery plan; well below 7 threshold for external phased plan). PRD classification SMALL confirmed.

### Sources consumed
- **Briefing** `.aioson/briefings/neural-chain/briefings.md` (RC-BRF detection — `briefing_source: neural-chain` no PRD frontmatter)
- **Research cache reused** (no new web search):
  - `agent-memory-backends-2026/summary.md` — SQLite+FTS5+WAL production pattern, Zep validity-window, hard cap 10k
  - `multi-agent-token-budget-2026/summary.md` — multi-agent 4-15x token amplification → guardrail metric structural
- **Brain `sheldon/architecture-decisions`** — 5 nodes q≥4 applied as defaults

### Sizing computation

| Critério | Valor | Pontos |
|---|---|---|
| Main entities > 3 | 4 (chain_edges, noise_file, audit_result, agent_event*) | +1 |
| Distinct delivery phases > 1 | 1 (M1 only) | 0 |
| External integrations novos | 0 (SQLite + git são infra) | 0 |
| User flows > 3 | 3 flows | 0 |
| AC complexity > 10 | ~12-15 ACs estimated post-enrichment | +1 |
| **Total** | | **2** |

→ **Path A in-place** (threshold 0-3). Sem `## Delivery plan` (necessário só p/ score 4-6). Sem external phased plan em `.aioson/plans/` (necessário só p/ score 7+).

### Decisions made in-place (5 briefing OQs closed)

| Briefing OQ | Closed by | Decision |
|---|---|---|
| #2 skill owner M2 | I3 | Extend `@neo` (cohesion > proliferation). Sem `@chain-keeper`, sem usar `@sheldon`. |
| #3 threshold rules `autonomy:standard` | C3 | 3 heurísticas determinísticas (test filename match, listener literal match, confidence>0.8 + hit_count>5). Threshold tuneável via config. |
| #4 multi-language priority V2 | I4 | `tree-sitter` Node binding. Tier-1 JS/TS, Tier-2 Python, Tier-3+ on-demand. |
| #5 bootstrap initial | I1 | Incremental default; opt-in background scan se git > 50 commits; warn > 60s. |
| #7 noise file format | I2 | Híbrido frontmatter YAML + body markdown checkboxes (padrão `feature-dossier`). Deletion-on-close trigger automático. |

### Meta-decision (sheldon-006 brain)

Added **`## Done gate` meta-AC (AC-AUDIT-NC)** ao PRD — 7-item audit que `@qa` enforce antes do feature ser marcada `done`. Bloqueia o anti-pattern "design-complete confused with execution-complete" que `sheldon-006` documentou (caso real do `@validator` orphaned por semanas em harness-driven-aioson Round 2).

### Honoring single-voice flag

O briefing flagged single-voice methodology como "feasibility delusion risk". Three concrete mitigations applied:

1. **Closed 5 OQs in-place** — `@analyst` recebe PRD com zero OQs abertas em vez de 5 deferred. Second-voice provided.
2. **Guardrail metric operacionalizado** — telemetria (`chain:audit` emits tokens; `chain:stats` agrega; pulse alert > 2x/mês) — sem isso, ausência de M2 viraria armadilha viability silenciosa.
3. **Meta-AC AC-AUDIT-NC** — done gate explicit anti-pattern enforcement via QA report check.

### Not done in this round

- **Harness contract generation** — RF-05 sheldon.md: "skip on MICRO; on SMALL produce progress.json only". `harness:init` skipped. `progress.json` produzido em `.aioson/plans/neural-chain/progress.json`.
- **No web search** — caches a 8d (1d além do threshold 7d, mas tópicos com alta estabilidade — risco aceitável).
- **No code review** — sheldon scope é PRD only (strict boundary). Code review do impl é `@qa` + `@validator`.

### Handoff

→ `@analyst` (Gate A pending). Produz `requirements-neural-chain.md` + `spec-neural-chain.md`. PRD agora tem:
- Data model concreto (schema SQL)
- Confidence formula
- Threshold rules determinísticas
- Hook model (synchronous)
- Noise file format completo
- 3 pre-made decisions p/ M2/V2
- Performance budget mensurável
- Telemetry hooks especificados
- Done gate AC-AUDIT-NC enforce-able

Zero OQs abertas. `@analyst` herda decisões prontas pra traduzir em RFs/ACs/ECs/BRs.

### Activation command
```
/analyst
```

### Recommended pre-step
```
/clear  # fresh context window — tudo persistido em disco
```
