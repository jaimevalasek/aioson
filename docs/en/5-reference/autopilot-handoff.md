# Streamlined feature autopilot

Autopilot removes mechanical handoff confirmations while preserving genuine user decisions and the human close/publish gate.

## Canonical route

```text
[optional Briefing → optional Briefing Refiner] → Product → optional Sheldon → Planner → DEV → QA → human close
```

Briefing and Briefing Refiner are optional when the user already has an approved product direction. Sheldon is optional PRD enrichment. Analyst, Architect, Discovery Design Doc, PM, Scope Check, and UX/UI remain callable consultants, but classification does not insert them into the route and they do not create mandatory artifact packages.

MICRO, SMALL, and MEDIUM use the same route. Classification changes depth, risk coverage, and implementation budget—not the number of specification agents.

## DEV execution

DEV reads the approved PRD, the single implementation plan, repository evidence, selected project rules/docs, and the non-blocking dossier.

If `agent-execution-{slug}.json` explicitly enables development lanes, DEV may dispatch different hosts/models for disjoint scopes:

```text
DEV → backend lane → frontend lane → DEV integration → QA
```

Lanes run sequentially in a shared worktree. They are runtime workers, not workflow stages or canonical agents. Missing host/model pauses unless the lane declares an applicable fallback. The current client never silently replaces an unavailable host with itself.

## Review

QA is the single default reviewer and receives a proportional budget:

- MICRO/Simple Plan: changed ACs, focused tests, one production-path smoke;
- SMALL: all feature ACs, focused regression, one production-path smoke;
- MEDIUM: deeper negative/integration checks only for named risks.

No QA agent runs between DEV phases. QA stops broad investigation after finding a reproducible implementation defect and returns the smallest correction packet. An unchanged diagnostic is not repeated more than twice.

Tester, Pentester, and Validator are disabled by default. They run only when enabled in `agent-execution-{slug}.json` and triggered by explicit user choice, approved-plan need, or a concrete QA finding. Classification alone never activates them.

## Stop conditions

Autopilot pauses for:

- a genuine product/security decision;
- an unavailable requested host/model without explicit fallback;
- a blocking QA finding or exhausted correction limit;
- missing authority for external, destructive, deploy, publish, or release action.

Autopilot never runs `feature:close`, commit, publish, deploy, or release without explicit user approval.
