---
description: "Genome binding lifecycle, executor materialization, conflicts, and runtime proof."
agents: [genome, squad, dev]
task_types: [apply, bind, repair, execute, eval]
triggers: [apply genome, genome binding, compiled genome, genome runtime]
---

# Genome Runtime Application

Use this module whenever a genome is applied, bound, repaired, executed, or evaluated in a squad.

## Lifecycle

Bindings use explicit states:

- `pending` — source, dependency, target prompt, or materialization is missing;
- `resolved` — source and target resolved, compilation not yet proven;
- `compiled` — versioned effects were materialized in every target executor;
- `conflicted` — relations, policies, or null effects prevent safe application;
- `stale` — binding version/hash no longer matches the installed source;
- `removed` — retained as lifecycle history but not active.

Never equate presence in `genomeBindings` with readiness.

## Operational propagation

Compilation maps stable genome content into the real executor:

- methodology/framework steps → `## Compiled genome method / Procedure`;
- prohibitions/bias controls → genome hard constraints;
- heuristics/quality rules → a generated executor checklist;
- communication/voice rules → genome style;
- framework/output requirements → genome output contract.

Persist source hash, source version, compilation ID, timestamp, dependencies, conflicts, owner, and next action. If no material effect is produced, set `conflicted`; if the target prompt does not exist, remain `pending`.

Only generated squad executor paths under `.aioson/squads/{slug}/agents/` may be modified. Never apply a genome to official `.aioson/agents/`.

## Conflict and precedence

1. Project/security rules override genomes.
2. Explicit task constraints override general genome style.
3. Required foundational genome precedes one applied method.
4. Contradicting applied genomes require an explicit owner/precedence decision.
5. A relevant expert owns the decision; generic voting cannot erase a conflict.

## Runtime proof

Before calling a premium binding ready:

1. inspect the target prompt and generated checklist;
2. verify compilation identity matches manifest state;
3. run the executor through the normal squad path;
4. run a held-out task with and without the binding;
5. report non-regression, regression, or improvement per dimension.

A longer prompt or a metadata count is not proof of better output.
