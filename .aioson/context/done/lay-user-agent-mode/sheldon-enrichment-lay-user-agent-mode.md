---
target_prd: .aioson/context/prd-lay-user-agent-mode.md
round_count: 1
last_enrichment_date: 2026-05-16
sizing_score: 4
sizing_decision: in-place + delivery plan (Path A, scores 4-6)
classification: SMALL
contract_files:
  - .aioson/plans/lay-user-agent-mode/progress.json
sources_used:
  - .aioson/briefings/lay-user-agent-mode/briefings.md
  - .aioson/context/prd-lay-user-agent-mode.md
  - plans/lay-user-agent-mode.md
  - researchs/lay-user-agent-mode-2026/summary.md
brain_patterns_applied:
  - sheldon-002 (classification gates scale process depth, q5)
  - sheldon-004 (discovery before architecture, q5)
  - sheldon-006 (design-complete is not execution-complete, q5)
---

# Sheldon Enrichment Log — lay-user-agent-mode (Round 1)

## Sizing breakdown

| Criterion | Score | Justification |
|---|---|---|
| Main entities above 3 | +2 | 5 entities: skill, jargon-map, profile field, doctor check, AskUserQuestion pattern |
| Distinct delivery phases above 1 | 0 | 1 cohesive ship (3 internal phases are sequential within one delivery, not independent releases) |
| External integrations | 0 | None — fully internal framework |
| User flows above 3 | +1 | 4 flows after enrichment: leigo MICRO, dev preservado, migration beginner→developer, team profile |
| AC complexity above 10 | +1 | 6 must-have + 2 should-have visible in MVP; analyst likely expands to 12+ binary ACs |
| **Total** | **4** | **Path A: in-place + delivery plan section** |

Classification (**SMALL**) is independent of sizing score — preserved from @product decision. SMALL → `progress.json` only; no `harness-contract.json` (per `.aioson/docs/sheldon/harness-contract.md` rule).

## Sources consulted

- Briefing `.aioson/briefings/lay-user-agent-mode/briefings.md` — JTBD + Cagan four risks + 13 open questions classified
- PRD `.aioson/context/prd-lay-user-agent-mode.md` — feature scope set by @product (MVP cirúrgico: skill + 5 agentes + dict + doctor check)
- Plan `plans/lay-user-agent-mode.md` — raw input from /deyvin session
- Research `researchs/lay-user-agent-mode-2026/summary.md` — 2 web queries about vibe coding UX + CLI agent profile patterns (verdict: has-alternatives)

## Brain patterns applied

- **sheldon-002 (5★):** classification gates scale process depth → SMALL = product→analyst→dev. Confirms workflow choice.
- **sheldon-004 (5★):** discovery before architecture → @analyst must map decision points + jargon surface before @architect/@dev choose implementation patterns.
- **sheldon-006 (5★):** design-complete is NOT execution-complete → audit wiring before closing. For this feature: skill loadable ≠ skill actually triggering rule branching in agent behavior; doctor check exists ≠ doctor check filtering correctly. `@qa` Gate D must verify runtime behavior, not just file presence.

## Gaps identified and applied (user-confirmed batch: P0+P1, gaps 1-9)

| # | Severity | Gap | Where applied |
|---|---|---|---|
| 1 | 🔴 P0 | Doctor check `jargon_leak_detection` needs scope filter to 5 participating agents | MVP must-have refinement |
| 2 | 🔴 P0 | `agent_events` schema verification (does it capture output, not just metadata?) | Open question #9 |
| 3 | 🔴 P0 | Identity-mode vs task-mode decision (Lovable uses task-mode; PRD uses identity-mode) | Open question #7 |
| 4 | 🟡 P1 | Naming `beginner` vs `creator`/`vibe`/`guided` | Open question #8 |
| 5 | 🟡 P1 | Migration narrative beginner → developer explicit | New user flow |
| 6 | 🟡 P1 | AskUserQuestion 4-option limit + escape hatch | MVP must-have refinement |
| 7 | 🟡 P1 | Jargon-map schema (markdown table vs YAML) | Open question #10 |
| 8 | 🟡 P1 | Test fixture pin for success metric | Success metrics refinement |
| 9 | 🟡 P1 | Team flow (`profile=team` behavior) | New user flow |

All 9 added to PRD marked `_(sheldon)_`. Three carry forward to `@analyst` as decision-required (#7, #8, #10) plus one testable (#9). Two of the original 6 briefing open questions remain `decision-required` (#1 and #2 — implementation details, not blocking PRD).

## Gaps deferred (P2 refinements)

| # | Reason for deferral |
|---|---|
| 10 | Kernel budget impact analysis — better measured during Phase 2 implementation with actual agent file deltas, not pre-implementation estimate |
| 11 | In-loop rule violation guard (vs after-fact doctor check) — V2 enhancement, MVP starts with after-fact doctor check |
| 12 | Persona validation via 3-5 user interviews — parallel research track, doesn't block MVP |

## Path A — In-place enrichment applied

The PRD was enriched in-place per Path A (score 4, range 4-6):

- **MVP scope refined** with 2 new must-have items (scope filter + AskUserQuestion limit/escape)
- **User flows** expanded from 2 to 4 (added migration, team)
- **Open questions** grew from 6 to 10 (3 closed/refined, 4 new from research+gap analysis)
- **Success metrics** added test fixture pin
- New section `## Delivery plan` with 3 sequential phases (Foundation / Agent integration / Verification) and a Gate per phase
- New section `## Reference sources (sheldon)` consolidating sources

PRD remains `briefing_source: lay-user-agent-mode`, classification SMALL, structurally aligned with @product output. No content removed; no Vision/Problem/Users rewritten.

## Harness contract

Skipped (classification SMALL). Only `.aioson/plans/lay-user-agent-mode/progress.json` produced — initialized via `aioson harness:init` then `harness-contract.json` removed to comply with SMALL rule (Sheldon doc explicit: "SMALL → Produce progress.json only").

`progress.json` baseline:
```json
{
  "feature": "lay-user-agent-mode",
  "phase": 1,
  "status": "in_progress",
  "completed_steps": [],
  "circuit_state": "CLOSED",
  "iterations": 0,
  "ready_for_done_gate": false
}
```

@analyst writes requirements (closes Gate A). @dev advances phases as Fase 1/2/3 land. @qa Gate D checks `ready_for_done_gate` before `feature:close`.

## Handoff

→ `/analyst` for requirements derivation.

Inputs `@analyst` reads:
- This file (`sheldon-enrichment-lay-user-agent-mode.md`)
- Enriched PRD (`prd-lay-user-agent-mode.md`)
- Briefing (for original Cagan risk frame)
- Research summary (for has-alternatives findings — important for naming + identity-mode decisions)
- Dossier (`.aioson/context/features/lay-user-agent-mode/dossier.md`)

Output expected from `@analyst`:
- `.aioson/context/requirements-lay-user-agent-mode.md` (functional + non-functional + edge cases + ACs binary-checkable)
- Decision on identity-mode vs task-mode (Q7) — surface to user if can't resolve from research alone
- Decision on naming (Q8) — surface 2-3 candidates to user
- Decision on jargon-map schema (Q10)
- Mapping of every decision point in the 5 MVP agents where the skill must activate
- Update `dossier.add-finding --section="Agent Trail"`
- Close Gate A
