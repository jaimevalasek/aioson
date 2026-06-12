---
description: "Squad workflow and quality rules — workflow generation, review loops, model tiering, plans, checklists, coverage score, and warm-up."
agents: [squad]
task_types: [workflow, quality]
triggers: [squad workflows, review loops, warm-up]
---

# Squad Workflow And Quality

Use this module whenever the squad has phases, quality gates, review loops, plans, or coverage scoring.

## When to generate a workflow

Generate `.aioson/squads/{squad-slug}/workflows/main.md` when:

- the squad has 3 or more distinct phases
- later phases depend on earlier outputs
- deterministic workers mix with LLM executors
- human approval points exist
- the squad will run as a repeatable pipeline

Skip only for purely conversational or exploratory squads.

## Workflow registration

Register the workflow in `squad.manifest.json` with:

- `slug`
- `title`
- `trigger`
- `executionMode`
- `estimatedDuration`
- `file`
- `phases`

Each phase should declare:

- `id`
- `title`
- `executor`
- `executorType`
- `dependsOn`
- `output`
- optional `humanGate`
- optional `review`
- optional `vetoConditions`

## Execution modes

- `sequential`
- `parallel`
- `mixed`

## Human gates

Use `humanGate` when a phase requires explicit human approval or risk review.

Action levels:

- `auto`
- `consult`
- `approve`
- `block`

## Review loops

Add review when:

- the phase produces a final deliverable
- the domain is high-risk
- the pipeline is repeatable and quality drift matters

Review should normally be done by an executor other than the creator.

Include:

- reviewer
- criteria
- `onReject`
- `maxRetries`
- `retryStrategy`
- `escalateOnMaxRetries`

Supported retry strategies:

- `feedback`
- `fresh`
- `alternative`

## Model tiering

Assign `modelTier` to every executor:

- `none` for deterministic workers
- `powerful` for orchestration, synthesis, creative generation, or reviewer roles
- `fast` for research, analysis at scale, or formatting-heavy work
- `balanced` for mixed/default cases

Show `modelTier` together with type classification in the confirmation output.

## Task decomposition

If an executor has a recurrent multi-step process:

- keep identity in the main agent file
- move procedure to `.aioson/squads/{squad-slug}/agents/{executor-slug}/tasks/`
- register the tasks in the manifest

## Quality checklists

Always generate `.aioson/squads/{squad-slug}/checklists/quality.md`.

The checklist must validate:

- domain-specific output quality
- output integrity
- executor coverage
- worker completion when present
- human gate resolution when present

Add phase-specific checklists if the workflow needs them.

## Execution plan

Generate `.aioson/squads/{squad-slug}/docs/execution-plan.md` when:

- the squad has 4 or more executors
- workflows are present
- the squad came from investigation
- the squad mode is `software` or `mixed`

Offer but do not force for:

- 3-executor squads with moderate complexity
- content squads with multi-step pipelines

Skip for:

- ephemeral squads
- tiny obvious linear flows
- explicit user refusal

## Confirmation, coverage, and warm-up

After generation:

1. list created executors
2. show classification review
3. show coverage score
4. suggest `aioson squad:score . --squad={slug}`
5. run the warm-up round immediately

Coverage score dimensions:

- executors typed
- workflow defined
- checklists present
- tasks defined
- workers present

Warm-up output should show, for each specialist:

- problem reading
- initial recommendation
- main risk or tension
- next practical step

Do not skip the warm-up round.
