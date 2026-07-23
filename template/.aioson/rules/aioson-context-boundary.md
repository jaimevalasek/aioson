---
name: aioson-context-boundary
description: .aioson/context/ is Markdown-first with explicit machine-readable workflow exceptions
priority: 10
version: 2.0.0
agents: [product, sheldon, planner, dev, qa, analyst, architect, ux-ui, pm]
modes: [executing]
task_types: [artifact-write, file-creation]
load_tier: trigger
guard: true
triggers: [writing artifacts, creating files, saving context, context artifact, machine-readable file]
paths: [.aioson/context/**]
---

# Context Boundary: `.aioson/context/`

`.aioson/context/` is Markdown-first. Feature and project knowledge stays human-readable unless a file is one of the explicit runtime/security exceptions below.

Allowed machine-readable exceptions:

- `.aioson/context/security-findings-{slug}.json`
- `.aioson/context/workflow.state.json`
- `.aioson/context/handoff-protocol.json`
- `.aioson/context/last-handoff.json`
- `.aioson/context/parallel/*.json`

Legacy `conformance-{slug}.yaml` files remain readable for compatibility but are not created by the canonical workflow.

## Canonical locations

| Artifact | Location |
|---|---|
| Project configuration | `.aioson/config.md` |
| Product authority | `.aioson/context/prd.md` or `prd-{slug}.md` |
| Delivery plan | `.aioson/context/implementation-plan-{slug}.md` |
| QA verdict | `.aioson/context/qa-report-{slug}.md` |
| Simple Plan | `.aioson/context/simple-plans/{slug}.md` |
| Project/feature indexes | `.aioson/context/features.md`, `project-pulse.md`, `dev-state.md` |
| Workflow runtime state | `.aioson/context/workflow.state.json`, `handoff-protocol.json`, `last-handoff.json` |
| Parallel coordination | `.aioson/context/parallel/*.json` |
| Security findings, only when triggered | `.aioson/context/security-findings-{slug}.json` |
| Optional specialist notes | `.aioson/context/{artifact}-{slug}.md` |

Requirements/spec/design/readiness/conformance documents are legacy optional inputs, not canonical outputs or prerequisites. Do not create them simply because a feature is SMALL or MEDIUM.

## On violation detected

1. Do not create an arbitrary machine-readable context file.
2. Put product behavior and acceptance criteria in the PRD.
3. Put delivery decisions, exact paths, and executable checks in the implementation plan.
4. Put the verdict and evidence in the QA report.
