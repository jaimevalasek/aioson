---
description: "Squad package contract — required filesystem layout, manifests, executor prompts, metadata, and gateway registration."
agents: [squad]
task_types: [squad-creation, package]
triggers: [squad package, manifest, executors]
---

# Squad Package Contract

Use this module whenever `@squad` is creating, extending, repairing, or validating the package itself.

## Non-negotiable package shape

Every persistent squad lives at `.aioson/squads/{squad-slug}/`. Generate the tree
deterministically, then fill or replace the skeletons instead of hand-building it:

```bash
aioson squad:scaffold . --slug=<slug> --name="<name>" --mode=<content|software|research|mixed> --json
```

Required files: `squad.manifest.json`, `squad.md`, `agents/agents.md`,
`agents/orquestrador.md`, `docs/design-doc.md`, `docs/readiness.md`,
`checklists/quality.md`, `learnings/index.md`, `workflows/default.md`.

Required directories: `agents/`, `workers/`, `workflows/`, `checklists/`,
`skills/`, `templates/`, `docs/`.

External roots, never under `.aioson/`: `output/{squad-slug}/` (including
`output/{squad-slug}/latest.html`), `aioson-logs/{squad-slug}/`, and
`media/{squad-slug}/`.

Do not collapse the squad into `agents/{slug}/`. The CLI and dashboard expect the package root under `.aioson/squads/`.

## Package derivation checklist

Before writing executors, derive and register: mission, goal, scope and out-of-scope, domain classification, locale scope and rationale, skills, MCPs, subagent policy, design-doc summary, and readiness status — plus content blueprints, source docs, investigation summary, and output strategy whenever they apply.

Reuse installed squad skills from `.aioson/squads/{squad-slug}/skills/` before inventing new ones.

## `agents/agents.md`

Create a short textual map at `.aioson/squads/{squad-slug}/agents/agents.md`.
Keep it concise and actionable. Sections: mission, does, does not, permanent executors, skills, MCPs, subagent policy, outputs and review policy.

Do not paste full executor prompts into this file.

## `squad.manifest.json`

Create `.aioson/squads/{squad-slug}/squad.manifest.json`.
`.aioson/schemas/squad-manifest.schema.json` is the authoritative schema — validate against it, do not infer the shape.

At minimum, include:

- `schemaVersion`, `packageVersion`, `slug`, `name`, `mode`, `mission`, `goal`, `visibility`
- `locale_scope` — `"universal"` when the blueprint carries no explicit value
- `storagePolicy`
- `package.rootDir`, `package.agentsDir`, `package.workersDir`, `package.workflowsDir`, `package.checklistsDir`, `package.skillsDir`, `package.templatesDir`, `package.docsDir`
- `rules.outputsDir`, `rules.logsDir`, `rules.mediaDir`
- `skills`, `mcps`, `subagents`, `contentBlueprints`, `executors`, `checklists`, `workflows`, `genomes`

Mandatory persistence — copy each of these from the blueprint whenever it exists.
Validation, readiness, and every later maintenance task read them back, so a field
dropped here is a field the squad loses permanently:

- `deliveryLane` — the resolved lane, so validation, readiness, and future maintenance share one assurance contract
- `domainClassification`, `locale_rationale`
- `investigation`, `sourceDocs`
- `analysis` — `entities`, `workflows`, `integrations`, `stakeholders`
- `composition` — the persistent core plus task-bound specialists; specialists stay `persistent: false`
- `researchPolicy` — the classified freshness policy and the Evidence Pack requirement
- `evaluation` — source-grounded criteria and at least one held-out case; when genomes are bound, with/without dimension evidence
- `genomeBindings`, `pilot`, `uiCapability`
- per `executors[]` entry: `confidence`, `traces`, `contribution`, `decisionRights` — `squad-analyze` and `squad-validate` read these fields

The manifest must mirror the real files you generated.

`storagePolicy` is always file-first for new or migrated squads:

- `primary: "file"`
- `artifacts: "output/{squad-slug}/"` (or the explicit `rules.outputsDir`)
- generated content must exist independently of `.aioson/runtime/aios.sqlite`

The SQLite runtime is local per clone and may hold rebuildable indexes, telemetry, and coordination. Never use it
as the only copy of squad content. Legacy `sqlite`/`hybrid` values remain readable only long enough to export and
migrate their content to files.

### Premium research and evidence

When output depends on external or current facts, the manifest records `researchPolicy` and names one responsible research executor/stage. Do not advance while a `live-required` or `live-check` task has only cache, snippets, or an unavailable provider presented as success.

Freshness classes, the versioned Evidence Pack contract, the `source_ids` mapping rule, and the `closed-world` exception: `.aioson/docs/squad/research-loop.md`. Manifest-side rule: volatile facts stay in Evidence Packs; genomes carry stable methods, prohibitions, checklists, style, and output structure.

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
- keep it dense — a bare role label produces a thin executor; length spent on persona, frameworks, and vocabulary pays off
- make the file immediately usable when invoked via `@`

Required structure:

- `## Mission`
- `## Quick context` — **must** carry the mandatory depth block (see below)
- `## Active genomes`
- `## Focus`
- `## Response pattern`
- `## Hard constraints` — **must** encode the executor's `anti_patterns` as real constraints
- `## Output contract`

`## Active genomes` lists the genomes bound to this executor (mirror of `squad.manifest.json` `genomeBindings`). When the genome pass (`squad-create` Step 5.5) queued a genome instead of binding it, write `pending: {genome-slug} — run @genome` rather than leaving the section empty.

Each executor prompt should make clear:

- which squad skills it relies on
- when to delegate to another executor
- when to ask the orchestrator for a temporary subagent

### Executor depth block — mandatory for every agent / clone / assistant

The persona description **is** the world model: sparse persona → sparse behavior (full theory and evidence in `.aioson/docs/squad/domain-breadth.md`). The customer-facing breadth failure ("we only sell medicine") is one instance of a general rule — a generic knowledge-work executor ("a researcher who gathers data and analyzes trends") is the *same* failure in a different collar.

So **every** `agent` / `clone` / `assistant` executor must carry a depth block in its `## Quick context`. Pick the variant by role.

**Variant A — knowledge / creative / technical executor** (researcher, analyst, strategist, writer, editor, architect, engineer, domain expert):

```yaml
role: "Seniority + specialty, never a bare label (e.g. 'Senior investigative researcher — primary-source analysis', not 'Researcher')"
persona: |
  3–6 sentences anchoring the executor as a specific, experienced
  practitioner: the level they operate at, the work they've shipped,
  the artifacts they produce. A senior and a junior in this role
  produce different work — say which this is. This paragraph is the
  world model; invest in it.
goal: "The single outcome this executor optimizes for."

expertise:
  frameworks: ["named methods this role applies — each grounded item cites its source, e.g. 'source triangulation (src: methods.md)'"]
  vocabulary: ["terms of art from sourceDocs / investigation (not invented) — each cites its source span"]
  signature_moves: ["what a senior in this role does that a junior wouldn't"]
  sources: ["which sourceDocs / findings inform this executor"]

quality_bar:
  - "Concrete standard the output is held to — what 'good' means for this role"

anti_patterns:
  - "Role-specific failure modes — each must reappear in ## Hard constraints"
```

**Source distillation (mandatory when `sourceDocs` or `investigation` exist):** mine them into `expertise.vocabulary`, `expertise.frameworks`, `persona`/`backstory`, and `anti_patterns`, and record in `expertise.sources` which source informed each executor. Method — competency tree, *extract, don't write*, every grounded item citing its source span: `.aioson/docs/squad/persona-grounding.md`. Source material persisted in the manifest but absent from every executor prompt is a defect; never leave `sourceDocs` as unused provenance.

### Variant B — Customer-facing executors — mandatory world-context block

Any executor whose role involves direct customer interaction (retail, hospitality, service, support, sales, food service, reception, etc.) **must** instead use this world-context block in its `## Quick context` section — the customer-facing specialization of the depth block above (`operational_breadth` is to a counter clerk what `expertise` is to an analyst). Without it, executors produce clipped responses ("we only sell medicine" when asked for candy at a pharmacy):

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
  - "When unavailable, name a specific alternative or adjacent item"
  - "Never say 'we only sell X' — name what we DO have"
  - "Validate the underlying need before responding to the literal request"
```

Full guidance, the HEARD refusal method, and four worked examples (pharmacy, restaurant, gym, hotel) in `.aioson/docs/squad/domain-breadth.md`. The `quality-lens.md` scorecard now includes a `domain breadth` criterion that gates this block.

### Variant C — Visual executors — mandatory visual-quality block

Any executor whose deliverable is something people **see** — UI, landing page, site, dashboard, screens, HTML/CSS, layout, visual direction (the trigger list of `squad-design` Step 3.5) — **must** additionally carry a `## Visual quality intelligence` section. The built-in visual agents (`@refiner`, `@dev`, `@ux-ui`) reach the anti-slop stack by name; a generated executor has no name the framework routes, so the stack rides in its prompt. `aioson squad:agent-create` emits the block automatically when the role reads as visual; an executor written by hand carries the same five lines and the done gate:

1. **One engine.** Resolve `design_skill` from `.aioson/context/project.context.md`; blank → `.aioson/skills/design/interface-design/SKILL.md` in intent-first mode. Load only that engine — presets are raw material, never a menu. Reference the engine in place; never copy it into the squad.
2. **Measured patterns first:** `aioson brain:query . --tags=visual-quality,layout --min-quality=4 --format=compact`
3. **Draw the start:** `aioson design:seed . --register=<register> --slug=<deliverable> --json` — build FROM one candidate, diversified against the operator's recent projects.
4. **Replaceability test + anti-references:** if the client name could be swapped and nothing else changes, it is not done; ask the owner for 2-5 things it must NOT look like before originating.
5. **Implementation doctrine:** `.aioson/docs/dev/visual-implementation.md` and `.aioson/docs/design/visual-effects.md`.

**Done gate:** `aioson verify:artifact . --kind=visual --dir=<deliverable dir> --advisory` before any page, screen, or component is declared ready — craft floor, generation tells (`tells N`), materials, cross-project fingerprint. The squad's own session end enforces the same floor on the pilot: `agent:done --agent=squad --slug=<slug>` runs `kind=visual` over `output/<slug>/pilot/` whenever it holds an HTML surface.

Agent file language follows `.aioson/rules/agent-language-policy.md`:

- `locale_scope` absent or `universal` → prompt files in English
- locale-specific `locale_scope` declared → prompt files in the locale language
- source code identifiers remain in English in every case

### UI specialist executor

If `uiCapability.mode = "executor"`:

- create `.aioson/squads/{squad-slug}/agents/ui-specialist.md` — Variant C applies in full: the `## Visual quality intelligence` block and its done gate are mandatory, and the project's design engine (`design_skill`, default `interface-design`) is the only aesthetic source
- treat it as a visual specialist responsible for UI direction, layout decisions, and HTML/UI-spec deliverables
- give it `modelTier: powerful`
- if using an assistant profile, prefer `behavioralProfile: compliant-dominant`
- make the routing explicit: visual, layout, interface, landing page, and component-structure requests go to `@ui-specialist`

## Orchestrator prompt

Create `.aioson/squads/{squad-slug}/agents/orquestrador.md`. It must include: squad mission, members, routing guide, genomes, skills, MCPs, subagent policy, inter-squad awareness, execution plan awareness, learnings protocol, hard constraints, and output contract.

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

Create `.aioson/squads/{squad-slug}/squad.md` with: name, mode, goal, the agents/manifest/output/logs/media/latest-session paths, locale scope, squad-level and per-agent genomes, skills, MCPs, and subagent policy — plus locale rationale, source docs, and investigation path when present.
