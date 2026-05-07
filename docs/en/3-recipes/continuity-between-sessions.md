# Recipe: Continuity between sessions

> **Who this is for:** any developer working on long features spread across multiple sessions — who doesn't want to start over every time they open the project.
> **Time to run:** 10 min of setup the first time; nearly zero in subsequent sessions.
> **What you'll have at the end:** every feature with a dossier on disk — spec, plan, decisions, touched code, status — that any agent reads and resumes without needing to re-read chat history.

---

## Scenario

You were implementing the Stripe checkout feature. You spent three hours with `@dev`, reached 80%, and the Claude Code session ended. The next day you open the project and ask the AI: "where did we leave off?" The AI doesn't know. It only has recent history, and yesterday's context was compacted.

This is the **prompt-monolith problem**: all memory lives in the conversation, which is temporary.

The **Feature Dossier** (agent-chain continuity system, implemented in 8 phases between Mar–May 2026) solves this. Each feature has a folder with persistent artifacts. When you resume, `@deyvin` reads the dossier and continues where it left off — without interviewing you about what was already done.

---

## Prerequisites

- AIOSON installed in the project
- A feature in progress (or about to start)
- Claude Code open in the project

---

## How a dossier is created

The dossier is initialized automatically when you start a feature via the normal workflow (`@product` → `@analyst` → `@dev`). You can also create it manually:

```bash
npx @jaimevalasek/aioson dossier:init --slug=checkout-stripe
```

```
Dossier initialized at:
.aioson/context/features/checkout-stripe/
├── dossier.md          ← main document (spec, plan, decisions, trail)
├── codemap/            ← map of files touched by the feature
└── research/           ← index of research done during the feature
```

---

## Anatomy of the dossier

```
.aioson/context/features/checkout-stripe/dossier.md
```

The file has standardized sections:

```
## Meta
slug: checkout-stripe
status: in_progress
classification: SMALL
agents_trail: [@product, @analyst, @architect, @dev]
last_agent: @dev
last_updated: 2026-05-06T14:32:00Z

## Spec Summary
[spec summary — what the feature solves, main ACs]

## Plan
[implementation plan steps with checkboxes]
- [x] Database schema (payments table)
- [x] POST /checkout/create-session route
- [ ] Webhook handler /webhooks/stripe
- [ ] Confirmation page

## Decisions
[decisions made during the feature with rationale]
- Using Stripe Checkout (not Elements) — lower PCI complexity
- Webhook verified with stripe.webhooks.constructEvent

## Code Map
[files that belong to this feature]
- src/routes/checkout.js       (created)
- src/services/stripe.js       (created)
- src/db/migrations/005_payments.js (created)
- src/routes/webhooks.js       (pending)
- app/pages/checkout/success.tsx (pending)

## Agent Trail
[what each agent did]
@product: spec created on 2026-05-05
@analyst: Payment, Order mapped
@architect: Stripe Checkout chosen, structure defined
@dev: 3/5 plan steps completed
```

---

## Resuming a feature — real flow

### New session, agent `@deyvin`

```
You > @deyvin

@deyvin > Reading project-pulse.md... feature checkout-stripe in progress.
           Reading dossier.md...

@deyvin > Here is where you left off:

           FEATURE: checkout-stripe
           Status: in_progress (80%)
           Last agent: @dev

           DONE:
           ✓ Payments schema (migration 005)
           ✓ POST /checkout/create-session
           ✓ Stripe Checkout integration

           PENDING:
           ✗ Webhook handler /webhooks/stripe
           ✗ Confirmation page /checkout/success

           RECORDED DECISIONS:
           - Stripe Checkout (not Elements)
           - Webhook verification with constructEvent

           Do you want to continue implementing the 2 pending steps?
You > Yes, start with the webhook.

@deyvin > [implements src/routes/webhooks.js]
           Webhook handler created. Testing with stripe-cli...
           Event payment_intent.succeeded received ✓
           Dossier updated: webhooks marked as done.
```

---

## Detecting drift

The dossier has **drift detection**: if the code changed since the last agent update, it detects the divergence before continuing.

```
@deyvin > Checking for drift...
           File: src/services/stripe.js
           Last known version: created by @dev on 2026-05-05
           Current state: modified outside the agent (1 function added)

           Drift detected. Before continuing, I'll read what changed...
           [reads diff]
           Change: handleRefund() function added manually.
           I'll include this in the codemap and continue.
```

---

## Adding research to the dossier

When you (or an agent) research something important for the feature, add it to the research index:

```bash
npx @jaimevalasek/aioson dossier:add-research . \
  --slug=checkout-stripe \
  --url="https://stripe.com/docs/webhooks" \
  --summary="Stripe requires signature verification on all webhooks. Use constructEvent." \
  --agent=dev
```

This lands in `research/` and future agents find it without having to re-read the documentation.

---

## Auditing the dossier

To verify the dossier is consistent with the actual code state:

```bash
npx @jaimevalasek/aioson dossier:audit --slug=checkout-stripe
```

```
Auditing checkout-stripe...

✓ All codemap files exist
✓ Migration 005 applied (verified via introspection)
✗ src/routes/webhooks.js listed as pending but file exists on disk

  Possible inconsistency: file created but dossier not updated.
  Recommendation: run @deyvin to sync the status.
```

---

## View current dossier state

```bash
npx @jaimevalasek/aioson dossier:show --slug=checkout-stripe
```

```
FEATURE: checkout-stripe
Status: in_progress
Agents: @product, @analyst, @architect, @dev, @deyvin
Progress: 4/5 steps done (80%)
Files: 5 (3 created, 2 pending)
Research: 1 (stripe webhooks)
Last updated: 2026-05-07 10:15
```

---

## `dev-state.md` — the dossier's complement

Beyond the dossier, `@dev` maintains `.aioson/context/dev-state.md` — a more granular snapshot of the implementation state:

```
## Dev State — checkout-stripe

### Done
- src/routes/checkout.js: POST /checkout/create-session → Stripe Checkout
- src/services/stripe.js: createCheckoutSession, handleRefund
- src/db/migrations/005_payments.js: payments table with Stripe fields

### In progress
- src/routes/webhooks.js: partial handler, missing payment_intent.payment_failed

### Blocked
- (none)

### Next steps
1. Complete webhook handler (payment_failed case)
2. Create /checkout/success page with session_id query param
3. Activate @qa to validate ACs
```

---

## What happens when the feature is closed

When you run `aioson feature:close --slug=checkout-stripe`, the dossier is moved to `.aioson/context/done/`. The feature archive stores:

```
.aioson/context/done/
└── checkout-stripe/
    ├── dossier.md        ← final state
    ├── codemap/          ← all touched files
    └── research/         ← accumulated research
```

This creates an auditable history of all features — useful for onboarding new devs or for `@neo` to understand the project's history.

---

## What was left on disk (audit trail)

```
.aioson/context/features/checkout-stripe/
├── dossier.md           ← central document (spec, plan, decisions, trail)
├── codemap/
│   └── files.json       ← files, status (created/modified/pending), agent
└── research/
    └── index.md         ← research indexed with summaries

.aioson/context/
├── dev-state.md         ← granular implementation state
└── project-pulse.md     ← global project state (active feature, next step)
```

---

## When NOT to use the dossier

- Feature you finish in one 1-hour session — unnecessary overhead.
- MICRO project with a single feature — `project.context.md` and `dev-state.md` are enough.
- Quick code exploration — use `@deyvin` directly without initializing a dossier.

For SMALL and MEDIUM projects, the dossier is strongly recommended. MEDIUM projects with `@orchestrator` use it by default.

---

## Variations

| Situation | Adjustment |
|---|---|
| Multiple parallel features | One dossier per feature slug. `project-pulse.md` shows which is active. |
| Team with multiple devs | Commit the dossiers to Git. Each dev sees the state of all features. |
| Feature resumed by a different agent | Any agent reads the dossier. The agent trail is recorded. |
| Session dropped without saving `dev-state.md` | `@deyvin` uses the dossier + git diff to reconstruct the state. |

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `@deyvin` didn't find the dossier | Run `dossier:show --slug=X` to confirm it exists. If not, `dossier:init`. |
| Dossier is out of sync with the code | `dossier:audit` detects inconsistencies and guides correction. |
| `dev-state.md` was overwritten | Git has the history. The dossier has the agent trail. |
| Drift detection fired incorrectly | Tell `@deyvin`: "the file was modified intentionally, update the codemap". |

---

## Next step

- Want to start with this flow on a legacy project? → [Integration in large codebase](./integration-in-large-codebase.md)
- Want to understand what else the dossier tracks? See the [Glossary — Dossier](../1-understand/glossary.md).
- Want the full artifact map? → [Ecosystem map](../1-understand/ecosystem-map.md).
