---
briefing_source: agent-orchestration-v2
classification: SMALL
---

# PRD — Agent Orchestration V2: Durable Execution & Scoped Memory

## Vision
Make AIOSON workflows resumable from any gate boundary and operator decisions queryable by feature — closing the two infrastructure gaps identified against LangGraph 1.2 and Mem0/Cloudflare patterns.

## Problem
When a workflow fails or is interrupted after multiple agents have completed, `workflow:heal` reconstructs state from artifacts but cannot resume from the exact agent context — re-execution costs 70-80% redundant tokens. Downstream agents receive handoff artifacts (spec.md, dev-state.md) that capture WHAT was decided but not WHY alternatives were rejected, leading to re-asked questions. Operator decisions captured via `op:capture` are an unindexed append-only log — no way to query "all decisions on feature X" or "what did the user decide about testing patterns?"

## Users
- **Developer using AIOSON CLI**: wants workflows that survive interruptions and agents that don't re-ask resolved questions
- **AIOSON framework maintainer (inception)**: wants operator memory to be queryable for debugging decision drift across features

## MVP scope

### Must-have (M1 — Checkpoint-at-gate)
- `gate:approve` writes a checkpoint JSON to `.aioson/runtime/checkpoints/gate-{A|B|C|D}-{slug}.json` alongside the existing gate status update
- Checkpoint payload (I1 — schema resolved): `{ gate, slug, agent, timestamp, prerequisites_snapshot: [{ file, mtime }], gate_check_result, decision_log: string[] }`. Checkpoint stores artifact list + mtimes, NOT content — `workflow:heal` re-reads artifacts from disk (already does today). This caps checkpoint at ~2-5KB instead of 50KB.
- `workflow:heal` reads the latest checkpoint for the active feature. When multiple checkpoints exist (e.g., gate-A and gate-B), use the most advanced gate (I2 — latest-gate-wins: D > C > B > A).
- Checkpoint write is best-effort (C1): `gate:approve` wraps checkpoint write in try/catch. Failure logs a warning but does NOT block gate approval — the gate status in spec-{slug}.md is the authoritative record, checkpoint is an optimization layer.
- Checkpoint size cap: max 5KB per checkpoint; if exceeded, truncate `decision_log` to last 3 entries with a `[truncated]` marker.

### Must-have (M2 — Decision rationale in handoffs)
- Extend `last-handoff.json` schema with `decision_rationale[]` array
- Each entry: `{ agent, decision, alternatives_considered, rationale, confidence }`
- Capped at 5 entries (oldest dropped on overflow)
- `dev:state:write` includes `decision_rationale` from `last-handoff.json` in context packages
- Population mechanism (C2): `session-handoff.js` already writes `last-handoff.json` — extend it with a `decision_rationale` field. Agents don't write to the file directly; the harness collects rationale from `op:capture` events emitted during the session and populates the field at handoff time. No new CLI command needed — reuses existing `op:capture` + `session-handoff.js` pipeline.

### Must-have (M3 — Scoped operator memory)
- `op:capture` gains 2 new flags: `--feature=<slug>` and `--session-id=<id>`
- New indexed columns in operator-memory SQLite: `feature_slug TEXT`, `session_id TEXT`
- `op:list` gains filter support: `--feature=<slug>`, `--agent=<name>`
- Migration follows established pattern (idempotent, IF NOT EXISTS guards, ALTER TABLE ADD COLUMN)
- Existing captures remain unscoped (no retroactive backfill — decision confirmed)

### Should-have (S1 — Telemetry consumer mapping)
- Document explicit consumers for each `runtime:emit` event type in `agent-structural-contract.md`
- `workflow:heal` reads `milestone` events to determine last successful step
- `preflight` reads `gate_check` events to skip re-verification of already-approved gates

### Should-have (S2 — Checkpoint lifecycle)
- `runtime:prune` archives checkpoints older than 30 days
- `feature:close` deletes all checkpoints for the closed feature slug

### Should-have (S3 — Op:list rich output)
- `op:list --feature=<slug>` outputs decisions grouped by agent with timestamps
- `op:list --agent=<name>` shows cross-feature decisions for pattern detection
- JSON output schema (I3): `{ feature, decisions: [{ agent, signal, quote, proposal, timestamp, session_id }], total }`
- JSON output mode for CI/scripting

## Out of scope
- Theme 2 (DAST depth: ZAP proxy + Nuclei reference) — handled as MICRO doc-only update, no PRD
- Playwright MCP integration — parked for V2 (monitor adoption)
- Retroactive backfill of existing op:capture records
- Time-travel debugging (LangGraph pattern — future feature; checkpoints enable it but this PRD does not implement replay UI)
- Checkpoint diffing or visualization
- Cross-feature decision aggregation dashboard

## User flows

### Flow 1 — Checkpoint-at-gate (happy path)
1. @analyst completes requirements → calls `gate:approve . --feature=checkout --gate=A`
2. CLI writes gate status to spec-checkout.md AND writes checkpoint to `.aioson/runtime/checkpoints/gate-A-checkout.json`
3. Workflow continues to @architect → @dev → fails at @dev Slice 3
4. User runs `workflow:heal . --feature=checkout`
5. CLI finds latest checkpoint (gate-A-checkout.json) → resumes from Gate A state with full context

### Flow 2 — Decision rationale in handoff
1. @product writes PRD, user confirms "SMALL, extend existing active-learning-loop"
2. @product writes `last-handoff.json` with `decision_rationale: [{ agent: "product", decision: "extend active-learning-loop", alternatives_considered: "parallel layer, new CLI namespace", rationale: "reuses existing infrastructure, zero new commands", confidence: 0.9 }]`
3. @analyst reads `last-handoff.json`, sees the rationale, does NOT re-ask "should we extend or create parallel?"

### Flow 3 — Scoped operator memory query
1. User runs: `aioson op:list --feature=neural-chain`
2. CLI returns: all decisions made during neural-chain sessions, grouped by agent
3. User sees: "@product: SMALL M1-only (confidence 0.9), @analyst: skip @architect (score=2), @sheldon: Path A in-place (score=2)"

## Success metrics
- **Primary:** `workflow:heal` resume from checkpoint succeeds on first attempt in ≥ 90% of interrupted workflows (vs current ~30% artifact-reconstruction success rate)
- **Secondary:** downstream agents re-ask ≤ 1 question that was already answered upstream (vs current ~3-4 per handoff)
- **Guardrail:** checkpoint storage grows < 500KB per feature lifecycle (4 gates x 50KB cap + margin)

## Done gate (AC-AUDIT — per brain sheldon-006)

Before marking this feature `done` in features.md, @qa must verify:

1. `gate:approve` writes checkpoint JSON on successful approval (check gate-approve.js for try/catch write)
2. `workflow:heal` reads checkpoint and resumes from latest gate (check workflow-heal.js for checkpoint loading logic)
3. `session-handoff.js` populates `decision_rationale[]` from `op:capture` events
4. `op:capture` accepts `--feature` and `--session-id` flags (check op-capture.js option parsing)
5. `op:list` accepts `--feature` and `--agent` filters (check op-list.js output)
6. Migration adds `feature_slug` and `session_id` columns to operator-memory table
7. `agent-structural-contract.md` updated with telemetry consumer mapping (S1)

## Open questions
- ~~Q1~~ [CLOSED by sheldon]: Checkpoint schema resolved — store prerequisites_snapshot (file+mtime list) + gate_check_result + decision_log. No artifact content. ~2-5KB per checkpoint.
- ~~Q2~~ [CLOSED by sheldon]: Checkpoints are sufficient. Milestones are dashboard-grade events; checkpoints capture the structured state needed for resume. workflow:heal reads checkpoints; milestone events are consumed by preflight for skip-approved-gates optimization (S1).

## Sheldon enrichment log

| # | Type | Improvement | Applied |
|---|------|------------|---------|
| C1 | Critical | Checkpoint write best-effort (try/catch, never blocks gate:approve) | Yes |
| C2 | Critical | decision_rationale population via session-handoff.js + op:capture pipeline | Yes |
| I1 | Important | Checkpoint schema: prerequisites_snapshot + mtime, not content. 2-5KB cap. | Yes |
| I2 | Important | Multiple checkpoints: latest-gate-wins (D > C > B > A) | Yes |
| I3 | Important | Op:list JSON output schema defined | Yes |
| I4 | Important | AC-AUDIT done gate (7 items) per sheldon-006 | Yes |

Sources: `gate-approve.js` code inspection, brain nodes sheldon-002/004/006, @orache investigation `squad-searches/standalone/agent-orchestration-upgrade-20260527.md`.

## Visual identity
Omitted — CLI project, no UI components.

## Visual identity
Omitted — CLI project, no UI components.
