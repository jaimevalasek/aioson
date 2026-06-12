---
description: "Sheldon enrichment paths — gap analysis dimensions, sizing, in-place vs phased plan outputs, enrichment log, and handoff."
agents: [sheldon]
task_types: [enrichment, sizing]
triggers: [enrichment paths, sizing, phased plan]
---

# Sheldon Enrichment Paths

Load this module after source consolidation and before writing any enrichment output.

## Gap analysis dimensions

Analyze the PRD for:

- missing requirements
- edge cases
- vague or absent acceptance criteria
- unresolved technical decisions
- unmapped external dependencies
- incomplete user flows
- internal contradictions

Show improvements grouped by:

- critical gaps
- important improvements
- refinements

The user must choose which improvements to apply before you write anything.

## Sizing decision

Score the enriched scope using:

| Criterion | Weight |
|---|---|
| Main entities above 3 | +1 each |
| Distinct delivery phases above 1 | +2 each |
| External integrations | +1 each |
| User flows above 3 | +1 each |
| AC complexity above 10 | +1 |

Decision thresholds:

- `0–3` → enrich PRD in place
- `4–6` → enrich PRD in place and add `## Delivery plan`
- `7+` → create external phased plan in `.aioson/plans/{slug}/`

Present the decision and justification before creating any files.

## Path A — In-place enrichment

For scores `0–6`:

- expand existing sections
- add missing sections when needed
- never remove existing content
- never rewrite `Vision`, `Problem`, or `Users`
- mark Sheldon-added content with `_(sheldon)_`

For scores `4–6`, add `## Delivery plan` with numbered phases inside the PRD.

Also add or update:

- `## Reference sources (sheldon)`

## Path B — External phased plan

For scores `7+`, create:

- `.aioson/plans/{slug}/manifest.md`
- `.aioson/plans/{slug}/plan-{phase-slug}.md`

Rules:

- create `manifest.md` first
- phase slugs must be descriptive
- phases must be independently implementable
- phase ACs must be independently verifiable
- pre-made decisions are final
- deferred decisions must state who decides and when

## `manifest.md`

Include:

- target PRD
- Sheldon version
- created date
- status
- overview
- phase table
- pre-made decisions
- deferred decisions
- reference sources

## `plan-{phase-slug}.md`

Each phase file should include:

- scope
- new or modified entities
- user flows covered
- acceptance criteria
- implementation sequence
- external dependencies
- notes for `@dev`
- notes for `@qa`
- phase-specific reference sources

## Enrichment log

Create or update `.aioson/context/sheldon-enrichment.md` at the end of every session.

It must track:

- target PRD
- enrichment round count
- last enrichment date
- plan path or `null`
- sizing score
- sizing decision
- sources used
- improvements applied
- improvements discarded

## Handoff

If enrichment stayed in-place:

- tell the user to activate `@analyst`

If an external phased plan was created:

- tell the user where `manifest.md` lives
- tell them to activate `@analyst`
