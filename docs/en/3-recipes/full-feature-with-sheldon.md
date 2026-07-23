# Recipe: Full feature with optional `@sheldon` enrichment

> **Who this is for:** tracked features that need a PRD, an executable plan, implementation, and a final delivery verdict.
> **What you'll have at the end:** one PRD, one implementation plan, integrated code, and one QA verdict, all traceable on disk.

---

## The trail in one line

```text
optional @briefing → optional @briefing-refiner → @product
→ optional @sheldon → @planner → @dev → @qa
```

The route is the same for MICRO, SMALL, and MEDIUM. Classification changes how deeply each stage investigates risk, how large the implementation budget is, and how broad QA should be. It does not add specification agents or security reviewers to the default chain.

This recipe shows Sheldon because it is useful when a ready PRD would benefit from another critical enrichment pass. Skip it when Product's PRD is already actionable.

---

## Scenario

You are adding subscription billing. The feature includes payment-provider webhooks, upgrades and downgrades, and a small management UI. It is meaningful enough to track, and some product edge cases deserve a critical review before planning.

For an already-specified bounded technical outcome that fits the Simple Plan budget, go directly to `@dev`; do not manufacture a feature workflow.

---

## Step 1 — `@product` owns the PRD

```text
You > @product

@product > Feature slug?
You > billing-subscription

@product > [drives problem, users, scope, exclusions, ACs, risks]
@product > PRD approved:
           .aioson/context/prd-billing-subscription.md
```

Product owns the single specification authority. The PRD contains capabilities, concrete acceptance criteria, exclusions, and unresolved decisions. Optional dossiers, prototypes, prior briefings, and consultant findings are evidence for this document—not competing specifications.

If a genuine product decision remains open, resolve it here before planning.

---

## Step 2 — Optional: `@sheldon` enriches the same PRD

Use Sheldon when the PRD has a rich surface, material edge cases, or would benefit from independent challenge.

```text
You > @sheldon

@sheldon > Reviewing prd-billing-subscription.md...
@sheldon > Four gaps need attention:
           1. downgrade timing is not explicit
           2. proration policy is ambiguous
           3. webhook idempotency has no AC
           4. dunning after repeated failure is excluded accidentally

You > [resolve product decisions]

@sheldon > Enrichment applied to the same PRD.
           Product scope and readiness remain explicit.
           Next: @planner.
```

Sheldon does not create requirements, design-doc, readiness, conformance, or harness documents as mandatory prerequisites. It preserves Product ownership and updates the same PRD in place.

When you need a named specialist decision, request it explicitly:

| Consultant | Use it for |
|---|---|
| `@analyst` | A concrete brownfield/domain question |
| `@architect` | A material boundary, integration, security, or operability decision |
| `@discovery-design-doc` | A standalone discovery/design investigation |
| `@pm` | Backlog or user-story consultation |
| `@ux-ui` | A formal interaction or visual-design decision |
| `@scope-check` | A bounded intent/plan/delivery drift review |

Their findings feed the PRD or implementation plan. They do not become default stages or create blocking artifact packages.

---

## Step 3 — `@planner` owns the implementation plan

```text
You > @planner

@planner > Reading the approved PRD and repository evidence.
@planner > Plan approved:
           .aioson/context/implementation-plan-billing-subscription.md

           Stage 1: webhook ingestion + idempotency + focused checks
           Stage 2: subscription service + upgrade/downgrade behavior
           Stage 3: management UI + production-path smoke
@planner > Every AC maps to a vertical stage and executable verification.
           Next: @dev.
```

Planner creates one vertical plan. It names exact expected files, repository reuse, dependencies, stage-level verification, production-path evidence, and any approved development lanes.

MICRO plans stay concise. SMALL plans cover the whole feature without excess ceremony. MEDIUM plans add depth only for named risks and integration boundaries.

---

## Step 4 — `@dev` implements and integrates

```text
You > @dev

@dev > Reading the PRD, implementation plan, selected rules/docs, and repository evidence.
@dev > Implementing stages sequentially...
@dev > Focused checks pass after each meaningful slice.
@dev > Full planned verification passes.
@dev > dev-state.md updated. Next: @qa.
```

DEV is the integration owner. It loads rules, docs, skills, and consultant evidence only when relevant.

### Optional development lanes

If `agent-execution-billing-subscription.json` explicitly enables generic development lanes, DEV may delegate disjoint scopes to registered CLI hosts/models:

```text
DEV → backend lane → frontend lane → DEV integration → QA
```

Each lane declares `host`, `model`, `prompt`, and `write_paths`. Lanes run sequentially in the shared worktree. DEV audits each diff, resolves shared boundaries, and performs final integrated verification.

An unavailable host/model pauses the run. The active client never silently substitutes itself. A fallback is legal only when the manifest explicitly declares an applicable fallback.

---

## Step 5 — `@qa` writes the final verdict

```text
You > @qa

@qa > Reviewing the PRD, plan, diff, DEV evidence, and production path.
@qa > AC-12 fails with a reproducible proration case.
@qa > Returning the smallest correction packet to @dev:
           command: npm test -- proration.test.js
           expected: downgrade credit is applied once
           observed: credit applied twice

@dev > Fix applied; focused and integrated checks pass.
@qa > Re-checking changed evidence...
@qa > qa-report-billing-subscription.md saved. Verdict: PASS.
```

QA is proportional and bounded:

- MICRO/Simple Plan: changed ACs, focused tests, one production-path smoke.
- SMALL: all feature ACs, focused regression, one production-path smoke.
- MEDIUM: deeper negative and integration checks only for named risks.

QA stops broad investigation after finding a reproducible implementation defect. It does not repeat an unchanged diagnostic more than twice, and it does not run between DEV stages.

Tester, Pentester, and Validator are disabled by default. They run only when their manifest entry is enabled and an explicit user choice, approved-plan need, or concrete QA finding triggers them. Classification alone never enables them.

---

## Autopilot behavior

When autopilot is armed, deterministic handoffs can continue through the canonical chain. The default delivery handoff is:

```text
DEV → QA
```

Autopilot pauses for genuine product or security decisions, unavailable requested host/model without an explicit fallback, exhausted correction limits, and actions requiring new authority. It never runs `feature:close`, commit, publish, deploy, or release without explicit approval.

See [Autopilot handoff](../5-reference/autopilot-handoff.md).

---

## Canonical audit trail

```text
.aioson/context/
├── prd-billing-subscription.md
├── implementation-plan-billing-subscription.md
├── dev-state.md
└── qa-report-billing-subscription.md
```

A dossier, prototype, consultant report, test inventory, security findings, or harness contract may exist as non-blocking evidence. None replaces the PRD, plan, or QA verdict.

---

## Troubleshooting

| Problem | Response |
|---|---|
| Product decisions remain open | Resolve them in `@product`; do not ask Planner or DEV to invent product policy |
| The PRD needs critical enrichment | Run optional `@sheldon`, then keep the result in the same PRD |
| Planner finds a material unresolved boundary | Request the relevant consultant, feed the decision back into the PRD/plan, then resume |
| A development host/model is unavailable | Pause or use a manifest-declared fallback; never silently run it in the current client |
| QA finds a reproducible defect | Return the smallest correction packet to DEV, then re-check only affected evidence plus required regression |
| QA investigation is not converging | Stop at the bounded attempt limit and ask for a human decision |

---

## Next steps

- [From idea to PRD via @briefing](./from-idea-to-prd-via-briefing.md)
- [Continuity between sessions](./continuity-between-sessions.md)
- [Agent execution and development lanes](../5-reference/agent-execution.md)
- [Ecosystem map](../1-understand/ecosystem-map.md)
