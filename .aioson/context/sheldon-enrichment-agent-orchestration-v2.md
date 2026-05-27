---
slug: agent-orchestration-v2
round: 1
sources_used: ["gate-approve.js code inspection", "brain nodes sheldon-002/004/006", "@orache investigation report"]
sizing_score: 1
sizing_decision: SMALL (score=1 but 6+ CLI files, 1 migration, 5 agent prompts → implementation complexity justifies SMALL over MICRO)
path: A (in-place enrichment)
---

# Sheldon Enrichment — agent-orchestration-v2

## Improvements applied (6/6)

| # | Priority | Title | Impact |
|---|----------|-------|--------|
| C1 | Critical | Checkpoint write best-effort | Prevents gate:approve failure from checkpoint IO errors |
| C2 | Critical | decision_rationale mechanism | Defines how rationale flows: op:capture → session-handoff.js → last-handoff.json |
| I1 | Important | Checkpoint schema resolved (Q1 closed) | Prerequisites snapshot + mtime, not content. 2-5KB cap replaces 50KB |
| I2 | Important | Latest-gate-wins selection | workflow:heal picks most advanced gate checkpoint |
| I3 | Important | Op:list JSON output schema | Concrete schema for CI/scripting consumption |
| I4 | Important | AC-AUDIT done gate (7 items) | Per sheldon-006: prevents orphaned hooks at feature close |

## Open questions resolved

- Q1 (checkpoint schema): CLOSED — store prerequisites_snapshot with file+mtime list, not artifact content
- Q2 (workflow:heal + milestones): CLOSED — checkpoints for resume, milestones for preflight skip optimization

## Brain nodes applied

- sheldon-002 (q=5): SMALL confirmed — classification gates scaling respected
- sheldon-004 (q=5): discovery before architecture — N/A (no architecture stage for this SMALL feature)
- sheldon-006 (q=5): AC-AUDIT done gate added with 7 verification items
