---
name: premium-command-center-ui
description: >-
  Premium Command Center UI is a packaged visual system for tri-rail dashboards, dark operational shells, and premium command-center software. Use it only when `design_skill: premium-command-center-ui` is selected or the user explicitly chooses this package.
---

# Premium Command Center UI

This is a specialized operational design skill.
It is not the default for every dashboard.

## Package structure

```text
.aioson/skills/design/premium-command-center-ui/
  SKILL.md
  references/
    visual-system.md
    patterns.md
    operations.md
    validation.md
```

## Activation rules

- Apply this package only when `design_skill: premium-command-center-ui` is selected.
- Do not load it in parallel with `cognitive-ui`, `interface-design`, or any other design skill.
- Use it when the product genuinely needs a premium operational shell, not merely a dark dashboard.

## Responsibility boundary

This skill defines:
- dark premium operational tone
- tri-rail composition rules
- density discipline
- grouped operational cards and contextual rails
- quality bar for command surfaces

This skill does not decide framework, component library, or delivery format.

## Loading guide

| Task | Load |
|---|---|
| Any visual work | `references/visual-system.md` |
| Dashboard shell and layout | `references/visual-system.md` + `references/patterns.md` |
| Operational page hierarchy | `references/visual-system.md` + `references/patterns.md` + `references/operations.md` |
| Final QA | add `references/validation.md` |

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
- command centers
- control towers
- orchestration software
- activity-heavy internal operating surfaces
- premium dark operational products

Do not use it for:
- landing pages
- editorial or calm consumer products
- simple CRUD screens that should stay neutral
- generic SaaS dashboards without command-center pressure
