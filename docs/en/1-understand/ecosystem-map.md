# AIOSON Ecosystem Map

> **Who this is for:** anyone who wants to see the full team at once.
> **Reading time:** 8 min
> **What you'll know after:** who the 29 agents are, when each one enters, and how they communicate.

---

## High-level overview

```
                       ┌──────────────────┐
                       │   You + AI       │
                       │   client         │
                       └────────┬─────────┘
                                │
                ┌───────────────┼───────────────┐
                ▼               ▼               ▼
         ┌──────────┐    ┌──────────┐    ┌──────────┐
         │  Setup   │    │   Neo    │    │ Briefing │
         │  (boot)  │    │ (route)  │    │ (pre-PRD)│
         └────┬─────┘    └────┬─────┘    └────┬─────┘
              │               │               │
              └───────┬───────┴───────┬───────┘
                      │               │
                      ▼               ▼
        ┌──────────────────────────────────────┐
        │         DEVELOPMENT CORE             │
        │                                      │
        │  Product → optional Sheldon          │
        │          → Planner → Dev → QA        │
        │                                      │
        │  Explicit consultants:               │
        │  Analyst · Architect · PM · UX-UI    │
        │  Scope-Check · Discovery-Design-Doc  │
        │                                      │
        │  Opt-in reviewers:                   │
        │  Validator · Tester · Pentester      │
        └──────────────────────────────────────┘
                      │
                      ▼
        ┌──────────────────────────────────────┐
        │        CONTINUITY & DELIVERY         │
        │                                      │
        │  Deyvin (pair) · Committer (git)     │
        │  Discover (semantic cache)           │
        │                                      │
        └──────────────────────────────────────┘
                      │
                      ▼
        ┌──────────────────────────────────────┐
        │           SPECIALIZATIONS            │
        │                                      │
        │  Squad · Genome · Profiler trio ·    │
        │  Site-Forge · Design-Hybrid-Forge ·  │
        │  Orache · Copywriter                 │
        │                                      │
        └──────────────────────────────────────┘
```

---

## Agents grouped by role

### 1. Boot and routing

| Agent | What it does | When to invoke |
|---|---|---|
| **`@setup`** | Project onboarding: detects stack, classifies MICRO/SMALL/MEDIUM, writes `project.context.md` | Always first on a new project |
| **`@neo`** | Reads state and suggests the next agent | When you don't know what to do next |
| **`@briefing`** | Turns plans/loose notes into a pre-PRD briefing | You have ideas but no feature yet |

### 2. Development core (official workflow)

After one-time setup, every tracked feature uses:

`optional @briefing → optional @briefing-refiner → @product → optional @sheldon → @planner → @dev → @qa`

> **The authorities stay stable at every classification.** Product owns one PRD, Planner owns one implementation plan, DEV owns implementation and final integration, and QA owns one final verdict. MICRO, SMALL, and MEDIUM change depth, risk coverage, and work budget—not the stage chain. Other specialists are explicitly requested consultants or reviewers.

| Agent | What it does | Main output |
|---|---|---|
| **`@product`** | Defines vision, scope, capabilities, exclusions, and ACs | `prd-{slug}.md` |
| **`@sheldon`** | Optional critical PRD enrichment; updates the same Product-owned PRD | enriched `prd-{slug}.md` |
| **`@planner`** | Converts the approved PRD into one vertical executable plan | `implementation-plan-{slug}.md` |
| **`@analyst`** | Explicit consultant for domain discovery and brownfield mapping | findings applied to PRD/plan |
| **`@architect`** | Explicit consultant for a named technical boundary or decision | decision evidence applied to PRD/plan |
| **`@ux-ui`** | Explicit consultant for interaction or visual-design decisions | design evidence |
| **`@pm`** | Explicit consultant for backlog and user-story questions | backlog evidence |
| **`@orchestrator`** | Opt-in coordination specialist; not a default workflow stage | coordination evidence |
| **`@dev`** | Implements the plan, optionally dispatches configured development lanes, and owns final integration | code + `dev-state.md` |
| **`@qa`** | Runs a proportional, bounded final review and records PASS/FAIL | `qa-report-{slug}.md` |
| **`@validator`** | Opt-in binary contract verification in a fresh context | validator evidence |
| **`@tester`** | Opt-in systematic test engineering for legacy/brownfield coverage | `test-inventory.md`, coverage tier |
| **`@pentester`** | Opt-in adversarial security review | `security-findings-*.json` |

### 3. Continuity and delivery

| Agent | What it does | When to invoke |
|---|---|---|
| **`@deyvin`** (alias `@pair`) | Continuity-first pair programming — recovers state with `confirmed/inferred`, works in small validated batches, automatic scope gate (refuses greenfield and hands back to `@product`) | Resuming a feature after a crash, debugging a small slice, pairing on a known task |
| **`@committer`** | Generates professional commit messages | Before committing |
| **`@discover`** | Builds a semantic cache of the project: produces `bootstrap/` (structured by artifact type, for agents to read) **and** `brains/` (Zettelkasten for cross-reference) | Fast onboarding on a large codebase |

### 4. Specializations

| Agent | What it does |
|---|---|
| **`@squad`** | Creates/manages custom squads (`refresh`, `agent-create`) |
| **`@genome`** | Creates and applies genomes (cognitive DNA of personas) |
| **`@profiler-researcher`** | Collects raw material about a public figure |
| **`@profiler-enricher`** | Analyzes the material cognitively |
| **`@profiler-forge`** | Generates Genome 4.0 + advisor |
| **`@site-forge`** | Clones, rebuilds, or extracts design from any URL |
| **`@design-hybrid-forge`** | Combines two design skills into a hybrid |
| **`@orache`** | Domain investigation and strategic research |
| **`@copywriter`** | Conversion copy for landing pages, emails |
| **`@discovery-design-doc`** | Explicit standalone discovery/design consultation; findings enrich canonical artifacts |

---

## How agents "talk"

They **don't talk to each other directly**. They talk **through disk artifacts**. This is the heart of the architecture.

```
┌─────────────┐ writes ┌────────────────┐ reads ┌─────────────┐
│  @product   ├───────▶│ prd-{slug}.md  ├──────▶│  @planner   │
└─────────────┘        └────────────────┘       └──────┬──────┘
                                                     │ writes
                                                     ▼
                                      ┌───────────────────────────────┐
                                      │ implementation-plan-{slug}.md │
                                      └──────────────┬────────────────┘
                                                     │ reads
                                                     ▼
                                              ┌─────────────┐
                                              │    @dev     │
                                              └──────┬──────┘
                                                     │ code + evidence
                                                     ▼
                                              ┌─────────────┐
                                              │     @qa     │
                                              └─────────────┘
```

**Advantage:** if a session drops, the next agent only needs to read the artifacts. No conversational memory is lost.

---

## Where artifacts live

```
your-project/
└── .aioson/
    └── context/
        ├── project.context.md      ← global context (created by @setup)
        ├── project-pulse.md        ← live state, updated each session
        ├── prd-{slug}.md           ← single Product-owned authority
        ├── implementation-plan-{slug}.md ← single Planner-owned plan
        ├── dev-state.md            ← output of @dev (current status)
        ├── qa-report-{slug}.md     ← single QA verdict
        ├── security-findings-*.json ← optional @pentester evidence
        ├── handoff-protocol.json   ← last handoff between agents
        ├── features/<slug>/        ← features in development
        ├── done/                   ← archived features (after feature:close)
        └── dossier/<slug>/         ← feature dossier (Phase 1+ of continuity)
```

---

## "I don't know which agent to use"

Use `@neo`. It's literally the "I'm lost" agent.

```
You in Claude Code:
> @neo

@neo:
> Reading project-pulse.md... you're on the "my-store" project, SMALL classification,
  with the "checkout-stripe" feature in progress. @dev finished yesterday.
> Natural next step: @qa to write tests for the feature.
> If you explicitly want extra security coverage: enable and run @pentester.
> If you want to pair first: @deyvin.
```

---

## Real dialogue — full SMALL cycle

```
─── Session 1 ───
You > @setup
@setup > Detected Node.js + Express + Postgres. Project type? [api/web_app/site/...]
You > web_app
@setup > How many user types? How many external integrations?
You > 2 / 3
@setup > Classified as SMALL. Interaction language? [en/pt-BR/es/fr]
You > en
@setup > project.context.md created. Next: @product.

─── Session 1 (continued) ───
You > @product
@product > Let's start a feature. What's it called? What's the problem?
You > "checkout-stripe", complete order with card payment.
@product > [...several questions...] PRD created at context/prd-checkout-stripe.md.
@product > Next: optional @sheldon enrichment, or @planner if the PRD is ready.

─── Session 2 (next day) ───
You > @neo
@neo > You stopped at @product. The PRD has two material gaps; optional @sheldon is useful.
You > @sheldon
@sheldon > Reading the PRD + codebase... Detected 2 gaps: no idempotency policy on Stripe webhook,
           no AC for payment failure retry. Researching Stripe docs...
@sheldon > PRD enriched in place. Next: @planner.

You > @planner
@planner > implementation-plan-checkout-stripe.md approved with 2 vertical stages. Next: @dev.

─── Session 3 ───
You > @dev
@dev > Reading the PRD and implementation plan. 2 stages.
       Stage 1/2: Stripe integration + webhook... focused checks OK.
       Stage 2/2: UI checkout flow... integrated checks OK. dev-state.md updated. Next: @qa.

You > @qa
@qa > 12 ACs. Focused regression and production-path smoke pass.
      qa-report-checkout-stripe.md: PASS.
```

---

## Next step

- Ready to try it? → [First project from scratch](../2-start/first-project.md)
- Confused about a term? → [Glossary](./glossary.md)
- Curious about why all this? → [Why it exists](./why-it-exists.md)
