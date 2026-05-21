---
target_prd: .aioson/context/prd-operator-memory.md
slug: operator-memory
sheldon_round: 1
last_enriched: 2026-05-21
plan_path: .aioson/plans/operator-memory/manifest.md
sizing_score: 11
sizing_decision: path-b-phased
---

# Sheldon enrichment log — operator-memory

## Sources used

- `plans/operator-memory.md` — pre-production seed (consumed by @product, reviewed for additional context here)
- `researchs/agent-memory-backends-2026/summary.md` — cached 2026-05-13 (8d old, at edge of 7d freshness window but verdict=confirmed; user accepted as primary external evidence)

## Improvements applied (all 12)

### Critical gaps (5/5)

1. **Storage backend resolved** → PMD-01: hybrid SQLite (FTS5 index) + markdown (decision body). Aligns with AIOSON active-learning-loop precedent; Engram-style hybrid keeps content human-readable + git-shareable.
2. **TTL per-category half-life** → PMD-03: identity=365d, autonomy=180d, tooling=90d, default=90d. Replaces PRD flat 90d.
3. **Validity window pattern (Zep)** → PMD-11: each decision tracks `last_reinforced` (Phase 2 schema, activated by Phase 5 decay) + `superseded_by` (V2 — for cross-decision supersedence; orthogonal to conflict).
4. **LLM-driven divergence acknowledged** → PMD-02 + Phase 2 deliverable: versioned prompt template at `template/agents/_shared/memory-capture-directive.md` + CHANGELOG transparency entry. Constraint: signal patterns are inherently fuzzy; regex would be brittle.
5. **10k hard cap** → PMD-04 + Phase 5 prune engine: oldest non-identity `last_reinforced` pruned to `history/` first.

### Important improvements (4/4)

6. **Cross-harness validation matrix** → Phase 3 deliverable: format spec doc at `.aioson/docs/operator-memory/memory-md-format.md` + explicit V1 support matrix (Claude Code + Codex + Gemini; Cursor/Aider TBD).
7. **Signal taxonomy false-positive examples** → Phase 2 deliverable: prompt template with 3+ examples per signal type + anti-pattern section + test corpora.
8. **Conflict policy gradient** → PMD-09: binary V1 (project rules win + warning), gradient V2. Partial-overlap deferred.
9. **`AIOSON_OPERATOR_ID` security model** → PMD-05: regex `^[a-z0-9][a-z0-9-]{2,31}$` + reserved prefixes `_*`, `aioson-*` blocked.

### Refinements (3/3)

10. **Migration timeline** → PMD-10: tied to features.md status `done`, not version numbers.
11. **Telemetry events listed** → PMD-12: `op_capture`, `op_promote`, `op_forget`, `op_conflict_warning`, `op_decay_prompt`, `op_migrate`, `op_history_cleanup`. Reuses `dossierTelemetry` (DD-04 default).
12. **Universal directive byte budget** → AC-P3-06 + `scripts/memory-budget-audit.js` (NEW Phase 3). Threshold: ≤ 300 tokens (~1200 bytes) per agent preflight.

## Improvements discarded

None — user accepted all (12/12).

## Sizing justification

**Score: 11 = `+1 entities (4) +8 phases (5, 3 above baseline 1) +0 integrations +1 flows (4) +1 ACs (>10)`** → Path B threshold (≥ 7).

Same progressive-release strategy as `workflow-handoff-integrity` (DD-05 confirmed exitoso). 5 phases × 5 minor releases (v1.12.0 → v1.16.0).

## Path B output

- `.aioson/plans/operator-memory/manifest.md` — overview, phase table, 12 PMDs, 5 DDs
- `.aioson/plans/operator-memory/plan-storage-identity.md` — Phase 1 (v1.12.0)
- `.aioson/plans/operator-memory/plan-capture-promotion.md` — Phase 2 (v1.13.0)
- `.aioson/plans/operator-memory/plan-universal-loading.md` — Phase 3 (v1.14.0)
- `.aioson/plans/operator-memory/plan-conflict-policy.md` — Phase 4 (v1.15.0) **inception risk: feature flag flips default-on here**
- `.aioson/plans/operator-memory/plan-ttl-migration.md` — Phase 5 (v1.16.0) — closure phase

## Notes

- Inception risk explicitly mitigated: Phase 3 universal directive ships behind `AIOSON_OPERATOR_MEMORY=true` flag (default OFF until Phase 4 ships green). Same shape as workflow-handoff-integrity Phase 1 mitigation.
- Cross-phase consolidation (AC-P5-10) is mandatory before Gate D — wiring audit table verifies every phase has call sites + tests + smoke coverage.
- `user-profile.md` migration is one-shot explicit (`aioson op:migrate`), not automatic — PMD-05 declines silent-import per privacy/footgun considerations.

## Next agent

`@analyst` (Gate A) — produce `requirements-operator-memory.md` covering ACs per phase + 4 cross-cutting NFRs:

1. **Storage scaling** (NFR-01): query performance with 10k decisions; FTS5 index size; preflight load ≤ 50ms cold.
2. **Prompt budget** (NFR-02): universal directive ≤ 300 tokens per agent; total cross-cutting overhead ≤ 6k tokens framework-wide.
3. **Multi-dev isolation** (NFR-03): Alice + Bob on same `~` (rare but possible — shared host) → zero memory cross-read; Alice + Bob on different hosts but same repo → zero git-side leak (per machine-local v1 commitment).
4. **Decay correctness** (NFR-04): per-category thresholds correctly applied; decay prompt debounced; ≤ 1 false-positive per category per 90-day window in fixture corpus.

Architect (Gate B) resolves 5 DDs after analyst lands ACs.
