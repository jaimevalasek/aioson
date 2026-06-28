# Recipe: Full feature with `@sheldon` (canonical SMALL trail)

> **Who this is for:** SMALL features where wrong early decisions are costly.
> **Time to run:** 1–4 hours, spread across 1–2 sessions.
> **What you'll have at the end:** a feature implemented, tested, and reviewed — spec + code + tests traceable on disk.
> **Status:** this is the DEFAULT lean lane for SMALL projects (v1.35.0+).

---

## The trail in one line

```
@product → @sheldon → @dev → @qa
```

`@sheldon` is the **single spec authority** for SMALL: in one pass it produces requirements + spec (Gates A/B/C approved) + design-doc + readiness + implementation-plan + harness-contract, then hands directly to `@dev`.

> **MEDIUM?** Use the maestro variant: `@product → @orchestrator → @dev → @pentester → @qa` — `@orchestrator` fans out `@analyst`/`@architect`/`@pm` (+ `@ux-ui` for UI-heavy) as sub-agents, consolidates the gated spec package, then hands to `@dev`. See [MEDIUM maestro variant](#medium-maestro-variant).

**Why order matters:** each agent reads the artifacts left by the previous one. Skipping the spec authority means `@dev` improvises — improvisation on big decisions becomes rework.

---

## Scenario

You are building a meaningful SMALL feature — typical examples: **subscription billing with Stripe**, **seller dashboard in a marketplace**, **order cancellation with time-window rules**. Something that mixes backend + business rules + optional UI.

If the feature is truly trivial (simple CRUD, no business logic), skip this trail — go straight to `@product → @dev → @qa` (MICRO). This trail is a cannon; don't use it to shoot sparrows.

## Prerequisites

- Project with `aioson init/install` already run
- `project.context.md` populated (`@setup` already done)
- Classification **SMALL**
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
@product > Next: @sheldon to close the spec and produce the implementation package.
```

**What was left on disk:** `prd.md` with clear sections (problem, scope, ACs, out-of-scope).

> **Variation:** if you already have material in `/plans/` or an approved briefing, `@product` detects it and offers to use it as a base. See [External plans for @product](./external-plans-for-product.md) and [From idea to PRD via @briefing](./from-idea-to-prd-via-briefing.md).

---

## Step 2 — `@sheldon` closes the spec (single spec authority)

This is the step that replaces the old multi-hop chain (`@analyst → @scope-check → @architect → ...`). `@sheldon` does it all in one pass.

```
You > @sheldon

@sheldon > Reading prd.md... scanning architecture.md, dependencies, plans/.
@sheldon > Detected 4 gaps:
        1. PRD does not cover plan downgrade (only upgrade)
        2. No decision on proportional billing (proration)
        3. Stripe webhook has no retry/idempotency policy
        4. No ACs for billing failure after 3 attempts (dunning)

@sheldon > Do you have external sources? [URL, local file, "no"]
You > docs.stripe.com/billing/subscriptions/upgrade-downgrade

@sheldon > [researches, reads, cites]
@sheldon > Closing spec — producing single-spec-authority package:
        ✓ requirements-billing-subscription.md (gaps resolved, ACs hardened)
        ✓ design-doc-billing-subscription.md (technical structure + reuse decisions)
        ✓ readiness-billing-subscription.md (Gate B: ready_with_warnings → cleared)
        ✓ implementation-plan.md (3 phases, file-disjoint waves)
        ✓ harness-contract.json (RG-smoke criteria + verification commands)

@sheldon > Gates A/B/C: approved.
@sheldon > Next: @dev — implementation-plan.md is the input.
```

**What `@sheldon` produces in one pass:**
- Closes all PRD gaps (with web research when needed)
- Creates the design-doc + readiness verdict (Gate B)
- Writes the phased implementation-plan
- Authors the harness-contract with binary success criteria + `verification` commands
- Signs off Gates A/B/C before handing to `@dev`

**Can run multiple times:** if the first pass left gaps, invoke `@sheldon` again. It detects existing artifacts and offers a new round without starting over.

> **When NOT to run `@sheldon`:** trivial features (basic CRUD) or MICRO. The spec effort does not pay off.

---

## Step 3 — `@dev` implements (phase loop)

```
You > @dev

@dev > Reading implementation-plan.md. 3 phases detected. Starting Phase 1.

── Phase 1/3: DB migrations + webhook handler ──
@dev > [implements]
@dev > aioson harness:check → OK. Verification sub-agent: pass.
@dev > Compacting context for Phase 2...

── Phase 2/3: billing routes + dunning cron ──
@dev > [implements]
@dev > aioson harness:check → OK. Verification sub-agent: pass.
@dev > Compacting context for Phase 3...

── Phase 3/3: UI components ──
@dev > [implements]
@dev > aioson harness:check → OK.
@dev > dev-state.md updated. All phases complete. Next: @qa.
```

**The `@dev` phase loop:**
- Implements phase-by-phase, **auto-continues between phases** (no "continue?" prompts)
- Runs `aioson harness:check` after each phase (deterministic exit-code check)
- Runs a light per-phase verification sub-agent; fixes in-phase if needed
- Compacts context between phases to maintain a clean context window
- The expensive full **Runtime smoke** runs **once at end-of-feature** (inside `@qa`), never per phase

> `@dev` is **resumable**. If the session drops midway, next session `@deyvin` reads `dev-state.md` and continues exactly where it left off. See [Continuity between sessions](./continuity-between-sessions.md).

---

## Step 4 — `@qa` + Runtime smoke gate

```
You > @qa

@qa > 18 ACs identified. Writing tests...
@qa > Failure on AC-12 (proration calculation).
        Iteration 1/2 — passing to @dev autonomously.
@dev > [fixes calculation, renames misleading variable]
@qa > Re-running... 18/18 OK.
@qa > Runtime smoke gate: build + migrations (applied to real DB) + boot + Core happy-path...
@qa > Runtime smoke: PASS.
@qa > test-plan.md and qa-report.md saved. Feature ready.
```

**`@qa` owns Gate D:** the feature does NOT close until the Runtime smoke gate passes — build + migrations applied to a real DB + boot + Core happy-path on the REAL stack. Passing unit tests + `tsc` is the floor, not "done."

**Cap 2 autonomous loop:** `@qa ↔ @dev` runs at most 2 iterations automatically. If it still fails, `@qa` stops and calls you for human review — prevents infinite loops.

---

## Optional steps — security and coverage

### Optional: `@pentester ↔ @dev` for security-sensitive features

When to activate:
- Feature touches sensitive data (payment, PII, auth)
- Going to production
- There is a regulatory requirement

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

> **Note:** in MEDIUM, `@pentester` is inline (not optional — it runs between `@dev` and `@qa`).

### Optional: `@tester` for systematic coverage

When to activate:
- High-load feature needing coverage beyond PRD ACs
- Suspected edge cases (timezones, concurrency, locales)
- Legacy code touched by the feature

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

### Optional: `@validator` — contract verification in fresh context

When to activate: a `harness-contract.json` exists and you want a binary verdict before closing.

```
You > @validator

@validator > Running harness:check first... 18/18 criteria pass.
@validator > LLM-judging non-executable criteria (2 criteria)...
@validator > Verdict: all criteria met. Feature ready for feature:close.
```

`@validator` always runs in a **fresh, isolated context** — never inline in the implementing session.

---

## Opt-in detours — when to add more spec agents

The SMALL lean trail (`@product → @sheldon → @dev → @qa`) is the default. The agents below are **NOT default hops** — none are deleted; invoke them explicitly when the need arises, or use the MEDIUM trail which fans them out automatically.

| Agent | When to invoke explicitly |
|---|---|
| **`@analyst`** | Deep brownfield domain mapping, complex entity relationships |
| **`@architect`** | Sensitive technical decision requiring a dedicated review (microservices boundary, library choice) |
| **`@pm`** | Large feature needing formal user stories + backlog management |
| **`@ux-ui`** | UI-heavy feature needing a formal design system spec before `@dev` |
| **`@discovery-design-doc`** | Exploratory mode (vague idea → clarity checkpoint); or an explicit pre-dev design contract |
| **`@scope-check`** | Explicit drift audit (intent vs plan vs diff) — `spec:analyze` also runs automatically at the `@dev`/`@qa` done gate |

---

## MEDIUM maestro variant

**Trail:** `@product → @orchestrator → @dev → @pentester → @qa`

`@orchestrator` is the **single spec authority** for MEDIUM (horizontal / fan-out): it spawns `@analyst` + `@architect` + `@pm` (+ `@ux-ui` when UI-heavy) as sub-agents, then **consolidates / verifies / redoes** their output into one gated spec package, then hands to `@dev`. Optionally `@sheldon` hardens the PRD as a pre-step.

```
You > @orchestrator

@orchestrator > Starting MEDIUM spec phase. Fanning out sub-agents...
        [spawns @analyst → maps domain: Subscription, Plan, Invoice, PaymentMethod]
        [spawns @architect → structures modules: webhook handler, dunning cron, migrations]
        [spawns @pm → implementation plan + user stories]
@orchestrator > Consolidating output... verifying cross-agent consistency...
@orchestrator > Gated spec package ready:
        - requirements.md (consolidated + ACs hardened)
        - architecture.md (decisions)
        - tasks.md (user stories + implementation plan)
        - harness-contract.json (RG-smoke criteria + verifications)
@orchestrator > Gates A/B/C: approved. Next: @dev.
```

After `@orchestrator`, `@dev` runs the same phase loop as SMALL. `@pentester` then runs inline (not optional in MEDIUM), and `@qa` closes with the Runtime smoke gate.

---

## What was left on disk (SMALL audit trail)

```
.aioson/context/
├── prd.md                               ← @product
├── requirements-billing-subscription.md ← @sheldon (closed gaps, ACs)
├── design-doc-billing-subscription.md   ← @sheldon (technical structure)
├── readiness-billing-subscription.md    ← @sheldon (Gate B)
├── implementation-plan.md               ← @sheldon (phases + waves)
├── dev-state.md                         ← @dev (phase log, updated each session)
├── test-plan.md                         ← @qa
├── qa-report-billing-subscription.md    ← @qa
├── test-inventory.md                    ← @tester (optional)
├── security-findings-billing-subscription.json ← @pentester (optional)
└── features/billing-subscription/
    ├── spec.md
    └── done/                            ← archived by feature:close

.aioson/plans/billing-subscription/
├── harness-contract.json                ← @sheldon (success contract)
└── progress.json                        ← current status
```

Six months from now, anyone (or any AI) reads these files and understands **everything**: what was planned, why, what was implemented, what was discarded.

---

## Trail variations

### MICRO (no spec phase)
`@product → @dev → @qa`. Skip everything else. The Constitution's Article II (*Right-Sized Process*) protects you from unnecessary ceremony.

### SMALL lean (this trail — default)
`@product → @sheldon → @dev → @qa`. `@sheldon` is the single spec authority. Add opt-in detours (`@analyst`, `@architect`, `@ux-ui`, etc.) when explicitly needed.

### MEDIUM maestro
`@product → @orchestrator → @dev → @pentester → @qa`. `@orchestrator` fans out `@analyst`/`@architect`/`@pm`/`@ux-ui` as sub-agents automatically. `@pentester` is inline (not opt-in).

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `@sheldon` complains the PRD is vague | Go back to `@product` and refine. `@sheldon` does not invent what is not clear. |
| `@dev` phase loop stalls mid-phase | `@deyvin` picks up via `dev-state.md`. See [Continuity between sessions](./continuity-between-sessions.md). |
| `@qa ↔ @dev` loop hit cap 2 | There is a design defect. Return to `@sheldon` or `@product` before writing more code. |
| `@pentester` HIGH finding won't clear | Don't force it. Document as accepted risk or defer the feature. |
| `@orchestrator` creates only 1 lane | Your feature is probably SMALL in disguise. Use the `@sheldon` trail instead. |
| Session dropped mid-`@dev` | `@deyvin` picks up. See [Continuity between sessions](./continuity-between-sessions.md). |

---

## When NOT to use this trail

- **Isolated bug fix** — go straight to `@dev` (with bug ID reference) and `@qa`.
- **Refactor without behavior change** — use [Large refactor](./large-refactor.md).
- **MICRO feature without new business logic** — overhead not worth it.

---

## Next step

- [From idea to PRD via @briefing](./from-idea-to-prd-via-briefing.md) — when the idea is still vague
- [Continuity between sessions](./continuity-between-sessions.md) — to resume the trail in another session
- [Ecosystem map](../1-understand/ecosystem-map.md) — view all agents
