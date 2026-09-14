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
product → sheldon → planner → dev [optional declared execution lanes → DEV integration] → qa
```

`--auto` enables Autopilot for the current direct/tracked activation even when the project default is off. `--step` disables it for the current activation and wins if both flags are present. Neither flag rewrites the persisted project/feature preference or authorizes closing/publishing by itself. A separate explicit closure policy may authorize close after final QA; `--step` suppresses it.

New `agent-execution-{slug}.json` manifests use schema v2 and add a developer-owned `orchestration` policy. New features default to `mode: autopilot`; `inherit` follows the activation/project scheme, and `step_by_step` forces that feature off. In effective Autopilot, `workflow:execute` derives its default checkpoint budget from `orchestration.max_checkpoints` instead of silently stopping after one transition. Existing v1 manifests remain valid and are never rewritten. A direct/persisted `--step` disarm still wins.

Development lanes are nested inside DEV, not new workflow stages. DEV dispatches only lanes explicitly enabled in `agent-execution-{slug}.json`, one at a time in the shared worktree, and remains responsible for integration and full verification. If a requested host/model is unavailable, autopilot pauses. It may use another host only when that lane contains an applicable explicit fallback.

QA is the single default reviewer. After its first pass, additional specialists run only when both enabled by the user/approved plan and triggered:

```text
qa → tester/pentester → bounded specialist correction or one consolidated dev correction → final qa → optional validator
```

`.aioson/context/agent-execution-{slug}.json` is the authority for development lanes, optional specialist enablement, host/model selection, fallbacks, and `cycle_limits`. Classification never enables a lane, Tester, Pentester, or Validator by itself.

The same manifest owns Neural Chain work routing through `chain_work_policy`. `inspect`/`fix` default to DEV; `test` and `security` route to Tester/Pentester only when those specialists are explicitly enabled, otherwise they fall back to DEV. A v2 manifest blocks DEV completion while DEV-owned actionable items remain unresolved. QA receives read-only oversight and independently revalidates corrections.

Tester and Pentester are allowed to implement a correction when their own contract proves it is deterministic, preserves approved behavior/contracts/data/architecture, fits the bounded path budget, and has targeted regression evidence. They persist the finding and `allowed_fix_paths` before editing. `review-cycle:advance` validates that scope and captures a Git baseline; `review-cycle:resolve` refuses the QA handoff when the changed paths exceed it. A direct pass over a disabled specialist requires explicit `--manual` and never mutates the developer-owned manifest. Cross-cutting changes go once to DEV. QA independently accepts or rejects every specialist-authored change; specialists never grant Gate D.

## Required handoff state

- Product: PRD has complete source-promise coverage when source intake exists, concrete capabilities/ACs, a repository-backed `## Current System Fit`, `product_scope: approved`, and `prd_ready: approved`.
- Sheldon: the same final PRD has `sheldon_review: approved` and a current hash-bound promoted PASS over the PRD plus briefing/prototype hard authorities.
- Planner: implementation plan has a repository-backed `## Implementation Delta`, evidence-triggered `## Engineering Controls` assigned to phases with verification/recovery where applicable, `status: approved`, and Gate C passes.
- Dev: required phases and engineering controls implemented with focused tests and production-path evidence.
- QA: `qa-report-{slug}.md` contains the independent verdict, including revalidation of any specialist correction.

No stage may synthesize missing requirements/spec/design/readiness/conformance/checkpoint/harness documents to make routing pass.

Current-system fit and implementation-delta decisions are not new human gates. When repository evidence, compatibility, correctness, or an existing convention determines the recommended choice, the active agent writes it and Autopilot continues. Pause only when the alternatives materially change product behavior, scope, cost, data, security, or risk.

Prototype ownership follows the same rule. An exact active-feature path plus matching approved manifest owner is `current`; a missing, cross-feature, draft, or closed-feature candidate cannot bind the PRD, and the repository becomes the baseline only for genuinely nonvisual work recorded as `none`. Agents state that resolution in chat and continue without a confirmation prompt. Pause when visual scope lacks an approved owned prototype or the user wants a non-owned historical prototype to become new product authority.

The same rule applies to bounded Tester/Pentester corrections: `review-cycle:advance` and configured cycle limits control execution, not routine confirmation prompts.

## Stop conditions

Stop immediately for:

- a genuine product/security decision;
- a failed gate or blocking QA finding;
- cycle/budget limit;
- an unresolved DEV-owned Neural Chain item when the feature manifest enables the handoff gate;
- missing authority for an external/destructive action;
- explicit step-by-step policy.

Autopilot may run `feature:close` after final QA under the explicit project closure policy (`.aioson/docs/delivery-followups.md`). It never infers permission to commit, publish, deploy, or release from that policy.

**A genuine decision is recorded, not remembered.** When an agent meets a choice only the owner can make — a product trade-off the PRD does not settle, a security posture, a contradiction between two approved artifacts — it records it with `aioson decision:add . --feature={slug} --id=DEC-NN --question="…" --evidence="…" --consequence="…" --recommendation="…" [--options="a|b"] --by=@agent` and stops. The checkpoint is durable (`.aioson/context/features/{slug}/decision-checkpoint.json`): `workflow:next` refuses to advance the feature while a blocking decision is pending, `decision:list` shows what is waiting, and only a human records the outcome with `aioson decision:resolve . --feature={slug} --id=DEC-NN --choice="…" --by="<name>"` (`--status=deferred|rejected` for the other outcomes). `--force` on `workflow:next` remains the explicit override, recorded as such. An agent never hand-edits the file.

**The owner confirms understanding, not only progress.** `aioson feature:summary . --feature={slug} --write` renders the executive summary — promises, capabilities, acceptance criteria, planned files, decisions, code-vs-plan drift, visual evidence, gaps — in the project's interaction language with framework jargon translated; `aioson feature:acknowledge . --feature={slug} --by="<owner>"` records that the owner read it, and refuses a summary the artifacts moved past (hash). `feature:close` reports the state; it never blocks on it.

The lightweight dossier and `mappings/{slug}/continuity.md` may be updated as non-blocking context caches; neither is scope, evidence, or a gate. Sheldon is mandatory PRD enrichment and approval. Analyst, Architect, Discovery Design Doc, and PM remain opt-in compatibility consultants; they produce bounded advice and are never injected into the canonical chain by classification.
