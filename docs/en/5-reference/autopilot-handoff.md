# Streamlined feature autopilot

Autopilot removes mechanical handoff confirmations while preserving genuine user decisions and the human close/publish gate.

## Canonical route

```text
[optional raw-source Briefing → Refiner → user approval] → Product → Sheldon → Planner → DEV → QA → human close
```

Briefing and Refiner are pre-product intake when raw sources need framing. Sheldon is the mandatory independent hash-bound PRD review. The former consultants (Analyst, Architect, Discovery Design Doc, PM, Scope Check, UX/UI) were retired into Product, Planner, Refiner, and QA; their CLI ids still resolve to the absorbing agent, and none of them adds a stage or a mandatory artifact package.

MICRO, SMALL, and MEDIUM use the same route. Classification changes depth, risk coverage, and implementation budget—not the number of specification agents.

`@dev --auto` (or `aioson agent:prompt dev . --auto`) enables Autopilot for that activation even when the project default is off. `--step` disables it for that activation and wins if both flags are supplied. Neither option rewrites the persisted preference. In every mode, the chain stops after QA and waits for explicit human authorization before `feature:close`/publish.

New feature execution manifests use schema v2 and default to Autopilot. Their create-once `orchestration.mode` may keep that default, inherit the project setting, or force step-by-step mode. Effective Autopilot uses the manifest's `max_checkpoints` budget instead of the legacy one-checkpoint default. Existing v1 manifests remain valid and are never rewritten; an explicit `--step` disarm still wins.

## DEV execution

DEV reads the approved PRD, the single implementation plan, repository evidence, selected project rules/docs, and the non-blocking dossier.

If `agent-execution-{slug}.json` explicitly enables development lanes, DEV may dispatch different hosts/models for disjoint scopes:

```text
DEV → backend lane → frontend lane → DEV integration → QA
```

Lanes run sequentially in a shared worktree. They are runtime workers, not workflow stages or canonical agents. Missing host/model pauses unless the lane declares an applicable fallback. The current client never silently replaces an unavailable host with itself.

The manifest also routes Neural Chain work. DEV owns inspection/fix items. Test and security items route to Tester/Pentester only when those opt-in specialists are enabled; otherwise they fall back to DEV. DEV completion is blocked while its actionable items remain unresolved, and QA receives read-only oversight for independent revalidation.

## Review

QA is the single default reviewer and receives a proportional budget:

- MICRO/Simple Plan: changed ACs, focused tests, one production-path smoke;
- SMALL: all feature ACs, focused regression, one production-path smoke;
- MEDIUM: deeper negative/integration checks only for named risks.

No QA agent runs between DEV phases. QA stops broad investigation after finding a reproducible implementation defect and returns the smallest correction packet. An unchanged diagnostic is not repeated more than twice.

Tester, Pentester, and Validator are disabled by default. They run only when enabled in `agent-execution-{slug}.json` and triggered by explicit user choice, approved-plan need, or a concrete QA finding. Classification alone never activates them. Tester/Pentester correction packets persist exact `allowed_fix_paths`; the CLI enforces the 3 behavior/5 total path budget, captures a Git baseline, and refuses the QA handoff after an out-of-scope diff. A direct pass over a disabled specialist requires `--manual` and does not mutate the manifest.

## Stop conditions

Autopilot pauses for:

- a genuine product/security decision;
- an unavailable requested host/model without explicit fallback;
- a blocking QA finding or exhausted correction limit;
- missing authority for external, destructive, deploy, publish, or release action.

Autopilot never runs `feature:close`, commit, publish, deploy, or release without explicit user approval.
