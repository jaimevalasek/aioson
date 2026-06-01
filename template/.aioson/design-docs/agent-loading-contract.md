---
description: "AIOSON agent memory/context loading contract — loading tiers (always / trigger-based / justified), append-style memory retention+archival policy (current-state.md), agent matrix, and enforcement. Complements agent-structural-contract."
scope: "governance"
agents: []
status: partially-implemented
implemented: "P0 (rollup), P1 (archive-awareness), tagging, tooling — shipped 2026-05 (v1.21.1)"
deferred: "P2 (mandatory slug-resolve pre-code), P3 (reflect-prompt hash+path), per-tier budget line in context:health"
---

# Agent Loading Contract

> Cross-cutting governance for **when** each agent loads **which** memory layer.
> Complements `agent-structural-contract.md`, which covers sections, observability, and handoff.
> Loaded by all agents in the "Project rules, docs & design governance" section.

## Why This Exists

The lazy-load doctrine already exists in prompts ("never preload all at once", "cost discipline"), but it was not originally extended to bootstrap memory. Measured result on 2026-05-28 in inception mode:

- `bootstrap/current-state.md` was **81 KB / ~33k tokens**, or **84% of bootstrap**, an append-only log with 172 entries. It was read **on activation** by `@dev`, `@qa`, `@architect`, and `@deyvin` — the most-used agents.
- `@product`/`@analyst`/`@neo` already read only small files (`what-is`/`what-it-does`) and were disciplined.
- Because `current-state` exceeded the read cap (~25k tokens), agents that "read" it received a **truncated and arbitrary slice**: expensive and incomplete.
- `aioson context:health` measured `.aioson/context/*.md` but ignored `bootstrap/`, underreporting the largest cost.

Failure modes to correct:
- **Over-load:** eager full reading of heavy memory regardless of task.
- **Under-load:** specific context (feature dossier/spec) loads only if the agent decides to do it; heuristic instead of enforced, leading to under-informed work.

## Principle

Every memory layer has a **loading tier** and a **trigger**. Expensive context does not enter activation by default.
Append-growing memory must have a **retention policy**; it must not accumulate forever on the hot path.

## The Three Loading Tiers

### Tier 0 — Always (budget <= ~2k tokens)
Immediate cheap orientation; answers "what this is + what is happening + what is missing":
- `bootstrap/what-is.md` — system identity
- `context/project-pulse.md` — last agent, active feature, blockers, next step
- `context/dev-state.md` — current development state, when present

The agent's own `.md` file and `CLAUDE.md` are loaded by the harness and are outside this budget.

### Tier 1 — Trigger-Based (load ONLY when trigger fires)

| Task trigger | Load |
|---|---|
| Needs recently shipped capability context (review, avoid rediscovery) | `current-state.md` **HOT section only**; cold/archive by keyword |
| Architectural/structural reasoning | `bootstrap/how-it-works.md` |
| Request names/implies a feature slug | `features/{slug}/dossier.md` + `spec-{slug}.md` (+ prd/requirements) |
| Implementation touches module/naming/reuse boundaries | Relevant `design-docs/*.md` |
| Rule whose `agents:` includes the agent or is `[]` | That rule |
| Task matches a process (SDD, secure-tdd, decision-presentation) | Matching SKILL |

### Tier 2 — Explicit Justification (expensive)
- `brain:query` (procedural memory) before architectural recommendations
- `git diff/log` only when memory+runtime are insufficient or the user asks for commit history
- **Full `current-state.md` + `current-state-archive.md`** only when a survey needs the full history
- scan artifacts (`scan-*.md`) for brownfield deep-dives

## Append-Style Memory Retention Policy

`current-state.md` and any state file that grows by append has a **per-entry lifecycle**.
A "Slice 3 of feature X shipped..." entry is HOT while X is active; after X closes, it becomes history — valuable for archaeology, unnecessary on every activation.

**HOT/COLD structure:**
- `bootstrap/current-state.md` (**HOT**) — only active features (`in_progress`) + entries inside the recent window (>= latest published minor or ~last 45 days). Target: **<= ~10 KB**.
- `bootstrap/current-state-archive.md` (**COLD**) — everything else. Never loaded on activation (Tier 2); searchable through `memory:search` / grep.

**Rollup triggers (move HOT → COLD, never delete):**
1. **Event-driven** — `feature:close` moves entries for that feature to archive. Requires a slug tag per entry.
2. **Window-based** — `memory:trim` applies the retention window to legacy/untagged entries.

**Entry tag going forward:** append writers (`@dev`, `@committer`, reflection) prefix entries with `[{slug} · {YYYY-MM-DD}]` so rollup is deterministic. Legacy untagged entries fall back to the window rule.

**Reading:** Tier 1 reads only HOT; archive is Tier 2 for archaeology/keyword work.

General rule: every append-growing memory file needs retention, not infinite append. Feature folders, plans, and dossiers are already archived under `done/` on `feature:close`; `current-state.md` was the only global log without rollup, and this policy closes that gap.

## Agent Loading Matrix

| Agent | Tier 0 | Typical Tier 1 triggers | Reads full `current-state`? |
|---|---|---|---|
| @product, @analyst | what-is + optional what-it-does | dossier/spec if feature named | never |
| @neo | what-is | router only | never |
| @deyvin | Tier 0 | HOT + dossier/spec by slug; pair-exec/debug docs by trigger | HOT only (full = Tier 2) |
| @dev | Tier 0 + how-it-works | HOT + dossier/spec + dev rules + design-docs on touch | HOT only |
| @qa | Tier 0 | HOT to avoid re-flagging shipped work + area under review | HOT only |
| @architect | Tier 0 + how-it-works | HOT + governance design docs | HOT only |

## Deterministic Triggers

When the request **names or implies** a feature, the agent **must** resolve the slug via `features.md` / `project-pulse.md` and load `dossier` + `spec` **before editing code**.
This converts the trigger from heuristic ("agent decides") into contract ("must resolve + load").
Use `aioson context:pack . --agent=<a> --goal="<request>"` to get the exact file set.

## Enforcement & Measurement

- `aioson context:health` **must** include `bootstrap/*.md` plus one budget line per tier.
- Budgets: Tier 0 <= ~2k tokens; activation (Tier 0 + agent prompt) target <= ~8k tokens.
- `@qa` (Gate D) and `@sheldon` (enrichment) check prompts against this contract, as they already do with `agent-structural-contract`; violation = Medium finding with `recommended_owner: dev`, never blocks a feature by itself.

## Implementation Sequence (@dev — inception-mirror src/ + template/)

1. Done — **P0 shipped v1.21.1:** `memory:trim` (engine + command, HOT/COLD split) + rollup hook on `feature:close` (keep=25, best-effort). Reduced `current-state.md` from 81KB to 21KB.
2. Done — **P1 shipped v1.21.1:** @dev/@qa/@architect/@deyvin "Bootstrap context" sections now point to `current-state-archive.md` for grep/`memory:search` on demand. Heavy "read partial + grep head" rewrite was no longer needed because HOT is small after trim.
3. Done — **Tagging shipped v1.21.1:** reflect-engine + @dev invariant #8 + @committer prefix entries with `[{slug} · {YYYY-MM-DD}]`.
4. Done — **Tooling shipped v1.21.1:** `context:health` measures `bootstrap/` and excludes the cold archive. Per-tier budget line still deferred.
5. Deferred — **P2:** make slug resolution + dossier/spec load mandatory before code.
6. Deferred — **P3:** store hash+path in `reflect-prompt.json` instead of full snapshot.

## Non-Goals / Deferred

- Change memory content or schema; only loading/retention policy.
- Cross-project memory, LLM-based context selection, file watcher.
- Touch @product/@analyst/@neo beyond reference alignment to this doc.
- Delete history; archival moves, never deletes, preserving searchable archaeology.
