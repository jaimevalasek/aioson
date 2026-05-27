---
name: agent-structural-contract
description: Contrato estrutural que todo agente AIOSON deve seguir — seções obrigatórias, ordem de observabilidade, padrão de handoff, e integridade de comandos CLI
priority: 5
version: 1.0.0
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

Agents that are part of the SDD workflow additionally MUST have:

| Section | Purpose | Required for |
|---|---|---|
| Handoff section | Structured next-agent recommendation | briefing, product, sheldon, analyst, architect, pm, orchestrator |
| `## Feature dossier` | Dossier read/write integration | product, sheldon, analyst, architect, pm, orchestrator |

## 3. Observability command order (session end)

At session end, commands MUST appear in this exact order. Missing steps are acceptable when marked N/A — wrong order is not.

```
1. gate:approve     (if this agent owns a gate — analyst=A, architect=B, pm=C, qa=D)
2. op:capture       (if user confirmed decisions — product, sheldon, pm)
3. pulse:update     (ALL agents — automated project-pulse update)
4. agent:done       (ALL agents — ALWAYS LAST)
```

`runtime:emit` milestones happen DURING the session at strategic moments, NOT in the session-end block. Each agent should emit at least 2 milestones during execution.

### Milestone timing per agent

| Agent | Milestone 1 (emit during work) | Milestone 2 (emit during work) |
|---|---|---|
| @briefing | Briefing draft written | Briefing approved |
| @product | PRD written | Feature registered in features.md |
| @sheldon | Sizing decided | Enrichment applied |
| @analyst | Requirements written | Spec skeleton created |
| @architect | Architecture decided | Gate B check |
| @pm | Implementation plan written | Gate C approved |
| @orchestrator | Lanes initialized | Merge complete |
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
> Recommended: `/clear` before activating — fresh context window.
```

Rules:
- The handoff message MUST include at least: artifact path, next agent, and rationale.
- `/clear` recommendation MUST be present.
- Do NOT continue into the next agent's work — output only the handoff and stop.

## 5. CLI error handling

Every `aioson` CLI command in an agent file MUST end with `2>/dev/null || true` to prevent silent failures from breaking the session.

```
aioson <command> . --flag=value 2>/dev/null || true
```

The ONLY exception is commands inside "Quick start" or "Prerequisites" sections where the user runs them manually (not the agent).

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
| `context:search` | `--query="<text>"` |
| `preflight` | `--agent=<name> --feature=<slug>` |
| `dev:state:write` | `--feature=<slug> --phase=<n> --next="<description>" --context=<tokens>` |

## 7. Template-workspace parity

Agent files in `template/.aioson/agents/` are the canonical source. Workspace files in `.aioson/agents/` are copies synced via `npm run sync:agents`.

Rules:
- Edits MUST be made in `template/` first, then synced to workspace.
- After any agent edit session, verify parity with `diff template/.aioson/agents/<file> .aioson/agents/<file>`.
- Drift between template and workspace is a bug — the template always wins.

## On violation detected

When an agent file violates this contract:

1. **During @qa Gate D:** flag as a Medium finding with `recommended_owner: dev`.
2. **During @sheldon enrichment:** flag in `sheldon-enrichment-{slug}.md` improvements list.
3. **During @deyvin pair session:** fix inline if the touched file is already in scope.
4. **Never block a feature** for structural violations alone — document and fix as follow-up.
