---
feature: operator-memory
slug: operator-memory
classification: MEDIUM
status: ready-for-dev
created_by: sheldon
created_at: 2026-05-21
target_prd: .aioson/context/prd-operator-memory.md
sheldon_version: v1.11.0
sizing_score: 11
sizing_decision: path-b-phased
phases:
  phase_1_storage_identity: completed
  phase_2_capture_promotion: pending
  phase_3_universal_loading: pending
  phase_4_conflict_policy: pending
  phase_5_ttl_migration: pending
release_strategy: progressive
release_sequence: ["v1.12.0 (storage+identity)", "v1.13.0 (capture)", "v1.14.0 (loading)", "v1.15.0 (conflict)", "v1.16.0 (ttl+migration)"]
---

# Manifest — Operator Memory (phased plan)

> **Path B (sizing score 11 ≥ 7).** Same progressive-release strategy as `workflow-handoff-integrity` (DD-05 confirmed exitoso: v1.9.5 → v1.10.0 across 5 minor bumps).

## Overview

Operator Memory ships a per-operator decision-memory layer (multi-dev safe via sha256 git-email hash, harness-agnóstica). Sized MEDIUM. Score 11 justifies external phased plan over in-place enrichment because:

- 4 entities (identity, decision, proposal, conflict-warning) above 3-baseline
- 5 logical phases identified (each independently shippable)
- 4 distinct user flows (capture, loading, conflict, identity-override)
- Cross-cutting concern: universal loading directive affects ALL agent prompts (~30 files in template/)
- AC complexity estimated ~30 across phases

Phase boundaries are designed for independent release + inception-risk minimization (each phase ships standalone tagged release).

## Phase table

| # | Phase | Release | Scope | Independence criterion |
|---|---|---|---|---|
| 1 | Storage + Identity | v1.12.0 | SQLite-index + markdown-body hybrid backend; sha256 email hash; `AIOSON_OPERATOR_ID` escape hatch + validation; 6 CLI command stubs (no logic) | Stubs respond; identity resolves; storage tree created |
| 2 | Capture + Promotion | v1.13.0 | LLM-driven capture (4 signal types); 2x threshold; `op:capture`/`op:promote`/`op:forget` impls; telemetry events | Captures land in `proposals/`; second detection promotes to `decisions/` |
| 3 | Universal loading | v1.14.0 | `## Memory loading` directive injected in template `CLAUDE.md`/`AGENTS.md`; lazy decision loading by description match; byte budget audit; `op:list`/`op:show` impls | Every agent reads MEMORY.md at preflight; lazy-load works on description match |
| 4 | Conflict policy | v1.15.0 | Conflict detection between `.aioson/rules/` + operator decisions; warning emission format; binary policy (project rules win) | Conflicts surface visible warning; operator decisions remain intact post-conflict |
| 5 | TTL decay + migration | v1.16.0 | Per-category half-life (identity 1y / autonomy 6mo / tooling 3mo / default 90d); `last_reinforced` tracking; 10k hard cap with prune; `user-profile.md` migration; `op:identity show/set` + history/ soft-delete | Decay prompts fire correctly; migration consumes `user-profile.md`; cap enforced |

## Pre-made decisions (PMDs)

| ID | Decision | Rationale | Source |
|---|---|---|---|
| PMD-01 | Storage = **hybrid SQLite (index) + markdown (body)**, not pure markdown | Align with active-learning-loop FTS5 pattern (already in AIOSON); Engram-style hybrid keeps content human-readable + git-shareable; FTS5 query for cross-decision search | `researchs/agent-memory-backends-2026/summary.md` |
| PMD-02 | LLM-driven capture is acknowledged divergence from AIOSON's deterministic principle | Signal patterns are inherently fuzzy (natural-language `pode X sempre` vs corretive `não faça X`); regex would be brittle. Constraint: prompt template versioned + tested via fixture corpora | Cache flagged Letta vs AIOSON divergence; PRD discovery accepted all 4 signal types |
| PMD-03 | **Per-category TTL half-life** (identity=1y, autonomy=6mo, tooling=3mo, default=90d) — NOT uniform 90d | Cache: uniform TTL is naive; production systems (MNEMOS, Engram) use per-category | `researchs/agent-memory-backends-2026/summary.md` |
| PMD-04 | **10k memories hard cap per operator identity**. Prune strategy: oldest non-identity decay-eligible first | Engram/MNEMOS production guidance | `researchs/agent-memory-backends-2026/summary.md` |
| PMD-05 | `AIOSON_OPERATOR_ID` validation regex `^[a-z0-9][a-z0-9-]{2,31}$`. Reserved prefixes: `_*`, `aioson-*` | Footgun prevention: typo creates new identity silently. Validation + warn on unmatched | Gap #9 (important improvement) |
| PMD-06 | **4 signal types in V1**: Authorization, Exclusion, Correction, Confirmation 2x+ | User confirmation in PRD discovery | PRD discovery |
| PMD-07 | **2x threshold for promotion** (proposals → decisions) | User confirmation in PRD discovery | PRD discovery |
| PMD-08 | **1-liner silent audit on promotion** (no Y/n prompt) | User confirmation in PRD discovery | PRD discovery |
| PMD-09 | **Conflict policy binary in V1** (project rules always win + warning emitted). Partial-overlap gradient deferred to V2 | Gap #8: gradient adds complexity; V1 ships safe default | Gap analysis |
| PMD-10 | **`user-profile.md` deprecation tied to feature.md status `done`**, NOT version numbers | Refinement #10: less ambiguous than v1.1/v2 versioning | Gap analysis |
| PMD-11 | **Engram-style validity window**: each decision tracks `last_reinforced` (timestamp) + `superseded_by` (slug nullable) | Cache: Zep precedent; refinement of audit trail | `researchs/agent-memory-backends-2026/summary.md` |
| PMD-12 | **Telemetry events**: `op_capture`, `op_promote`, `op_forget`, `op_conflict_warning`, `op_decay_prompt` via existing `dossierTelemetry` pattern (same as `workflow-handoff-integrity`) | Consistency + reuse | Refinement #11 |

## Deferred decisions (DDs)

| ID | Decision | Resolver | Resolve by |
|---|---|---|---|
| DD-01 | Validity window schema completeness — minimal (`last_reinforced` + `superseded_by` per PMD-11) OR full Zep pattern (additional `start_at`/`end_at` per fact)? | `@architect` | Gate B (Phase 1 start) |
| DD-02 | Hash size — sha256 truncated 16 chars (10^19 space; collision-improbable for teams ≤1e9) OR full 64 chars (defense-in-depth against reverse lookup at storage cost)? | `@architect` | Gate B (Phase 1 start) |
| DD-03 | Universal directive byte budget threshold — what's acceptable preflight overhead per agent? Cap directive at N bytes/tokens? Reference: ~30 agents × directive bytes | `@architect` | Gate B (Phase 3 start) |
| DD-04 | Telemetry storage — extend `dossierTelemetry` SQL (single table, ~5 new event_types) OR new `operator_events` table (cleaner separation, more setup)? | `@architect` | Gate B (Phase 2 start) |
| DD-05 | Migration UX from `user-profile.md` — full auto-import on first `op:capture` (silent), OR `aioson op:migrate` explicit one-shot command, OR both? | `@architect` | Gate B (Phase 5 start) |

## Critical gaps applied (all 5)

1. ✅ Storage backend resolved via PMD-01 (hybrid)
2. ✅ TTL per-category resolved via PMD-03
3. ✅ Validity window resolved via PMD-11
4. ✅ LLM-driven divergence acknowledged via PMD-02
5. ✅ Hard cap resolved via PMD-04

## Important improvements applied (all 4)

6. ✅ Cross-harness validation matrix — Phase 3 deliverable (format spec + reference impl + support matrix)
7. ✅ Signal taxonomy false-positive examples — Phase 2 deliverable (versioned prompt template + fixture corpora)
8. ✅ Conflict policy gradient — Phase 4 binary V1; gradient V2 (PMD-09)
9. ✅ `AIOSON_OPERATOR_ID` security model — PMD-05

## Refinements applied (all 3)

10. ✅ Migration timeline tied to feature.md status (PMD-10)
11. ✅ Telemetry events listed (PMD-12)
12. ✅ Universal directive byte budget — Phase 3 explicit deliverable (DD-03)

## Reference sources

- `researchs/agent-memory-backends-2026/summary.md` — Mem0/Letta/Zep/Engram/MNEMOS landscape (validated 2026-05-13, verdict: confirmed; informs PMD-01/03/04/11)
- `plans/operator-memory.md` — original PRD seed (consumed by @product)
- `.aioson/context/prd-operator-memory.md` — PRD base (this manifest enriches without rewriting)

## Inception risk (Risk-09 analog from workflow-handoff-integrity)

Universal loading directive (Phase 3) modifies template `CLAUDE.md`/`AGENTS.md` that THIS framework uses. If broken, breaks every subsequent agent session. Mitigation: Phase 3 ships behind feature flag `AIOSON_OPERATOR_MEMORY=true` initially; flag default-on only after Phase 4 ships green.

## Next agent

`@analyst` (Gate A) — produce `requirements-operator-memory.md` covering ACs per phase + 4 cross-cutting NFRs (storage scaling, prompt budget, multi-dev isolation, decay correctness).
