---
name: workflow-lean-lane
agents: [setup, product, sheldon, dev, qa, validator, neo, orchestrator]
modes: [planning]
task_types: [workflow, routing, configuration]
load_tier: trigger
triggers: [lean lane, workflow.config.json, fewer agents, menos é mais, lean pipeline]
---

# Workflow Lean Lane (SMALL default; opt-in for MEDIUM)

SMALL features now run the **lean chain by default**, and MEDIUM runs the **`@orchestrator` maestro lane**
(`@product → @orchestrator → @dev → @pentester → @qa`), where `@orchestrator` fans out to
`@analyst`/`@architect`/`@pm` (+ `@ux-ui` when UI-heavy) as sub-agents and consolidates one gated spec
package, with `@scope-check`, `@discovery-design-doc`, and `@ux-ui` available as opt-in detours. The older heavy chain (`product → analyst → scope-check → architect →
discovery-design-doc → pm → dev → qa`) is no longer a built-in default, but its spec hops can be opted
back in. The bottleneck was never "too few design documents", it was the absence of a gate that runs the
real app (now fixed: see `.aioson/docs/sheldon/harness-contract.md` §2c and `@qa`'s Runtime smoke gate).

The **lean lane** removes the intermediate hops and makes `@sheldon` the single spec authority:

```
product (PRD) → sheldon (enrich + ACs + design + plan + harness-contract) → dev → qa → (validator detour)
```

`@sheldon` runs in **Lean lane mode (RF-LEAN)** and produces, in one pass, what analyst/architect/
discovery-design-doc/pm would have produced (requirements + ACs, design-doc + readiness, implementation plan,
and the §2c runtime-gated harness contract). `@dev` implements from that plan using the project's design skill;
`@qa` runs the Runtime smoke gate; `@validator` runs as a detour when a harness contract exists.

## When to use which lane

| Use the **lean lane** when… | Opt into the **full chain** when… |
|---|---|
| Most features — bounded scope, a single product surface, a clear prototype | Genuinely large or multi-domain scope |
| You want velocity and one spec authority | Sensitive surface (money, multi-tenant ownership, regulated data) that wants independent architecture + scope-check + adversarial review as distinct gates |
| The team trusts `@sheldon` to own the bridge | You want the readiness/scope-check checkpoints to be separate agents |

The **runtime smoke gate is mandatory in both lanes** for every runtime surface the framework can prove from
local artifacts. The CLI blocks detectable runtime features (prototype manifest or migration/Prisma evidence)
without a valid `RG-*` contract; `@validator` still owns the target-app-only `has_api` judgment.

## How to opt in

SMALL already ships lean — no config needed. Use this preset to extend the lean shape to MEDIUM (or to pin it
explicitly). Drop this file at `.aioson/context/workflow.config.json` (the CLI's `readWorkflowConfig` merges it over the
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

Autopilot (`auto_handoff: true`) drives only the **post-dev** cycle (`@dev → @qa → …`) in the lean lane:
`@product`/`@sheldon` always hand off manually (upstream-agent policy), so there is nothing to auto-chain before
`@dev`. This matches the MEDIUM maestro lane, whose `@product`/`@orchestrator` pre-dev handoffs are also manual —
so the lean lane loses no automation it was ever supposed to have.

Running the agents by hand (slash commands) is equivalent: activate `@product → @sheldon → @dev → @qa` and skip
analyst/architect/discovery-design-doc/pm. No config file is needed for the manual path.

## Full-merged chain (heavier, opt-in)

The lean/maestro defaults are enough for most work. When a project genuinely wants the heavier multi-agent
chain back — independent `@analyst`, `@architect`, and `@pm` as distinct gates — drop the **full-merged**
preset at `.aioson/context/workflow.config.json` (ready-to-copy at
`.aioson/docs/presets/workflow.config.full-merged.json`): it is that chain with `discovery-design-doc`
removed. On this full-merged detour, when the active sequence routes `@architect` → `@dev` while omitting
`@discovery-design-doc`, `@architect` runs in **merged mode** (see `agents/architect.md` → *Architect merged
mode*) and produces the design-doc + readiness + dev-state itself, then hands off to `@dev`. Merging `@architect` +
`@discovery-design-doc` keeps the readiness gate (the cheap, valuable part) while dropping the redundant
second file-level-plan hop; it is a velocity change, not a correctness one — the runtime gate is what
prevents the green-but-broken outcome.

```json
{
  "version": 1,
  "feature": {
    "MICRO": ["product", "dev", "qa"],
    "SMALL": ["product", "analyst", "scope-check", "architect", "dev", "qa"],
    "MEDIUM": ["product", "analyst", "architect", "pm", "scope-check", "dev", "pentester", "qa"]
  },
  "project": {
    "MICRO": ["setup", "dev"],
    "SMALL": ["setup", "product", "analyst", "scope-check", "architect", "dev", "qa"],
    "MEDIUM": ["setup", "product", "analyst", "architect", "ux-ui", "pm", "orchestrator", "scope-check", "dev", "qa"]
  },
  "rules": { "required": ["dev"], "allowDetours": true }
}
```

## What this does NOT change

- The override mechanism is unchanged — `readWorkflowConfig` still merges `workflow.config.json` over the
  built-in defaults (per-classification arrays replace the defaults). Only the built-in default *shape* changed
  (SMALL ships lean, MEDIUM ships the `@orchestrator` maestro lane); the lean lane stays a project-level config +
  agent capability, not a different engine.
- The runtime safety gates are unchanged: `@qa`'s Runtime smoke gate, the §2c `RG-*` criteria, the CLI
  contract-integrity backstop, and `@validator`'s target-app judgment apply identically in both lanes.

## What the lean lane DOES change about the gates

Removing `@analyst`/`@pm` removes the agents that produced `spec-{slug}.md` and approved the process gates
A (requirements), B (design) and C (plan). Those gates still fire under `aioson workflow:next` — `@dev`'s
completion checks **Gate C** against `spec-{slug}.md`, and `@qa`'s checks **Gate D** against the same file — so
the lean lane would dead-end at `@dev` if nothing produced them. In the lean lane **`@sheldon` owns that**: its
RF-LEAN pass writes `spec-{slug}.md` with `gate_requirements`/`gate_design`/`gate_plan: approved` and an
`implementation-plan-{slug}.md` with `status: approved` (the hops it collapsed, after the user confirms its
spec-authority output). Gate D / execution stays with `@qa`, which writes the `## QA sign-off` PASS into the same
file after the Runtime smoke gate. If you run the lane by hand (slash
commands, untracked), the gate frontmatter is informational — but writing it keeps the manual and tracked paths
identical.
