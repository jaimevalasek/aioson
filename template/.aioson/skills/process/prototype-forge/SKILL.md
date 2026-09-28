---
name: prototype-forge
description: Self-contained prototype process for canonical Briefing surfaces or non-canonical visual explorations
agents: [refiner, briefing]
task_types: [prototype, visual-exploration]
triggers: [prototype, prototipo, clickable, visual exploration, exploracao visual, surface map]
---

# Prototype Forge

Generate a clickable, self-contained prototype in exactly one mode. `canonical-briefing` validates the selected experience or operational map for a refinable Briefing. `visual-exploration` tests a visual direction, screenshot reference, redesign, or model variant without making it canonical. Skip tiny non-visual work.

## Ownership

Prototype Forge owns interaction, screens, navigation, local/mock state, and applicable state coverage. CRUD belongs only to promised management behavior. The selected `design_skill` owns tokens, composition, component anatomy, and motion. Never invent a second visual system.

Apply quality in order: selected experience completeness → working behavior/states → product-specific visual craft → one surgical polish pass. For a game, prove the playable loop before polishing the surrounding interface.

## Inputs

For `canonical-briefing`:

1. Chosen surface map in `.aioson/briefings/{slug}/solution-options.md` or `expansion-scout.md`; fallback to the feature-expansion taxonomy. If none exists, build the map first.
2. `.aioson/briefings/{slug}/briefings.md`.
3. `design_skill` from project context, including its final quality reference.
4. For `interface-design`, resolve briefing `identity.md`, then project `identity.md`.

For `visual-exploration`:

1. Frozen `.aioson/explorations/{slug}/inputs/task.md`, `inputs/source-map.md`, and confirmed `intake.json`.
2. Only the run directory assigned by the parent; isolated runs must not inspect sibling reports or prototypes.
3. Resolve exploration `identity.md`, then project `identity.md`, then none.

An identity file **overlays the one engine** and is not a **second visual system**: apply Palette, Typography, Spacing & layout, Radius & depth, Motion, and `## Component structure notes`.

## Execution

Load `references/build-contract.md` and `references/quality-and-manifest.md` before UI coding. Use the quality reference at that point only to write the manifest skeleton and its decision-grade `## Visual direction`; defer every polish/check/evidence step under “After the functional build” until operational completeness or the selected playable loop is real. Then re-read that same reference for exactly one bounded polish pass and handoff evidence. This phase boundary prevents both late composition and premature polishing.

The prototype is a development reference, not production proof. A canonical lock stays draft until the workflow freezes it. An exploration stays non-canonical even after selection.

## Outputs

In `canonical-briefing`, write only:

- `.aioson/briefings/{slug}/prototype.html`
- `.aioson/briefings/{slug}/prototype-manifest.md`

The manifest begins:

```yaml
---
feature: {slug}
status: draft
identity: .aioson/briefings/{slug}/identity.md
references: extracted
---
```

Feature ownership must match the directory. A later lock may change `status`, never `feature`.

`identity` records the exact record this prototype was built from, or `none` for an intent-first build. It is provenance the PRD must inherit, so never point it at another feature or at an exploration record. `references` records the owner's answer about visual references — `extracted` (images given, identity built), `declined` (the owner has none), `unavailable` (asked, no answer yet); on a brand surface an intent-first build without this line is the measured shape of a question never asked (`references_unasked`).

In `visual-exploration`, write only the assigned immutable run's `prototype.html` and `report.md`. The report must preserve `<!-- aioson:reusable-prompts -->`, the exact generation prompt, a reusable one-shot prompt, an incremental prompt sequence, validation evidence, and limitations. Never create a briefing manifest from an exploration run.

## Gate

Do not hand off until the selected core journey works, promised managed objects are reachable/manageable, actions produce their intended state/feedback, applicable empty/error/permission states are demonstrable, authenticated chrome works when applicable, no native browser dialog or external dependency remains, the file is CSP-compatible and under 2,000,000 bytes, and visual evidence is honest. In `canonical-briefing`, also: the first-open explainer (`data-aioson-tour` + `?` control) exists, the `data-aioson-primary` marker sits on the briefing's #1 differentiator, the first-contact walkthrough matched the briefing's promises, the copy corpus stays inside the em-dash budget (`em_dash_prose` warning clean or each remaining instance deliberate), and the generation-tell scan is clean (`tells 0`, or each named tell carries a recorded brief/register reason in Quality evidence — the kicker never qualifies).
