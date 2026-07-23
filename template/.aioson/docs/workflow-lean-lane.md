---
name: workflow-streamlined-lane
agents: [setup, product, sheldon, planner, dev, qa, neo]
modes: [planning]
task_types: [workflow, routing, configuration]
load_tier: trigger
triggers: [streamlined workflow, lean lane, workflow.config.json, fewer agents, menos burocracia]
---

# Streamlined Feature Workflow

The canonical SMALL/MEDIUM route is:

```text
optional briefing/refinement → product → planner → dev → qa
```

It deliberately contains one PRD, one implementation plan, and one QA verdict. Classification changes depth inside those artifacts; it does not add default agents or documents.

```json
{
  "version": 1,
  "feature": {
    "MICRO": ["product", "planner", "dev", "qa"],
    "SMALL": ["product", "planner", "dev", "qa"],
    "MEDIUM": ["product", "planner", "dev", "qa"]
  },
  "project": {
    "MICRO": ["setup", "product", "planner", "dev", "qa"],
    "SMALL": ["setup", "product", "planner", "dev", "qa"],
    "MEDIUM": ["setup", "product", "planner", "dev", "qa"]
  },
  "rules": { "required": ["dev"], "allowDetours": true }
}
```

## Role boundaries

- Product creates an implementation-ready PRD with capabilities and acceptance criteria.
- Sheldon may challenge and enrich that same PRD in place when requested or when a concrete contradiction warrants independent review.
- Planner inspects the repository and writes vertical executable phases.
- Dev implements through the production path.
- QA independently proves the real application behavior.

Sheldon, Analyst, Architect, PM, UX/UI, Discovery Design Doc, Scope Check, Orchestrator, Tester, Pentester, and Validator remain available to every classification as opt-in detours. Use one for a named uncertainty or triggered review, then merge the conclusion into a canonical artifact. The lightweight feature dossier is a non-blocking context cache, not a fourth deliverable.

## Compatibility

Custom `workflow.config.json` sequences continue to run. Older requirements/spec/design/readiness/conformance/harness files remain readable. They are no longer generated or required by the built-in route.

The historical filename `workflow-lean-lane.md` is retained so existing links do not break.
