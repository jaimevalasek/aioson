# Initial decisions — MICRO, SMALL, or MEDIUM? Which AI client?

> **Who this is for:** you're about to run `aioson init` and want to choose well.
> **Reading time:** 6 min
> **What you'll know after:** how AIOSON classifies your project, and how to choose AI client / design / language.

---

## The classification: MICRO, SMALL, MEDIUM

AIOSON is the opposite of "one size fits all." It applies **more depth and evidence to riskier work and less to smaller work**. This is Article II of the Constitution: *Right-Sized Process*.

### How the score is calculated

The sum of three factors (each worth 0, 1, or 2 points):

| Factor | 0 pts | 1 pt | 2 pts |
|---|---|---|---|
| **User types** | 1 | 2 | 3+ |
| **External integrations** | 0 | 1–2 | 3+ |
| **Non-obvious business rules** | none | some | complex |

| Score | Classification |
|---|---|
| 0–1 | **MICRO** |
| 2–3 | **SMALL** |
| 4–6 | **MEDIUM** |

### What changes at each level

After one-time setup, every tracked feature uses the same stage chain:

```text
optional @briefing → optional @refiner → @product
→ @sheldon → @planner → @dev → @qa
```

Classification changes the detail of the PRD and plan, the implementation budget, and the risk-proportional QA review. It does not insert Orchestrator, Pentester, or other specialists into the default route.

#### MICRO — the lightest version of the canonical chain

- For: bounded features in scripts, automations, prototypes, and simple personal apps.
- One concise PRD, one concise implementation plan, and one focused QA verdict.
- `@sheldon` is normally unnecessary unless a small product ambiguity benefits from enrichment.
- QA checks changed acceptance criteria, focused tests, and one production-path smoke.

**Typical examples:**
- Python script that processes CSV
- Simple Telegram bot
- Static portfolio page
- Mini API with 3 endpoints

#### SMALL — the normal version of the canonical chain

- For: most real apps.
- `@product` owns the PRD; `@sheldon` may enrich that same PRD in place.
- `@planner` owns the single vertical implementation plan.
- `@dev` implements and integrates the plan; `@qa` reviews all feature ACs, focused regression, and a production-path smoke.
- Domain rules and interaction decisions live in the PRD, architecture decisions and code mapping in the plan, and scope drift is checked by `@qa` — there are no separate consultant stages.

**Typical examples:**
- SaaS app for a single persona
- API with auth and some business rules
- Simple online store
- Blog with admin panel

#### MEDIUM — the deepest version of the canonical chain

- For: products with multiple user types, several integrations, complex rules.
- The stage chain stays Product → Sheldon → Planner → DEV → QA.
- The PRD and plan carry deeper integration, negative-path, operational, and security evidence for named risks.
- DEV may use explicitly configured development lanes, then remains responsible for final integration.
- Tester, Pentester, and Validator remain disabled by default and run only when explicitly enabled and triggered.
- More aggressive context threshold (55% — warns early).

**Typical examples:**
- Marketplace (seller + buyer + admin)
- ERP / CRM
- Multi-tenant platform with tier billing
- Fintech app with KYC and compliance

### Edge cases

| Situation | Suggestion |
|---|---|
| Personal project, but with one heavy external integration | SMALL — `@planner` records the boundary decision in the plan's Architecture Decisions |
| Score 1, but I know it will grow | Start MICRO. Can promote later with `@setup` |
| Score 4, but the team is just me | MEDIUM anyway. Complex rules benefit from deeper PRD, plan, and QA evidence |
| Score 2, but greenfield and I want careful design | SMALL + provide reference images for `interface-design` up front |

> **Frequently forgotten truth:** AIOSON fights unnecessary ceremony. If you're unsure between two levels, **choose the smaller one**. Promoting later is easy. Demoting later is painful.

---

## Choosing an AI client

You can mark **more than one** in the wizard — they coexist in the same project.

| Client | Strong for... | Distinctive features |
|---|---|---|
| **Claude Code** | Long agents, refactoring, planned tasks | Native skills, slash commands, hooks |
| **Codex CLI** | Short tasks, focus on direct code | `@` mode to include files |
| | Multi-modal, low cost on some plans | Generous context window |
| **OpenCode** | Open-source, integrates with multiple providers | Granular configuration |

**Recommendation for beginners:** start with Claude Code — it has the highest parity with AIOSON. Add others later with `aioson install --reconfigure`.

---

## Choosing Mode: Development vs Development + Squads

### Development (default)

Includes the 29 official agents (product, planner, dev, qa, etc.). Sufficient for 95% of projects.

### Development + Squads

Adds the squad system — you can create custom squads for domains outside the standard.

**Practical example:** your project is legal. You create a "compliance" squad with agents:
- `@regulator` — understands local regulation
- `@attorney` — interprets clauses
- `@auditor` — checks conformity

```bash
# Inside the AI client
> @squad scaffold compliance

# Or via CLI
npx @jaimevalasek/aioson squad:scaffold . --slug=compliance --name="Compliance" --mode=mixed
```

**When to activate Squads:**
- You know you'll need specialization outside the standard
- Large team with different domains
- You'll publish squads on aioson.com (see `system:publish`)

**When NOT to activate:**
- MICRO personal project
- You haven't used the standard agents enough yet to know if you need it

> Can be activated later with `aioson install --reconfigure`.

---

## Choosing a Design System

> **The route: `interface-design` + your own reference images.** The template ships exactly one design skill — the `interface-design` engine. Instead of inheriting a fixed preset's identical look, you provide reference images (identity/brand and, optionally, component structure); the `reference-identity-extract` skill converts them **once** into a text `identity.md` that the engine applies to everything downstream (prototype and build). There is no question to answer: `design_skill: "interface-design"` is written into `project.context.md` from the start and no agent asks you to choose or confirm a design skill — only a skill this project forged (`@site-forge` or `@design-hybrid-forge`) replaces the engine, when you name it. Reference images are optional: with none, the engine still runs, deciding on its own (origin mode).

**Skipping** the images is a valid option. You can:
- Provide them later with `@setup`/`@refiner` — same route, always with explicit confirmation
- Clone a real site's design with `@site-forge`
- Create a hybrid from two of your own forged skills with `@design-hybrid-forge`

---

## Choosing the interaction language

| Language | When it makes sense |
|---|---|
| **English** | International teams; want maximum prompt quality |
| **Português (pt-BR)** | 100% PT team; end users read PT |
| **Español** | 100% ES team |
| **Français** | 100% FR team |

**Important:** internal agent files always stay in English (they're prompts, and models perform best in English). `interaction_language` only changes how the agent **speaks to you** — questions, explanations, messages.

Deliberate project decision: separate **prompt language** (en, always) from **interaction language** (your choice). This separation was introduced in commits `efb0902` and `6629730`.

---

## Wizard skip — lightning installs

```bash
# Everything: all clients, Squads mode, no design, EN
npx @jaimevalasek/aioson init my-app --all

# No prompts (defaults), English
npx @jaimevalasek/aioson install --no-interactive
```

---

## How do I change later?

| I want to change... | Command |
|---|---|
| Add Codex to the same project | `aioson install --reconfigure` |
| Activate Squads | `aioson install --reconfigure` (and select it) |
| Switch design skill | Edit `design_skill:` in `project.context.md` (a skill this project forged); neither `@setup` nor `install --reconfigure` asks a design question |
| Change interaction language | Edit `interaction_language:` in `project.context.md` or run `@setup` again |
| Change the classification | Edit `classification:` in `project.context.md`. Next sessions respect it. |

---

## Final decision in 30 seconds

```
What are you building? Risk level? How many integrations?
                              │
                              ▼
                       Small and simple?
                       YES → MICRO
                       NO → ↓
                              ▼
                  3+ user types OR 3+ integrations
                       OR complex rules?
                       YES → MEDIUM
                       NO → SMALL

Main AI client? Claude Code (recommended to start)
Squads? Not yet
Language? English

Done. Run aioson init.
```

---

## Next step

- [First project from scratch](./first-project.md)
- [Existing project](./existing-project.md)
- Curious about the principles? → [Why it exists](../1-understand/why-it-exists.md)
