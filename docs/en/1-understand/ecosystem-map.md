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
        │  Product → Sheldon → Analyst →       │
        │  Architect → UX-UI → PM →            │
        │  Orchestrator → Dev → QA →           │
        │  Validator → Tester → Pentester      │
        │                                      │
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

The default order depends on the classification:

**MICRO:** `@setup → @product (optional) → @dev`
**SMALL:** `@setup → @product → @sheldon (optional) → @analyst → @scope-check → @architect → @dev → @qa`
**MEDIUM:** `@setup → @product → @sheldon → @analyst → @architect → @ux-ui → @pm → @orchestrator → @scope-check → @dev → @qa`

> **Why does `@sheldon` appear so early?** It is the **PRD quality guardian** — it runs *between* `@product` and `@analyst` to detect gaps, validate technical assumptions with web research, and decide between enriching the PRD in-place or creating a phased plan in `.aioson/plans/{slug}/`. Can be invoked N times on the same PRD. Skipping this step on serious features is expensive later.

| Agent | What it does | Main output |
|---|---|---|
| **`@product`** | Defines vision, scope, feature PRD | `prd.md`, `spec.md` |
| **`@sheldon`** | PRD quality guardian — gap analysis, web research, sizing, decides in-place vs phased plan | `sheldon-enrichment-{slug}.md` or `.aioson/plans/{slug}/` |
| **`@analyst`** | Discovers domain, entities, flows in the codebase | `architecture.md`, ER diagrams |
| **`@architect`** | Technical decisions: structure, libs, integrations | `architecture.md` (decisions) |
| **`@ux-ui`** | Design system and component specs (MEDIUM) | `design-doc.md`, `discovery.md` |
| **`@pm`** | Backlog, user stories, ACs (MEDIUM) | `tasks.md`, user stories |
| **`@orchestrator`** | Coordinates parallel lanes (MEDIUM) | `parallel/`, execution plan |
| **`@dev`** | Implements the feature | Code + `dev-state.md` |
| **`@qa`** | Writes tests, validates ACs, autonomous fix cycle (cap 2) | `test-plan.md`, `qa-report-*.md` |
| **`@validator`** | Technically validates against `harness-contract.json` in a context sandbox | `.aioson/plans/{slug}/last-validator-output.json` (consumed by `harness:apply-validation`, updates `progress.json`) |
| **`@tester`** | Systematic test engineering (legacy/brownfield) | `test-inventory.md`, coverage tier |
| **`@pentester`** | Adversarial security review (OWASP, LLM Top 10) | `security-findings-*.json` |

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
| **`@discovery-design-doc`** | Discovery + design doc combined (joint mode) |

---

## How agents "talk"

They **don't talk to each other directly**. They talk **through disk artifacts**. This is the heart of the architecture.

```
┌─────────────┐  writes    ┌──────────────────┐  reads  ┌──────────────┐
│  @product   ├───────────▶│  spec.md         │◀────────┤  @architect  │
└─────────────┘            │  prd.md          │         └──────────────┘
                           └──────────────────┘
                                    │
                                    ▼ reads
                           ┌──────────────────┐  reads  ┌──────────────┐
                           │  @architect      │         │  @dev        │
                           │  writes →        ├────────▶│              │
                           │  architecture.md │         └──────┬───────┘
                           └──────────────────┘                │
                                                               ▼ writes
                                                      ┌──────────────────┐
                                                      │  dev-state.md    │
                                                      │  (code)          │
                                                      └────────┬─────────┘
                                                               │ reads
                                                               ▼
                                                      ┌──────────────┐
                                                      │  @qa         │
                                                      └──────────────┘
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
        ├── architecture.md         ← decisions from @analyst and @architect
        ├── prd.md                  ← output of @product
        ├── design-doc.md           ← output of @ux-ui
        ├── tasks.md                ← output of @pm
        ├── dev-state.md            ← output of @dev (current status)
        ├── test-plan.md            ← output of @qa
        ├── security-findings-*.json ← output of @pentester
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
> If you want a security review before QA: @pentester.
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
@product > [...several questions...] Spec created at context/features/checkout-stripe/spec.md.
@product > Next: @analyst to map the domain.

─── Session 2 (next day) ───
You > @neo
@neo > You stopped at @product. Next: @analyst.
You > @analyst
@analyst > [reads spec.md, examines codebase] Mapped: Order, Customer, Payment, OrderItem.
@analyst > Decision recorded in architecture.md. Next: @architect.

─── and so on until @qa ───
```

---

## Next step

- Ready to try it? → [First project from scratch](../2-start/first-project.md)
- Confused about a term? → [Glossary](./glossary.md)
- Curious about why all this? → [Why it exists](./why-it-exists.md)
