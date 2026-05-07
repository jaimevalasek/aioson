---
description: "Squad package contract — required filesystem layout, manifests, executor prompts, metadata, and gateway registration."
---

# Squad Package Contract

Use this module whenever `@squad` is creating, extending, repairing, or validating the package itself.

## Non-negotiable package shape

Every persistent squad must be created at `.aioson/squads/{squad-slug}/` with:

- `agents/agents.md`
- `agents/`
- `workers/`
- `workflows/`
- `checklists/`
- `skills/`
- `templates/`
- `docs/design-doc.md`
- `docs/readiness.md`
- `squad.manifest.json`
- `squad.md`
- external roots: `output/{squad-slug}/`, `aioson-logs/{squad-slug}/`, `media/{squad-slug}/`

Do not collapse the squad into `agents/{slug}/`. The CLI and dashboard expect the package root under `.aioson/squads/`.

## Package derivation checklist

Before writing executors, derive and register:

- mission
- goal
- scope and out-of-scope
- domain classification
- locale scope and rationale
- skills
- MCPs
- subagent policy
- content blueprints when relevant
- source docs when relevant
- investigation summary when relevant
- output strategy when relevant
- design-doc summary
- readiness status

Reuse installed squad skills from `.aioson/squads/{squad-slug}/skills/` before inventing new ones.

## `agents/agents.md`

Create a short textual map at `.aioson/squads/{squad-slug}/agents/agents.md`.
Keep it concise and actionable. It should include:

- mission
- does
- does not
- permanent executors
- skills
- MCPs
- subagent policy
- outputs and review policy

Do not paste full executor prompts into this file.

## `squad.manifest.json`

Create `.aioson/squads/{squad-slug}/squad.manifest.json`.
At minimum, include:

- `schemaVersion`
- `packageVersion`
- `slug`
- `name`
- `mode`
- `mission`
- `goal`
- `visibility`
- `locale_scope`
- `storagePolicy`
- `package.rootDir`
- `package.agentsDir`
- `package.workersDir`
- `package.workflowsDir`
- `package.checklistsDir`
- `package.skillsDir`
- `package.templatesDir`
- `package.docsDir`
- `rules.outputsDir`
- `rules.logsDir`
- `rules.mediaDir`
- `skills`
- `mcps`
- `subagents`
- `contentBlueprints`
- `executors`
- `checklists`
- `workflows`
- `genomes`

When they exist, also persist:

- `locale_rationale`
- `domainClassification`
- `investigation`
- `sourceDocs`

The manifest must mirror the real files you generated.

## Executor generation

### Workers

If an executor is `type: worker`:

- create `.aioson/squads/{squad-slug}/workers/{slug}.py` or `.sh`
- keep it deterministic
- mark it in the manifest with:
  - `"usesLLM": false`
  - `"deterministic": true`

### Agents, clones, assistants

If an executor is `type: agent`, `clone`, or `assistant`:

- create `.aioson/squads/{squad-slug}/agents/{role-slug}.md`
- keep it concise but dense
- make the file immediately usable when invoked via `@`

Recommended structure:

- `## Mission`
- `## Quick context`
- `## Active genomes`
- `## Focus`
- `## Response pattern`
- `## Hard constraints`
- `## Output contract`

Each executor prompt should make clear:

- which squad skills it relies on
- when to delegate to another executor
- when to ask the orchestrator for a temporary subagent

### Customer-facing executors — mandatory world-context block

Any executor whose role involves direct customer interaction (retail, hospitality, service, support, sales, food service, reception, etc.) **must** include this block in its `## Quick context` section. The block is the world-model anchor — without it, executors produce clipped responses ("we only sell medicine" when asked for candy at a pharmacy):

```yaml
role: "Concrete role title with operational specificity"
backstory: |
  3–6 sentences anchoring the executor in real lived experience.
  Reference real venues, real years on the job, real customer types.
  Mention the breadth of requests handled daily.
goal: "The single customer-facing outcome to optimize."

operational_breadth:
  primary: ["literal role responsibilities"]
  adjacent: ["5–10 adjacent items real practitioners handle"]
  out_of_scope: ["only what's illegal, unsafe, or genuinely unavailable"]

interaction_principles:
  - "Default 'yes, and...' — accept the premise, build on it"
  - "Refuse only when illegal, unsafe, or genuinely unavailable"
  - "Never say 'we only sell X' — name what we DO have"
  - "Validate the underlying need before responding to the literal request"
```

Full guidance + four worked examples (pharmacy, restaurant, gym, hotel) in `.aioson/docs/squad/domain-breadth.md`. The `quality-lens.md` scorecard now includes a `domain breadth` criterion that gates this block.

Agent file language follows `.aioson/rules/agent-language-policy.md`:

- `locale_scope` absent or `universal` → prompt files in English
- locale-specific `locale_scope` declared → prompt files in the locale language
- source code identifiers remain in English in every case

### UI specialist executor

If `uiCapability.mode = "executor"`:

- create `.aioson/squads/{squad-slug}/agents/ui-specialist.md`
- treat it as a visual specialist responsible for UI direction, layout decisions, and HTML/UI-spec deliverables
- give it `modelTier: powerful`
- if using an assistant profile, prefer `behavioralProfile: compliant-dominant`
- make the routing explicit: visual, layout, interface, landing page, and component-structure requests go to `@ui-specialist`

## Orchestrator prompt

Create `.aioson/squads/{squad-slug}/agents/orquestrador.md`.
The orchestrator must include:

- squad mission
- members
- routing guide
- genomes
- skills
- MCPs
- subagent policy
- inter-squad awareness
- execution plan awareness
- learnings protocol
- hard constraints
- output contract

The orchestrator is responsible for the final session HTML and for synthesis across specialists.

## Gateway registration

Register the squad in both root gateway files:

- `CLAUDE.md`
- `AGENTS.md`

Use `.aioson/squads/{squad-slug}/agents/{role}.md` paths.

Rules:

- do not remove official framework agents
- append or update only the squad section
- if the squad already exists, update only its own section

## Squad metadata

Create `.aioson/squads/{squad-slug}/squad.md` with:

- name
- mode
- goal
- agents path
- manifest path
- output path
- logs path
- media path
- latest session path
- locale scope
- locale rationale when present
- source docs when present
- investigation path when present
- squad-level genomes
- per-agent genomes
- skills
- MCPs
- subagent policy

## Required filesystem outputs

Persistent squad package:

- `.aioson/squads/{squad-slug}/squad.manifest.json`
- `.aioson/squads/{squad-slug}/squad.md`
- `.aioson/squads/{squad-slug}/agents/`
- `.aioson/squads/{squad-slug}/workers/`
- `.aioson/squads/{squad-slug}/workflows/`
- `.aioson/squads/{squad-slug}/checklists/`
- `.aioson/squads/{squad-slug}/skills/`
- `.aioson/squads/{squad-slug}/templates/`
- `.aioson/squads/{squad-slug}/docs/`
- `output/{squad-slug}/latest.html`
- `aioson-logs/{squad-slug}/`
- `media/{squad-slug}/`
