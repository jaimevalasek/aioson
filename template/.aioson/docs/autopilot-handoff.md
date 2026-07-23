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

Development lanes are nested inside DEV, not new workflow stages. DEV dispatches only lanes explicitly enabled in `agent-execution-{slug}.json`, one at a time in the shared worktree, and remains responsible for integration and full verification. If a requested host/model is unavailable, autopilot pauses. It may use another host only when that lane contains an applicable explicit fallback.

QA is the single default reviewer. After its first verdict, additional specialists run only when both enabled by the user/approved plan and triggered:

```text
qa → tester/pentester → final qa → optional validator
```

`.aioson/context/agent-execution-{slug}.json` is the authority for development lanes, optional specialist enablement, host/model selection, fallbacks, and `cycle_limits`. Classification never enables a lane, Tester, Pentester, or Validator by itself.

## Required handoff state

- Product: PRD has concrete capabilities/ACs, `product_scope: approved`, and `prd_ready: approved`.
- Sheldon, when explicitly inserted: the same PRD has `sheldon_review: approved`.
- Planner: implementation plan has `status: approved` and Gate C passes.
- Dev: required phases implemented with focused tests and production-path evidence.
- QA: `qa-report-{slug}.md` contains the independent verdict.

No stage may synthesize missing requirements/spec/design/readiness/conformance/checkpoint/harness documents to make routing pass.

## Stop conditions

Stop immediately for:

- a genuine product/security decision;
- a failed gate or blocking QA finding;
- cycle/budget limit;
- missing authority for an external/destructive action;
- explicit step-by-step policy.

Autopilot never runs `feature:close`, commit, publish, deploy, or release without explicit human approval.

The lightweight dossier may be updated throughout the route as a non-blocking context cache. Sheldon is an optional PRD enrichment step. Analyst, Architect, Discovery Design Doc, and PM remain opt-in compatibility consultants; they produce bounded advice and are never injected into the canonical chain by classification.
