---
description: "Squad genome binding rules — when to route to @genome, how to persist bindings, and how to preserve legacy compatibility."
agents: [squad, genome]
task_types: [genome, bindings]
triggers: [genomes, genome bindings, binding repair]
---

# Squad Genome Bindings

Use this module when the request mentions genomes, when the squad already has genome bindings, or when repairing binding compatibility.

## Responsibility boundary

- `@squad` owns the squad package and its metadata
- `@genome` owns genome generation and application logic

If the user asks for a genome during a squad session:

- finish or confirm the squad package first
- then route explicitly to `@genome`

The create-phase genome pass (`squad-create` Step 5.5) follows the same order by design: executors are written first, then genomes are generated/bound.

## Binding persistence

When a genome is applied to an existing squad:

- update `.aioson/squads/{slug}/squad.md`
- if normalized bindings are present or being normalized, update `.aioson/squads/{slug}/squad.manifest.json`
- record whether the binding is squad-wide or agent-specific
- rewrite affected executor prompts in `.aioson/squads/{squad-slug}/agents/` so they include `## Active genomes`

Presence is not readiness. Preserve binding lifecycle (`pending`, `resolved`, `compiled`, `conflicted`, `stale`, `removed`), source version/hash, compilation identity, dependencies, owner, and next action. A premium binding is ready only after the applicable procedure, restrictions, checklist, style, or output contract is materialized in the intended executor.

## Compatibility rules

When inspecting or modifying an existing squad:

- accept legacy `genomes`
- accept normalized `genomeBindings`
- if only `genomes` exists, interpret it as squad-level bindings
- if `genomeBindings` exists, treat it as the primary structure
- do not automatically delete legacy `genomes` during the migration phase

If the user asks for repair or normalize:

- materialize `genomeBindings`
- preserve old data
- keep reads compatible with both formats

## Operational propagation

When a bound genome carries operational sections, apply them to the bound executors — binding a genome that changes nothing in the executor prompt is a defect:

- `## Prohibitions` → each becomes a line in the executor's `## Hard constraints`
- `## Delivery Checklist` → materialize or extend a checklist in `.aioson/squads/{slug}/checklists/`
- `## Operating Procedure` → reference it in the executor's `## Response pattern` — the executor works the method's numbered steps, not a generic flow
- `## Style Metrics` / `## Output Structure` → fold into the executor's `## Output contract` when the executor produces that deliverable

Run the compiler through the normal apply path and inspect the generated prompt/checklist. If the target prompt is missing, a dependency is absent, relations conflict, the source version is stale, or compilation has no operational effect, keep the binding visible and block premium readiness.

When a binding becomes `removed`, `stale`, `conflicted`, or otherwise has no
compiled operational effect, the compiler must remove its managed prompt block
and replace any generated checklist with an explicit inactive state. Historical
instructions must never remain executable after the binding stops being ready.

For outcome claims, execute the same held-out task with and without the binding and report dimensions separately. Metadata presence, prompt length, or self-review alone does not prove improvement.

## Non-negotiable boundary

Do not modify official files in `.aioson/agents/` with user-specific genomes.
Bindings must affect only squad package files under `.aioson/squads/{slug}/`.
