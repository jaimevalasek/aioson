# Recipe: Full feature with `@sheldon` (canonical trail)

> **Who this is for:** medium-to-high complexity features where wrong early decisions are costly.
> **Time to run:** 2 to 8 hours (varies with scope), spread across 1–4 sessions.
> **What you'll have at the end:** a feature implemented, tested, security-audited, and reviewed end-to-end — every decision traceable on disk.
> **Status:** this is the trail the AIOSON creator uses by default for SMALL/MEDIUM projects with significant implementation.

---

## The trail in one line

```
/aioson:agent:product → @sheldon → @analyst → @architect → @ux-ui → @pm → @orchestrator → @dev
                                                              │
                                              (@qa ↔ @dev)  ← autonomous loop
                                                              │
                              optional: @tester → (@qa ↔ @dev) ← extra coverage
                                                              │
                              optional: @pentester ↔ @dev    ← security
                                                              │
                                              @qa (final general review)
```

**Why order matters:** each agent reads the artifacts left by the previous one. Skipping an agent means the next one improvises — and improvisation on big decisions becomes rework.

---

## Scenario

You are building a meaningful feature — typical examples: **subscription billing with Stripe**, **seller dashboard in a marketplace**, **order cancellation with time-window rules**. Something that mixes backend + UI + business rules + external integration.

If the feature is trivial (simple CRUD without business logic), skip to the [Landing page recipe](./landing-page.md) or [SaaS app from scratch](./saas-app-from-scratch.md). This trail is a cannon; don't use it to shoot sparrows.

## Prerequisites

- Project with `aioson init/install` already run
- `project.context.md` populated (`@setup` already done)
- Classification **SMALL** or **MEDIUM**
- AI client open in the project

---

## Step 1 — `@product` defines the PRD

```
You > @product

@product > Let's define a feature. What's the slug?
You > billing-subscription

@product > In one sentence, the problem?
You > Customer wants to subscribe to monthly/annual plan and manage payment

@product > [guided questions: ACs, out-of-scope, dependencies, SLA limits]
@product > PRD created at .aioson/context/prd.md (copy at features/billing-subscription/spec.md).
@product > Next: @sheldon to validate and enrich before going technical.
```

**What was left on disk:** `prd.md` with clear sections (problem, scope, ACs, out-of-scope).

> **Variation:** if you already have material in `/plans/` or an approved briefing, `@product` detects it and offers to use it as a base. See [External plans for @product](./external-plans-for-product.md) and [From idea to PRD via @briefing](./from-idea-to-prd-via-briefing.md).

---

## Step 2 — `@sheldon` enriches the PRD (critical step)

This is the step most people skip — and where AIOSON gains depth.

```
You > @sheldon

@sheldon > Reading prd.md... scanning .aioson/context/architecture.md, dependencies, plans/.
@sheldon > Detected 4 gaps:
        1. PRD does not cover plan downgrade (only upgrade)
        2. No decision on proportional billing (proration)
        3. Stripe webhook has no retry/idempotency policy
        4. No ACs for billing failure after 3 attempts (dunning)

@sheldon > Do you have external sources? [URL, local file, "no"]
You > docs.stripe.com/billing/subscriptions/upgrade-downgrade

@sheldon > [searches, reads, cites]
@sheldon > Recommendation:
        - Enrich PRD in-place (gaps 1, 2 are product decisions)
        - Create phased plan at .aioson/plans/billing-subscription/ for
          phased implementation of webhook+dunning (gaps 3, 4)

@sheldon > Applying enrichment... prd.md updated.
@sheldon > Phased plan: .aioson/plans/billing-subscription/{phase-1.md, phase-2.md, harness-contract.json}
@sheldon > Next: @analyst.
```

**Why run `@sheldon`:**
- It reads the **actual project code** and cross-references it with the PRD — it sees what's missing.
- It can fetch **external sources** (Stripe docs, RFCs, technical posts) and **cite them**.
- It decides between **enriching in-place** (editing `prd.md`) or **creating a phased plan** when scope is too large for a single implementation.

**Can run multiple times:** if the first pass left gaps, invoke `@sheldon` again. It detects existing `sheldon-enrichment.md` and offers a new enrichment round without starting over.

> **When NOT to run `@sheldon`:** trivial features (basic CRUD) or MICRO. The enrichment effort does not pay off.

---

## Step 3 — `@analyst` maps the domain

```
You > @analyst

@analyst > Reading enriched prd.md + codebase.
@analyst > Entities: Subscription, Plan, Invoice, PaymentMethod, DunningAttempt.
        Already exist in code: Customer, Order. Will extend.
@analyst > Domain map saved to architecture.md (domain section).
@analyst > Next: @architect.
```

## Step 4 — `@architect` decides the technical structure

```
You > @architect

@architect > Decisions:
        - Stripe Customer Portal for self-service (reduces custom UI)
        - Webhook handler on dedicated route with idempotency key
        - Daily dunning cron (3 attempts, 1d/3d/7d intervals)
        - Migration: subscriptions table with FK on customers
@architect > Decisions saved to architecture.md (decisions section).
@architect > Next: @ux-ui.
```

## Step 5 — `@ux-ui` designs the UI

```
You > @ux-ui

@ux-ui > Reading architecture and PRD. Stack confirmed: React + current design skill.
@ux-ui > Components:
        - PlanSelector (3 cards: Free, Pro, Enterprise)
        - BillingPortal (link to Stripe Portal)
        - InvoiceList
        - DunningBanner (failed billing alert)
@ux-ui > Specs saved to design-doc.md. Next: @pm.
```

> In **SMALL** projects without `@ux-ui` in the flow, skip this step.

## Step 6 — `@pm` breaks down into user stories

```
You > @pm

@pm > 7 user stories identified, grouped into 3 epics.
        Each with verifiable ACs (e.g., "POST /subscriptions/upgrade
        returns 200 and sets proration_amount > 0").
@pm > tasks.md saved.
@pm > Next: @orchestrator.
```

## Step 7 — `@orchestrator` defines parallel lanes

```
You > @orchestrator

@orchestrator > Identified 3 parallelizable lanes:
        - lane-backend.md (routes + webhook + cron)
        - lane-ui.md (4 components + integration)
        - lane-migration.md (DB schema + test seeds)
@orchestrator > Dependency: lane-ui depends on lane-backend for the API contract.
@orchestrator > parallel/ saved. harness-contract.json created.
@orchestrator > Next: @dev (can work lanes in separate sessions).
```

> In **SMALL** projects, skip `@orchestrator` — no parallel lanes worth the overhead.

## Step 8 — `@dev` implements

```
You > @dev

@dev > Reading full plan. Starting with lane-backend (no dependencies).
@dev > [implements] Lane-backend done. dev-state.md updated.
@dev > Next: run @qa for this lane before moving to lane-ui.
```

> `@dev` is **resumable**. If the session drops midway, next session `@deyvin` reads `dev-state.md` and continues exactly where it left off. See [Continuity between sessions](./continuity-between-sessions.md).

## Step 9 — `@qa ↔ @dev` loop (autonomous, cap 2)

```
You > @qa

@qa > 18 ACs identified. Writing tests...
@qa > Failure on AC-12 (proration calculation).
        Iteration 1/2 — passing to @dev autonomously.
@dev > [fixes calculation, renames misleading variable]
@qa > Re-running... 18/18 OK.
@qa > test-plan.md and qa-report.md saved.
```

**Cap 2** means: the autonomous loop runs at most 2 iterations. If it still fails, `@qa` stops and calls you for human review — prevents infinite loops.

---

## Step 10 (optional) — `@tester` for systematic coverage

When to activate:
- You know the feature will have high load and want **more coverage** than just the PRD ACs.
- You suspect **edge cases** that `@qa` didn't cover (timezones, concurrency, locales).
- The project is legacy and the feature touches untested code.

```
You > @tester

@tester > Reading qa-report. Current coverage: 78%. Quality tier: MEDIUM.
@tester > Identified 3 zones with test smell:
        - Tests coupled to brittle fixtures (3 tests)
        - 2 tests only verify "no throw" (don't check behavior)
        - Missing proration coverage on edge dates (29th–31st of month)
@tester > Additional test plan saved to test-inventory.md.
@tester > Next: run @qa again to implement missing tests.
```

After `@tester`, **run `@qa` again** — the `@qa ↔ @dev` loop repeats on the new tests.

## Step 11 (optional) — `@pentester ↔ @dev` for security

When to activate:
- Feature touches sensitive data (payment, PII, auth).
- Going to production.
- There is a regulatory requirement.

```
You > @pentester

@pentester > Mapping attack surfaces (OWASP + supply chain + tooling).
@pentester > Findings:
        - HIGH: Stripe webhook without signature validation in dev mode
        - MEDIUM: /billing/portal route without rate-limit
        - LOW: log includes customer email in plaintext

@pentester > Iteration 1 — passing to @dev to fix.
@dev > [fixes signature validation, adds rate-limit, redacts log]
@pentester > Re-scan: HIGH=0, MEDIUM=0, LOW=1 (accepted as low risk).
@pentester > security-findings-billing-subscription.json saved.
```

## Step 12 — Final `@qa`, general review

After everything (tester and pentester), run `@qa` one more time:

```
You > @qa

@qa > General review post-pentester and post-tester.
@qa > 18 original ACs + 9 additional tests (from @tester) + 3 security
        regression tests (from @pentester). Total: 30 tests. All passing.
@qa > Verdict: feature ready. @validator recommended before closing.
```

Optional: run `@validator` to check the success contract, and `@committer` for the final commit.

---

## What was left on disk (full audit trail)

```
.aioson/context/
├── prd.md                             ← @product
├── sheldon-enrichment.md              ← @sheldon (multiple rounds)
├── architecture.md                    ← @analyst + @architect
├── design-doc.md                      ← @ux-ui
├── tasks.md                           ← @pm
├── parallel/
│   ├── lane-backend.md                ← @orchestrator
│   ├── lane-ui.md
│   └── lane-migration.md
├── dev-state.md                       ← @dev (updated each session)
├── test-plan.md                       ← @qa
├── qa-report-billing-subscription.md  ← @qa
├── test-inventory.md                  ← @tester
├── security-findings-billing-subscription.json ← @pentester
└── features/billing-subscription/
    ├── spec.md
    └── done/                          ← archived by feature:close

.aioson/plans/billing-subscription/
├── phase-1.md                         ← @sheldon (phased plan)
├── phase-2.md
├── harness-contract.json              ← success contract
└── progress.json                      ← current status
```

Six months from now, anyone (or any AI) reads these files and understands **everything**: what was planned, why, what was implemented, what was discarded.

---

## Trail variations

### MICRO (small scope)
`@product → @dev → @qa`. Skip `@sheldon`, `@analyst`, `@architect`, `@ux-ui`, `@pm`, `@orchestrator`. The Constitution Article II (*Right-Sized Process*) protects you from unnecessary ceremony.

### SMALL without UI
`@product → @sheldon → @analyst → @architect → @dev → @qa`. Skip `@ux-ui`, `@pm`, `@orchestrator`.

### Full MEDIUM
The complete trail above.

### When you are only implementing Lane 1 today
Go through `@orchestrator`, then invoke `@dev` only for `lane-backend.md`. Pause before `@qa`. Next session: `@deyvin` picks up on the pending lane.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `@sheldon` complains the PRD is vague | Go back to `@product` and refine. `@sheldon` does not invent what is not clear. |
| `@orchestrator` creates only 1 lane | Your feature is probably SMALL in disguise. Skip parallel lanes. |
| `@qa ↔ @dev` loop hit cap 2 | There is a design defect. Return to `@architect` or `@product` before writing more code. |
| `@pentester` HIGH finding won't clear | Don't force it. Document as accepted risk or defer the feature. |
| Session dropped mid-`@dev` | `@deyvin` picks up. See [Continuity between sessions](./continuity-between-sessions.md). |

---

## When NOT to use this trail

- **Isolated bug fix** — go straight to `@dev` (with bug ID reference) and `@qa`.
- **Refactor without behavior change** — use [Large refactor](./large-refactor.md).
- **MICRO feature without new business logic** — overhead not worth it.

---

## Next step

- [SDD: plans and structure](../5-reference/sdd-planos-e-estrutura.md) — deep dive into the structure `@pm` and `@orchestrator` create
- [From idea to PRD via @briefing](./from-idea-to-prd-via-briefing.md) — when the idea is still vague
- [External plans for @product](./external-plans-for-product.md) — when you already planned in another chat
- [Continuity between sessions](./continuity-between-sessions.md) — to resume the trail in another session
- [Ecosystem map](../1-understand/ecosystem-map.md) — view all agents
