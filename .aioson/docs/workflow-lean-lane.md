---
name: workflow-streamlined-lane
description: "The streamlined (lean) workflow lane — fewer agent hops with the same gates; when it applies, how workflow.config.json selects it, and what it never skips."
agents: [setup, product, sheldon, planner, dev, qa, neo]
modes: [planning]
task_types: [workflow, routing, configuration]
load_tier: trigger
triggers: [streamlined workflow, lean lane, workflow.config.json, fewer agents, menos burocracia]
---

# Streamlined Feature Workflow

The canonical SMALL/MEDIUM route is:

```text
optional raw sources/briefing/refinement/approval → product → sheldon → planner → dev → qa
```

It deliberately contains one PRD, one implementation plan, and one QA verdict. Classification changes depth inside those artifacts; it does not add default agents or documents.

```json
{
  "version": 1,
  "feature": {
    "MICRO": ["product", "sheldon", "planner", "dev", "qa"],
    "SMALL": ["product", "sheldon", "planner", "dev", "qa"],
    "MEDIUM": ["product", "sheldon", "planner", "dev", "qa"]
  },
  "project": {
    "MICRO": ["setup", "product", "sheldon", "planner", "dev", "qa"],
    "SMALL": ["setup", "product", "sheldon", "planner", "dev", "qa"],
    "MEDIUM": ["setup", "product", "sheldon", "planner", "dev", "qa"]
  },
  "rules": { "required": ["sheldon", "dev"], "allowDetours": true }
}
```

## Role boundaries

- Product creates an implementation-ready PRD with capabilities, current-system fit, and acceptance criteria.
- Sheldon must challenge and enrich that same PRD in place and promote a current hash-bound PASS before Planner.
- Planner inspects the repository, records the per-path implementation delta, and writes vertical executable phases with evidence-triggered engineering controls.
- Dev implements and integrates those phases and controls through the production path.
- QA independently proves the real application behavior and revalidates any bounded specialist-authored correction.

Orchestrator, Tester, Pentester, and Validator remain available to every classification as opt-in detours. Use one for a named uncertainty or triggered review, then merge the conclusion into a canonical artifact. Tester/Pentester may apply only their bounded, evidence-backed corrections and must return final acceptance to QA. The lightweight feature dossier and continuity mapping are non-blocking context caches, not extra deliverables.

## Compatibility

Custom `workflow.config.json` sequences continue to run. Older requirements/spec/design/readiness/conformance/harness files remain readable. They are no longer generated or required by the built-in route.

The historical filename `workflow-lean-lane.md` is retained so existing links do not break.
