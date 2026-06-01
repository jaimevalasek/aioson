# Task: Squad Execution Plan

> Generate the squad execution plan after creation and validation.
> Defines how executors will attack the goal in sequence.
> Ensures consistency between executors, workflows, and checklists.

## When To Use
- Automatically after `@squad create` + `@squad validate` + warm-up for qualified squads
- `@squad plan <slug>` — direct invocation
- Before the first productive squad session
- When the squad changes: new executors, new investigation, workflow redesign

## Input
- Squad manifest (`squad.manifest.json`)
- Blueprint (`.designs/{slug}.blueprint.json`)
- Investigation report, if present in `squad-searches/`
- Workflow definition, if present in `workflows/`
- Quality checklists, if present in `checklists/`
- Loaded `.aioson/rules/squad/` rules
- Loaded `.aioson/skills/squad/` skills
- Prior learnings, if `learnings/index.md` exists

## Process

### Step 1 - Cross Re-Analysis

Read the full manifest and verify consistency.

**Coverage analysis — each executor:**
- Does the role cover something unique that no other executor covers?
- Is there a coverage gap? (goal aspect nobody covers)
- Is there overlap? (two executors do the same thing)
- Do declared skills exist and fit the role?

**Workflow analysis — if workflow exists:**
- Does each phase have an assigned executor that exists in the manifest?
- Is each phase output the expected input for the next phase?
- Are there handoffs without clear transformation?
- Are human gates placed at real risk points?
- Do review loops point to phases that exist?

**Checklist analysis:**
- Do checklist criteria cover critical domain aspects?
- Are any criteria too generic? Replace them with specific criteria.
- Is there a criterion no executor can evaluate? This is a competency gap.

**Investigation analysis — if investigation report exists:**
- Are discovered anti-patterns reflected as hard constraints in executors?
- Was domain vocabulary injected into relevant executors?
- Are discovered frameworks used in the squad structure?
- Are quality benchmarks present in the checklist?

Classify each issue:
- **ADJUST** — fix before execution, for example executor without coverage
- **WARN** — signal but may proceed, for example intentional partial overlap
- **INFO** — note for orchestrator awareness, for example a dimension not covered by investigation

### Step 2 - Activation Sequence

Define the ideal round order for achieving the squad goal.

**If the squad has a defined workflow:**
- Use workflow phases as base.
- Map each phase to one round in the execution plan.
- Add review/synthesis rounds between critical phases.
- Respect execution mode (sequential/parallel/mixed).

**If the squad does not have a workflow:**
- Derive the sequence from manifest + domain knowledge.
- Default heuristic:

```
1. Research / Analysis (executors focused on research)
2. Creation / Production (executors focused on creation)
3. Review / Quality (executors focused on review)
4. Synthesis / Delivery (@orquestrador)
```

**For each round, define:**

```markdown
### Round {N} — {descriptive title}
- **Executor:** @{slug} ({type})
- **Objective:** {what this executor will produce in this round}
- **Input:** {what it must receive — from whom, which artifact}
- **Expected output:** {concrete artifact produced}
- **Quality gate:** {acceptance criterion for this round}
- **Anti-patterns to avoid:** {from investigation report, if available}
- **Handoff:** output → Round {N+1} input
- **Parallel:** {true | false — whether it can run with another round}
```

**Special rounds:**
- `Round 0 — Context Loading` (implicit, not a real round): orchestrator loads learnings and context.
- `Round N — Synthesis` (always last): `@orquestrador` synthesizes all outputs into final deliverable.
- `Review Round` after critical rounds when review loop is configured.

### Step 3 - Context Per Executor

For each executor in the plan, define the briefing package:

```markdown
## Briefing: @{executor-slug}

### Must read before starting
- Its agent file (`.aioson/squads/{slug}/agents/{executor}.md`)
- Previous round output, if any
- {specific artifact relevant to this executor}

### Context injected by orchestrator
- Squad goal: {1 sentence}
- Your objective in this round: {1 sentence}
- Anti-patterns to avoid: {short list}
- Domain vocabulary: {key terms, if from investigation}

### Does not need to read
- {artifacts from other executors that are not input for this round}
- {full investigation — only relevant excerpts}
```

### Step 4 - Success Criteria

Define how to know the squad fulfilled the objective:

```markdown
## Success Criteria

### Expected final output
- {concrete deliverable description — not "quality content" but "3 video scripts with hook, body, and CTA"}

### Quality gates that must pass
- {checklist item 1 — from quality.md}
- {checklist item 2}
- {investigation report item, if applicable}

### Definition of done
- [ ] All rounds completed
- [ ] Final output saved in `output/{squad-slug}/`
- [ ] Session HTML generated at `output/{squad-slug}/{session-id}.html`
- [ ] No pending review loop, if configured
- [ ] Checklists validated
```

### Step 5 - Orchestration Notes

Specific instructions for `@orquestrador`:

```markdown
## Orchestration Notes

### Session management
- {how the orchestrator should open the session}
- {when to escalate to the user vs. decide autonomously}
- {how to handle review loops if configured}

### Round transitions
- After each round, check the quality gate BEFORE moving to the next.
- If quality gate fails: {retry strategy — from review loop config or default}
- If executor asks for help from another: {routing rules}

### Escalation policy
- If an executor cannot produce output: escalate to the user.
- If two executors conflict: synthesize the tension and ask the user.
- If quality gate fails after max retries: {strategy}

### Learning capture
- At session end, detect learnings (see squad-learning).
- Register in `learnings/` before closing the session.
```

### Step 6 - Generate execution-plan.md

Save to `.aioson/squads/{slug}/docs/execution-plan.md`:

```markdown
---
squad: "{squad-slug}"
created: "{ISO-8601}"
status: "draft"
based_on_blueprint: "{blueprint path}"
based_on_investigation: "{investigation path or null}"
rounds_total: {N}
source_artifacts:
  - squad.manifest.json
  - {blueprint path}
  - {investigation path}
---

# Execution Plan: {squad-name}

> Plan for how the squad will attack the objective.
> Generated after creation and approved before the first session.
> Status: draft → approved → in_progress → completed

## Pre-flight check

### Consolidated artifacts
{inventory from Step 1}

### Consistency check
{issues found, classified as ADJUST/WARN/INFO}

### Squad readiness verdict
{READY | NEEDS_ADJUSTMENT | NOT_READY}

## Execution Strategy

### Round sequence
{Rounds from Step 2}

## Executor Briefings
{Briefings from Step 3}

## Success Criteria
{Criteria from Step 4}

## Orchestration Notes
{Notes from Step 5}

## Context Package (for session or new chat)

### What @orquestrador must read at the start of each session
1. This execution-plan.md
2. squad.manifest.json
3. Last session HTML, if not the first session
4. learnings/index.md, if it exists

### What each executor receives
- Its agent file + briefing from this plan
- Previous round output, if any
```

### Step 7 - Present To User

Show in the selected project language:

```
Execution Plan generated for squad {name}.

Rounds: {N} ({M parallel if any})
Consistency: {N adjusts, M warns, P infos}
Readiness: {READY | NEEDS_ADJUSTMENT | NOT_READY}

Sequence:
1. {round 1 — executor — one line}
2. {round 2 — executor — one line}
[...]

Success criteria: {one-line expected final deliverable}
```

Ask whether the user wants to adjust anything before starting the first session.

If NEEDS_ADJUSTMENT, state the required adjustments and ask whether to fix them before approving the plan.

## When To Generate Automatically (Decision Tree For squad.md)

```
Squad created and validated
  ├── 4+ executors? → GENERATE automatically
  ├── Workflow defined? → GENERATE automatically
  ├── @orache investigation done? → GENERATE automatically
  ├── Mode = software or mixed? → GENERATE automatically
  ├── 3 executors + simple goal? → OFFER, do not force
  ├── Ephemeral squad? → SKIP
  └── 2 executors + obvious flow? → SKIP
```

## Rules

- Do not execute any round here; plan only.
- Do not ignore ADJUST issues; signal them and offer correction.
- Do not generate vague rounds like "produce content"; specify WHAT, HOW, and WITH WHICH inputs.
- Execution plan is persistent; save it to disk, not only in chat.
- If investigation exists, it must enrich the plan.
- If learnings exist, they must inform the round sequence.
- Review rounds are optional when no review loop is configured, but recommended for squads with 4+ executors.
- After user approval, change status from `draft` to `approved`.
- If the squad is edited after plan approval, mark the plan as `stale`.
