# Task: Squad Investigate

> Investigation phase of the squad lifecycle. Enriches design with real domain knowledge.

## When To Use
- `@squad investigate <domain>` — standalone investigation
- `@squad` flow when the user accepts investigation
- `@squad design --investigate` — triggers investigation before design

## Input
- Domain or topic
- Squad goal
- Expected output type
- Optional: specific dimensions to focus on

## Process

### Step 1 - Activate @orache
Read `.aioson/agents/orache.md` and execute as `@orache`.
Pass the domain context collected by `@squad`.

### Step 2 - Wait For Investigation
`@orache` executes its investigation process (agent steps 1-6).

### Step 3 - Receive Report
`@orache` saves the report in `squad-searches/`.

### Step 3.5 - Extract Integration Payload
From the report, explicitly extract:
- regulations / obligations
- domain vocabulary
- anti-patterns
- quality benchmarks
- structural / workflow patterns

### Step 4 - Validate Completeness
Verify that the report covers at least 4 of the 7 dimensions.
If it does not, ask the user in the selected project language whether they want to go deeper.

### Step 5 - Integrate With Design
If this task was invoked from the `@squad` flow:
- Return the report path to `@squad`.
- Record the `investigation` object in the blueprint.
- Use regulations for hard constraints, human gates, and review criteria.
- Use anti-patterns for checklists and `vetoConditions`.
- Use benchmarks for quality, warm-up, and coverage scoring.
- Use vocabulary and structural patterns for executors, workflow, and content blueprints.

## Output
- Investigation report saved in `squad-searches/`
- Report path available to `@squad design`
- Integration payload available for blueprint/checklist/workflow

## Rules
- Do not generate the squad here; that is the responsibility of `squad-create`.
- Do not fabricate findings; if you did not find something, say so.
- Always save the report to disk; never only in chat.
