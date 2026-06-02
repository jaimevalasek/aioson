# AIOSON Glossary

> **Who this is for:** anyone reading the other docs and tripping over jargon.
> **Reading time:** reference — read what you need.
> **How to use:** Ctrl+F is your friend.

Terms in alphabetical order. Each entry has a **short definition** + **concrete example** + **where to learn more**.

---

## Agent

**Definition:** a virtual specialist with its own prompt, its own rules, and a specific responsibility. Lives in `.aioson/agents/<name>.md`.

**Example:** `@dev` is the agent that implements code. `@qa` is the one that writes tests. `@pentester` is the one that tries to break the feature on purpose.

**How to invoke:** type `@name` in your AI client (Claude, Codex e OpenCode) or describe the intent in natural language ("let's implement the feature").

---

## AIOSON

**Definition:** the framework itself. An npm package (`@jaimevalasek/aioson`) that installs a structure of agents, rules, and tools in your project.

**Example:** running `npx @jaimevalasek/aioson init my-app` creates the `.aioson/` folder in your project.

---

## AIOSON Cloud / aioson.com

**Definition:** the hosted service for publishing and installing squads, genomes, and skills across projects.

**Example:** you create a squad of agents for the legal domain in your project, run `aioson system:publish`, and any other project can run `aioson system:install <slug>`.

**Where to learn more:** `5-reference/aioson-com-store.md`.

---

## Artifact

**Definition:** any file that an agent creates or updates as output of its work.

**Examples:**
- `.aioson/context/project.context.md` — project context (created by `@setup`)
- `.aioson/context/features/<slug>/spec.md` — feature spec (created by `@product`/`@analyst`)
- `.aioson/context/dossier/<slug>/` — feature dossier (created by the agent chain)

**Why it matters:** Article III of the Constitution says important work leaves an artifact. Without an artifact, the work "didn't happen" officially.

---

## Brains

**Definition:** procedural memory of an agent — structured knowledge in "nodes" (Zettelkasten style) that the agent loads on demand.

**Example:** `@site-forge` has brains with 14 nodes about how `pt.squarespace.com` structures its pages, used when you ask for a clone.

**Where it lives:** `.aioson/brains/<agent>/`.

---

## Briefing

**Definition:** a pre-PRD document that frames a problem before it becomes a feature. Output of the `@briefing` agent.

**Example:** you have 5 scattered notes about an idea. `@briefing` transforms them into a structured briefing with problem, hypotheses, and discovery frames.

---

## Classification (MICRO / SMALL / MEDIUM)

**Definition:** the size of the project, calculated from 3 factors (user types, external integrations, business rules). Determines how much ceremony the workflow applies.

**How it works:**
- 0–1 points → **MICRO** (`@setup → @product → @dev`)
- 2–3 points → **SMALL** (`@setup → @product → @analyst → @architect → @dev → @qa`)
- 4–6 points → **MEDIUM** (full workflow, all gates, all artifacts)

**Where it appears:** `classification:` in the `project.context.md` frontmatter.

---

## AI Client

**Definition:** the program where you actually talk to the AI. AIOSON is client-agnostic — it works with several.

**Officially supported:** Claude Code, Codex CLI, OpenCode.
**Also works via terminal:** VS Code, Cursor, Windsurf, JetBrains IDEs, Zed, Antigravity (any that opens a terminal).

**Where to learn more:** `5-reference/clientes-ai.md`.

---

## Committer

**Definition:** the `@committer` agent that generates professional commit messages from the diff and context.

**Example:** after implementing a feature, `@committer` reads what changed, proposes the message, shows a checkbox in the terminal, and commits.

---

## Constitution

**Definition:** the 6 (currently 7, with Zero Trust) principles in `.aioson/constitution.md`. No agent can contradict an article.

**Full detail:** [Why it exists](./why-it-exists.md#the-6-principles-of-the-constitution).

---

## Context Pack

**Definition:** a minimal, curated set of files that an agent reads to do its work — instead of scanning the entire project.

**Why it matters:** saves context window. `@dev` for a "add a form field" feature doesn't need to read the whole project.

---

## Continuity (agent-chain-continuity)

**Definition:** the system that ensures if a session drops in the middle of a feature, the next session can resume without losing context. Implemented in phases (1 to 8) across Mar–May 2026.

**Main components:** `dossier`, `dev-state.md`, `dev-resume`, `handoff-protocol.json` v2, drift detection.

---

## Design Skill

**Definition:** a skill specialized in a visual system (colors, typography, spacing, components). Can be a native skill or a hybrid created by `@design-hybrid-forge`.

**Ready-made examples:** Clean SaaS UI, Aurora Command UI, Cognitive Core UI, Bold Editorial UI, Warm Craft UI, Glassmorphism UI, Neo Brutalist UI.

**Where to choose:** during `aioson init`, in the wizard.

---

## Dossier (Feature Dossier)

**Definition:** a folder `.aioson/context/dossier/<slug>/` that contains **everything** about a feature in progress: spec, plan, decisions, touched code, research index, status.

**Why it matters:** it's the single point any agent entering the feature consults. Replaces "I'll re-read the entire history."

**Commands:** `aioson dossier:init`, `dossier:show`, `dossier:add-research`, `dossier:audit`.

---

## Genome

**Definition:** "cognitive DNA" of a persona — a structured YAML with personality traits (DISC, Enneagram, Big Five, MBTI, HEXACO-H), style, tone, and advisor instructions.

**What it's for:** creating advisors (personalized assistants) that reason like a specific person. Example: generate a "Steve Jobs style" advisor to review pitch decks.

**Current version:** Genome 4.0 with `anchor_prompt`, `relations`, `hexaco_h`, `trait_interactions`.

**Where to learn more:** `5-reference/genome-4.0-spec.md` (in progress).

---

## Handoff

**Definition:** the moment when an agent finishes its part and passes to the next, leaving the artifacts ready.

**Where it's recorded:** `.aioson/context/handoff-protocol.json` (v2).

---

## Live Session

**Definition:** a "tracked" session — an envelope that records each milestone in the local SQLite for the dashboard to display.

**Commands:** `aioson live:start`, `live:status`, `live:handoff`, `live:close`.

---

## Memory

**Definition:** AIOSON's persistent memory. Recently gained an **active retrieval** layer — agents can search for relevant memories, not just read everything.

**Where it lives:** `.aioson/memory/` (in the project) and `~/.claude/projects/<hash>/memory/` (per user, for Claude Code).

---

## Neo

**Definition:** the `@neo` agent — intelligent router. It looks at the project state and tells you which agent makes sense to invoke now.

**When to use:** when you don't know how to continue ("show project status", "where do I start?"). Recently gained a full ecosystem catalog and *ecosystem-inquiry* mode.

---

## Pentester

**Definition:** `@pentester` agent that does adversarial security review — scans OWASP Top 10, LLM Top 10, supply chain, and maps attack surfaces.

**When to use:** before publishing a feature to production, or when you need a specific audit point.

---

## Pipeline / Workflow

**Definition:** the ordered sequence of agents that AIOSON applies to a feature, based on the classification.

**Central command:** `aioson workflow:next .` — shows which agent is next.

---

## Plan

**Definition:** documents in `/plans/` (project root) that describe a planned execution. Not committed (local memory).

**What they're for:** planning before executing; serve as "seed plans" for features.

---

## Profiler (researcher / enricher / forge)

**Definition:** the 3-stage pipeline that creates a Genome from a public figure.

1. `@profiler-researcher` — collects raw material.
2. `@profiler-enricher` — analyzes cognitively.
3. `@profiler-forge` — generates the Genome 4.0 and the advisor.

---

## Project Pulse

**Definition:** the file `.aioson/context/project-pulse.md` — the live global state of the project. Read at the start of each session, updated at the end.

**What it's for:** give any incoming agent a snapshot of "what's happening in this project right now."

---

## Rules

**Definition:** *hard* project rules, in `.aioson/rules/*.md`. Unlike loose instructions in a prompt, rules are read automatically by all applicable agents.

**Example:** `security-baseline.md` declares the `SEC-SBD-01..08` controls that `@dev` and `@qa` consume.

---

## Skill

**Definition:** a pluggable instruction package. Types:
- **Process skills** — methodologies (e.g., `aioson-spec-driven`)
- **Design skills** — visual systems (e.g., `clean-saas-ui`)
- **Static skills** — fixed domain knowledge
- **Dynamic skills** — generate instructions at runtime

**Where they live:** `.aioson/skills/` in the project, or globally.

---

## Squad

**Definition:** a group of custom agents — tailor-made for a domain the standard team doesn't cover well.

**Example:** a "legal compliance" squad with agents `@regulator`, `@attorney`, `@auditor`, under the command of `@squad`.

**Commands:** `aioson squad:assemble`, `squad:agent-create`, `squad:refresh`.

---

## Tester

**Definition:** `@tester` agent — systematic test engineering for already-implemented apps. Use when regular `@qa` isn't enough (legacy, brownfield, gaps across 3+ modules).

**Recent:** gained *coverage quality tier* and *test smell audit*.

---

## Validator

**Definition:** `@validator` agent — technically validates a feature against the success contract defined in the spec, before close-out.

---

## Workflow

See **Pipeline / Workflow**.

---

## Zero Trust

**Definition:** Article VII of the Constitution. Security is not an "optional feature" — it's the default state. Every feature goes through automatic baseline checks.

---

Term not found? Search the [Ecosystem map](./ecosystem-map.md) or the [agents guide](../README.md).
