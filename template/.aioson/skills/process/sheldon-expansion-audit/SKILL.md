---
name: sheldon-expansion-audit
description: "Discover and audit PRD enrichment through horizontal product thinking. Use in Sheldon for rich surfaces, prior expansion-scout/scope-expansion/expansion-audit artifacts, a PRD that is too thin or inflated, or an explicit request for creative enrichment."
agents: [sheldon]
task_types: [prd-audit, feature-expansion]
triggers: [expansion audit, prd too thin, rich surface, scope expansion, auditar expansao, prd enxuto demais, creative enrichment, enriquecimento criativo]
---

# Sheldon Expansion Audit

Originate useful possibilities and independently challenge their value. Protect the PRD from both missed opportunities and unjustified scope. Work inside Sheldon's existing two passes; expansion is not a third review or an approval gate.

## Inputs

Read `.aioson/docs/feature-expansion-taxonomy.md` for buckets and conditional operational coverage, and `.aioson/docs/sheldon/quality-lens.md` for horizontal discovery and selection.

Read the target PRD and available feature-owned inputs:

- `.aioson/briefings/{slug}/expansion-scout.md`
- `.aioson/context/features/{slug}/scope-expansion.md`
- `.aioson/context/features/{slug}/expansion-audit.md`

Treat prior ideas as evidence to assess, not a ceiling on creativity or proof of approval. Reuse their decisions and avoid rediscovering rejected ideas without new evidence. When none exists, derive opportunities from the user's goal, source promises, actual journeys, and inspected repository capabilities; label them inferred. Lack of prior files does not restrict an explicit request for deeper exploration.

## Discover, then challenge

In pass 1, use relevant horizontal lenses to generate distinct ways to improve the result. Consider connections between capabilities and a simpler alternative alongside additions. Trace the before/after journey across actors already in scope. A transfer from an adjacent domain must explain the shared mechanism and its limitations.

In pass 2, compare the strongest candidates with the approved baseline: user value, evidence/confidence, added complexity, downside, scope/prototype impact, and a cheap validation. Do not require a fixed number of ideas. Keep the shortlist small enough for an actual decision. A new actor, product outcome, integration, or interaction is a proposal until accepted even when reuse makes it inexpensive.

For external claims that materially affect a recommendation, use Sheldon's research modules. Hypotheses and analogies must not be presented as verified demand or technical compatibility.

## Conditional operational audit

Use the taxonomy's Operational Surface Map when the approved feature includes objects users manage. Establish who owns each object, where in-scope actions happen, and how relevant lifecycle, empty/error, validation, and permission boundaries work.

- A missing action or surface is critical only when its absence breaks a cited approved promise. Name that promise and the unusable journey.
- Generic phrases such as "manage cards" need concrete flows; a read-only view does not imply create/edit/delete or workspace administration.
- For Trello/Kanban/CRM/workspace-like scope, inspect the main work surface and creation/editing/management flows that the user actually approved. Category resemblance alone does not authorize new entities or roles.
- Respect explicit exclusions and justified non-applicability/deferments. Do not impose full CRUD, collaboration, restoration, search, or dashboards on every named object.
- Keep missing approved behavior separate from attractive enhancements and from normal Planner implementation choices.

## Output

Write or update `.aioson/context/features/{slug}/expansion-audit.md` as a non-canonical decision aid. Keep conclusions and evidence, not private reasoning or an exhaustive brainstorm. Use only relevant sections:

```md
# Expansion Audit - {Feature}

## Inputs
- PRD and inspected source/repository paths:
- Prior expansion artifacts found:
- Audit mode: prior-artifact / inferred
- Depth and relevant lenses:

## Opportunities
| Opportunity | Actor / friction / evidence | Mechanism and before → after | Value / confidence | Cost / downside | Bucket | Disposition / owner | Validation |
|---|---|---|---|---|---|---|---|

## Findings
| Severity | Finding | Approved promise / evidence | Required correction |
|---|---|---|---|

## Operational Surface Audit
| Object / in-scope action | Surface / state gap | Promise affected | Correction or exclusion rationale |
|---|---|---|---|

## PRD Changes and Deferred Options
- Applied: decision or promise → CAP/AC → observable value delta.
- Proposed/deferred: owner, trade-off, validation; not implementation scope.
- Cut: why the baseline is better or an exclusion applies.

## Sheldon Decision
Proceed / repair approved behavior / blocking product decision, with reason.
```

Merge approved conclusions into the same PRD with CAP/AC trace. Originate proposed reframings when useful, but preserve Product-owned Vision, Problem, Users, scope, and prototype unless a recorded owner decision changes them. Classify scope only after accepted edits. Optional ideas can remain deferred while Sheldon approves the coherent existing scope; the audit's existence or length never blocks Planner.
