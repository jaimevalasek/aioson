---
description: "Optional Sheldon enrichment paths for challenging and repairing the existing PRD without creating a second specification package."
agents: [sheldon]
task_types: [enrichment, prd-review]
triggers: [explicit enrichment request, concrete PRD contradiction, material product risk]
---

# Sheldon Enrichment Paths

Load this module only after the active PRD and its source evidence are known. Classification never triggers Sheldon or changes the output shape.

## One path: repair the PRD in place

Challenge only the approved product promise:

- missing observable behavior or failure state;
- contradiction between briefing, prototype, PRD, and current product behavior;
- vague acceptance evidence;
- unresolved dependency that materially changes user scope;
- speculative scope that should be deferred.

Use repository and research evidence before asking the user. Ask for a decision only when it changes product behavior, scope, cost, or material risk.

Apply accepted corrections directly to `prd-{slug}.md` or `prd.md`. Preserve stable `CAP-*` and `AC-*` identifiers whenever their meaning has not changed. Record rejected ideas under deferred or out-of-scope instead of expanding the MVP.

## Output boundary

The PRD remains the only specification authority. Never create:

- a Sheldon enrichment or validation report;
- requirements, spec, architecture, design-doc, readiness, conformance, or user-story files;
- a delivery plan, phased-plan directory, decision checkpoint, or harness contract.

An optional expansion skill may leave a non-canonical working note when explicitly triggered. Merge useful conclusions into the PRD; its presence and completeness never block Planner.

## Dossier trail

When the feature dossier exists, append one compact best-effort entry containing the concrete gap reviewed, PRD changes, ideas rejected, and residual risk. Do not copy the PRD or turn the dossier into another approval artifact.

## Handoff

When the PRD is coherent, set `sheldon_review: approved` and return directly to `@planner`. If a truly blocking product decision remains, return it to Product or the user as one bounded question. Never route by default through Analyst, Architect, PM, Design Doc, Scope Check, or Orchestrator.
