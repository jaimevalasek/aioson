# Initial decisions — MICRO, SMALL, or MEDIUM? Which AI client?

> **Who this is for:** you're about to run `aioson init` and want to choose well.
> **Reading time:** 6 min
> **What you'll know after:** how AIOSON classifies your project, and how to choose AI client / design / language.

---

## The classification: MICRO, SMALL, MEDIUM

AIOSON is the opposite of "one size fits all." It applies **more ceremony to larger projects and less to smaller ones**. This is Article II of the Constitution: *Right-Sized Process*.

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

#### MICRO — `@setup → @product → @dev → @qa`

- For: scripts, automations, prototypes, simple personal apps.
- No formal spec phase — no `@sheldon` or `@orchestrator`. Lightweight.
- `@product` is optional — you can pass the spec directly in chat if you prefer.
- No per-phase verification; `@dev` phase checks are suppressed to save tokens.

**Typical examples:**
- Python script that processes CSV
- Simple Telegram bot
- Static portfolio page
- Mini API with 3 endpoints

#### SMALL — `@setup → @product → @sheldon → @dev → @qa` (lean default)

- For: most real apps.
- `@sheldon` is the **single spec authority**: in one pass it produces requirements + spec (Gates A/B/C) + design-doc + readiness + implementation-plan + harness-contract, then hands directly to `@dev`.
- `@analyst`, `@architect`, `@pm`, `@ux-ui`, `@scope-check` are opt-in detours — not in the default hop sequence.
- `@dev` runs a phase loop: auto-continues between phases, per-phase verification, context compaction.

**Typical examples:**
- SaaS app for a single persona
- API with auth and some business rules
- Simple online store
- Blog with admin panel

#### MEDIUM — `@setup → @product → @orchestrator → @dev → @pentester → @qa` (maestro lane)

- For: products with multiple user types, several integrations, complex rules.
- `@orchestrator` is the **single spec authority**: fans out `@analyst`/`@architect`/`@pm` (+ `@ux-ui` for UI-heavy) as sub-agents, consolidates the gated spec package, then hands to `@dev`.
- `@pentester` runs inline (not opt-in) before `@qa`.
- Quality gates applied at each handoff.
- More aggressive context threshold (55% — warns early).

**Typical examples:**
- Marketplace (seller + buyer + admin)
- ERP / CRM
- Multi-tenant platform with tier billing
- Fintech app with KYC and compliance

### Edge cases

| Situation | Suggestion |
|---|---|
| Personal project, but with one heavy external integration | SMALL — the integration justifies `@architect` |
| Score 1, but I know it will grow | Start MICRO. Can promote later with `@setup` |
| Score 4, but the team is just me | MEDIUM anyway. Complex business rules benefit from the artifacts |
| Score 2, but greenfield and I want careful design | SMALL + activate a design skill in the wizard |

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

Includes the 29 official agents (product, analyst, dev, qa, etc.; `@pair` is alias of `@deyvin`). Sufficient for 95% of projects.

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

> **Recommended route: `interface-design` + your own reference images.** Instead of inheriting a fixed preset's identical look, you provide reference images (identity/brand and, optionally, component structure); the `reference-identity-extract` skill converts them **once** into a text `identity.md` that the `interface-design` engine applies to everything downstream (prototype and build). `@setup` offers this route first — always with explicit confirmation, never auto-selected. The presets below remain available as an alternative.

Presets available in the wizard:

| Skill | Style | Use cases |
|---|---|---|
| **Clean SaaS UI** | Clean, clear typography, neutral | Panels, dashboards |
| **Aurora Command UI** | Dark, subtle gradients, central command | Developer tools |
| **Cognitive Core UI** | Weighted cards, depth via shadows | Information-dense apps |
| **Bold Editorial UI** | Editorial typography, strong hierarchy | Blogs, content |
| **Warm Craft UI** | Warm colors, soft texture | Artisan e-commerce |
| **Glassmorphism UI** | Glass, blur, translucent | Modern premium apps |
| **Neo Brutalist UI** | Black outlines, strong colors, no shadow | Bold brands |

**Skipping** is a valid option. You can:
- Choose later with `@ux-ui` — it offers the same two routes (reference images or preset)
- Clone a real site's design with `@site-forge`
- Create a hybrid with `@design-hybrid-forge` (e.g., clean-saas + neo-brutalist)

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
| Switch design skill | `@ux-ui` in the AI client or `aioson install --reconfigure` |
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
Design? Skip or Clean SaaS UI
Language? English

Done. Run aioson init.
```

---

## Next step

- [First project from scratch](./first-project.md)
- [Existing project](./existing-project.md)
- Curious about the principles? → [Why it exists](../1-understand/why-it-exists.md)
