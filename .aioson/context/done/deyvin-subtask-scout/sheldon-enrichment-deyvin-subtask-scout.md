---
target_prd: .aioson/context/prd-deyvin-subtask-scout.md
slug: deyvin-subtask-scout
round_count: 1
last_enrichment_date: 2026-05-13
plan_path: .aioson/plans/deyvin-subtask-scout/manifest.md
sizing_score: 9
sizing_decision: phased-plan
sources_used:
  - researchs/sub-agent-patterns-2026/summary.md
  - researchs/multi-agent-token-budget-2026/summary.md
  - .aioson/brains/sheldon/architecture-decisions.brain.json (nodes 001, 003, 005, 006)
  - .aioson/context/done/deyvin-density/prd-deyvin-density.md
  - .aioson/context/bootstrap/what-it-does.md
  - package.json (stack inspection — zero JSON schema deps)
  - .aioson/context/done/MANIFEST.md
improvements_applied:
  - G1: CLI-less fallback added to deyvin.md (Phase 3 plan + PRD Must-have)
  - G2: parent_session_excerpt required field in output schema (cold-load comprehension)
  - G3: Sub-agent prompt template enforces tool whitelist [Read, Grep] (Nautilus pattern)
  - G4: Hand-rolled JSON validator decision (zero new deps; ajv deferred to V2 if schema grows)
  - G5: Wiring audit ACs W1-W8 in Phase 3 plan; dossier integration mandatory; memory:summary integration mandatory
  - I1: Success metrics split into parent-context-preservation + sub-agent-efficiency + cold-load-comprehension (honest about 4-15x token amplification)
  - I2: Lifecycle prune raised from 30d to 90d for unattached scouts; opt-in scout:archive for orphan preservation
  - I3: max_depth=2 cap added (allows scout to spawn 1 level of sub-scout)
  - I4: Dossier auto-append promoted from Should-have to Must-have (Phase 3 AC W3)
  - I5: memory:summary scout-count row promoted to Must-have (Phase 3 AC W5)
  - R1: Scout id format includes feature slug when present (greppable per feature)
  - R2: Evidence field max 200 chars enforced in schema (Phase 1 AC E3)
  - R3: Open Question on harness sub-agent capability promoted to pre-made decision #14 in manifest
improvements_discarded: []
status: completed
---

# Sheldon Enrichment Log — deyvin-subtask-scout

## Summary

Single round, first enrichment. PRD was tight on product framing (Why/What clear) but missing 5 critical implementation gaps that would have caused @dev rework or downstream silent failure:

1. **CLI assumption** — PRD silently required `aioson` binary. Real failure mode for downstream adopters in plain Claude Code. Closed by mandating CLI-less fallback in deyvin.md (template embedded directly).
2. **Cold-load comprehension** — output schema lacked the field that explains WHY a scout was dispatched. Without it, archived scouts are inscrutable to future cold-load agents — defeating AIOSON's disk-first memory philosophy. Closed by requiring `parent_session_excerpt`.
3. **Sub-agent security** — prompt template did not constrain the sub-agent's tool surface. Scout could escalate to write/exec scope. Closed by Nautilus pattern: `[Read, Grep]` only, prose-enforced even where harness lacks machine-readable tool config.
4. **Stack decision pending** — JSON schema validation needed a dep decision. Resolved with hand-rolled validator (zero new deps, schema small/stable, migrate to `ajv` in V2 if needed).
5. **Wiring audit gap** — original AC-07 said "rubric updated" but missed: invocation block, terminal-failure UX, telemetry visibility in `memory:summary`. Closed by Phase 3 plan with 8 wiring ACs.

Plus 5 important improvements (honest token cost, longer prune window, max_depth, dossier integration mandatory, memory:summary integration) and 3 refinements (greppable id, evidence cap, harness capability resolved).

## Sizing decision

Score 9 → Path B (external phased plan, 3 phases). Justified by: 5 surfaces touched (engine, CLI, agent prompts, archival hook, dossier/memory/doctor integration), 5 distinct user flows, 24 total ACs across phases. Inline ## Delivery plan would have ballooned the PRD past its concision discipline.

Classification stays SMALL per sheldon-002 (q=5) — phased plan does not change which agents run (product → analyst → dev). RF-05 harness contract NOT generated (MEDIUM only); progress.json suffices.

## Reference sources

See manifest. All cached in `researchs/` for downstream agent reuse.

## Brain update candidate (for follow-up if pattern repeats)

Potential new node `sheldon-007`: "Sub-agent contracts must always include CLI-less fallback embedded in the agent prompt itself, not just in CLI commands. Reason: downstream adopters often inherit `.aioson/` without running `aioson setup`; agent prompts are the only universally available surface." Tag: `cli-fallback, sub-agent, cold-load, downstream-adoption`. Quality target: 4. Will append after Phase 3 ships and pattern proves out in real downstream use.

## Handoff

Activate `@analyst` to produce `requirements-deyvin-subtask-scout.md`:
- Resolve the 2 remaining Open Questions (parent_session_excerpt block-vs-warn, sub-agent timeout)
- Resolve the 5 deferred decisions in manifest (file lock strategy, prune mechanism, etc.)
- Map entities formally (scout, scout state, scout config, scout archive entry, dossier scout-section entry)
- Generate code map for the 3 phases

After @analyst: `@dev` starts Phase 1 per `.aioson/plans/deyvin-subtask-scout/plan-core-engine.md`.
