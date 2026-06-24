---
name: bold-editorial-ui
description: >-
  Bold Editorial UI is a design system for high-impact, typographically-driven interfaces inspired by premium editorial design, fashion magazines, and creative agency portfolios. Use it when `design_skill: bold-editorial-ui` is set in project.context.md OR when the user explicitly asks for "bold", "editorial", "dramatic typography", "magazine style", "Stripe-like", "Vercel-like", "premium marketing", "cinematic", "agency portfolio", or similar. Ideal for landing pages, product marketing, creative portfolios, SaaS marketing sites, and any product where visual impact and storytelling matter more than density. Supports websites, landing pages, and apps — dark by default with a light variant. Do NOT use this skill unless explicitly selected.
---

# Bold Editorial UI

A design system where **typography is the architecture and contrast is the material**. Bold Editorial sits at the intersection of premium magazine design and modern digital craft — interfaces that feel authored, cinematic, and unforgettable.

**This is one visual system.** Never combine it with another design skill.

## Package structure

```text
.aioson/skills/design/bold-editorial-ui/
  SKILL.md                      <- you are here (load this first)
  references/
    art-direction.md            <- intent, expression modes, signature moves, anti-generic tests
    design-tokens.md            <- CSS variables dark + light, typography, token guardrails
    components.md               <- All reusable components (display headings, buttons, cards, inputs, etc.)
    patterns.md                 <- Page layouts: app shell, marketing, documentation, dashboard, auth
    dashboards.md               <- Dashboard presets: marketing, developer, analytics, content, executive
    websites.md                 <- Landing page, product page layouts + hero patterns + anti-patterns
    motion.md                   <- Animations: cinematic entrances, scroll-driven, hover, page transitions
```

## Activation rules

- Apply this package **only** when `project.context.md` contains `design_skill: "bold-editorial-ui"` or the user explicitly chooses it.
- If another design skill is selected, do **not** load this package.
- Never auto-select this skill — always require explicit confirmation.
- If no skill is set yet, the active agent must ask or confirm before applying.

## Responsibility boundary

This skill defines:
- Visual direction and aesthetic DNA
- Design tokens (colors, typography, spacing, radius, shadows)
- Component vocabulary and anatomy
- Page composition patterns
- Theme switching behavior (dark/light)

This skill does **not** decide:
- Stack (React, Vue, Blade, HTML, etc.)
- Output format (single file, multi-file, CSS modules, Tailwind, etc.)
- Icon library choice
- Whether a theme toggle exists in the product (the agent decides)

## Loading guide

Always load only what the current task needs:

| Task | Load |
|---|---|
| Any UI work | `references/design-tokens.md` |
| Reusable components | `references/design-tokens.md` + `references/components.md` |
| Dashboard or admin panel | `references/art-direction.md` + `references/design-tokens.md` + `references/components.md` + `references/patterns.md` + `references/dashboards.md` |
| Detail / settings page | `references/art-direction.md` + `references/design-tokens.md` + `references/components.md` + `references/patterns.md` |
| Landing page or website | `references/art-direction.md` + `references/design-tokens.md` + `references/components.md` + `references/websites.md` |
| Motion / animation | add `references/motion.md` when animation materially improves the result |
| Full UI build | all seven reference files |

## Visual signature — three pillars

1. **Typographic drama** — Typography oversized as the primary design element. Display fonts with personality. Lettering as architecture. Headlines that occupy 40–60% of the viewport. The type IS the visual — not decoration supporting a layout, but the layout itself. Sizes go up to 128px. Tracking tight. Weight bold to black.
2. **Cinematic contrast** — Extreme contrast between light and dark. Sections that alternate between deep near-black and pure white. Color transitions like film cuts. Nothing in the middle — every surface either commits to dark or light. The drama of film stills, not the comfort of day-to-day.
3. **Editorial rhythm** — A grid that breaks intentionally. Asymmetry as principle. Sections with different cadences — dense → breathing → impact → pause. Each scroll should feel like turning the page of a premium magazine. Hierarchy through scale, not color.

## Theme system

```html
<div data-theme="dark">   <!-- or data-theme="light" -->
```

- **Dark (default)**: Landing pages, portfolios, product marketing, premium experiences, SaaS marketing sites
- **Light**: Institutional, documentation, content-heavy editorial, case study pages
- **Both with toggle**: When the product spans both contexts or user preference is required

If the user does not specify: default to **dark with a light variant** available.

## Visual DNA

### Colors — dark theme (default)
- Background void: `#050505` (near-black, not navy)
- Background base: `#0A0A0A` (main background)
- Surface: `#141414` (cards, panels)
- Elevated: `#1E1E1E` (hover, nested, modals)
- Primary accent: `#FF4D2A` (energetic red-orange) — CTAs, highlights, key moments
- Text heading: `#FFFFFF` (pure white — maximum contrast)
- Text primary: `#B8B8B8`
- Text secondary: `#787878`
- Text muted: `#484848`

### Colors — light theme
- Background void: `#F5F5F0` (off-white, slightly warm)
- Background base: `#FAFAF7`
- Surface: `#FFFFFF`
- Elevated: `#EFEFEA`
- Primary accent: `#E03A18` (deeper red-orange for light backgrounds)
- Text heading: `#0A0A0A` (near-black)
- Text primary: `#3A3A3A`
- Text secondary: `#7A7A7A`
- Text muted: `#AAAAAA`

### Typography
- Display headings: `Clash Display`, `Impact` fallback — weight 700, tracking `-0.04em`, line-height `0.9` at large sizes
- Body: `Inter`, `weight-regular (400)`, `line-height: 1.65`
- Metadata/captions: `JetBrains Mono`, `weight-500`, `uppercase`, `tracking-widest`, `font-size: 0.75rem`
- Stats/numbers: `Clash Display`, `weight-bold (700)`, sizes `text-3xl` and up

### Layout structure (marketing sites)
```
+-----------------------------------------------------------+
|  TOP BAR: [Logo]   [Nav — minimal]            [CTA]       |
+-----------------------------------------------------------+
|                                                           |
|  HERO — full-viewport or near-full                        |
|  Headline dominates: 60–80% of hero height               |
|  One CTA, one subtitle max                               |
|                                                           |
+-----------------------------------------------------------+
|  SECTION — alternating rhythm                             |
|  Dense feature → white breathing → impact counter         |
|  → pause with testimonial → dark CTA                      |
|                                                           |
+-----------------------------------------------------------+
|  FOOTER — bg-void, minimal                                |
+-----------------------------------------------------------+
```

### Signature details
- **Minimal radius**: cards `radius-lg` (8px), buttons `radius-md` (6px) — sharp and adult, not bubbly
- **Dramatic shadows**: `0 8px 24px rgba(0,0,0,0.35)` — deep, cinematic drops
- **Accent glow**: `0 0 60px rgba(255, 77, 42, 0.15)` — used only on featured/hero elements
- **Mono captions**: Every category, date, overline, and metadata uses JetBrains Mono + uppercase + wide tracking
- **Display-only font for impact numbers**: stat counters, big headlines, manifesto text
- **White sections as dramatic counterpoint**: light sections inside dark pages feel like spotlight moments

## Application rules

- Treat `references/design-tokens.md` as the source of truth for ALL tokens.
- Treat `references/art-direction.md` as the source of truth for expression, signature moves, and anti-generic decisions.
- Resolve the page variant before composing: marketing/landing pages use narrative editorial pacing; apps use structured dark shell with focused hierarchy.
- Never combine this package with `warm-craft-ui`, `clean-saas-ui`, `glassmorphism-ui`, `neo-brutalist-ui`, or any other design skill in the same task.
- Reuse the project's component library if one exists — map Bold Editorial tokens onto it instead of rebuilding primitives.
- Adapt code examples to the active stack. Reference snippets are design specifications, not copy-paste code.
- Accessibility, responsiveness, and production semantics are the agent's responsibility (not this skill).

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

## Intent before visuals

Before choosing layout, answer all three:

1. Who is the human arriving at this page right now?
2. What is the single impression or action that must land?
3. How should this interface feel — in concrete, visceral words, not generic labels?

Bad answers:
- "for users"
- "show features"
- "bold and modern"

Good answers:
- "developer evaluating a new infrastructure product at 11pm"
- "creative director deciding whether to shortlist an agency"
- "cinematic, authoritative, like a product launch trailer"

## Workflow discipline

1. Audit the current page or existing UI before changing visuals.
2. Explore the product domain and choose one expression mode from `references/art-direction.md`.
3. Name one signature move and repeat it intentionally across the page.
4. Consolidate repeating patterns instead of inventing new card/button variants per screen.
5. Build from tokens first, then components, then page composition.
6. Validate state parity before finishing: default, hover, active, focus, disabled.
7. Validate contrast: white text on dark surfaces must exceed WCAG AA. Light sections must re-verify independently.

## Non-negotiable quality gates

- Never use a generic dark theme — `#0A0A0A` is near-black, intentionally chosen, not "dark mode gray".
- Never use blue, teal, or purple as the primary accent — this is red-orange or nothing.
- Display font is non-negotiable — if Clash Display is unavailable, use Cabinet Grotesk or Syne, not Inter.
- Typography must carry the hierarchy before color does — if the type scale is wrong, no color fix will help.
- The grid must break intentionally at least once per page — a fully regular grid is anti-editorial.
- Mono captions are the connective tissue — overlines, categories, and metadata must use `font-mono`.
- Never add a warm tint, rounded corners above `radius-xl` (16px), or serif fonts — these belong to Warm Craft.
- Accent glow (`shadow-glow`) is reserved for one element per viewport — the hero CTA or the featured card.
- Every section alternation (dark → light → dark) must feel like a deliberate cut, not an accident.
- Sameness is failure. If the result could be a generic dark SaaS landing page, iterate before presenting.
- Every full page must have one typographic statement that could stand alone as a poster.

## Delivery modes

### Greenfield
1. Choose page variant (marketing, app, dashboard, documentation)
2. Load relevant references
3. Apply token scope from `design-tokens.md`
4. Compose layout from `patterns.md` or `websites.md`
5. Build components from `components.md`

### Brownfield
1. Audit existing UI before rewriting
2. Map Bold Editorial tokens onto the existing component library
3. Fix token scope issues (font/color variables must be on the correct container)
4. Consolidate duplicate variants before introducing new ones
5. Prefer targeted upgrades over full rewrites unless the user asks for a redesign
