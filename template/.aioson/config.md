# AIOSON Config

## Principles
- Less is more: complexity must match problem size.
- Single source of truth: rules live in `.aioson/agents/`.
- Never assume stack: detect first, then ask.
- For `project_type=site` and `project_type=web_app`, visual system choice is explicit workflow data. Record it in `design_skill` or leave it blank on purpose; never auto-pick a design skill silently.

## Project sizes
- MICRO: `@setup -> @product (optional) -> @dev`
- SMALL: `@setup -> @product -> @analyst -> @scope-check(pre-dev) -> @architect -> @discovery-design-doc -> @dev -> @qa`
- MEDIUM: `@setup -> @product -> @analyst -> @architect -> @discovery-design-doc -> @ux-ui -> @pm -> @orchestrator -> @scope-check(pre-dev) -> @dev -> @qa`

Optional alignment checkpoints:
- After `@dev`: `@scope-check --scope-mode=post-dev` when the implementation changed planned behavior, touched unexpected files, or skipped approved scope.
- After `@qa`, `@tester`, or `@pentester` corrections: `@scope-check --scope-mode=post-fix` when fixes changed behavior or product scope.

Optional test engineering (activate after @dev when coverage is insufficient):
- `@tester` — systematic test engineering for implemented apps. Activate when: (1) app was built without adequate tests, (2) @qa identifies coverage gaps in 3+ modules, or (3) working on a legacy/brownfield project.

## Official classification
Score (0-6):
- User types: 1=0, 2=1, 3+=2
- External integrations: 0=0, 1-2=1, 3+=2
- Non-obvious rules: none=0, some=1, complex=2

Ranges:
- 0-1: MICRO
- 2-3: SMALL
- 4-6: MEDIUM

## Context budget warning

Setting: `context_warning_threshold` (default: 65%)

| Classification | Recommended threshold |
|---------------|-----------------------|
| MICRO | 75% (short phases, acceptable to go higher) |
| SMALL | 65% (default) |
| MEDIUM | 55% (long phases, warn earlier) |

When an agent notices it is close to the threshold:
1. Write all in-progress artifacts to disk (disk-first)
2. Emit this warning in the selected project language: "Context at {X}% — I recommend `/clear` before the next phase"
3. Include the current work in `last_checkpoint`

## Context contract
`project.context.md` must contain YAML frontmatter with:
- `project_name`
- `project_type`
- `profile`
- `framework`
- `framework_installed` (boolean) — `true` means the framework was detected in the workspace; downstream agents skip installation commands. `false` means it was not detected; agents must include installation steps before any implementation.
- `classification`
- `interaction_language` (BCP-47, for example `en`, `pt-BR`)
- `conversation_language` (legacy compatibility alias; keep synchronized with `interaction_language`)
- `aioson_version`

Optional UI context fields:
- `design_skill` (for example `cognitive-ui`; keep empty when the visual system is still pending)

Optional testing fields:
- `test_runner` (for example `pest`, `jest`, `vitest`, `pytest`, `rspec`, `foundry`)

Optional workflow fields:
- `auto_handoff` (boolean, default `false`) — when `true`, the feature-workflow agents from `@analyst` through `@discovery-design-doc` chain automatically via skill auto-invocation instead of stopping for manual activation, until the `@dev` handoff. Protocol and stop conditions: `.aioson/docs/autopilot-handoff.md`. Upstream agents (`@briefing`, `@product`, `@sheldon`) always hand off manually.

Allowed `project_type` values:
- `web_app`
- `api`
- `site`
- `script`
- `dapp`
- `desktop_app`

Optional Web3 context fields (recommended for `project_type=dapp`):
- `web3_enabled` (boolean)
- `web3_networks` (for example `ethereum`, `solana`, `cardano`, `ethereum,solana`)
- `contract_framework` (for example `Hardhat`, `Foundry`, `Anchor`, `Aiken`)
- `wallet_provider` (for example `wagmi`, `RainbowKit`, `Phantom`, `Lace`)
- `indexer` (for example `The Graph`, `Helius`, `Blockfrost`)
- `rpc_provider` (for example `Alchemy`, `Infura`, `QuickNode`)

## Visual system gate
- For `site` and `web_app`, `design_skill` must be chosen explicitly during the workflow or kept explicitly blank.
- `@setup` can register the initial choice.
- `@product` and `@ux-ui` can confirm or update that choice when it is still blank.
- `@dev` must consume the chosen `design_skill`; it must never auto-select one.

## Runtime lifecycle

When AIOSON manages the session via `aioson workflow:next`, ALL orchestration is handled by the CLI:
- Workflow state (which agent is next, what was completed)
- Event emission to `.aioson/runtime/aios.sqlite` (read by the AIOSON Dashboard at /tasks and /logs)
- Sequence enforcement and required-agent checks

The agent `.md` files define WHAT each agent does. The CLI defines HOW the session is orchestrated.

**Agents should call these commands to keep the dashboard in sync (skip if `aioson` CLI is not installed):**

| Moment | Command |
|---|---|
| On activation | `aioson runtime-log . --agent=@{agent} --title="..." --message="Starting {agent}"` |
| After each step | `aioson runtime-log . --agent=@{agent} --message="<what was done>"` |
| On completion | `aioson runtime-log . --agent=@{agent} --finish --status=completed --summary="..."` |
| Advance workflow | `aioson workflow:next . --complete` |

These commands are injected into the agent prompt automatically by `aioson workflow:next`.
In direct mode (LLM without CLI), agents call them manually following the rules in CLAUDE.md / AGENTS.md.

## Devlog (direct LLM mode without CLI)

When the `aioson` CLI is **not available**, agents must write a devlog file at the end of the session (or when the user asks to save progress). This is the only way to preserve session history for the dashboard when the CLI is missing.

**Directory:** `aioson-logs/` (create if absent)
**Filename:** `devlog-{agent}-{unix-timestamp}.md`

**Template:**
```markdown
---
agent: dev
feature: {feature-slug or "project"}
session_key: direct-session:{unix-timestamp}:{agent}
started_at: {ISO 8601}
finished_at: {ISO 8601}
status: completed
verdict: null
plan_step: null
---

# Devlog: @{agent} — {feature} — {YYYY-MM-DD}

## Summary
{One sentence of what was accomplished.}

## Artifacts
- {path/to/file.ext}

## Decisions
- {decision} → {why}

## Learnings
- [process] {any process learning from this session}
- [domain] {any domain learning}

## Blockers
- {blocker or "None"}
```

**Minimum viable devlog (if session was cut short):**
```markdown
---
agent: {agent}
feature: {slug}
status: partial
started_at: {ISO 8601}
finished_at: {ISO 8601}
---
# Devlog: @{agent} — {feature} — {date}
## Summary
{one sentence of what was done}
## Learnings
- [process] {any process learning}
```

**Rules:**
- Frontmatter fields `agent`, `started_at`, `finished_at` are required. All others are optional.
- `[process]` / `[domain]` / `[quality]` / `[preference]` prefixes in Learnings enable automatic promotion to project memory.
- Record **why** decisions were made — the "what" is in the git diff.
- Skip the devlog for trivial sessions (quick questions, no code changes).
- When the CLI becomes available: `aioson devlog:process .` imports devlogs into SQLite (learnings, artifacts, decisions, verdict).

## On-demand context layers

AIOSON uses three on-demand context layers that any agent can load automatically. Each layer is optional — if the directory is empty or absent, agents skip it silently.

### Rules (`.aioson/rules/`)

Project-specific rules that override agent defaults. Each file must have YAML frontmatter:

```markdown
---
agents: [dev, architect]   # empty [] = universal rule loaded by all agents
---

# Database conventions
- Always use soft deletes
- Never use raw SQL — use the ORM query builder
```

**When to use:** coding standards, naming conventions, architecture constraints, security policies, team agreements.

### Docs (`.aioson/docs/`)

Persistent documentation loaded on-demand based on relevance. Each file must have YAML frontmatter:

```markdown
---
description: "Auth module refactoring plan — migration from JWT to sessions"
---

# Refactoring Plan — Auth Module
...
```

Agents load a doc only when its `description` matches the current task or when a loaded rule references it.

**When to use:**
- Refactoring plans that span multiple sessions
- Integration guides (Stripe, external APIs)
- Domain knowledge the LLM needs but cannot infer from code
- Migration strategies and rollback procedures
- Performance benchmarks and constraints

**Key principle:** docs persist across sessions. A refactoring plan saved here will be available to any future agent that works on the same area — no need to re-explain context.

### Code governance (`.aioson/design-docs/`)

Persistent code-structure governance surfaced by `aioson preflight` and loaded on demand by agents. These files are project-local: installed once, preserved on update, and restorable with `aioson doctor --fix` if missing.

Default governance files:
- `folder-structure.md`
- `componentization.md`
- `code-reuse.md`
- `naming.md`
- `file-size.md`

**When to use:** folder structure, naming, reuse, component boundaries, file-size thresholds, and maintainability constraints.

### Design docs (`.aioson/context/design-doc.md`)

Living decision documents that bridge discovery and implementation. Produced by `@discovery-design-doc`.

```markdown
---
description: "Billing module — Stripe integration with metered pricing"
scope: "billing"
agents: [dev, architect]   # empty [] = all agents load it
---
```

**Design-doc vs PRD — when to use each:**

| | PRD (`prd.md`) | Code governance (`.aioson/design-docs/`) | Design doc (`design-doc.md`) |
|---|---|---|---|
| **Produced by** | `@product` | Installer + project team | `@discovery-design-doc` |
| **Focus** | What and why — vision, users, problem, features | Structural code quality rules | How — technical flows, decisions, risks, slices |
| **Audience** | All agents | Agents doing structural planning or implementation | Technical agents (dev, architect, qa) |
| **Lifecycle** | Written once, enhanced by @pm | Stable, edited when conventions change | Living document, updated as decisions are made |
| **When to create** | Every project/feature | Installed by default | Complex features needing technical clarity |

A project can have both: the PRD defines the product; the design-doc defines the approach. For simple features (MICRO), only the PRD may be needed.

### Bootstrap (`.aioson/context/bootstrap/`)

Semantic knowledge cache that gives agents instant understanding of the system without reading the codebase. Generated by `@discover`.

| File | Content | Loaded by |
|------|---------|-----------|
| `what-is.md` | System identity, users, value proposition | `@product`, `@analyst` |
| `how-it-works.md` | Architecture, modules, data flow, integrations | `@dev`, `@architect` |
| `what-it-does.md` | Features, business rules, user workflows | `@product`, `@analyst` |
| `current-state.md` | Implementation status, tech debt, recent changes | `@dev`, `@qa` |

**When to use:** run `@discover` once after setup, and re-run when significant changes accumulate. Agents read bootstrap files at session start for instant context.

**Key difference from `discovery.md`:** `discovery.md` is a technical scan (routes, entities, structure). Bootstrap is semantic (meaning, purpose, business rules). They complement each other.

## Skills

AIOSON ships three types of skills in `.aioson/skills/`:

| Type | Directory | How agents load them |
|---|---|---|
| **Design skills** | `.aioson/skills/design/` | Explicit — via `design_skill` in project.context.md. Only ONE can be active. |
| **Static skills** | `.aioson/skills/static/` | Automatic — agents match by `framework` in project.context.md |
| **Dynamic skills** | `.aioson/skills/dynamic/` | Automatic — agents load when task references external services |
| **Process skills** | `.aioson/skills/process/` | Loaded on demand when an agent needs a workflow method such as SDD, decision presentation, prompt sharpening, or design-skill creation |

First-party process skills include:

- `prompt-sharpener` — improves agent prompts, skills, PRDs, plans, and handoffs by turning vague guidance into evidence-driven decision behavior while preserving workflow contracts.

### Installed skills (`.aioson/installed-skills/`)

Third-party or custom skills installed via CLI:

```bash
aioson skill:install --slug=my-skill --from=./path/to/SKILL.md
aioson skill:install --slug=my-skill --from=npm
aioson skill:install --slug=my-skill --from=cloud
```

After installation, skills are distributed to editor directories (`.claude/skills/`, `.cursor/skills/`, `.windsurf/skills/`) and become available as slash commands in supported editors.

### Listing available skills

```bash
aioson skill:list              # show installed skills
aioson skill:remove --slug=x   # remove an installed skill
```

**Note:** Source skills in `.aioson/skills/` are loaded automatically by agents — they do not need installation. Only third-party skills require `skill:install`.

## Session handoff

When a workflow stage completes or an agent finishes via `runtime-log --finish`, AIOSON generates `.aioson/context/last-handoff.json` with:

- What was done in the last session
- What comes next
- Which agent should be activated
- Open decisions pending

Agents can read this file on activation to resume work without losing context between sessions.

## Context compaction template

When approaching context threshold, any agent can write a structured checkpoint to
`.aioson/context/last-handoff.json` before compacting:

```json
{
  "agent": "<agent-name>",
  "session_summary": {
    "messages_processed": "<N>",
    "tools_used": ["<tool1>", "<tool2>"],
    "recent_requests": ["<last 3 user requests>"],
    "pending_work": ["<item1>", "<item2>"],
    "key_files": ["<path1>", "<path2>"],
    "timeline": ["<step1 done>", "<step2 done>"]
  },
  "compacted_at": "<ISO 8601>",
  "resume_instruction": "Continue from this summary. Do not acknowledge it."
}
```

After writing, prepend to the next response:
`[Context compacted — resuming from checkpoint]`

On resume: read `last-handoff.json` before loading any other context file.

Agents with dedicated compaction protocols (e.g. `@orache`) define additional
steps in their own files — this template is the shared baseline.

## Hook contract (PreToolUse / PostToolUse)

Hooks are shell scripts configured in `.claude/settings.json` under `hooks`.
The harness passes context via stdin (JSON) and environment variables.

### Exit codes
| Code | Meaning |
|------|---------|
| 0 | Allow — continue tool execution |
| 2 | Deny — block tool, return message to agent |
| other non-zero | Warn — log warning, continue execution |

### Environment variables
| Variable | Description |
|----------|-------------|
| `HOOK_EVENT` | `PreToolUse` or `PostToolUse` |
| `HOOK_TOOL_NAME` | Tool being executed (e.g. `Bash`, `Write`) |
| `HOOK_TOOL_INPUT` | JSON params of the tool call |
| `HOOK_TOOL_IS_ERROR` | `true`/`false` (PostToolUse only) |
| `HOOK_TOOL_OUTPUT` | Tool output (PostToolUse only) |

### Example: block rm -rf in Bash
```bash
#!/bin/bash
INPUT=$(cat)
if echo "$INPUT" | grep -q "rm -rf"; then
  echo "Blocked: rm -rf not allowed in this project"
  exit 2
fi
exit 0
```

## Agent file size guidelines

The Claude Code harness enforces a hard limit of ~4,000 chars per auto-loaded
instruction file (`CLAUDE.md` hierarchy). Files are truncated silently.
Agent files in `.aioson/agents/` are read manually (not auto-loaded) so they
are not subject to this truncation, but large files consume context budget.

Recommended targets:

| File type | Target | Notes |
|-----------|--------|-------|
| `CLAUDE.md` / `AGENTS.md` | ≤ 3,500 chars | Auto-loaded — hard truncation applies |
| Focused agents (analyst, qa, tester) | ≤ 8,000 chars | Keep lean |
| Generalist agents (dev, architect) | ≤ 15,000 chars | Move optional sections to `.aioson/docs/` |
| Orchestrator agents (orchestrator, squad) | ≤ 12,000 chars | Move boilerplate to `.aioson/rules/` |

When an agent file exceeds its target:
1. Move repeated boilerplate to a shared `.aioson/rules/` file
2. Split optional sections into `.aioson/docs/` files (loaded on demand)
3. Use the "On-demand context layers" pattern from this config

## Config tiers

AIOSON supports three config tiers (precedence: local > project > user):

| Tier | Location | Versioned | Purpose |
|------|----------|-----------|---------|
| User | `~/.aioson/config.md` | No | Personal defaults (model, locale, thresholds) |
| Project | `.aioson/config.md` | Yes | Team standards — source of truth |
| Local | `.aioson/config.local.md` | No | Machine overrides (local paths, env specifics) |

When the same setting exists in multiple tiers, the lower tier wins (local > project > user).

**Current support:**
- Project tier: fully supported (this file)
- Local tier: `config.local.md` is the convention — agents can read it if present
- User tier (`~/.aioson/config.md`): **backlog** — requires CLI support; not yet read automatically

Until the user tier is implemented in the CLI, use `CLAUDE.local.md` for personal
preferences that should not affect other team members.

## Agent language model
- Canonical agent prompts are stored only in `.aioson/agents/` and written in English.
- User-facing communication is controlled by `interaction_language`.
- `conversation_language` remains as a compatibility alias for older projects.
- Use `aioson locale:apply` to restore canonical prompts and synchronize the chosen `interaction_language`.
