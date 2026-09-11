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
Read `.aioson/squads/.designs/<slug>.blueprint.json` and validate required fields: slug, name, problem, goal, mode, executors. Carry every other field the blueprint holds through to the manifest untouched — the mandatory-persistence list in `.aioson/docs/squad/package-contract.md` § `squad.manifest.json` is the contract for what must survive. `deliveryLane` defaults to `standard` when absent (backward compatibility) and is forced to `regulated` for tier-1.

### Step 2 - Scaffold The Package Tree
Do not hand-build the tree. Run the deterministic generator, then fill or replace the skeletons it writes:

```bash
aioson squad:scaffold . --slug=<slug> --name="<name>" --mode=<content|software|research|mixed> --json
```

It creates the canonical package plus the `output/<slug>/`, `aioson-logs/<slug>/`, and `media/<slug>/` roots. What must exist and what each file must end up carrying: `.aioson/docs/squad/package-contract.md` § Non-negotiable package shape. The steps below replace every skeleton with real content — a skeleton delivered as generated is an unfinished squad.

### Step 2.5 - Process UI/UX Capability From Blueprint

Read the blueprint `uiCapability` field. If absent, treat it as `mode: none`.

**If `mode = skills`:**
1. Copy `.aioson/skills/static/landing-page-forge.md` → `.aioson/squads/{slug}/skills/design/landing-page-forge.md`
2. Bind the project's design engine by reference, never by copy: `design_skill` from `project.context.md`, or `.aioson/skills/design/interface-design/SKILL.md` when blank. Record the path in `squad.manifest.json` — the engine stays the project's single aesthetic source (one skill, no fork, no preset menu)
3. Register the skills in `squad.manifest.json`

**If `mode = executor`:**
1. Execute the same skill steps above; the executor depends on them.
2. Generate `.aioson/squads/{slug}/agents/ui-specialist.md` per `.aioson/docs/squad/package-contract.md` § "UI specialist executor" — same structure as other permanent executors, mission on UI/layout/components/visual direction, the mandatory `## Visual quality intelligence` block, `modelTier: powerful`, `behavioralProfile: compliant-dominant`, and the routing rule. `aioson squad:agent-create` emits the Variant C block when the role reads as visual.
3. Expected output: `ui-spec.md` and, when appropriate, an HTML/visual deliverable; state explicitly when business context goes back to `@orquestrador`.
4. Register it in `squad.manifest.json` and add "Visual / UI / layout requests → @ui-specialist" to the orchestrator routing guide.

**If `mode = external`:** Add a note in `docs/design-doc.md` saying `@ux-ui` is called externally.

**If `mode = none`:** No action.

Always save `uiCapability` in `squad.manifest.json`.

### Step 3 - Generate squad.manifest.json
Build the manifest over the scaffolded skeleton. Required fields, the mandatory-persistence list (`deliveryLane`, `analysis`, `composition`, `researchPolicy`, `evaluation`, per-executor `contribution`/`decisionRights`/`confidence`/`traces`, `genomeBindings`, `pilot`, `uiCapability`, and the rest), and the authoritative schema: `.aioson/docs/squad/package-contract.md` § `squad.manifest.json`. Copy executors, skills, mcps, genomes, and contentBlueprints from the blueprint; add package paths and rules. A blueprint field dropped here is lost permanently.

### Step 4 - Generate agents.md (Text Manifest)
Follow `.aioson/docs/squad/package-contract.md`, section `agents/agents.md`.

Additional rules for the text manifest:
- group executors by type when workers, clones, assistants, or human-gates exist
- if a category does not exist, omit the section instead of leaving a placeholder
- reflect `locale_scope`, skills, MCPs, and review policy when these change real squad behavior

Minimum sections: `# Squad <name>`, `## Mission` (from `blueprint.mission`), `## Does` (from scope), `## Does Not Do` (from `outOfScope`), `## Permanent Executors` (`- @<slug> — [role]`, `@orquestrador` first), `## Squad Skills`, `## Squad MCPs`, `## Subagent Policy`, `## Outputs And Review`.

### Step 5 - Generate Each Executor
For each executor in the blueprint, create `.aioson/squads/<slug>/agents/<executor-slug>.md` following `.aioson/docs/squad/package-contract.md`, section `Executor generation`:
- Generate permanent files only for the justified persistent core. A task-specific specialist stays in the execution plan with an integration owner; it does not silently become a permanent executor.
- **Before writing**, run the *Pre-write depth gate* from `.aioson/docs/squad/creation-flow.md` for each executor: persona, frameworks, source vocabulary, signature_moves, anti-patterns. Empty gate = do not write yet.
- Header with `# Agent @<slug>` + ACTIVATED block.
- Mission, Quick context, Active genomes, Focus, Response standard, Hard constraints, Output contract.
- **Mandatory depth block** in `## Quick context` — `package-contract.md` § Executor depth block: Variant A for knowledge/creative/technical roles, Variant B for customer-facing ones, Variant C additionally for visual deliverables. A standalone `role:` without a depth block = basic executor; do not deliver it.
- **Distill sources:** when the blueprint has `sourceDocs` or `investigation`, mine them with the competency-tree method in `.aioson/docs/squad/persona-grounding.md` (*extract, don't write*; each framework/term cites its source span, uncited items are model priors) and record in `expertise.sources` which source fed each executor. Seed `expertise.vocabulary` and `focus` from `analysis.entities`/`analysis.workflows` and the executor's `traces`. A source that stays in the manifest and enters no prompt is a defect.
- Each `anti_pattern` from the depth block becomes a real line in `## Hard constraints`.
- State the executor's contribution and decision rights (`creation-flow.md` § "Domain decomposition", steps 8-9): for review work name an independent reviewer or record the explicit exception.
- Before moving to the next executor, apply this test: would a real senior person in this role recognize themselves in this prompt? If not, deepen before continuing.
- If `locale_scope` is locale-specific, write user-facing behavior examples in that locale's language; code identifiers remain English.

### Step 5.5 - Genome Pass (bind or queue genomes)

Binding rules, persistence, lifecycle, and operational propagation: `.aioson/docs/squad/genome-bindings.md`. Lane depth: `.aioson/docs/squad/creation-flow.md` § Delivery lane.

Create-specific ordering — executors are written first (Step 5), genomes second. For each executor whose blueprint entry plans a genome, and for every `assistant`/`clone` in a tier-1/tier-2 domain even when the blueprint is silent:

1. Reuse before generating: check `.aioson/genomes/` for a genome matching the planned domain/function.
2. If missing, generate it now via `@genome` (Skill `aioson:agent:genome`) with the domain/function and `type`. `persona` genomes are never auto-generated — queue them for the Profiler pipeline instead.
3. Apply through the runtime binding service, then inspect what actually changed in each executor: procedure, restrictions, checklist, style, output contract. A metadata-only or null-effect binding stays `conflicted`, not ready.
4. If generation or materialization is impossible in this session, never deliver an empty `## Active genomes` silently: persist `status: pending|stale|conflicted`, the owner, and the exact repair command in the manifest and the creation summary.

Lane deltas the table does not carry: `quick` never generates in the hot path — bind an already-valid match or persist the pending owner, exact command, and `evaluation.deferReason`; `standard` binds only planned genomes whose expected behavioral contribution is named, never one per role by convention; `premium` adds the source-hash check; `regulated` adds mandatory current evidence and forbids deferring a sensitive-domain binding.

Skip this step only for tier-3 squads whose executors are all `worker` / plain `agent` types with no specialized expertise.

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

### Step 10 - Run Strict Validate And Eval
Always run `aioson squad:validate . --squad=<slug> --strict --json`. Strict also measures executor BODIES (Layer 6): a prompt below the size floor or carrying placeholder text (TODO/FIXME/TBD/lorem ipsum) is an ERROR; a thin or bloated prompt, a missing core section, near-duplicate executors, and workers reading input only from argv are advisory warnings. `aioson verify:artifact . --kind=squad-package --slug=<slug> --advisory` runs strict validation plus that lint and auto-fires at `agent:done --agent=squad`.

Lane assurance: `.aioson/docs/squad/creation-flow.md` § Delivery lane. Run-level deltas: `quick` runs one routing/entry-point smoke and may defer the eval only with a concrete `evaluation.deferReason`, leaving readiness `provisional`; `standard` runs `aioson squad:eval . --squad=<slug> --json` once and tolerates a non-critical WARN only with an owner and a repair action; `premium` also requires applicable genome A/B evidence; `regulated` requires current/live-required evidence and no defer. Add `--no-persist` to measure without writing `evals/` or `docs/EVAL-*.md`.

### Step 11 - Warm-Up Round
Round mechanics and the per-specialist output fields: `.aioson/docs/squad/workflow-quality.md` § `Confirmation, coverage, and warm-up`. Lane depth:

- `quick`: one routing/readiness smoke; no ceremonial per-specialist round.
- `standard`: one representative end-to-end warm-up covering the orchestrator and participating specialists.
- `premium|regulated`: the full specialist round.

## Output
- Full package under `.aioson/squads/<slug>/`
- Updated `CLAUDE.md` and `AGENTS.md`
- Lane-appropriate readiness proof executed

## Rules
- Always read the blueprint before generating.
- Follow `.aioson/docs/squad/package-contract.md` and `.aioson/docs/squad/workflow-quality.md`.
- Keep the HTML deliverable after each round according to the existing rule.
- Do not skip the proof required by `deliveryLane`; do not inflate Quick into a premium ceremony.
