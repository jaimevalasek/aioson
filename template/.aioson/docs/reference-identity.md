---
description: "Reference-image-driven visual identity — how user-provided reference images become a text identity.md the interface-design engine applies, instead of every project inheriting a fixed preset's look. Covers the schema, the two scopes, the extraction skill, the verify:artifact gate, and the cross-harness/no-vision fallback."
agents: [setup, briefing-refiner, ux-ui]
task_types: [design, configuration, verification]
triggers: [identity.md, reference image, visual identity, reference-identity-extract, kind=identity, brand reference, design_skill interface-design]
---

# Reference-image-driven visual identity

A fixed design preset (`clean-saas-ui`, `aurora-command-ui`, …) hardcodes a palette and a typeface, so
every project that picks the same preset looks the same — the generic, "made-by-AI" look. The
`interface-design` skill is the opposite: a craft **engine** whose mandate is *"if another AI would
produce the same output, you failed."* This flow feeds that engine the user's **own references** so the
result is specific and premium.

The pipeline: **reference images → extracted once into `identity.md` (text) → the engine builds from the
text.** The build never reads the images. This is the same move AIOSON already makes when it extracts a
real website into a token spec — generalized so the **source** is images and the **lifetime** is
per-briefing (or per-project brand), not a frozen preset.

## Two image roles

- **Visual identity** — brand color, type, texture, the *feel*. Drives the token system.
- **Component / structure** — a board, a table, a screen the user wants. Drives **structure only**; its
  own colors/fonts are ignored. Feeds `prototype-forge`'s surface map.

Synthesis = **apply the identity to the structure.** This is why you do not want "component skills": a
component skill smuggles in its own fixed identity and reintroduces the sameness. A component *image*
contributes layout, and the identity comes from the identity images.

## The `identity.md` record

One text file the build consumes. Frontmatter mirrors the proven extracted-token shape; sections map to
the `interface-design` token families plus its Phase-1 anti-sameness anchors. Authored by the
`reference-identity-extract` process skill (see its `SKILL.md` for the exact schema).

- **Frontmatter:** `kind`, `scope` (`briefing` | `brand`), `slug`, `source` (`references` | `intent`),
  `generated_by`, `generated_at`, `confidence`, `theme`, `base_unit`.
- **Sections:** `## Design pillars`, `## Palette` (real hex), `## Typography`, `## Spacing & layout`,
  `## Radius & depth` (exactly one depth strategy), `## Motion`, `## Signature moves`, `## Anti-goals`,
  `## Component structure notes`, `## Provenance` (generic — never names an external source).
- `source: references` (filled from images) vs `intent` (image-less fallback via interface-design's own
  Phase 0). **Same shape either way**, which is what makes it gateable and harness-portable.

## Two scopes

| scope | record | images |
|---|---|---|
| **Per-briefing** (default) | `.aioson/briefings/{slug}/identity.md` | `.aioson/briefings/{slug}/references/{identity,structure}/` |
| **Project brand** | `.aioson/context/identity.md` | `.aioson/context/brand-references/{identity,structure}/` |

**Resolution order** (identical for `@ux-ui` and `prototype-forge`): per-briefing → project brand →
none (then `interface-design` Phase 0 governs). The **text record is canonical and committed**; the
images are raw source and may be `.gitignore`d — extraction runs once, so the build never needs them
again.

## How it runs

- **`@briefing-refiner`** (prototype mode) — when a rich-surface product would benefit from a visual,
  it offers reference-image intake: the user drops images into `references/{identity,structure}/`, the
  agent loads `reference-identity-extract`, writes `identity.md`, and `prototype-forge` builds from it.
  No images → it skips and `interface-design` runs intent-first. Always optional, never blocking.
- **`@setup`** — for `site`/`web_app`, the recommended visual route is *interface-design + reference
  images* (sets `design_skill: interface-design`; the concrete look comes from `identity.md`). The
  fixed presets remain an explicit alternative.
- **`@ux-ui`** — Step 0 loads `identity.md` as the **identity input** the single interface-design engine
  applies. It is **not** a second design skill: exactly one design skill is loaded, and `identity.md`
  parameterizes it. This does not weaken the ONE-SKILL-ONLY rule.

## The gate

`aioson verify:artifact . --kind=identity --file=<path>` proves the record is complete — the token
skeleton plus both anti-sameness anchors (`## Design pillars` + `## Signature moves`) plus the structure
section are present, and no placeholder or unfilled hex slipped through. Build-free, deterministic, the
periphery analog of the code pipeline's `SG-*` gates. The extraction skill runs it `--advisory` before
handing back. Path-resolved via `--file` because the record lives in either scope.

## Cross-harness & no-vision

The extraction pass is the **only** vision step. On a vision-less harness, either run extraction once on
a vision-capable harness, or hand-author `identity.md` from the schema — the gate then proves it is
complete. The build is identical in both cases because it reads only the text. This is the same reason
gates are engine-driven rather than hook-driven: the portable artifact crosses harnesses; the
host-specific capability does not.

## Notes

- **Vision is non-deterministic** — two extractions of one image can differ. That is exactly why the
  text record exists: `identity.md` is the frozen, user-editable source of truth, and the build off it
  is deterministic.
- **Image storage** — reference images are binary and can bloat git. The text record is canonical and
  committed; images are optional and may be `.gitignore`d at the project level.
- **Provenance discipline** — `## Provenance` describes sources by type only. Never name an external
  product, brand, site, or tool in any artifact.
