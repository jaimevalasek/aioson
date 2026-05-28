---
decision: DD-5
phase: 4
slug: doctor-curation-checks
resolved_by: architect
resolved_at: 2026-05-14
status: deferred
deferred_to: follow-up-feature
follow_up_slug_proposed: brain-curation
---

# DD-5 — Brain merge proposal (S1)

**Resolution**: **Defer para follow-up feature `brain-curation`** (MICRO classification expected).

**Scope of deferred work**:
- Doctor check `brain_overlap_candidate` — heuristic: 2 brain nodes com ≥70% tag overlap AND same `verdict` field.
- Brain merge proposal output em `aioson doctor` (text + JSON modes).
- Optional: `aioson brain:merge --from=<id> --to=<id> --reason=<text>` (tier 2 humano-acionado) — design TBD em follow-up feature.

**Why deferred**:
- Phase 4 já tem 3 doctor checks robustos (rule_staleness, learning_orphans, distillation_lag). Adding 4th risks scope creep.
- Brain merge is independent surface (only brains; doesn't touch rules/learnings flow). Cleaner as standalone feature.
- Follow-up classification MICRO/SMALL: @product → @dev (or @dev direct if heuristic-only). Faster delivery.
- Phase 4 retrospective revisita esta decision: se brain DB grew significantly during active-learning-loop implementation, may upgrade priority.

**Phase 4 ships without S1**:
- 3 doctor checks finalized as primary V1 deliverable.
- Brain telemetry from Phase 1 (`brain_loaded` events) ainda úteis para futuro brain-curation feature.

**Trade-offs accepted**:
- Brain overlap remains uncurated em V1.
- @sheldon e outros agents que escrevem brains continuam adding nodes sem automated overlap detection.

**Re-evaluation trigger**: brain DB > 50 nodes total OR user reports brain overlap pain.

**Full reasoning**: see `.aioson/context/architecture-active-learning-loop.md § DD-1..DD-5 resolutions`.
