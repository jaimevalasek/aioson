<div align="center">

# AIOSON

**AI operating framework for hyper-personalized software.**

*Structure your AI sessions. Orchestrate specialized agents. Ship with confidence.*

*Works in any IDE with a terminal — VS Code, Google Antigravity, Cursor, Windsurf, JetBrains IDEs, Zed, and more.*

[![npm version](https://img.shields.io/npm/v/@jaimevalasek/aioson?color=6c47ff&style=flat-square)](https://www.npmjs.com/package/@jaimevalasek/aioson)
[![npm downloads](https://img.shields.io/npm/dm/@jaimevalasek/aioson?style=flat-square&color=6c47ff)](https://www.npmjs.com/package/@jaimevalasek/aioson)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue?style=flat-square)](LICENSE)
[![Node.js ≥18](https://img.shields.io/badge/node-%E2%89%A518.0.0-brightgreen?style=flat-square)](https://nodejs.org)

[![Claude Code](https://img.shields.io/badge/Claude_Code-supported-6c47ff?style=flat-square)](https://claude.ai/code)
[![Codex CLI](https://img.shields.io/badge/Codex_CLI-supported-black?style=flat-square)](https://github.com/openai/codex)
[![Gemini CLI](https://img.shields.io/badge/Gemini_CLI-supported-4285F4?style=flat-square)](https://github.com/google-gemini/gemini-cli)
[![OpenCode](https://img.shields.io/badge/OpenCode-supported-orange?style=flat-square)](https://opencode.ai)

</div>

---

<div align="center">

AIOSON gives every AI session a **role**, a **protocol**, and a **lifecycle**.  
Instead of one massive prompt doing everything, each agent owns a well-defined slice — from discovery to deployment — and hands off cleanly to the next.

</div>

---

## Installation

```bash
# New project
npx @jaimevalasek/aioson init my-project

# Existing project
cd my-project
npx @jaimevalasek/aioson install
```

Running `init` or `install` launches an **interactive wizard** to configure:

1. Which AI tools to enable (Claude Code, Codex CLI, Gemini CLI, OpenCode)
2. Mode — Development or Development + Squads
3. Design system (optional) — Clean SaaS UI, Aurora Command UI, Cognitive Core UI, etc.
4. Agent language — English, Português, Español, Français

Only the relevant files are copied. No extra dependencies are installed.

**Skip the wizard** — install everything at once with `--all`:

```bash
npx @jaimevalasek/aioson init my-project --all
npx @jaimevalasek/aioson install --all
```

**Reconfigure** — add tools or activate Squads after the initial install:

```bash
npx @jaimevalasek/aioson install --reconfigure
```

**CI / automation** — install without prompts:

```bash
npx @jaimevalasek/aioson install --no-interactive
```

**Update** the AIOSON files in your project (respects your saved profile):

```bash
npx @jaimevalasek/aioson update
```

> Updating an existing project to a new release? See [Upgrading](#upgrading) — `aioson update` alone is not enough if the CLI itself is out of date.

---

## Upgrading

Two things can be on different versions: the **CLI you run** (`aioson`) and the **AIOSON files inside your project** (`.aioson/`). Both need to move together.

> ⚠ **The #1 reason `aioson update` "doesn't bring in the new version":** `aioson update` copies the templates bundled with the CLI currently on disk. If your global CLI is on an older release, running `aioson update` from a project will copy that older version's files — no matter how many times you run it. You have to upgrade the CLI itself first.

**Step 1 — upgrade the CLI.**

If you installed globally:

```bash
npm install -g @jaimevalasek/aioson@latest
aioson --version
```

If `aioson --version` still shows the old version, the binary is being shadowed (older Node on PATH, nvm switch, leftover global install). Reinstall cleanly:

```bash
npm uninstall -g @jaimevalasek/aioson
npm install -g @jaimevalasek/aioson@latest
aioson --version
```

Prefer not to install globally at all? Use `npx` pinned to `@latest` — it always fetches the latest published version and ignores anything installed globally:

```bash
npx @jaimevalasek/aioson@latest <command>
```

**Step 2 — refresh the AIOSON files in each project.**

From inside the project directory:

```bash
aioson update
```

This copies the latest agents, skills, and templates into `.aioson/`, respecting your saved profile. Repeat in every project you want to bring up to date.

---

## How it works

```
  New project                              Existing project
       │                                         │
       ▼                                         ▼
  aioson init                           aioson install .
       │                                aioson scan:project
       └──────────────┬──────────────────────────┘
                      │
                      ▼
              ┌───────────────┐
              │  /setup       │  ← Project context & onboarding
              └───────┬───────┘
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
    /analyst     /architect    /product      ← Discovery & planning
          │           │           │
          └───────────┼───────────┘
                      ▼
              ┌───────────────┐
              │  /sheldon     │  ← PRD enrichment & deep technical reasoning
              └───────┬───────┘
                      ▼
              ┌───────────────┐
              │   /ux-ui      │  ← Design system & UI specs
              └───────┬───────┘
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
      /deyvin       /dev        /pm          ← Implementation
          │           │           │
          └───────────┼───────────┘
                      ▼
              ┌───────────────┐
              │ /pentester    │  ← Adversarial security review (MEDIUM)
              └───────┬───────┘
                      ▼
              ┌───────────────┐
              │    /qa        │  ← Review, tests, browser QA
              └───────┬───────┘
                      ▼
              ┌───────────────┐
              │   /tester     │  ← Systematic test engineering (when needed)
              └───────────────┘
```

Each agent runs as a tracked live session with full runtime observability — milestones, handoffs, and context snapshots recorded in the AIOSON dashboard.

---

## Why AIOSON

Most AI sessions are conversations. AIOSON is a **protocol**.

Every feature goes through a defined lifecycle — spec, gate, build, verify — and every agent knows exactly where it is in that lifecycle. The result: AI that doesn't guess, doesn't drift, and doesn't lose track when the context window fills up.

### Spec-Driven Development

Vague prompt → unambiguous spec → gated execution. No skipping phases, no silent assumptions.

```
"add a stock management feature"
         │
         ▼ @product
   prd-stock-management.md
   ┌──────────────────────────────────────┐
   │ objectives, out-of-scope, open items │
   └──────────────────────────────────────┘
         │
         ▼ @sheldon          ← PRD enrichment
   sheldon-enrichment-stock.md
   ┌──────────────────────────────────────┐
   │ gray areas decided, readiness score  │
   │ RF-GA extraction, AC hardening       │
   └──────────────────────────────────────┘
         │
         ▼ Gate A            ← requirements approved?
   requirements-stock.md     ← REQ-stock-001, AC-stock-001 …
         │
         ▼ Gate B            ← design approved?
   architecture.md + design-doc-stock.md
         │
         ▼ Gate C            ← implementation plan reviewed?
   implementation-plan-stock.md
         │
         ▼ @dev / @deyvin    ← code, commits, spec updates
         │
         ▼ Gate D            ← 4-tier verification
   @qa forensics: Exists → Substantive → Wired → Functional
```

**Gates are blocking in MEDIUM projects, informational in SMALL.** Each gate is enforced by a checklist in `spec-{slug}.md` — agents can't advance without explicit approval signals. No more AI that starts coding before the requirements are clear.

**What you get in the spec file:**

| Field | What it tracks |
|-------|----------------|
| `phase_gates` | `requirements: approved`, `design: approved`, `plan: approved` |
| `last_checkpoint` | Exactly where the agent stopped — resume without re-reading everything |
| `gray_areas_decided` | Every ambiguity that was surfaced and decided, with rationale |
| `must_haves` | Triplet contract: truths, artifacts, key links |
| `readiness` / `readiness_notes` | @sheldon's go/no-go signal before implementation starts |

---

### Context intelligence

AI sessions fail silently. Context fills up, the model forgets, the agent reinvents what was already decided. AIOSON ships a full context management layer so this never happens quietly.

**5-phase context optimization system:**

**Session Recovery** — when Claude compacts or a session crashes, one command restores the full working state:
```bash
aioson recovery:generate   # snapshot current state, < 2 000 tokens
aioson recovery:show       # paste this into the new session — agent picks up exactly where it left
```

**Context Monitor** — real-time usage bars with adaptive thresholds per project size:
```bash
aioson context:monitor     # ASCII bars, warning/critical detection
```
```
Context usage ████████████░░░░ 73%  ⚠ approaching threshold (SMALL: 65%)
Agents recommend /clear before next phase
```

**FTS5 Search Index** — find anything across all your project artifacts in milliseconds:
```bash
aioson context:search "payment webhook retry logic"
# BM25 ranking + recency reranking — surfaces the right doc, not just keyword matches
```

**Context Cache** — save and restore session snapshots without losing what the AI already knows:
```bash
aioson context:cache save --label="before-refactor"
aioson context:cache restore --label="before-refactor"
```

**Agent Sharding** — agents load only the instructions relevant to the current goal. Irrelevant sections are stripped before the context window fills:
```bash
aioson agent:load deyvin --goal="fix stock modal validation"
# 68% token reduction — agent arrives focused, not bloated
```

**Adaptive learning** — AIOSON tracks what worked and evolves agent behavior over time:
```bash
aioson learning:evolve    # distill patterns from completed sessions
aioson learning:apply     # push improvements back into the agent chain
```

**Context budget thresholds by project size:**

| Classification | Warning threshold | Why |
|----------------|-------------------|-----|
| MICRO | 75% | Short phases — ok to run higher |
| SMALL | 65% | Default — balanced warning |
| MEDIUM | 55% | Long phases — warn early, write artifacts first |

When an agent approaches its threshold it writes all in-progress artifacts to disk, emits a warning, and records `last_checkpoint` — so the next session can start from state, not from memory.

---

## AIOSON Squads

Squads are the part of AIOSON that most people don't expect.

You can build a specialized, multi-agent team for **any domain** — software development, content creation, legal review, gastronomy, YouTube, music production, marketing, or anything you can describe. A squad is a fully packaged, versioned, invocable team of AI agents that lives inside your project and gets smarter over time.

```
                    ┌─────────────────────────────────────────────┐
                    │              AIOSON Squad                    │
                    │                                              │
                    │  @orchestrator ─── coordinates the team      │
                    │       │                                      │
                    │  ┌────┴──────────────────────────┐          │
                    │  │         Executors              │          │
                    │  │  @scriptwriter  @copywriter    │          │
                    │  │  @analyst       @reviewer      │          │
                    │  └───────────────────────────────┘          │
                    │       │                                      │
                    │  ┌────┴──────────────────────────┐          │
                    │  │  Genome (cognitive layer)      │          │
                    │  │  "how this team thinks"        │          │
                    │  │  domain · function · persona   │          │
                    │  └───────────────────────────────┘          │
                    │       │                                      │
                    │  ┌────┴──────────────────────────┐          │
                    │  │  Skills (operational layer)    │          │
                    │  │  "what this team knows how to do"        │
                    │  └───────────────────────────────┘          │
                    └─────────────────────────────────────────────┘
```

### Create a squad for any domain

```bash
# Software squad
@squad
> domain: SaaS product development
> goal: ship features end-to-end
> roles: product, architect, dev, qa

# YouTube content squad
@squad
> domain: YouTube content creation
> goal: scriptwriting, hooks, retention
> roles: scriptwriter, hook-analyst, thumbnail-strategist, orchestrator

# Legal review squad
@squad
> domain: contract review — Brazilian corporate law
> goal: flag risks, suggest amendments
> roles: risk-analyst, clause-reviewer, summarizer
```

Each squad gets its own package under `.aioson/squads/{slug}/` — agents, manifest, output folder, execution logs. Every agent is directly invocable by the user: `@scriptwriter`, `@risk-analyst`, `@hook-analyst`.

---

### Genome — the cognitive layer

Skills tell an agent what to do. A genome tells it **how to think**.

```
@genome
> type: domain
> domain: viral content strategy
> depth: expert

→ generates: .aioson/genomes/viral-content-strategy.md
  - mental models and decision frameworks
  - quality lenses and judgment heuristics
  - anti-patterns and known failure modes
  - vocabulary and reference benchmarks
```

Four genome types:

| Type | What it encodes |
|------|----------------|
| `domain` | Deep knowledge of a field — editorial, legal, financial, technical |
| `function` | Operational expertise — retention analysis, risk review, architecture |
| `persona` | Cognitive profile of a real person — their mental models, blindspots, style |
| `hybrid` | Combination of domain + persona with weighted influence |

Apply a genome to any squad executor and the agent thinks with those lenses — not just follows instructions.

---

### Persona genomes and the Profiler pipeline

When a squad revolves around a specific person's methodology — a creator, strategist, or thought leader — AIOSON can profile them and inject their cognitive fingerprint into the squad.

```
@genome --type=persona --person="Alex Hormozi"
         │
         ▼ @profiler-researcher
   Web research, books, interviews, frameworks collected
         │
         ▼ @profiler-enricher
   Cognitive analysis, psychometric profiling
   DISC profile, Enneagram, Big Five, MBTI mapped
         │
         ▼ @profiler-forge
   .aioson/profiler-reports/alex-hormozi/enriched-profile.md
   genome-alex-hormozi.md (Genome 3.0)
         │
         ▼ applied to @copywriter in your squad
   @copywriter now reasons with Hormozi's offer-framing mental models
```

Genome 3.0 fields include `disc`, `enneagram`, `big_five`, `mbti`, `confidence`, and `hybrid_mode` — so you know exactly how confident the profiling is and where it was inferred vs. evidence-based.

---

### DISC behavioral profiles

Every squad executor can be assigned a behavioral profile so its communication style, decision speed, and conflict resolution match the squad's dynamics:

| Profile | Traits | Best for |
|---------|--------|----------|
| `dominant-driver` | Direct, fast, results-first | Execution agents, sprint leads |
| `influential-expressive` | Persuasive, creative, high energy | Content creators, copywriters |
| `steady-amiable` | Patient, empathetic, consensus-driven | Reviewers, QA, support agents |
| `compliant-analytical` | Precise, systematic, risk-aware | Analysts, architects, legal review |
| + 4 hybrid combinations | — | — |

---

### Ephemeral squads

Need a quick throwaway team for a one-off task?

```bash
@squad --ephemeral
> domain: competitive analysis for this pitch
> ttl: 24h
```

Ephemeral squads skip the full design-doc flow, use a timestamped slug, and self-expire after the TTL. They never pollute `CLAUDE.md` or `AGENTS.md`. Use them for research sessions, quick drafts, or exploratory tasks.

---

### Cross-squad orchestration

Multiple squads can run in parallel in the same project. When an executor from one squad encounters a task outside its domain, it routes to the right sibling squad automatically — no manual handoff needed.

```
project/
  .aioson/squads/
    content-squad/      @scriptwriter, @hook-analyst, @orchestrator
    dev-squad/          @architect, @dev, @qa, @orchestrator
    legal-squad/        @risk-analyst, @clause-reviewer, @orchestrator

# @scriptwriter receives a question about the privacy policy clause in a script
→ cross-squad router detects: legal domain
→ hands off to @clause-reviewer in legal-squad
→ returns answer to content-squad session
```

The orchestrator of each squad knows its siblings, reads their manifests, and routes out-of-domain requests rather than silently absorbing them or hallucinating an answer.

---

### Webhook integration — trigger squads from anywhere

AIOSON ships a built-in HTTP webhook server. External systems — WhatsApp, Telegram, Slack, ERPs — can trigger any squad and receive async responses via callback.

```bash
aioson squad:webhook start --squad=content-squad --port=3100
```

```
[WhatsApp message]  →  POST /trigger  →  squad executes
                                              ↓
[user receives reply]  ←  POST callback_url  ←  async response
```

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/trigger` | Async execution with callback URL + exponential backoff retry |
| `GET` | `/status/:run_id` | Poll run status |
| `POST` | `/query` | Sync execution (10s timeout) |
| `GET` | `/health` | Server health check |

Bearer token auth and rate limiting (60 req/min/IP) ship out of the box. No extra dependencies — pure `node:http`.

---

### Squad Dashboard

Real-time web panel for monitoring all your squads. Ships with AIOSON, zero extra install.

```bash
aioson squad:dashboard              # → http://localhost:4180
aioson squad:dashboard --squad=content-squad   # jump to a specific squad
aioson squad:dashboard --port=4200  # custom port
```

**What the dashboard shows:**
- Active agents and their current task
- Context usage per agent with warning indicators
- Token consumption over time
- Execution logs and milestone history
- Squad health score and ROI metrics
- Cross-squad pipeline status

Run multiple projects simultaneously on different ports — one dashboard per project.

---

### Squad commands reference

<details>
<summary><strong>Lifecycle — create, validate, maintain</strong></summary>

```bash
aioson squad:create <slug>          # create a new squad
aioson squad:validate <slug>        # validate manifest, agents, and output config
aioson squad:analyze <slug>         # deep analysis of squad health and coverage
aioson squad:extend <slug>          # add executors or skills to existing squad
aioson squad:repair <slug>          # fix broken genomes, missing agents, schema drift
aioson squad:export <slug>          # export squad as portable package
aioson squad:deploy <slug>          # deploy squad to target environment
```

</details>

<details>
<summary><strong>Execution — run, plan, orchestrate</strong></summary>

```bash
aioson squad:plan <slug>            # generate execution plan before running
aioson squad:worker <slug>          # start a squad worker process
aioson squad:daemon <slug>          # run squad as background daemon
aioson squad:processes <slug>       # list running squad processes
aioson squad:worktrees <slug>       # parallel git worktrees per worker
aioson squad:merge <slug>           # merge worktree branches back
```

</details>

<details>
<summary><strong>Intelligence — genome, learning, profiling</strong></summary>

```bash
aioson squad:mcp <slug>             # MCP connector registry for squad
aioson squad:learning <slug>        # review and apply learning from past sessions
aioson squad:score <slug>           # quality and coverage score
aioson squad:roi <slug>             # ROI metrics from session history
aioson squad:investigate <domain>   # domain investigation before squad design
aioson squad:agent-create <slug>    # create a custom agent inside a squad
```

</details>

<details>
<summary><strong>Integration — pipelines, webhooks, recovery</strong></summary>

```bash
aioson squad:pipeline <slug>        # inter-squad DAG pipeline with ports
aioson squad:webhook start          # HTTP webhook server for external triggers
aioson squad:recovery <slug>        # recover interrupted squad session
aioson squad:dashboard              # real-time web monitoring panel
```

</details>

---

## Agents

| Agent | Role | Best for |
|-------|------|----------|
| `/aioson:agent:setup` | Project onboarding & context | First step on any project |
| `/aioson:agent:product` | Product decisions & PRD | Feature scope, user stories |
| `/aioson:agent:sheldon` | Deep technical reasoning & PRD hardening | Hard engineering problems, spec review |
| `/aioson:agent:analyst` | Domain discovery & entity mapping | Understanding the problem space |
| `/aioson:agent:architect` | Project structure & technical decisions | Architecture, stack choices |
| `/aioson:agent:ux-ui` | UI/UX design system & component specs | Dashboards, flows, components |
| `/aioson:agent:pm` | Backlog & user stories | Sprint planning, task breakdown |
| `/aioson:agent:orchestrator` | Session protocol & parallel execution | Multi-agent coordination |
| `/aioson:agent:dev` | Feature implementation (any stack) | Focused dev tasks |
| `/aioson:agent:deyvin` / `/aioson:agent:pair` | Pair programming & continuity | Coding — greenfield or brownfield |
| `/aioson:agent:qa` | Risk-first review & test generation | Quality gates before ship |
| `/aioson:agent:tester` | Systematic test engineering | Coverage gaps, legacy code testing |
| `/aioson:agent:pentester` | Adversarial security review | Security gates before release |
| `/aioson:agent:squad` | Parallel agent squads | Large feature sets in parallel |
| `/aioson:agent:genome` | Agent knowledge & learning | Adaptive squad intelligence |
| `/aioson:agent:committer` | Semantic commit messages | High-quality Git commits |
| `/aioson:agent:briefing` | Plan → structured briefing | Pre-production planning, problem framing |
| `/aioson:agent:copywriter` | Conversion copy & content | Marketing pages, VSL scripts |
| `/aioson:agent:discover` | System discovery & semantic cache | Brownfield mapping, knowledge bootstrap |
| `/aioson:agent:neo` | Onboarding & next steps | "Where do I start?" guidance |
| `/aioson:agent:orache` | Market research & competitors | External data gathering |
| `/aioson:agent:profiler-researcher` | Persona research & profiling | DNA mental research |
| `/aioson:agent:profiler-enricher` | Profile enrichment | Cognitive analysis |
| `/aioson:agent:profiler-forge` | Profile generation | Genome 3.0 advisor creation |
| `/aioson:agent:site-forge` | Site cloning & design extraction | Clone, harvest, blend, or forge skills from any URL |
| `/aioson:agent:design-hybrid-forge` | Hybrid design system generation | Merge two visual parents into one |
| `/aioson:agent:discovery-design-doc` | Discovery & design doc generation | Living design doc bridging discovery to implementation |
| `/aioson:agent:validator` | Deliverable validation | Pre-gate verification |

---

## Quick start

```bash
# Install globally
npm install -g @jaimevalasek/aioson

# New project
aioson init my-project

# Existing project
cd my-project
aioson install .

# One-off (no global install)
npx @jaimevalasek/aioson init my-project
```

Then open your AI client and activate an agent:

```bash
# See all agents and their activation prompts
aioson agents

# Get the activation prompt for any agent
aioson agent:prompt setup --tool=claude

# See the recommended agent sequence for your project size
aioson workflow:plan --classification=SMALL
```

---

## Requirements

**Core**

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | ≥ 18.0.0 | Required by the CLI |
| An AI CLI tool | — | Claude Code, Codex CLI, Gemini CLI, or OpenCode |

**Optional — by feature**

| Feature | Requirement |
|---------|-------------|
| `scan:project` — brownfield scanner | `aioson-models.json` with a cheap LLM API key (DeepSeek, OpenAI, Gemini, Groq, Together, Mistral, or Anthropic) |
| `qa:run` / `qa:scan` — browser QA | `npm install -g playwright && npx playwright install chromium` |
| `mcp:init` / `mcp:doctor` | MCP-compatible tool (Claude Code, Gemini CLI, OpenCode, or Codex CLI) |
| Web3 support | Hardhat, Foundry, Anchor, or other supported chain toolchain |

---

## Tracked live sessions

AIOSON can track every AI session with full runtime observability — useful when working from external clients like Claude Code, Codex CLI, or Gemini CLI.

```bash
# Open a tracked session before the AI client starts
aioson live:start . --tool=claude --agent=deyvin --plan=plan.md --no-launch

# Emit milestones as work progresses
aioson runtime:emit . --agent=deyvin --type=task_started --title="Fix stock modal"
aioson runtime:emit . --agent=deyvin --type=task_completed --summary="Stock modal fixed" --refs="src/app.js"

# Hand off the session to another agent (keeps the same session envelope)
aioson live:handoff . --agent=deyvin --to=qa --reason="Ready for review"

# Monitor in real-time
aioson live:status . --watch=2

# Close and generate summary.md
aioson live:close . --agent=qa --summary="QA complete, shipped"
```

---

## AIOSON Store

Package, publish, and distribute squads, genomes, skills, and full systems through the AIOSON Store.

```bash
# Package and publish your system/boilerplate
aioson system:package .
aioson system:publish . --name=my-stack

# Build mode: compile TS/JSX, obfuscate JS (terser), package as ZIP
aioson system:publish . --name=my-stack --build

# Publish squads, genomes, and skills
aioson squad:publish . --squad=marketing --version=1.0.0
aioson genome:publish . --slug=fintech --version=1.0.0
aioson skill:publish . --slug=vue-spa --version=1.0.0

# Install from the Store
aioson squad:install . --slug=marketing --version=1.0.0
aioson genome:install . --slug=fintech
aioson system:install . --slug=laravel-saas
```

Authentication via `auth:login` and workspace management via `workspace:*` commands are supported for cloud features.

## Commands

<details>
<summary><strong>Setup & install</strong></summary>

```bash
aioson init <project-name> [--lang=en|pt-BR|es|fr] [--tool=codex|claude|gemini|opencode]
aioson install [path] [--lang=en|pt-BR|es|fr] [--tool=codex|claude|gemini|opencode]
aioson update [path] [--lang=en|pt-BR|es|fr] [--all]
aioson info [path] [--json]
aioson doctor [path] [--fix] [--dry-run] [--json]
aioson setup:context [path] [--defaults] [--framework=<name>] [--lang=en|pt-BR|es|fr]
aioson context:validate [path] [--json]
aioson scan:project [path] [--folder=src] [--with-llm] [--provider=<name>] [--dry-run] [--json]
```

</details>

<details>
<summary><strong>Agents & workflow</strong></summary>

```bash
aioson agents
aioson agent:prompt <agent> [--tool=codex|claude|gemini|opencode]
aioson workflow:plan [path] [--classification=MICRO|SMALL|MEDIUM] [--json]
aioson workflow:next [path] [--complete] [--auto-heal] [--force]
aioson workflow:heal [path] --stage=<agent>
aioson workflow:harden [path] [--dry-run]
aioson workflow:execute [path] [--dry-run] [--start-from=<agent>]
```

</details>

<details>
<summary><strong>SDD automation & gates</strong></summary>

```bash
aioson preflight [path] [--json]
aioson classify [path] [--json]
aioson gate:check [path] --gate=A|B|C|D [--json]
aioson artifact:validate [path] --feature=<slug> [--json]
aioson detect:test-runner [path] [--json]
aioson agent:audit [path] [--json]
aioson brief:gen [path] --feature=<slug> [--json]
aioson verify:gate [path] --feature=<slug> [--json]
```

</details>

<details>
<summary><strong>Parallel orchestration</strong></summary>

```bash
aioson parallel:init [path] [--workers=2..6] [--force] [--dry-run] [--json]
aioson parallel:assign [path] [--source=auto|prd|architecture|discovery|<file>] [--workers=2..6]
aioson parallel:status [path] [--json]
aioson parallel:doctor [path] [--workers=2..6] [--fix] [--force] [--dry-run] [--json]
```

</details>

<details>
<summary><strong>Live sessions & runtime</strong></summary>

```bash
aioson live:start [path] --tool=codex|claude|gemini|opencode --agent=<agent> [--plan=<file>] [--no-launch]
aioson live:handoff [path] --agent=<agent> --to=<next-agent> --reason="..."
aioson live:status [path] [--watch=<seconds>]
aioson live:close [path] --agent=<agent> --summary="..."
aioson runtime:emit [path] --agent=<agent> --type=<event> --summary="..."
```

`live:start` supports tmux for persistent terminal sessions. Use `--no-launch` to only prepare the tracked envelope without starting the client.

</details>

<details>
<summary><strong>MCP</strong></summary>

```bash
aioson mcp:init [path] [--tool=claude|codex|gemini|opencode] [--dry-run] [--json]
aioson mcp:doctor [path] [--strict-env] [--json]
```

`mcp:init` generates `.aioson/mcp/servers.local.json` and tool-specific preset templates. Supports Context7 and Database MCP in remote-endpoint mode.

</details>

<details>
<summary><strong>Browser QA (Playwright)</strong></summary>

```bash
aioson qa:init [path] [--url=<app-url>] [--dry-run] [--json]
aioson qa:run [path] [--url=<app-url>] [--persona=naive|hacker|power|mobile] [--headed] [--html] [--json]
aioson qa:scan [path] [--url=<app-url>] [--depth=3] [--max-pages=50] [--headed] [--html] [--json]
aioson qa:report [path] [--html] [--json]
aioson qa:doctor [path] [--json]
```

</details>

<details>
<summary><strong>Squads</strong></summary>

```bash
aioson squad:status [path]
aioson squad:doctor [path] --squad=<slug>
aioson squad:validate [path] --squad=<slug>
aioson squad:export [path] --squad=<slug>
aioson squad:bus [path] --squad=<slug> --sub=post|read|watch|summary|list|clear
aioson squad:autorun [path] --squad=<slug> --goal="..."
aioson squad:daemon [path] --squad=<slug> --sub=start|stop|status
aioson squad:worker [path] --squad=<slug> --sub=list|run
aioson squad:dashboard [--port=4180] [--squad=<slug>]
```

</details>

<details>
<summary><strong>Store & cloud</strong></summary>

```bash
aioson auth:login --token ...
aioson auth:status
aioson workspace:init [path] --name=<slug>
aioson system:package [path]
aioson system:publish [path] --name=<slug>
aioson squad:publish [path] --squad=<slug> [--paid]
aioson squad:install [path] --slug=<slug>
aioson genome:publish [path] --slug=<slug>
aioson genome:install [path] --slug=<slug>
aioson skill:publish [path] --slug=<slug>
```

</details>

<details>
<summary><strong>Context optimization</strong></summary>

```bash
aioson context:pack [path] [--agent=<agent>] [--goal="..."] [--module=<folder>]
aioson context:health [path]
aioson feature:archive [path] --feature=<slug> [--dry-run] [--restore] [--force]
aioson context:monitor [path] [--budget=<n>] [--tokens=<n>]
aioson context:search:index [path]
aioson context:search [path] --query="..."
aioson context:cache:save --label=<name>
aioson context:cache:restore --label=<name>
aioson compress:agents [path] [--agent=<name>] [--rules] [--dry-run] [--restore]
```

</details>

<details>
<summary><strong>i18n & locale</strong></summary>

```bash
aioson i18n:add <locale>
aioson locale:apply [path] [--lang=en|pt-BR|es|fr]
```

Built-in locales: `en`, `pt-BR`, `es`, `fr`. Use `--lang` or `AIOS_LITE_LOCALE` env var.

</details>

<details>
<summary><strong>Git & committer</strong></summary>

```bash
aioson commit:prepare [path] [--json]
aioson git:guard [path] [--install-hook] [--json]
```

`commit:prepare` collects staged diffs, runs `git:guard`, and generates a `commit-prep.json` ready for `@committer`.
`git:guard` blocks commits with forbidden files (`node_modules/`, secrets, etc.) and can install a pre-commit hook.

</details>

<details>
<summary><strong>Testing & CI</strong></summary>

```bash
aioson test:agents [path]
aioson test:smoke [workspace-path] [--lang=en|pt-BR|es|fr] [--web3=ethereum|solana|cardano] [--profile=standard|mixed|parallel] [--keep] [--json]
aioson test:package [source-path] [--keep] [--dry-run] [--json]
```

</details>

---

## Multi-IDE support

| IDE / Client | Config file |
|--------------|-------------|
| Claude Code | `CLAUDE.md` |
| Codex CLI | `AGENTS.md` |
| Gemini CLI | `.gemini/GEMINI.md` |
| OpenCode | `OPENCODE.md` |

---

## Web3 support

Supports `project_type=dapp` with detection for Ethereum (Hardhat, Foundry, Truffle), Solana (Anchor, Solana Web3), and Cardano (Aiken/Cardano SDK).

```bash
aioson setup:context . \
  --web3-enabled=true \
  --web3-networks=ethereum,solana \
  --contract-framework=Hardhat \
  --wallet-provider=wagmi \
  --indexer="The Graph" \
  --rpc-provider=Alchemy
```

See the [Web3 guide](docs/en/web3.md) for full details.

---

## JSON output for CI

Most commands support `--json` for structured output. See [JSON schemas](docs/en/json-schemas.md) for contracts.

```bash
aioson info --json
aioson doctor --json
aioson agents --json
aioson parallel:status --json
aioson qa:run --json
aioson scan:project --json
```

---

## Documentation

**CLI & commands**
- [CLI reference](docs/en/5-reference/cli-reference.md) — full docs for every command
- [JSON schemas](docs/en/5-reference/json-schemas.md) — `--json` output contracts

**Feature guides**
- [Parallel orchestration](docs/en/5-reference/parallel.md)
- [MCP guide](docs/en/5-reference/mcp.md)
- [Browser QA guide](docs/en/5-reference/qa-browser.md)
- [Web3 guide](docs/en/5-reference/web3.md)
- [i18n guide](docs/en/5-reference/i18n.md)
- [Squad Dashboard](docs/en/5-reference/squad-dashboard.md)

**Portuguese guides**

*Entender*
- [O que é AIOSON](docs/pt/1-entender/o-que-e-aioson.md)
- [Por que existe](docs/pt/1-entender/por-que-existe.md)
- [Mapa do ecossistema](docs/pt/1-entender/mapa-do-ecossistema.md)
- [Glossário](docs/pt/1-entender/glossario.md)

*Começar*
- [Primeiro projeto](docs/pt/2-comecar/primeiro-projeto.md)
- [Projeto existente](docs/pt/2-comecar/projeto-existente.md)
- [Decisões iniciais](docs/pt/2-comecar/decisoes-iniciais.md)

*Receitas*
- [App SaaS do zero](docs/pt/3-receitas/app-saas-do-zero.md)
- [Feature completa com Sheldon](docs/pt/3-receitas/feature-completa-com-sheldon.md)
- [Da ideia ao PRD via briefing](docs/pt/3-receitas/da-ideia-ao-prd-via-briefing.md)
- [Landing page](docs/pt/3-receitas/landing-page.md)
- [Continuidade entre sessões](docs/pt/3-receitas/continuidade-entre-sessoes.md)
- [Integração em codebase grande](docs/pt/3-receitas/integracao-em-codebase-grande.md)
- [Refatoração grande](docs/pt/3-receitas/refatoracao-grande.md)
- [Auditoria de segurança](docs/pt/3-receitas/auditoria-seguranca.md)
- [Clonar design de site](docs/pt/3-receitas/clonar-design-de-site.md)
- [Publicar no AIOSON Store](docs/pt/3-receitas/publicar-no-aioson-com.md)

*Agentes*
- [Guia de agentes](docs/pt/agentes.md)
- [Referência por agente](docs/pt/4-agentes/README.md)

*Referência*
- [Clientes AI](docs/pt/5-referencia/clientes-ai.md)
- [SDD framework](docs/pt/5-referencia/sdd-framework.md)
- [Motor hardening](docs/pt/5-referencia/motor-hardening.md)
- [Runtime observability](docs/pt/5-referencia/runtime-observability.md)
- [Live sessions](docs/pt/5-referencia/live-sessions.md)
- [Memória e contexto](docs/pt/5-referencia/memoria-e-contexto.md)
- [Feature dossier](docs/pt/5-referencia/feature-dossier.md)
- [Agent sharding](docs/pt/5-referencia/agent-sharding.md)
- [Skills](docs/pt/5-referencia/skills.md)
- [Sandbox executor](docs/pt/5-referencia/sandbox.md)
- [Squad Dashboard (PT)](docs/pt/5-referencia/squad-dashboard.md)
- [Design-docs governance](docs/pt/5-referencia/design-docs-governance.md)
- [Runner system](docs/pt/5-referencia/runner-system.md)
- [Secure by default](docs/pt/5-referencia/secure-by-default.md)

*Living Memory*
- [Memória viva](docs/pt/living-memory/memoria-viva.md)
- [Autonomy contract](docs/pt/living-memory/autonomy-contract.md)

---

## License

[AGPL-3.0-only](LICENSE) — GNU Affero General Public License v3.0
