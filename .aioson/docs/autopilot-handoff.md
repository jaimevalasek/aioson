---
description: "Autopilot handoff for the streamlined feature chain and conditional post-dev specialists."
agents: [product, sheldon, planner, dev, qa, tester, pentester, validator]
modes: [executing]
task_types: [workflow, handoff, autopilot]
load_tier: trigger
triggers: [auto_handoff, autopilot, workflow execute, agentic policy]
---

# Autopilot Handoff

Autopilot advances this deterministic route:

```text
product → planner → dev [optional declared execution lanes → DEV integration] → qa
```

`--auto` enables Autopilot for the current direct/tracked activation even when the project default is off. `--step` disables it for the current activation and wins if both flags are present. Neither flag rewrites the persisted project/feature preference, and neither authorizes the human `feature:close`/publish gate.

Development lanes are nested inside DEV, not new workflow stages. DEV dispatches only lanes explicitly enabled in `agent-execution-{slug}.json`, one at a time in the shared worktree, and remains responsible for integration and full verification. If a requested host/model is unavailable, autopilot pauses. It may use another host only when that lane contains an applicable explicit fallback.

QA is the single default reviewer. After its first pass, additional specialists run only when both enabled by the user/approved plan and triggered:

```text
qa → tester/pentester → bounded specialist correction or one consolidated dev correction → final qa → optional validator
```

`.aioson/context/agent-execution-{slug}.json` is the authority for development lanes, optional specialist enablement, host/model selection, fallbacks, and `cycle_limits`. Classification never enables a lane, Tester, Pentester, or Validator by itself.

Tester and Pentester are allowed to implement a correction when their own contract proves it is deterministic, preserves approved behavior/contracts/data/architecture, fits the bounded path budget, and has targeted regression evidence. They persist the finding and `allowed_fix_paths` before editing. `review-cycle:advance` validates that scope and captures a Git baseline; `review-cycle:resolve` refuses the QA handoff when the changed paths exceed it. A direct pass over a disabled specialist requires explicit `--manual` and never mutates the developer-owned manifest. Cross-cutting changes go once to DEV. QA independently accepts or rejects every specialist-authored change; specialists never grant Gate D.

## Required handoff state

- Product: PRD has concrete capabilities/ACs, a repository-backed `## Current System Fit`, `product_scope: approved`, and `prd_ready: approved`.
- Sheldon, when explicitly inserted: the same PRD has `sheldon_review: approved`.
- Planner: implementation plan has a repository-backed `## Implementation Delta`, evidence-triggered `## Engineering Controls` assigned to phases with verification/recovery where applicable, `status: approved`, and Gate C passes.
- Dev: required phases and engineering controls implemented with focused tests and production-path evidence.
- QA: `qa-report-{slug}.md` contains the independent verdict, including revalidation of any specialist correction.

No stage may synthesize missing requirements/spec/design/readiness/conformance/checkpoint/harness documents to make routing pass.

Current-system fit and implementation-delta decisions are not new human gates. When repository evidence, compatibility, correctness, or an existing convention determines the recommended choice, the active agent writes it and Autopilot continues. Pause only when the alternatives materially change product behavior, scope, cost, data, security, or risk.

Prototype ownership follows the same rule. An exact active-feature path plus matching manifest owner is `current`; a missing, cross-feature, or closed-feature candidate becomes `none` with an explicit historical exclusion, and the repository becomes the baseline. Agents state that resolution in chat and continue without a confirmation prompt. Pause only when the user explicitly wants a non-owned historical prototype to become new product authority, because that requires a new feature-owned artifact and may change scope.

The same rule applies to bounded Tester/Pentester corrections: `review-cycle:advance` and configured cycle limits control execution, not routine confirmation prompts.

## Stop conditions

Stop immediately for:

- a genuine product/security decision;
- a failed gate or blocking QA finding;
- cycle/budget limit;
- missing authority for an external/destructive action;
- explicit step-by-step policy.

Autopilot never runs `feature:close`, commit, publish, deploy, or release without explicit human approval.

The lightweight dossier may be updated throughout the route as a non-blocking context cache. Sheldon is an optional PRD enrichment step. Analyst, Architect, Discovery Design Doc, and PM remain opt-in compatibility consultants; they produce bounded advice and are never injected into the canonical chain by classification.
