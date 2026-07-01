# First project from scratch

> **Who this is for:** anyone who has never used AIOSON and wants to run it once to understand it.
> **Execution time:** 30–45 min.
> **What you'll have at the end:** a simple web app (a to-do list) with a spec, code, tests, and a dossier — all traceable on disk.

We're going to build a **mini TODO app** using the SMALL cycle. You'll see each agent enter, do its part, and hand off to the next.

---

## Prerequisites

- **Node.js 18+** installed
- An AI client configured: **Claude Code**, **Codex CLI**, or **OpenCode**. Examples here use Claude Code; switching is trivial.
- A terminal open

If you don't have an AI client yet: Claude Code is the most widely used by the AIOSON community. See [`clientes-ai.md`](../5-reference/clientes-ai.md).

---

## Step 1 — Create the project

```bash
npx @jaimevalasek/aioson init my-todo
cd my-todo
```

The wizard will ask:

```
? Which AI tools? › Claude Code
? Mode? › Development (no squads for now)
? Design system? › (skip for now)
? Agent language? › English
```

> **Beginner tip:** to skip the wizard and install everything, use `--all`. For CI environments, use `--no-interactive`.

The command creates this structure:

```
my-todo/
├── .aioson/         ← agents, rules, config
├── .claude/         ← Claude Code integration
├── CLAUDE.md        ← automatic instructions for Claude Code
├── AGENTS.md        ← instructions for Codex
└── (empty — no package.json yet)
```

---

## Step 2 — Open the AI client in the project

```bash
claude .   # or: codex .   or: opencode .
```

From here on, we'll interact with the AI.

---

## Step 3 — `@setup` handles onboarding

```
You > @setup
```

Expected dialogue (may vary):

```
@setup > Hello! I'll configure the context for this project.
@setup > No stack detected yet. Starting from scratch — what type is it?
        [web_app · api · site · script · dapp · desktop_app]
You > web_app

@setup > Preferred stack?
You > Node.js + Express + SQLite

@setup > How many user types?
You > 1

@setup > How many external integrations (APIs, gateways, etc.)?
You > 0

@setup > Any non-obvious business rules (special calculations, multi-condition flows)?
You > No

@setup > [calculates] Score: 0+0+0 = 0 → MICRO. But you asked for spec/tests...
@setup > I recommend SMALL to have @qa at the end. Agree?
You > Yes

@setup > project.context.md created.
@setup > Next agent: @product (to define the initial feature).
```

Look at what appeared on disk:

```bash
cat .aioson/context/project.context.md
```

```yaml
---
project_name: "my-todo"
project_type: "web_app"
profile: "developer"
framework: "Node.js"
classification: "SMALL"
interaction_language: "en"
...
---
```

> **What happened:** `@setup` interviewed you and saved the answers to a file. **This file is the external memory** that all other agents will read.

---

## Step 4 — `@product` defines the first feature

```
You > @product

@product > Let's define the initial feature. What's the short name (slug)?
You > task-list

@product > In one sentence, what problem does it solve?
You > Let users create tasks and mark them as completed

@product > What are the acceptance criteria?
You > Create a task with text. Mark as completed. List pending and completed separately. Persist in SQLite.

@product > [...details...] Spec saved to
        .aioson/context/features/task-list/spec.md
@product > Next: @analyst.
```

```bash
cat .aioson/context/features/task-list/spec.md
```

You'll see a structured spec with scope, ACs, and out-of-scope items.

---

## Step 5 — `@sheldon` closes the spec (single spec authority for SMALL)

```
You > @sheldon

@sheldon > Reading spec.md... stack: Node + Express + SQLite.
@sheldon > No external gaps detected (simple scope). Producing spec package:
        ✓ design-doc-task-list.md (structure: src/{routes,db,server}.js)
        ✓ readiness-task-list.md (Gate B: ready)
        ✓ implementation-plan.md (1 phase — scope is tight)
        ✓ harness-contract.json (4 RG-smoke criteria matching the ACs)

@sheldon > Notes:
        - Persistence: better-sqlite3 (synchronous SQLite, simple)
        - Validation: manual (no extra libs — Article VI)
        - Test framework: node:test (built-in, no dependency)
@sheldon > Gates A/B/C: approved. Next: @dev.
```

> **Note Article VI ("Simplicity Over Ceremony"):** `@sheldon` flagged no unnecessary libraries. On a simple project like this it produces a lean package; on a complex feature it would do web research and multi-phase planning.

---

## Step 6 — `@dev` implements

```
You > @dev

@dev > [reads implementation-plan.md, spec, project.context]
@dev > Phase 1/1: full implementation (tight scope).
@dev > Creating:
        package.json
        src/db.js          (init schema)
        src/routes.js      (POST /tasks, PATCH /tasks/:id, GET /tasks)
        src/server.js
        tests/tasks.test.js (placeholder — @qa covers)

@dev > [implements]
@dev > aioson harness:check → 4/4 criteria pass.
@dev > dev-state.md updated.
@dev > Next: @qa.
```

See what changed:

```bash
ls src/
# db.js  routes.js  server.js
cat .aioson/context/dev-state.md
```

`dev-state.md` shows exactly what was done, in which files, and the current status.

---

## Step 7 — `@qa` tests

```
You > @qa

@qa > Reading spec... 4 ACs identified.
@qa > Test plan:
        AC-01: create task → POST returns 201 and id
        AC-02: mark completed → PATCH changes completed
        AC-03: list separately → GET /tasks?status=pending|done
        AC-04: persistence → restart process, data persists
@qa > Writing tests/tasks.test.js... running...

[If a test fails? Autonomous QA→Dev cycle (up to 2 iterations):]
@qa > AC-03 failed: GET without filter returns mixed results.
        Passing back to @dev (iteration 1/2)...
@dev > Fixing... done.
@qa > Re-running... 4/4 OK.
@qa > test-plan.md and qa-report.md saved. Feature ready.
```

> **What's new:** the *autonomous QA→Dev cycle* (cap 3, `agentic_policy.review_cycle`) lets `@qa` request small fixes without you having to manually reactivate it. Under autopilot, this same cycle can chain all the way to `@tester`/`@pentester`/`@validator` and the `feature:close` recommendation without stopping — see [Autopilot handoff](../5-reference/autopilot-handoff.md).

---

## Step 8 — Clean commit with `@committer`

```
You > @committer

@committer > Reading diff and dev-state...
        Proposed message:
        ┌────────────────────────────────────────────────────┐
        │ feat(tasks): add basic CRUD with SQLite            │
        │                                                    │
        │ - POST /tasks creates a task                       │
        │ - PATCH /tasks/:id toggles completion              │
        │ - GET /tasks supports status=pending|done filter   │
        │                                                    │
        │ Closes spec task-list. Tests: 4/4 pass.            │
        └────────────────────────────────────────────────────┘
        [✓] Accept  [ ] Edit  [ ] Cancel
You > [Enter to accept]
@committer > Committed.
```

---

## What stayed traceable

```
.aioson/context/
├── project.context.md           ← project view (step 3)
├── design-doc-task-list.md      ← @sheldon spec (step 5)
├── readiness-task-list.md       ← @sheldon Gate B (step 5)
├── implementation-plan.md       ← @sheldon (step 5)
├── dev-state.md                 ← what @dev did (step 6)
├── test-plan.md                 ← @qa's plan (step 7)
├── qa-report-test-coverage.md   ← QA report
└── features/
    └── task-list/
        └── spec.md              ← original spec (step 4)

.aioson/plans/task-list/
└── harness-contract.json        ← @sheldon success contract
```

Three months from now, someone (you or another AI) can open this project and understand **everything** just by reading these files. No chat history needed.

---

## What if I want a new feature?

Go back to step 4. `@product` creates a new feature → `@sheldon` (closes the spec) → `@dev` → `@qa`. `@setup` doesn't need to run again (context is already there).

If you get lost in the middle:

```
You > @neo
```

It tells you who's next.

---

## Common troubleshooting

| Problem | Solution |
|---|---|
| The agent "forgot" the context | Check `cat .aioson/context/project.context.md`. If fields are missing, run `@setup` again. |
| I want to resume an interrupted feature | Run `@deyvin` — it reads `dev-state.md` and continues. |
| Not sure if SMALL is the right classification | Ask `@neo` — it explains the calculation. |
| Install failed | `npx @jaimevalasek/aioson doctor` — diagnoses and suggests a fix. |
| I want to add Codex later | `npx @jaimevalasek/aioson install --reconfigure`. |

---

## Next step

- Have a project **that already exists** and want to add AIOSON? → [Existing project](./existing-project.md)
- Want to understand when MICRO vs SMALL vs MEDIUM? → [Initial decisions](./initial-decisions.md)
- Want to see the full team? → [Ecosystem map](../1-understand/ecosystem-map.md)
