---
name: workflow-lean-lane
agents: [setup, product, sheldon, dev, qa, validator, neo, orchestrator]
modes: [planning]
task_types: [workflow, routing, configuration]
load_tier: trigger
triggers: [lean lane, workflow.config.json, fewer agents, menos é mais, lean pipeline]
---

# Workflow Lean Lane (opt-in)

The default spec-driven chain (`product → analyst → scope-check → architect → discovery-design-doc → pm →
dev → qa`) is thorough but heavy. For most features the spec hops can be collapsed without losing rigor —
the bottleneck was never "too few design documents", it was the absence of a gate that runs the real app
(now fixed: see `.aioson/docs/sheldon/harness-contract.md` §2c and `@qa`'s Runtime smoke gate).

The **lean lane** removes the intermediate hops and makes `@sheldon` the single spec authority:

```
product (PRD) → sheldon (enrich + ACs + design + plan + harness-contract) → dev → qa → (validator detour)
```

`@sheldon` runs in **Lean lane mode (RF-LEAN)** and produces, in one pass, what analyst/architect/
discovery-design-doc/pm would have produced (requirements + ACs, design-doc + readiness, implementation plan,
and the §2c runtime-gated harness contract). `@dev` implements from that plan using the project's design skill;
`@qa` runs the Runtime smoke gate; `@validator` runs as a detour when a harness contract exists.

## When to use which lane

| Use the **lean lane** when… | Keep the **full chain** when… |
|---|---|
| Most features — bounded scope, a single product surface, a clear prototype | Genuinely large or multi-domain scope |
| You want velocity and one spec authority | Sensitive surface (money, multi-tenant ownership, regulated data) that wants independent architecture + scope-check + adversarial review as distinct gates |
| The team trusts `@sheldon` to own the bridge | You want the readiness/scope-check checkpoints to be separate agents |

The **runtime smoke gate is mandatory in both lanes** — neither lane lets a runtime feature close without
build + migrate + boot + Core happy-path on the real stack.

## How to opt in

Drop this file at `.aioson/context/workflow.config.json` (the CLI's `readWorkflowConfig` merges it over the
built-in defaults — per-classification arrays replace the defaults). Then run `aioson workflow:next .` as usual.

A ready-to-copy preset lives at `.aioson/docs/presets/workflow.config.lean.json`:

```json
{
  "version": 1,
  "feature": {
    "MICRO": ["product", "dev", "qa"],
    "SMALL": ["product", "sheldon", "dev", "qa"],
    "MEDIUM": ["product", "sheldon", "dev", "qa"]
  },
  "project": {
    "MICRO": ["setup", "dev"],
    "SMALL": ["setup", "product", "sheldon", "dev", "qa"],
    "MEDIUM": ["setup", "product", "sheldon", "dev", "qa"]
  },
  "rules": { "required": ["dev"], "allowDetours": true }
}
```

`allowDetours: true` keeps `@validator` (harness contract present) and `@tester`/`@pentester` (fired by `@qa`'s
triggers) available as detours — they are not in the static sequence in either lane.

Running the agents by hand (slash commands) is equivalent: activate `@product → @sheldon → @dev → @qa` and skip
analyst/architect/discovery-design-doc/pm. No config file is needed for the manual path.

## Slimming the full chain too (optional)

If you keep the full chain but want it lighter, the most redundant adjacent pair is `@architect` +
`@discovery-design-doc` — both translate the design into a concrete file-level plan. They can be merged into a
single architecture step that also emits the readiness verdict + dev-state handoff (keep the readiness gate; it is
the cheap, valuable part). This is a velocity change, not a correctness one — the runtime gate is what prevents the
green-but-broken outcome.

## What this does NOT change

- No change to `src/` routing constants — the built-in defaults stay the full chain, so the framework test suite
  is untouched. The lean lane is a project-level config + agent capability, not a core rewrite.
- No change to the gates: Gate D / `@qa` Runtime smoke gate / `@validator` contract-integrity precheck apply
  identically in both lanes.
