# What is AIOSON

> **Who this is for:** anyone who hasn't used it yet.
> **Reading time:** 5 min
> **What you'll know after:** what AIOSON is, what it does for you, and when *not* to use it.

---

## In one sentence

AIOSON turns a single generic AI into **a team of specialists that take turns** throughout your project — each focused on one stage, with clear rules about when to start and when to hand off to the next one.

## The building crew analogy

Imagine you want to build a house.

**Without AIOSON:** you hire one super-generic contractor and say "build my house." They try to be architect, bricklayer, electrician, plumber, and site inspector all at once. Sometimes it works. Often they forget details. When something goes wrong, they don't remember why they made a decision two hours ago.

**With AIOSON:** you have a team.

- **Briefing** listens to your raw idea (the "napkin sketch") and hands back a structured briefing — with risks and open questions — *before* it becomes a project.
- **Product** understands what you want to build and why — and writes the PRD.
- **Sheldon** reviews the PRD like a senior architect who has seen everything: points out gaps, researches what's outdated, reads your actual code, and decides whether to enrich the PRD or create a phased plan. Can review multiple times.
- **Analyst** discovers what already exists in the codebase and what's missing.
- **Architect** designs the structure.
- **UX-UI** designs how the end user will live there.
- **Dev** builds.
- **Deyvin** is the site foreman who picks up the job when you return from a trip: reads what's confirmed, flags what's inferred, and proceeds one small step at a time without you having to re-explain anything.
- **QA** inspects.
- **Pentester** tests the locks (security).
- **Committer** writes the meeting minutes (commit message).

Each one knows when to step in, when to step out, and what document to hand to the next. You talk to any of them by typing `@name` in your AI client.

## What this changes in practice

| Without AIOSON | With AIOSON |
|---|---|
| One massive prompt trying to do everything | Several smaller prompts, each with clear scope |
| The AI "forgets" earlier decisions mid-work | Decisions become **disk artifacts** (specs, dossiers, plans) |
| You start from scratch when you switch sessions | The next session reads the artifacts and picks up where it left off |
| Hard to go back and audit what was done | Every agent leaves a trail: what it decided, why, based on what |
| Large teams disagree on each AI's style | Everyone uses the same set of agents and rules |

## What AIOSON installs in your project

When you run `aioson init`, it creates:

```
your-project/
├── .aioson/
│   ├── agents/              ← prompts for each specialist
│   ├── config.md            ← project rules (size, language, stack)
│   ├── constitution.md      ← the 6 principles no one overrides
│   ├── context/             ← live context: project.context.md, project-pulse.md
│   ├── rules/               ← hard rules agents follow (security, etc.)
│   ├── skills/              ← pluggable packages (design systems, processes)
│   └── runtime/             ← local telemetry (SQLite)
├── .claude/  .codex/                         ← native client config
├── CLAUDE.md  AGENTS.md  OPENCODE.md         ← per-client instructions
└── docs/                                      ← optional documentation
```

Open your favorite AI client and type `@setup`, `@product`, `@dev`, etc. — the agents take over.

## Works with any AI client

Works with **any IDE that has a terminal**:

- Claude Code · Codex CLI · OpenCode
- VS Code, Google Antigravity, Cursor, Windsurf, JetBrains, Zed (with any of the clients above)

Agents are *prompts*, not plugins. They live in `.md` files and your AI client reads them when you invoke via `@name`.

## When AIOSON shines

- **Projects where decisions matter** — you want traceability, not improvisation.
- **Teams** — multiple humans and multiple AIs need to read the same narrative.
- **Long or resumed sessions** — you need to stop today and come back tomorrow without losing context.
- **When you want specialization** — serious security, careful UX, systematic testing.

## When *not* to use AIOSON

- **A 20-line script** that runs once. Use a direct prompt, no ceremony.
- **You want to explore an idea freely** in 5 minutes. AIOSON asks for setup first.
- **You won't open the project again.** The value is precisely in repeated sessions.

For these cases, AIOSON itself has a lightweight path — the **MICRO** classification (`@setup → @product → @dev`). But if even that doesn't fit, don't force it.

## Next step

- Want to understand *why* AIOSON was designed this way? → [Why it exists](./why-it-exists.md)
- Want to see the full team at a glance? → [Ecosystem map](./ecosystem-map.md)
- Want to start now? → [First project from scratch](../2-start/first-project.md)
