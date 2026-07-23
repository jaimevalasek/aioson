---
name: agent-structural-contract
description: Structural contract every AIOSON agent must follow — mandatory sections, observability order, handoff pattern, and CLI command integrity
priority: 5
version: 1.0.0
modes: [planning, executing]
task_types: [agent-contract, agent-authoring]
load_tier: trigger
guard: true
triggers: [editing agent files, creating agents, agent prompt, handoff contract, observability block, milestone order]
paths: [.aioson/agents/**, template/.aioson/agents/**, .aioson/squads/**]
---

# Agent Structural Contract

Every AIOSON agent file (`template/.aioson/agents/*.md`) must comply with this structural contract. Violations are caught by `@qa` during Gate D and by `@sheldon` during enrichment reviews.

## 1. Language boundary (mandatory, line 3)

Every agent MUST start with:

```markdown
> **LANGUAGE BOUNDARY:** Agent instructions are canonical in English. All user-facing communication must follow `interaction_language` from project context. If it is absent, fall back to `conversation_language`.
```

## 2. Mandatory sections

Every agent that interacts with the user MUST have these sections (order may vary):

| Section | Purpose | Required for |
|---|---|---|
| `## Mission` | What the agent does in 1-2 lines | All agents |
| `## Required input` | What files must be read before acting | All agents |
| `## Hard constraints` | Non-negotiable rules | All agents |
| Observability block | `agent:done` + `pulse:update` at session end | All agents |

Agents in the canonical feature workflow additionally MUST have:

| Section | Purpose | Required for |
|---|---|---|
| Handoff section | Structured next-agent recommendation | briefing, product, sheldon, planner |
| `## Feature dossier` | Dossier read/write integration | product, sheldon, planner, dev, qa |

## 3. Observability command order (session end)

At session end, commands MUST appear in this exact order. Missing steps are acceptable when marked N/A — wrong order is not.

```
1. gate:approve     (if this agent owns a gate — planner=C, qa=D)
2. op:capture       (if user confirmed decisions — product, sheldon, planner)
3. pulse:update     (ALL agents — automated project-pulse update)
4. agent:done       (ALL agents — ALWAYS LAST)
```

`runtime:emit` milestones happen DURING the session at strategic moments, NOT in the session-end block. Each agent should emit at least 2 milestones during execution.

### Milestone timing per agent

| Agent | Milestone 1 (emit during work) | Milestone 2 (emit during work) |
|---|---|---|
| @briefing | Briefing draft written | Briefing approved |
| @product | PRD written | Feature registered in `.aioson/context/features.md` |
| @sheldon | Sizing decided | Enrichment applied |
| @planner | Repository path mapped | Vertical plan approved |
| @analyst | Requirements written | Spec skeleton created |
| @architect | Architecture decided | Gate B check |
| @pm | Named priority question identified | Recommendation returned |
| @orchestrator | Execution lanes justified | Ownership and merge order resolved |
| @dev | Slice started | Slice landed |
| @qa | Review started | Verdict decided |

## 4. Handoff contract

Every workflow agent MUST end with a handoff block following this template:

```markdown
**Handoff message:**
```
[Artifact produced]: .aioson/context/[artifact].md
[Gate status]: Gate [X]: [approved|pending]
Next agent: @[name] ([condition or rationale])
Action: /[agent-name]
```
> Recommended: `/compact` before activating the next same-feature agent. Use `/clear` only for a hard reset, feature switch, polluted context, or security-sensitive reset.
```

Rules:
- The handoff message MUST include at least: artifact path, next agent, and rationale.
- `/compact` recommendation MUST be present for same-feature continuation.
- `/clear` MUST be described only as a hard reset option.
- Do NOT continue into the next agent's work — output only the handoff and stop.

## 5. CLI error handling

Best-effort `aioson` CLI commands in agent files MUST end with `2>/dev/null || true` to prevent optional telemetry or context helpers from breaking the session when the CLI is unavailable.

```
aioson <command> . --flag=value 2>/dev/null || true
```

Do not silence blocking commands whose result controls safety, routing, or user action. These commands must run normally, and the agent must inspect their result before continuing.

Blocking examples:
- `aioson git:guard`
- `aioson commit:prepare`
- `aioson gate:check`
- `aioson preflight`
- `aioson workflow:status`
- `aioson context:validate`

Best-effort examples:
- `aioson runtime:emit`
- `aioson pulse:update`
- `aioson agent:done`
- `aioson dossier:*`
- `aioson memory:search`
- `aioson context:search`
- `aioson context:brief`
- `aioson context:pack`

Commands inside "Quick start" or "Prerequisites" sections are user-run examples and do not need the best-effort suffix.

## 6. CLI flag integrity

Agent files must reference CLI commands with correct flag names. When adding a new command reference:

1. Check `src/commands/<command>.js` for the actual option names.
2. Use `--flag=value` syntax (not positional arguments) for clarity.
3. Never guess flags — verify against the source.

Known correct signatures (reference table):

| Command | Correct flags |
|---|---|
| `gate:approve` | `--feature=<slug> --gate=<A\|B\|C\|D>` |
| `gate:check` | `--feature=<slug> --gate=<A\|B\|C\|D>` |
| `pulse:update` | `--agent=<name> --feature=<slug> --action="<summary>" --next="<recommendation>"` |
| `op:capture` | `--signal=<type> --quote="<verbatim>" --proposal="<paraphrase>" --source-agent=<name>` |
| `brain:query` | `--tags=<csv> --min-quality=<n> --format=<compact\|json\|ids>` |
| `artifact:validate` | `--feature=<slug>` (NOT `--spec=<file>`) |
| `dossier:audit` | `--check=<template-parity\|coverage>` (NOT `--slug=<slug>`) |
| `dossier:add-finding` | `--slug=<slug> --agent=<name> --section="<section>" --content="<text>"` |
| `dossier:add-codemap` | `--slug=<slug> --file=<path> --role=<role> --coupling=<low\|medium\|high> --added-by=<agent>` |
| `dossier:link-rule` | `--slug=<slug> --rule=<path> --reason="<text>"` |
| `runtime:emit` | `--agent=<name> --type=<milestone\|gate_check> --summary="<text>"` |
| `memory:search` | `--query="<text>"` |
| `context:search` | `[path] --query="<text>" --agent=<name> --mode=<mode> --task="<text>" --paths=<csv> --intent=<csv>` |
| `context:brief` | `[path] --agent=<name> --mode=<planning\|executing> --task="<text>" --paths=<csv> [--no-recall]` |
| `context:index` | `[path] --force` |
| `preflight` | `--agent=<name> --feature=<slug>` |
| `dev:state:write` | `--feature=<slug> --phase=<n> --next="<description>" --context=<tokens>`; supports `simple-plan` |

## 7. Template-workspace parity

Agent files in `template/.aioson/agents/` are the canonical source. Workspace files in `.aioson/agents/` are copies synced via `npm run sync:agents`.

Rules:
- Edits MUST be made in `template/` first, then synced to workspace.
- After any agent edit session, verify parity with `diff template/.aioson/agents/<file> .aioson/agents/<file>`.
- Drift between template and workspace is a bug — the template always wins.

## On violation detected

When an agent file violates this contract:

1. **During @qa Gate D:** flag as a Medium finding with `recommended_owner: dev`.
2. **During @sheldon review:** repair the existing PRD or flag the prompt itself; do not create an enrichment artifact.
3. **During @deyvin pair session:** fix inline if the touched file is already in scope.
4. **Never block a feature** for structural violations alone — document and fix as follow-up.
