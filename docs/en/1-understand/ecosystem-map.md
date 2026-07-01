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
        │  MICRO:  Product → Dev → QA          │
        │  SMALL:  Product → Sheldon → Dev     │
        │          → QA                        │
        │  MEDIUM: Product → Orchestrator      │
        │          → Dev → Pentester → QA      │
        │                                      │
        │  Spec sub-agents (opt-in/fan-out):   │
        │  Analyst · Architect · PM · UX-UI    │
        │  Scope-Check · Discovery-Design-Doc  │
        │                                      │
        │  Post-dev (on demand):               │
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

The default lane depends on the classification:

**MICRO:** `@setup → @product → @dev → @qa`
**SMALL (lean — default):** `@setup → @product → @sheldon → @dev → @qa`
**MEDIUM (maestro):** `@setup → @product → @orchestrator → @dev → @pentester → @qa`

> **The spec authority changes by size.** For SMALL, `@sheldon` is the **single spec authority** — in one pass it produces requirements + spec (Gates A/B/C approved) + design-doc + readiness + implementation-plan + harness-contract. For MEDIUM, `@orchestrator` is the **maestro** — it fans out `@analyst`/`@architect`/`@pm` (+ `@ux-ui` for UI-heavy) as sub-agents, then consolidates and gates the full spec package. Agents like `@analyst`, `@architect`, `@pm`, `@ux-ui`, `@scope-check`, and `@discovery-design-doc` are **opt-in detours** or **fan-out sub-agents** — none deleted, none invoked by default in the new lanes.

| Agent | What it does | Main output |
|---|---|---|
| **`@product`** | Defines vision, scope, feature PRD | `prd.md`, `spec.md` |
| **`@sheldon`** | **SMALL single spec authority** — one pass: requirements + spec (Gates A/B/C) + design-doc + readiness + implementation-plan + harness-contract. Also a PRD-hardening / enrichment capability usable in any lane. | `requirements-{slug}.md`, `design-doc-{slug}.md`, `readiness-{slug}.md`, `implementation-plan.md`, `harness-contract.json` |
| **`@analyst`** | Domain discovery — entities, flows, brownfield mapping. **Opt-in detour / fan-out sub-agent** (invoked by `@orchestrator` in MEDIUM) | `architecture.md`, ER diagrams |
| **`@architect`** | Technical decisions: structure, libs, integrations. **Opt-in detour / fan-out sub-agent**; runs in **merged mode** (also produces design-doc + readiness) when `@discovery-design-doc` is omitted | `architecture.md` (decisions) |
| **`@ux-ui`** | UI/UX spec — **opt-in detour** for UI-heavy specs; `@dev` applies design skills directly | `design-doc.md`, `discovery.md` |
| **`@pm`** | Backlog, user stories, implementation plan (Gate C). **Opt-in detour / fan-out sub-agent** (MEDIUM) | `tasks.md`, user stories |
| **`@orchestrator`** | **MEDIUM maestro / single spec authority** — fans out `@analyst`/`@architect`/`@pm` (+ `@ux-ui` for UI-heavy) as sub-agents, consolidates the gated spec package. Secondary: coordinate parallel `@dev` lanes post-spec. | `parallel/`, execution plan, consolidated spec package |
| **`@dev`** | Implements the feature — runs phases as a **loop**: auto-continues between phases, compacts context between phases, per-phase verification (light sub-agent). Full Runtime smoke runs once at end-of-feature. | Code + `dev-state.md` |
| **`@qa`** | Writes tests, validates ACs, autonomous fix cycle (cap 3), hub of the post-dev autopilot review cycle. Owns Gate D: **Runtime smoke gate** (build + migrations on real DB + boot + Core happy-path on REAL stack). | `test-plan.md`, `qa-report-*.md` |
| **`@validator`** | Technically validates against `harness-contract.json` in a **fresh isolated context** (detour when a harness contract exists) | `.aioson/plans/{slug}/last-validator-output.json` |
| **`@tester`** | Systematic test engineering (legacy/brownfield) — triggered by `@qa` when conditions fire | `test-inventory.md`, coverage tier |
| **`@pentester`** | Adversarial security review (OWASP, LLM Top 10). Inline in MEDIUM; opt-in in SMALL. | `security-findings-*.json` |

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
| **`@discovery-design-doc`** | Discovery + design doc combined — opt-in; absorbed by `@architect` merged mode, `@sheldon`, or `@orchestrator` by default |

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
@product > Next: @sheldon to close the spec and produce the implementation package.

─── Session 2 (next day) ───
You > @neo
@neo > You stopped at @product. Next: @sheldon (single spec authority for SMALL).
You > @sheldon
@sheldon > Reading spec.md + codebase... Detected 2 gaps: no idempotency policy on Stripe webhook,
           no AC for payment failure retry. Researching Stripe docs...
@sheldon > Spec package ready: requirements, design-doc, readiness (Gate B), implementation-plan (2 phases),
           harness-contract.json. Gates A/B/C: approved. Next: @dev.

─── Session 3 ───
You > @dev
@dev > Reading implementation-plan.md. 2 phases.
       Phase 1/2: Stripe integration + webhook... harness:check OK. Compacting...
       Phase 2/2: UI checkout flow... harness:check OK. dev-state.md updated. Next: @qa.

You > @qa
@qa > 12 ACs. Tests written. 12/12 OK. Runtime smoke: PASS. Feature ready.
```

---

## Next step

- Ready to try it? → [First project from scratch](../2-start/first-project.md)
- Confused about a term? → [Glossary](./glossary.md)
- Curious about why all this? → [Why it exists](./why-it-exists.md)
