---
description: Briefing enrichment, solution breadth, research discipline, artifact schemas, and delivery checks
agents: [briefing]
task_types: [briefing-enrichment, solution-exploration, briefing-write]
triggers: [resolved briefing source, confirmed briefing slug, rich operational surface]
---

# Briefing Exploration and Artifacts

Load after the source and slug are resolved. This module owns enrichment and writes; it does not reopen intake decisions without new contradictory evidence.

## Enrichment order

1. Run `context:select` in executing mode and load only selected context.
2. Check `.aioson/context/features/{slug}/dossier.md` when present.
3. Inspect `researchs/` before any web search. Load web-research guidance only when an external/time-sensitive claim could materially change risk, options, or questions. Persist fresh results to `researchs/{research-slug}/summary.md`.
4. Load the SDD hardening reference only when classifying whether unresolved gaps can safely move forward.
5. Use `.aioson/docs/feature-completeness-contract.md` as a discovery lens, not a PRD template. Trace candidate promised outcomes through interaction, lifecycle/state, validation, failures/recovery, permissions, integration/asynchrony, notifications, import/export, observability, scale/migration, accessibility/localization, and operational management only where material.
6. For a rich operational or experiential surface, load `.aioson/skills/process/briefing-expansion-scout/SKILL.md` and write `.aioson/briefings/{slug}/expansion-scout.md`. Infer richness from the intended experience, not prompt length: a simple game or learning tool can need discovery without needing a large product. Summarize the strongest opportunities, their value and unresolved choices in the briefing; a detached ideas file is insufficient for handoff. Keep inferred proposals separate from source promises.

Do not invent formal `CAP-*` identifiers; Product owns them.

## Horizontal solution exploration

Run when more than one viable shape exists or the idea has workspaces, boards/cards, pipelines, CRM/Kanban, dashboards, builders/editors, automation, collaboration, admin/management, repeated CRUD, templates, media output, games, simulations, or learning experiences. Use the taxonomy's experience lenses for non-management products.

1. Consider 3–5 materially different shapes when the product direction is open, not cosmetic variants or a quota to fill. With a fixed direction, explore useful interactions within it instead of proposing another product.
2. For operational shapes, map every Core object to parent/owner, create, list/select, edit, archive/restore, management surface, first-use empty state, and material error/recovery state.
3. Compare value, risk, effort, completeness, and implementation leverage.
4. Recommend one for Product to weigh, while leaving every credible option visible.
5. Ground claims in repository/research evidence and cite consulted sources.

If the user fixed one specific solution and its relevant operational or experiential surface is complete, replace the fan-out with a concise `Alternatives considered` note. This waives breadth, not completeness. Preserve explicit exclusions and bounded corrections; a richer result may come from removing friction rather than adding features.

Write `.aioson/briefings/{slug}/solution-options.md`:

```markdown
---
slug: {slug}
created_at: {ISO-date}
recommended: {option-id}
---

# Solution options — {Title}

> Exploratory. No option is approved here; @product chooses.

## Option A — {name}
- Shape:
- Operational surface:
- Experience map (for interaction-led products; use the taxonomy's shape):
- Capability candidates and conditional lenses:

| Object | Parent / owner | Required actions | Management surface | Empty / error states |
|---|---|---|---|---|

- Value / Risk / Effort / Completeness:

## Comparison
| Option | Value | Risk | Effort | Completeness | Recommended |
|---|---|---|---|---|---|

## Recommendation
```

Reference this artifact from `## Proposed solution` and `## Additional files`.

## Canonical briefing schema

Write `.aioson/briefings/{slug}/briefings.md`:

```markdown
---
slug: {slug}
created_at: {ISO-date}
updated_at: {ISO-date}
source_plans: [{plans or "conversational"}]
---

# Briefing — {Title}

## Context

## Problem

## Proposed solution

## Themes

## Risks

## Identified gaps

## Sources

## Open questions
```

All eight sections are mandatory. Use `TBD — not discussed in this session.` rather than deleting an empty section. Risks must be specific, sources must name consulted URLs/references or explicitly state no research, and open questions must be numbered and classified.

Complex themes may use `.aioson/briefings/{slug}/{theme}.md`; register each under `## Additional files`.

## Sources subsection schemas

Inside `## Sources`, add:

- `### Source Inventory`: one `SRC-*` row per inventoried file with project-relative path, current `sha256:` fingerprint — copied verbatim from the `fingerprint` fields of `aioson briefing:sources . --slug={slug} --json`, never computed or invented by hand — purpose, and no secret content; `Type`/`Role`/`Usage` columns preserve `consulted`, `metadata_only`, or `blocked`.
- `### Source Promise Map`: one stable `PROM-*` row per material user promise, citing `SRC-*` or an explicit conversational/research source, its approved intent, and `required`, `deferred`, or `not_applicable`. Each row also records a locator into its `SRC-*` (heading or line anchor) so the refiner's blocking check and Product's coverage pass are targeted reads, never whole-pack re-reads.

## Registry schema

Create/update `.aioson/briefings/config.md` with valid YAML and a readable table:

```yaml
---
updated_at: {ISO-date}
briefings:
  - slug: {slug}
    status: draft
    source_plans: [{plans or "conversational"}]
    created_at: {ISO-date}
    approved_at: null
    prd_generated: null
---
```

Lifecycle is `draft → approved → implemented`. Preserve existing statuses and metadata; only the CLI/user-controlled workflow advances them.

## Delivery checks

- Verify frontmatter parses and all eight headings occur once.
- Verify the problem describes progress/pain rather than merely naming a feature.
- Verify each promised outcome is present or explicitly deferred.
- Verify rich operational objects can be managed, not merely displayed.
- Verify every blocking uncertainty is visible and classified.
- Verify selected plans remain untouched.

After writing, record the feature trail when a dossier exists:

```bash
aioson dossier:add-finding . --slug={slug} --agent=briefing --section="Agent Trail" --content="Briefing created: {N} themes, {N} risks, {N} open questions" 2>/dev/null || true
```
