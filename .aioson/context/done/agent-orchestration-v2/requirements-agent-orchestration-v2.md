---
feature: agent-orchestration-v2
classification: SMALL
generated_at: 2026-05-27
source: prd-agent-orchestration-v2.md + sheldon-enrichment-agent-orchestration-v2.md
---

# Requirements — Agent Orchestration V2

## 1. Feature summary
Extend AIOSON's gate system with persistent checkpoints for durable workflow recovery, add decision rationale to agent handoffs for context preservation, and scope operator memory captures by feature/session for queryability.

## 2. New entities and fields

No new tables. Schema extensions to existing structures:

### Checkpoint file (new JSON, filesystem-based)

| Field | Type | Nullable | Constraints |
|---|---|---|---|
| gate | string | no | enum: A, B, C, D |
| slug | string | no | must match active feature slug |
| agent | string | no | agent that approved the gate |
| timestamp | string | no | ISO-8601 |
| prerequisites_snapshot | array | no | `[{ file: string, mtime: string }]` — artifact paths + modification times |
| gate_check_result | object | no | result from gate:check validation |
| decision_log | string[] | yes | capped at last 3 entries if checkpoint exceeds 5KB |

Path: `.aioson/runtime/checkpoints/gate-{A|B|C|D}-{slug}.json`

### last-handoff.json extension (new field)

| Field | Type | Nullable | Constraints |
|---|---|---|---|
| decision_rationale | array | yes | `[{ agent, decision, alternatives_considered, rationale, confidence }]` — max 5 entries, FIFO |

### operator-memory table (ALTER TABLE)

| Column | Type | Nullable | Constraints |
|---|---|---|---|
| feature_slug | TEXT | yes | indexed; NULL for pre-existing captures |
| session_id | TEXT | yes | indexed; NULL for pre-existing captures |

## 3. Changes to existing entities

| Entity | Change | Reason |
|---|---|---|
| `gate-approve.js` | Write checkpoint JSON after successful approval | M1 |
| `workflow-heal.js` | Read latest checkpoint for feature, resume from that state | M1 |
| `session-handoff.js` | Populate `decision_rationale[]` from `op:capture` events | M2 |
| `dev-resume.js` / `dev:state:write` | Include `decision_rationale` from last-handoff.json in context package | M2 |
| `op-capture.js` | Accept `--feature` and `--session-id` flags, write to new columns | M3 |
| `op-list.js` | Accept `--feature` and `--agent` filters, output JSON schema | M3 |
| `runtime:prune` | Archive checkpoints older than 30 days | S2 |
| `feature:close` | Delete checkpoints for closed feature slug | S2 |

## 4. Relationships

- Checkpoint files ← produced by `gate:approve`, consumed by `workflow:heal`
- `decision_rationale[]` ← populated by `session-handoff.js` from `op:capture` events, consumed by downstream agents via `last-handoff.json` and `dev:state:write`
- `feature_slug` + `session_id` ← written by `op:capture`, queried by `op:list`
- `agent-structural-contract.md` ← updated to document telemetry consumer mapping (S1)

## 5. Migration

**Implementation note (H-01 spec correction):** The operator-memory architecture uses markdown files as source of truth (PMD-AN-06) with FTS5 virtual tables for search indexing. FTS5 tables cannot be ALTERed. The scoping fields are implemented as markdown frontmatter extensions on proposals and decisions, with JS-side filtering in `op:list`. No SQL migration needed.

1. ~~ALTER TABLE operator-memory ADD COLUMN `feature_slug` TEXT~~ → markdown frontmatter field in proposal.js + decision.js (conditional emit when non-null)
2. ~~ALTER TABLE operator-memory ADD COLUMN `session_id` TEXT~~ → same pattern
3. ~~CREATE INDEX~~ → N/A (JS-side filter in op:list, no SQL index needed)
4. ~~CREATE INDEX~~ → N/A
5. Ensure `.aioson/runtime/checkpoints/` directory exists on first gate:approve (mkdir -p equivalent) ✓

## 6. Business rules

| ID | Rule |
|---|---|
| BR-AO-01 | Checkpoint write is best-effort: try/catch wraps the JSON.stringify + fs.writeFile; failure logs warning to stderr but does NOT block gate:approve. Gate status in spec-{slug}.md remains the authoritative record. |
| BR-AO-02 | Latest-gate-wins: when multiple checkpoints exist for the same slug, `workflow:heal` selects the most advanced gate (D > C > B > A). Selection is by gate letter, not by timestamp. |
| BR-AO-03 | Checkpoint size cap: max 5KB per checkpoint. If `JSON.stringify(checkpoint).length > 5120`, truncate `decision_log` to last 3 entries and prepend `[truncated]` marker. |
| BR-AO-04 | Decision rationale is FIFO: `decision_rationale[]` in last-handoff.json capped at 5 entries. When a new entry is added and the array exceeds 5, drop the oldest entry. |
| BR-AO-05 | `session-handoff.js` collects `decision_rationale` from `op:capture` events with `signal=confirmation` emitted during the current session. Only `confirmation` signals become rationale entries; `exclusion`, `correction`, and `authorization` signals are NOT promoted to rationale. |
| BR-AO-06 | `op:capture --feature` and `--session-id` are optional. When omitted, the columns remain NULL. Existing captures are never backfilled. |
| BR-AO-07 | `op:list` without filters returns ALL captures (backward compatible). With `--feature`, filters by `feature_slug`. With `--agent`, filters by `source_agent`. Filters are AND-composable. |
| BR-AO-08 | Checkpoint lifecycle: `runtime:prune` deletes checkpoints with `timestamp` older than 30 days. `feature:close` deletes ALL checkpoints for the closed slug regardless of age. |
| BR-AO-09 | `op:list --json` output follows schema: `{ feature, decisions: [{ agent, signal, quote, proposal, timestamp, session_id }], total }`. When `--feature` is omitted, `feature` is `null` and all decisions are returned. |

## 7. Edge cases

| ID | Edge case | Expected behavior |
|---|---|---|
| EC-AO-01 | `gate:approve` succeeds but checkpoint write fails (disk full, permission denied) | Gate is approved (spec frontmatter updated). Checkpoint missing. `workflow:heal` falls back to current artifact-reconstruction logic. Warning logged to stderr. |
| EC-AO-02 | `workflow:heal` called but no checkpoint exists for the feature | Fall back to current behavior (artifact reconstruction). No error — checkpoints are an optimization, not a requirement. |
| EC-AO-03 | Two features with similar slugs (e.g., `checkout` and `checkout-v2`) | Checkpoint filenames include full slug (`gate-A-checkout-v2.json`). No collision. |
| EC-AO-04 | `decision_rationale[]` exceeds 5 entries in a single session (agent asks >5 decisions) | Oldest entries dropped on each insert. Only the 5 most recent decisions survive to handoff. |
| EC-AO-05 | `op:capture` called without `--feature` in a feature-mode workflow | `feature_slug` is NULL. The capture is stored but not queryable by feature filter. Warning NOT emitted (backward compatible). |
| EC-AO-06 | `op:list --feature=nonexistent-slug` | Returns empty result: `{ feature: "nonexistent-slug", decisions: [], total: 0 }`. No error. |
| EC-AO-07 | Migration runs on a database that already has the columns (idempotent re-run) | ALTER TABLE silently succeeds or error is swallowed (try/catch). CREATE INDEX IF NOT EXISTS is natively idempotent. |
| EC-AO-08 | `feature:close` called for a feature with no checkpoints | No error — nothing to delete. `feature:close` proceeds normally. |

## 8. Out of scope

- Time-travel debugging / checkpoint replay UI
- Retroactive backfill of existing op:capture records
- Cross-feature decision aggregation dashboard
- Checkpoint diffing or visualization
- Theme 2 DAST depth (separate MICRO doc-only update)
- Playwright MCP integration (V2)

## 9. Classification

| Dimension | Score | Rationale |
|---|---|---|
| User types | 0 | 1 type (developer) |
| External integrations | 0 | 0 new (all internal CLI) |
| Business rules | 1 | 9 BRs with moderate complexity (truncation, FIFO, gate ordering, best-effort write) |
| **Total** | **1** | **SMALL** (score=1 but 6+ CLI files, 1 migration, 5 agent prompts justify SMALL over MICRO) |

Visual identity: N/A (CLI project)
