---
description: Classify scope drift after a behavior-changing correction — measured diff first, one owner per drift, engine drift gate stays authoritative
agents: [qa]
task_types: [qa, scope-drift, conformance, post-fix-review]
triggers: [scope drift, post-fix, correction changed behavior, unexpected files, skipped scope, plan conformance]
---

# Scope drift classification

Load when a Dev, QA, Tester, or Pentester correction changed behavior, touched files outside the plan, or skipped approved scope. A correction that only fixed a defect inside planned behavior needs no drift pass.

## Measure first

1. `aioson feature:diff . --feature={slug} --json` — the delivered change set against the resolved base.
2. `aioson spec:analyze . --feature={slug} --stage=dev --json` — read `delivery_drift` (`planned`, `delivered`, `untouched`, `outside`).

Classify only what these two outputs show. A drift claim without a path from them is an opinion, not a finding.

## Classify each drift

| Class | Meaning | Owner |
|---|---|---|
| `PRODUCT_DECISION` | Delivered behavior changes what the PRD promised or adds an unpromised capability | `@product` |
| `PLAN_CORRECTION` | Behavior matches the PRD but the plan's paths, phases, or boundaries were wrong | `@planner` |
| `DEV_CORRECTION` | Code deviates from an approved PRD and plan | `@dev`, only with the command that reproduces the deviation |
| `DEFERRED` | Known gap accepted for now | recorded with its reason in the QA report |

One class and one owner per drift. Never fold a `PRODUCT_DECISION` into a Dev fix.

## Authority

The engine's scope drift gate in `workflow:next` runs at dev/qa completion and stays authoritative; this classification explains its findings and routes them, it never overrides or silences them.
