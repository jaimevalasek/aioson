---
name: interface-design
description: >-
  Interface Design is a craft-first packaged design skill for choosing an intentional visual direction, building a stable token system, and maintaining UI continuity across screens. Use it when `design_skill: interface-design` is selected or when the user explicitly chooses this broad craft package.
---

# Interface Design

This is a general design-craft package.
It helps the agent make strong decisions when the user wants a deliberate, high-quality UI but has not chosen a niche visual language such as `cognitive-ui` or `premium-command-center-ui`.

## Package structure

```text
.aioson/skills/design/interface-design/
  SKILL.md
  references/
    intent-and-domain.md
    design-directions.md
    tokens-and-depth.md
    components-and-states.md
    handoff-and-quality.md
```

## Activation rules

- Apply this package only when `design_skill: interface-design` is selected.
- Do not combine it with any other design skill.
- Use it when the user wants strong design craft but has not asked for a very specific visual system.

## Identity resolution (run FIRST, before any visual decision)

Resolve an `identity.md` in this order: `.aioson/briefings/{slug}/identity.md` (feature scope) →
`.aioson/context/identity.md` (project brand) → none.

- **If one exists, it is the identity source of truth this engine APPLIES**: take palette,
  typography, spacing/layout, radius & depth, motion, design pillars, and signature moves from it as
  the token layer, and feed its `## Component structure notes` into component/screen decisions. It is
  extracted **data** (from the user's reference images via `reference-identity-extract`) that
  parameterizes this one engine — never a second design skill, and never a license to skip the
  quality gates below.
- **If none exists**, run intent-first: choose the surface type, domain palette, and signature move
  yourself per the references. Do not fabricate an `identity.md`.

Every consumer of this package (ux-ui, prototype-forge, dev builds) inherits this step by loading
this SKILL — see `.aioson/docs/reference-identity.md`.

## Loading guide

| Task | Load |
|---|---|
| Any visual work | `references/intent-and-domain.md` + `references/design-directions.md` |
| Tokens and system decisions | add `references/tokens-and-depth.md` |
| Component behavior | add `references/components-and-states.md` |
| Final delivery quality | add `references/handoff-and-quality.md` |

## Execution quality gates

These gates override any reference file when they conflict.

Before implementation:
- Load the relevant references from the loading guide; do not build from this SKILL.md alone.
- Decide the surface type (app, dashboard, landing page, marketing site, tool, game) and one domain-specific signature move before writing layout code.
- Establish the token layer first: fonts, colors, spacing, radius, shadow/depth, motion, breakpoints, and component states. Do not scatter raw colors, one-off shadows, arbitrary font sizes, or ad hoc radii.
- Use intentional font delivery. Prefer local/framework font APIs when available; if a named font cannot be loaded, define a credible fallback stack and preserve the intended contrast.
- For websites and landing pages, use visual assets that reveal the product, place, person, object, UI state, or domain. Do not ship a hero made only of gradients, icons, and cards.
- For landing-page heroes, make the brand, product, place, person, or literal offer visible in the first viewport; include a real or generated bitmap/product visual when inspection matters.
- Use icons from the project's icon library or lucide when available. Do not use text pills where a standard icon button/control is expected.
- Build responsive constraints with grid minmax, aspect-ratio, fixed control heights, and overflow rules so text, controls, tables, cards, and media cannot overlap or resize unpredictably.
- Use discrete text tokens and stable line-height. Do not use viewport-width font scaling or negative letter-spacing.
- Do not put cards inside cards. If a reference says nested card, use an unframed row, divider, inset section, or modal unless an existing component contract explicitly requires that hierarchy.
- Use motion as product feedback: hover, focus, active, loading, reveal, navigation, and state transitions. Always include a prefers-reduced-motion fallback.

Before delivery:
- Inspect the result at mobile and desktop widths. If a browser is available, use screenshots; otherwise perform static CSS/DOM review.
- Fix overlap, clipped text, illegible contrast, missing states, unsupported font loading, missing assets, raw palette drift, and generic template composition before presenting.
- Do not add isolated blurred-circle background decorations. If a reference suggests that pattern, reinterpret it as a subtle full-bleed ambient field or remove it.

Use this package for:
- general web apps
- websites that need strong craft but not a preset style language
- redesigns that need a clearer system
- multi-screen work where continuity matters

Do not use it when a more explicit visual package was selected.
