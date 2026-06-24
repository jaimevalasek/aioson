---
name: pt-squarespace-com
description: >-
  Extracted Squarespace-inspired design system for sharp minimal SaaS websites with black/white contrast, teal accent, Clarkson-style typography, CSS-first motion, local font/video asset guidance, and cloned pt.squarespace.com layout patterns. Use when `design_skill: pt.squarespace.com` or `design_skill: pt-squarespace-com` is selected, or when the user explicitly asks for a Squarespace/PT Squarespace-inspired website rebuild.
---

# Squarespace (pt.squarespace.com) Design System

> Extracted from https://pt.squarespace.com/ on 2026-03-31.
> Deep analysis completed 2026-04-01 via static file extraction (CSS/JS/fonts/media from saved site).
> Visual clone skill — do not use in unrelated projects without adapting the tokens.

## Identity

**Theme:** light (with dark hero/footer sections)
**Personality:** Clean, professional SaaS aesthetic with strong typographic hierarchy, minimal decoration, and bold black-white contrast punctuated by occasional teal accents.

## Design pillars

1. **Sharp minimalism** — Zero border-radius throughout; geometric precision dominates
2. **Bold typographic hierarchy** — Large headlines (Clarkson 300), clear size differentiation
3. **High contrast** — Black and white with teal accent; no gradients, no shadows

## Animation philosophy

**CSS-first, zero third-party libraries.** No GSAP, no Framer Motion, no AOS, no Lottie.
All animations are pure `@keyframes` + class toggling + `IntersectionObserver`.

Signature effects:
- CTA hover: `mix-blend-mode: difference` pseudo-element (not a color transition)
- Mobile menu: `clip-path: polygon()` swipe animation (not `translateX`)
- Link underline: `background-position` animated on two linear-gradients
- Scroll reveals: `IntersectionObserver` adds `.in-view`, CSS handles transition

## Local assets available

These files were extracted from the saved site and are ready to use directly:

**Fonts** (`public/fonts/`):
- `clarkson-300.woff2` — Clarkson Light (hero headlines)
- `clarkson-400.woff2` — Clarkson Regular (body, nav)
- `clarkson-500.woff2` — Clarkson Medium (CTAs, labels)
- `clarkson-serif-300.woff2` — Clarkson Serif Light
- `clarkson-serif-400.woff2` — Clarkson Serif Regular

**Videos** (`public/videos/pt.squarespace.com/`):
- `video-desktop.webm` + `.mp4` — Hero background video (1280×720)
- `video-mobile.webm` + `.mp4` — Hero background video, portrait-optimized
- `templates.webm` + `.mp4` — Template showcase animation
- `blueprint-ai.webm` + `.mp4` — AI blueprint feature demo
- `design-intelligence-3.mp4` — Design intelligence card video
- `conversion-centered.mp4` — Final CTA section video

> Reference files — replace with your own assets before publishing.

## When to use

Activate when building projects that need a professional, clean SaaS website aesthetic inspired by Squarespace's homepage — minimal, typography-forward, with dark hero sections and teal accents.

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

## Activation

Load `references/design-tokens.md` before writing any component.
Load `references/motion.md` before implementing any animation or interaction.
Load `references/components.md` to get the real class naming conventions and hover mechanics.

## Skill files

- `references/design-tokens.md` — CSS custom properties (colors, typography, spacing, real easing curves)
- `references/components.md` — Component patterns, real class names, CTA hover mechanics
- `references/patterns.md` — Page layout patterns with real section IDs
- `references/motion.md` — All 12 extracted @keyframes, exact timings, animation usage map
- `references/websites.md` — Complete page topology including all 11 sections
