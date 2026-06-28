# Adding AIOSON to an existing project

> **Who this is for:** you already have a codebase and want to bring AIOSON into it.
> **Execution time:** 20–60 min, depending on project size.
> **What you'll have at the end:** AIOSON installed, initial context mapped, and the first feature of the new era ready to run.

---

## First rule: nothing will be overwritten

`aioson install` is **additive**. It creates the `.aioson/`, `.claude/`, etc. directories, and adds `CLAUDE.md`, `AGENTS.md`, `OPENCODE.md` files to the root. It **does not touch**:

- Your code (`src/`, `app/`, etc.)
- Your `package.json` / `pyproject.toml` / `Gemfile`
- Your `.gitignore` (on updates)
- Your infra (`Dockerfile`, CI configs)

If you ever want to leave, just delete `.aioson/` and the `CLAUDE.md`/`AGENTS.md`/`OPENCODE.md` files.

---

## Step 1 — Install

```bash
cd my-existing-project
npx @jaimevalasek/aioson install
```

The interactive wizard appears:

```
? Which AI tools? ›
   ◉ Claude Code
   ◉ Codex CLI
   ◯ OpenCode

? Mode? ›
   ◉ Development
   ◯ Development + Squads

? Design system? ›
   ◯ Clean SaaS UI
   ◯ Aurora Command UI
   ◯ (more options...)
   ◉ Skip

? Agent language? ›
   ◉ English
   ◯ Português
   ◯ Español
   ◯ Français
```

> **Tip:** `--all` installs everything without the wizard (all tools, Development+Squads mode). `--no-interactive` for CI.

---

## Step 2 — Scan the project

```bash
npx @jaimevalasek/aioson scan:project
```

The scan will:
- Detect language, framework, package manager
- Map the folder structure
- List dependencies
- Save to `.aioson/context/scan-*.md`

> Don't confuse `scan:project` with `@discover` — the **scan** is static (file analysis). **`@discover`** goes further: it builds a semantic cache with a search index.

---

## Step 3 — Run `@setup`

```bash
claude .   # or: codex . / opencode .
```

Inside the AI client:

```
You > @setup

@setup > Detected: Node.js + Next.js + Postgres + Prisma. Confirm?
You > Yes

@setup > How many user types currently exist in the project?
You > Admin, customer, supplier (3)

@setup > External integrations?
You > Stripe, SendGrid, S3 (3)

@setup > Complex business rules (calculations, conditional flows)?
You > Yes — discount policy by customer tier, commission rules

@setup > Score: 2 + 2 + 2 = 6 → MEDIUM.
@setup > Interaction language? › English

@setup > project.context.md created with MEDIUM classification.
@setup > Since you already have running code, I recommend:
        - Run @discover to build the semantic cache
        - Then @analyst to map the existing domain (initial brownfield scan)
        - Only then start features via @product → @orchestrator (MEDIUM maestro)
```

---

## Step 4 — `@discover` indexes the knowledge

```
You > @discover

@discover > Indexing .aioson/context/bootstrap...
        - 1,247 files analyzed
        - 84 semantic entities extracted
        - 23 flows identified
        - Cache ready at .aioson/brains/discover/
@discover > When any agent needs something from the codebase, it queries
            this cache instead of scanning everything. Saves a lot of context.
```

This step is **optional for small projects**, but critical in medium and large codebases (>5k files).

---

## Step 5 — `@analyst` maps the existing domain

```
You > @analyst

@analyst > [reads scan + @discover cache]
        Identified:
        - Customer, Supplier, Order, OrderItem, Payment, Discount, Commission
        - Auth via NextAuth
        - Active Stripe webhook
        - Tier table in customer.tier (free|pro|enterprise)
@analyst > Domain map saved to architecture.md.
@analyst > Ready for the next feature.
```

> **Why this matters:** when you create the next feature with `@product`, it will already come with **context**. The agent knows Customer already exists and won't suggest creating it again.

---

## Step 6 — First feature of the new era

```
You > @product

@product > We have the base mapped. What feature?
You > "order-cancellation" — allow canceling an order within 1 hour

@product > Acceptance criteria?
You > [...]

@product > Spec saved. Next: @orchestrator (MEDIUM maestro — will fan out @analyst, @architect, @pm).
```

From there, the MEDIUM maestro flow applies: `@product → @orchestrator → @dev → @pentester → @qa`. `@orchestrator` fans out `@analyst`, `@architect`, and `@pm` as sub-agents (the domain knowledge from Step 5 feeds into them), consolidates the gated spec package, and hands to `@dev`. See [Full feature with @sheldon — MEDIUM variant](../3-recipes/full-feature-with-sheldon.md#medium-maestro-variant) for the full walkthrough.

---

## Special cases

### I have legacy code without tests

Use **`@tester`** (not just `@qa`) — it does systematic test engineering for already-implemented apps. It recently gained *coverage quality tier* and *test smell audit*.

```
You > @tester

@tester > Current coverage: 12%. Quality tier: LOW.
@tester > Strategy: cover the 5 most critical modules first
        (auth, payments, orders, discounts, webhook handler).
```

### I want a security audit before touching anything

```
You > @pentester

@pentester > Mapping attack surfaces (OWASP Top 10 + LLM Top 10 + supply chain).
        ...
        Findings:
        - HIGH: /admin/* routes without rate-limiting
        - MEDIUM: dependency X with known CVE
        - LOW: error logs leak email addresses
        Saved to context/security-findings-project.json
```

### I want to migrate understanding between AI clients

The `.aioson/` files are **client-agnostic**. You use Claude Code today, switch to Codex tomorrow on the same project:

```bash
npx @jaimevalasek/aioson install --reconfigure
# Also mark Codex CLI in the wizard
```

The `.codex/` and `AGENTS.md` files appear. Agents read the same files as before.

### I have code rules I need to enforce

Create `.aioson/rules/<name>.md`. Example:

```markdown
# .aioson/rules/no-direct-db-from-controllers.md

Controllers never access the ORM directly. Always via the service layer.
```

Every technical agent (`@dev`, `@qa`, etc.) loads these rules automatically. See [Design Docs Governance](../5-reference/design-docs-governance.md).

### Whole team on the same project

Commit the `.aioson/` folder. Every developer will have the same agent team, the same rules, the same Constitution. Keep only `.aioson/runtime/` in `.gitignore` (local telemetry).

---

## Quick verification

After install, these commands should work:

```bash
# 1. General diagnostics
npx @jaimevalasek/aioson doctor

# 2. Project state
npx @jaimevalasek/aioson workflow:next .

# 3. Confirm context is OK
cat .aioson/context/project.context.md

# 4. Inside the AI client
> @neo
```

---

## Next step

- Want to understand which classification makes sense? → [Initial decisions](./initial-decisions.md)
- How does continuity between sessions work? → [Continuity between sessions](../3-recipes/continuity-between-sessions.md)
- Team overview → [Ecosystem map](../1-understand/ecosystem-map.md)
