# Task: Squad Design

> Squad lifecycle design phase. Produces an intermediate blueprint.

## When To Use
- `@squad design <name>` — direct invocation
- `@squad` without subcommand when no blueprint exists for the slug

## Input
- User context: domain, goal, constraints, desired roles
- Optional: source documentation (`.md` files, pasted text, screenshots)
- Optional: domain hint to guide analysis

## Process

### Step 0 - Check Project Context, Artisan Input, And Available Templates

**0A — AIOSON pipeline artifacts**

Before asking anything, run the scan in `.aioson/docs/squad/creation-flow.md` § "Project artifact detection" over `.aioson/context/` (implementation plan first, then `requirements`, `architecture`, `prd`). Extract risks alongside the fields listed there, record consumed paths in `sourceDocs`, and never repeat a question those artifacts already answer. Ask the single disambiguation question, when one is needed, in the selected project language.

**0B — Artisan input**

If the user supplied `--from-artisan <id>`:
1. Look for `.aioson/squads/.artisan/<id>.md`.
2. If found, read the Squad PRD.
3. Extract: domain, goal, mode, proposed executors, skills, constraints, content blueprints.
4. Use it as the blueprint base; skip to Step 5 (calculate readiness).
5. Tell the user in the selected project language that you read the Artisan PRD and ask whether anything should be adjusted before generating the blueprint.

**0C — Templates**
Check whether `.aioson/templates/squads/` exists. If it exists, list available templates and ask in the selected project language whether to start from a template: `content-basic`, `research-analysis`, `software-delivery`, `media-channel`, or from scratch.
If the user chooses a template, read `template.json` and use it as the blueprint base (executors, content blueprints, mode).

### Step 1 - Collect Minimal Context
Ask the five intake fields from `.aioson/docs/squad/creation-flow.md` § Intake — domain, goal, output type, constraints, optional role hints — in one block; do not run multiple rounds. If the user already supplied enough context (text, docs, images), infer the answers and continue. Ask only when material gaps remain.

### Step 1.5 - Domain Classification Gate + Locale Scope

Before defining executors, classify the domain with `.aioson/docs/squad/domain-classification.md` (the three tiers and the investigation policy each one carries) and apply the opt-out default in `.aioson/docs/squad/creation-flow.md` § "Investigation default". If relevant investigation already exists, reuse the report instead of requesting a new one.

After classification:
- decide `locale_scope` based on `.aioson/rules/agent-language-policy.md` when the rule exists
- suggest `universal` by default
- if the squad is clearly local, confirm a specific locale (`pt-BR`, `es-MX`, etc.) and record `locale_rationale`
- capture in the blueprint:
  - `domainClassification.tier`
  - `domainClassification.rationale`
  - `domainClassification.regulations` when applicable
  - `domainClassification.investigationPolicy`
  - `locale_scope`
  - `locale_rationale` when applicable

Resolve and persist one `deliveryLane` — `quick`, `standard`, `premium`, or `regulated` — before loading deeper creation modules. Lane semantics and selection: `.aioson/docs/squad/creation-flow.md` § Delivery lane. Design deltas: `regulated` is mandatory for `tier-1-regulated` and never downgrades for speed; the lane controls research/genome/eval/warm-up depth, not package correctness.

### Step 2 - Derive Mental Design Doc
Before defining executors, consolidate:
- Problem being solved
- Practical squad goal
- Scope and out-of-scope
- Risks and assumptions
- Skills and docs that must enter context
- Squad mode (content | software | research | mixed)
- Consumed source docs
- Applied investigation and how it changes design
- Squad locale scope
- Delivery lane and its causal reason

### Step 2.5 - Domain Decomposition From Sources
If there are `sourceDocs`, `investigation`, or pasted domain context, **derive the roster from sources; do not guess "3-5 roles"**. Run the four extraction passes (entities, workflows, integrations, stakeholders) and the derivation that follows them in `.aioson/docs/squad/creation-flow.md` § "Domain decomposition".

**Deterministic shortcut:** run `aioson squad:role-scan --docs=<comma-separated sourceDocs> --json` (or `--squad=<slug>` if the package already exists). It extracts `entities`, `work-modes` (originate/transform/judge), and source terms without invention. Use the output to seed the role pool before clustering.

Record everything in blueprint `analysis`. Without sources, skip this pass and define the roster from the stated goal; mark executor confidence lower.

### Step 3 - Define Executors From Decomposition
Cluster `workflows` into work modes and derive one executor per mode actually demanded by the sources, following steps 5-9 of `.aioson/docs/squad/creation-flow.md` § "Domain decomposition". For each executor, define:
- slug (kebab-case)
- title
- role (one sentence)
- focus (3-5 bullets)
- `traces` — which `workflows`/`entities` this executor owns; an executor tracing no workflow is ceremony, so cut it
- `confidence` (0-1) — how well sources justify this role; low = investigate or cut, never fill with padding
- skills it will use
- genomes it should inherit — record planned genomes (`type: domain|function`) for assistants/clones and specialized-domain agents; the create phase generates and binds them (`squad-create` Step 5.5)

Always include an `orquestrador`. Keep 3-5 unless decomposition proves the real work requires more; do not inflate to look complete.

### Step 3.5 - Detect And Capture UI/UX Capability

After defining executors, check whether the squad produces visual output.

**Triggers that activate this detection:**
- Output type contains: site, landing page, sales page, event page, dashboard, web app, HTML, layout, screens, interface, UI, UX
- Domain contains: marketing, agency, design, digital product, e-commerce, funnel, conversion, branding
- Goal contains: "create page", "build a site", "make dashboard", "design interface", "pages for clients"

**If detected, ask in the selected project language:**
> This squad will produce visual output. How do you want to include UI/UX?
>
> 1. Skills — bind the project's design engine (`design_skill`, default `interface-design`) + `landing-page-forge` as squad skills; lightweight, executors reference them
> 2. Executor — add `@ui-specialist` to the squad; autonomous, produces `ui-spec.md` + HTML, carries the visual-quality block
> 3. External — no UI inside the squad; call `@ux-ui` separately
> 4. Skip

**If not detected:** proceed without UI capability, equivalent to option 4.

**Capture the decision in the blueprint** as `uiCapability`:
```json
"uiCapability": {
  "mode": "skills | executor | external | none",
  "skills": ["interface-design", "landing-page-forge"],
  "executor": "ui-specialist | null"
}
```

The engine is the project's one aesthetic source (`.aioson/skills/design/interface-design/` unless `design_skill` names another); `ui-ux-modern` is no longer offered — generic "clarity before decoration" bullets are the slop the visual-quality brain exists to prevent. Any visual executor, whichever mode, carries the visual-quality block from `.aioson/docs/squad/package-contract.md` § Variant C.

If `mode = executor`, add `ui-specialist` to the executor list before continuing.

### Step 4 - Define Content Blueprints
If the squad is content-oriented, define at least 1 content blueprint with:
- slug, contentType, layoutType
- sections with key, label, blockTypes

### Step 5 - Calculate Readiness
Evaluate each dimension:
- contextReady: is there enough context?
- blueprintReady: is the blueprint complete?
- generationReady: can the executors be generated?
- if `domainClassification.tier = tier-1-regulated`: generationReady = false until `investigation` exists

### Step 6 - Generate Blueprint JSON
Save the blueprint to `.aioson/squads/.designs/<slug>.blueprint.json`.

The JSON must follow `squad-blueprint.schema.json`.

Generate a UUID for `id`. Use `new Date().toISOString()` for `createdAt`.

When decomposition happened (Step 2.5), persist `analysis` (`entities`, `workflows`, `integrations`, `stakeholders`), `confidence` + `traces` per executor, and overall `confidence` (average of executors). These fields feed self-review and readiness.

### Step 6.5 - Squad Spec Self-Review

Before presenting to the user, review the blueprint as if another agent were reading it for the first time.

**Check completeness:**
- [ ] Each executor has a unique role and does not overlap another executor.
- [ ] Each executor has 3-5 concrete focus bullets.
- [ ] No "TBD", "to define", "as needed", or equivalent placeholder appears in any field.
- [ ] Squad mission is one sentence explaining what it does and for whom.
- [ ] `deliveryLane` follows the domain tier and explicit user intent; Quick is not used for regulated or persistent production work.

**Check consistency:**
- [ ] No contradictions between squad tone/audience and each executor's tone.
- [ ] If `mode=content`: content blueprints cover expected outputs.
- [ ] If `mode=software`: executors cover necessary development phases.
- [ ] Squad does not have more responsibilities than executors can cover.

**Check scope:**
- [ ] Squad solves the user's stated problem, no more and no less.
- [ ] No executor was added because it "could be useful" without relation to the goal.
- [ ] If the user requested N executors, verify no extras were added silently.
- [ ] When decomposition happened, every executor traces at least one `workflow`; no workflow-orphan executors.
- [ ] When decomposition happened, low-confidence executors were investigated, merged, or cut; not delivered as-is.

**Calibration:** Block only if the issue would make output fundamentally wrong.
Style preferences do not block. Detail gaps do not block.
Scope contradictions and roles without real responsibility do block.

If problems are found, fix the blueprint before presenting it.
If everything is OK, continue to Step 7.

### Step 7 - Present Summary
Show the user, in the selected project language:
- Proposed executors with roles
- Source decomposition: entities / workflows / stakeholders, when available
- Defined content blueprints
- Domain tier and investigation policy
- Delivery lane and proportional assurance
- Locale scope
- Assumptions made
- Risks identified
- Readiness status
- Confidence score

Ask whether they want to adjust anything before creation.

## Output
- File: `.aioson/squads/.designs/<slug>.blueprint.json`
- Chat summary for user review

## Next Step
- If approved: `@squad create <slug>`, which reads the blueprint and generates the package
- If adjustment is needed: user indicates changes and design is updated

## Rules
- Do not create the squad package here; that is the responsibility of `squad-create`.
- Do not skip the blueprint; it is mandatory.
- Keep the blueprint lightweight; the LLM fills gaps in the create phase.
- Do not ignore relevant `implementation-plan` / `requirements` when they exist.
- Do not bypass the regulated-domain gate.
