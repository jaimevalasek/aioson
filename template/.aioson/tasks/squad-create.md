# Task: Squad Create

> Creation phase of the lifecycle. Generates the full package from a blueprint.

## When To Use
- `@squad create <slug>` — direct invocation
- Automatically after `@squad design` is approved
- `@squad` fast flow after inline design is approved

## Input
- Blueprint at `.aioson/squads/.designs/<slug>.blueprint.json`
- If no blueprint exists: tell the user to run `@squad design <slug>` first.
- Or, if the user called `@squad` without subcommand, run design + create in sequence.

## Process

### Step 1 - Read Blueprint
Read `.aioson/squads/.designs/<slug>.blueprint.json` and validate required fields: slug, name, problem, goal, mode, executors.
If present, also preserve:
- `locale_scope`
- `locale_rationale`
- `domainClassification`
- `investigation`
- `sourceDocs`
- `analysis` (decomposition from design Step 2.5) + `confidence`/`traces` per executor

### Step 2 - Create Directory Structure
```
.aioson/squads/<slug>/
├── agents/
│   ├── agents.md              # Text manifest
│   ├── orquestrador.md        # Orchestrator
│   └── <executor-slug>.md     # One per executor
├── skills/
├── templates/
├── docs/
│   ├── design-doc.md
│   └── readiness.md
└── squad.manifest.json        # Formal JSON manifest

output/<slug>/                 # Output directory
aioson-logs/<slug>/            # Logs directory
media/<slug>/                  # Media directory
```

### Step 2.5 - Process UI/UX Capability From Blueprint

Read the blueprint `uiCapability` field. If absent, treat it as `mode: none`.

**If `mode = skills`:**
1. Copy `.aioson/skills/static/landing-page-forge.md` → `.aioson/squads/{slug}/skills/design/landing-page-forge.md`
2. Copy `.aioson/skills/static/ui-ux-modern.md` → `.aioson/squads/{slug}/skills/design/ui-ux-modern.md`
3. If `design_skill` exists in `project.context.md`, also copy that skill to `skills/design/`
4. Register the skills in `squad.manifest.json`

**If `mode = executor`:**
1. Execute the same skill steps above; the executor depends on them.
2. Generate `.aioson/squads/{slug}/agents/ui-specialist.md` following `.aioson/docs/squad/package-contract.md`:
   - use the same structure as other permanent executors
   - mission focused on UI, layout, components, and visual direction
   - expected output: `ui-spec.md` and, when appropriate, HTML/visual deliverable
   - make explicit when business context must be delegated back to `@orquestrador`
3. Register the executor in `squad.manifest.json` with `modelTier: powerful` and `behavioralProfile: compliant-dominant`.
4. Add to the orchestrator routing guide: "Visual / UI / layout requests → @ui-specialist".

**If `mode = external`:** Add a note in `docs/design-doc.md` saying `@ux-ui` is called externally.

**If `mode = none`:** No action.

Always save `uiCapability` in `squad.manifest.json`.

### Step 3 - Generate squad.manifest.json
Build the manifest from the blueprint. JSON must follow `squad-manifest.schema.json`. Copy executors, skills, mcps, genomes, and contentBlueprints from the blueprint. Add package paths and rules.

Mandatory persistence:
- `locale_scope`: use `"universal"` by default when blueprint has no explicit value
- `locale_rationale`: copy when present
- `domainClassification`: copy when present
- `investigation`: copy when present
- `sourceDocs`: copy when present
- `analysis` (entities/workflows/integrations/stakeholders): copy when present
- `confidence` + `traces` per executor: copy from blueprint into each `executors[]` manifest entry; `squad-analyze` and `squad-validate` read these fields

### Step 4 - Generate agents.md (Text Manifest)
Follow `.aioson/docs/squad/package-contract.md`, section `agents/agents.md`.

Additional rules for the text manifest:
- group executors by type when workers, clones, assistants, or human-gates exist
- if a category does not exist, omit the section instead of leaving a placeholder
- reflect `locale_scope`, skills, MCPs, and review policy when these change real squad behavior

Minimum format:
```markdown
# Squad <name>

## Mission
[from blueprint.mission]

## Does
[derived from scope]

## Does Not Do
[derived from outOfScope]

## Permanent Executors
- @orquestrador — [role]
- @<slug> — [role]

## Squad Skills
## Squad MCPs
## Subagent Policy
## Outputs And Review
```

### Step 5 - Generate Each Executor
For each executor in the blueprint, create `.aioson/squads/<slug>/agents/<executor-slug>.md` following `.aioson/docs/squad/package-contract.md`, section `Executor generation`:
- **Before writing**, run the *Pre-write depth gate* from `.aioson/docs/squad/creation-flow.md` for each executor: persona, frameworks, source vocabulary, signature_moves, anti-patterns. Empty gate = do not write yet.
- Header with `# Agent @<slug>` + ACTIVATED block.
- Mission, Quick context, Active genomes, Focus, Response standard, Hard constraints, Output contract.
- **Mandatory depth block** in `## Quick context` (package-contract § `Executor depth block`): Variant A (persona + expertise: frameworks, vocabulary, signature_moves, quality_bar, anti_patterns) for knowledge/creative/technical executors; Variant B (operational_breadth) for customer-facing executors. A standalone `role:` without depth block = basic executor; do not deliver it.
- **Distill sources:** if the blueprint has `sourceDocs` or `investigation`, read/reuse the extraction and inject it into each relevant executor: real terms of art, named frameworks/methods, examples, and anti-patterns. Record in `expertise.sources` which source fed each executor. Use `analysis.entities`/`analysis.workflows` and executor `traces` (design Step 2.5 decomposition) as seeds for `expertise.vocabulary` and `focus`. A source that remains only in the manifest and enters no prompt is a defect. Follow the competency tree in `.aioson/docs/squad/persona-grounding.md` (*extract, don't write*): each framework/term cites its source; uncited items are model priors.
- Each `anti_pattern` from the depth block becomes a real line in `## Hard constraints`.
- Before moving to the next executor, apply this test: would a real senior person in this role recognize themselves in this prompt? If not, deepen before continuing.
- If `locale_scope` is locale-specific, write user-facing behavior examples in that locale's language; code identifiers remain English.

### Step 6 - Generate Orchestrator
Create `.aioson/squads/<slug>/agents/orquestrador.md` following `.aioson/docs/squad/package-contract.md`, section `Orchestrator prompt`.
If `uiCapability.mode = executor`, include routing guidance that visual demands go to `@ui-specialist`.

### Step 7 - Generate Docs
- `docs/design-doc.md`: design summary derived from the blueprint
- `docs/readiness.md`: readiness state derived from the blueprint

### Step 8 - Register In Gateways
Update root `CLAUDE.md` and `AGENTS.md` according to `.aioson/docs/squad/package-contract.md`, section `Gateway registration`.

### Step 9 - Save Metadata
Save `.aioson/squads/<slug>/squad.md` according to `.aioson/docs/squad/package-contract.md`, section `Squad metadata`.
Include `locale_scope`, `locale_rationale`, `investigation`, and `sourceDocs` when present.

### Step 10 - Run Validate
After creating everything, mentally execute `squad-validate` (read `.aioson/tasks/squad-validate.md`) to verify the package is consistent.

### Step 11 - Warm-Up Round
Follow `.aioson/docs/squad/workflow-quality.md`, section `Confirmation, coverage, and warm-up`: show each specialist with problem reading, initial recommendation, main risk, and suggested next step.

## Output
- Full package under `.aioson/squads/<slug>/`
- Updated `CLAUDE.md` and `AGENTS.md`
- Warm-up round executed

## Rules
- Always read the blueprint before generating.
- Follow `.aioson/docs/squad/package-contract.md` and `.aioson/docs/squad/workflow-quality.md`.
- Keep the HTML deliverable after each round according to the existing rule.
- Do not skip warm-up; it is mandatory.
