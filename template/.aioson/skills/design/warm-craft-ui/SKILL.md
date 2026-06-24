---
name: warm-craft-ui
description: >-
  Warm Craft UI is a design system for approachable, human-centered interfaces with light backgrounds, rounded forms, warm accents, generous whitespace, and humanist typography. Use it when `design_skill: warm-craft-ui` is set in project.context.md OR when the user explicitly asks for "warm", "friendly UI", "clean light", "soft modern", "human-centered", "Notion-like", "Linear-like", "calm interface", or similar. Ideal for productivity apps, SaaS B2C, health, education, personal finance, and any product where trust, clarity, and approachability matter more than density or authority. Supports apps, dashboards, landing pages, and websites — light by default with an optional dark theme. Do NOT use this skill unless explicitly selected.
---

# Warm Craft UI

A design system where **clarity is generosity and whitespace is confidence**. Warm Craft sits at the intersection of humanist typography and disciplined spacing — interfaces that feel handcrafted, breathable, and immediately trustworthy.

**This is one visual system.** Never combine it with another design skill.

## Package structure

```text
.aioson/skills/design/warm-craft-ui/
  SKILL.md                      <- you are here (load this first)
  references/
    art-direction.md            <- intent, domain exploration, expression modes, signature moves, anti-generic tests
    design-tokens.md            <- CSS variables light + dark, typography, token scope guardrails
    components.md               <- All reusable components (nav, cards, forms, tables, badges, modals, etc.)
    patterns.md                 <- Page layouts: app shell, detail, settings, onboarding, list-detail
    dashboards.md               <- Dashboard presets: overview, analytics, activity feed, project board, admin
    websites.md                 <- Landing page, product page, institutional layouts + anti-patterns
    motion.md                   <- Animations: entrances, micro-interactions, scroll, loading states
```

## Activation rules

- Apply this package **only** when `project.context.md` contains `design_skill: "warm-craft-ui"` or the user explicitly chooses it.
- If another design skill is selected, do **not** load this package.
- Never auto-select this skill — always require explicit confirmation.
- If no skill is set yet, the active agent must ask or confirm before applying.

## Responsibility boundary

This skill defines:
- Visual direction and aesthetic DNA
- Design tokens (colors, typography, spacing, radius, shadows)
- Component vocabulary and anatomy
- Page composition patterns
- Theme switching behavior (light/dark)

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

1. **Approachable warmth** — Light surfaces with subtle warm undertones. Rounded corners on everything. Colors that feel like sunlight through linen, not clinical LED panels. The interface should feel like a well-designed physical notebook, not a control room.
2. **Typographic humanity** — Humanist sans-serif with visible character. Generous line-heights. Text that breathes. Headings that feel handwritten in their weight and tracking, even though they are perfectly set. Body text that is genuinely pleasant to read for long sessions.
3. **Disciplined calm** — Generous whitespace that signals confidence, not emptiness. One accent color used sparingly. Subtle depth through soft shadows, not hard borders. Every element has room to exist without competing for attention.

## Theme system

```html
<div data-theme="light">   <!-- or data-theme="dark" -->
```

- **Light (default)**: Productivity apps, content platforms, B2C SaaS, health, education, personal tools, most use cases
- **Dark**: Optional — for users who prefer it, night modes, media-heavy contexts
- **Both with toggle**: When the user asks, or when the product serves diverse contexts

If the user does not specify: default to **light with a theme toggle** available.

## Visual DNA

### Colors — light theme
- Background void: `#F8F6F3` (warm off-white, never pure #FFF)
- Background base: `#FDFCFA` (main app background)
- Surface: `#FFFFFF` (cards, elevated panels)
- Elevated: `#F3F1ED` (hover, nested, sidebar backgrounds)
- Primary accent: `#E07A5F` (terracotta/warm coral) — CTAs, active states, key highlights
- Text heading: `#2D3436` (warm charcoal, never pure black)
- Text primary: `#4A5568` (readable warm gray)
- Text secondary: `#8896A6` (muted)
- Text muted: `#B0BCC7` (hints, placeholders)

### Colors — dark theme
- Background void: `#1A1814` (warm dark, not navy)
- Background base: `#211F1B` (main app background)
- Surface: `#2A2824` (cards)
- Elevated: `#353330` (hover, nested)
- Primary accent: `#F0967D` (lighter terracotta for dark backgrounds)
- Text heading: `#F5F0EB`
- Text primary: `#D4CBC2`
- Text secondary: `#9A9088`
- Text muted: `#6B6460`

### Typography
- Headings: `Source Serif 4`, `weight-semibold (600)` or `weight-bold (700)` for page titles, `letter-spacing: 0`
- Body: `Inter`, `weight-normal (400)`, `line-height: 1.7`
- Labels and metadata: `Inter`, `weight-medium (500)`, `font-size: 0.8rem`, `letter-spacing: 0.02em`
- Stats: `Source Serif 4`, `weight-bold (700)`, `font-size: 2.5rem`

### Layout structure (apps)
```
+----------------------------------------------------------+
|  TOP BAR: [Logo] [Search (center, rounded)]  [Avatar]    |
+----------------------------------------------------------+
|           |                                               |
|  SIDEBAR  |  CONTENT                                      |
|  200px    |  PAGE HEADER (serif title + subtitle)         |
|  soft bg  |                                               |
|  rounded  |  CONTENT SECTIONS                             |
|  items    |  (generous padding, card groups)              |
|           |                                               |
|  [nav     |  SECTION: title + description                 |
|   items   |  CARD GROUP (2-3 col, gap-6)                 |
|   with    |                                               |
|   icons]  |  SECTION: title + description                 |
|           |  CARD GROUP or TABLE                          |
+-----------+-----------------------------------------------+
```

### Signature details
- Rounded corners on everything: cards `radius-xl` (16px), buttons `radius-lg` (12px), inputs `radius-md` (8px)
- Soft shadows: `box-shadow` with warm tones, never harsh black drops
- Accent used sparingly: primary buttons, active nav, key badges — never borders, never backgrounds of sections
- Serif headings mixed with sans-serif body — the primary differentiator from every other UI
- Subtle background patterns: very faint dot grid or warm gradient wash on hero sections
- Illustrations and empty states: warm, hand-drawn style — never cold geometric
- Input fields: visible but soft borders, generous padding, rounded
- Active sidebar item: `background: var(--bg-elevated)` + `border-radius: var(--radius-lg)` + accent text — no hard left border
- Theme transition: `200ms ease` on background, color, border-color, box-shadow

## Application rules

- Treat `references/design-tokens.md` as the source of truth for ALL tokens.
- Treat `references/art-direction.md` as the source of truth for expression, signature moves, and anti-generic decisions.
- Resolve the page variant before composing: apps use structured navigation rhythm; websites/landing pages use more narrative flow, larger typography, and editorial pacing.
- Never combine this package with `cognitive-core-ui`, `interface-design`, `premium-command-center-ui`, or any other design skill in the same task.
- Reuse the project's component library if one exists — map Warm Craft tokens onto it instead of rebuilding primitives.
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

1. Who is the human using this page right now?
2. What is the main action or decision they must complete?
3. How should this interface feel in concrete words, not generic labels?

Bad answers:
- "for users"
- "manage content"
- "clean and modern"

Good answers:
- "freelancer reviewing today's tasks over morning coffee"
- "parent checking their child's learning progress after dinner"
- "calm, warm, spacious, like a well-organized desk with natural light"

## Workflow discipline

1. Audit the current page or existing UI before changing visuals.
2. Explore the product domain and choose one expression mode from `references/art-direction.md`.
3. Name one signature move and repeat it intentionally across the page.
4. Consolidate repeating patterns instead of inventing new card/button/table variants for each screen.
5. Build from tokens first, then components, then page composition.
6. Validate state parity before finishing: default, hover, active, focus, disabled.
7. Validate contrast before shipping: body text must meet WCAG AA, controls must stay legible in all themes and states.

## Non-negotiable quality gates

- Never use pure white (#FFFFFF) as the app background — always use warm off-whites.
- Never use pure black (#000000) for text — always warm charcoals.
- Never crowd elements — when in doubt, add more whitespace, not more content.
- Serif headings are the signature — never replace them with sans-serif across the board.
- Accent must feel warm, never clinical or cold (no blues, no purples as primary).
- Rounded corners are structural, not decorative — everything is rounded, consistently.
- Soft shadows must use warm-tinted RGBA, not generic `rgba(0,0,0,...)`.
- Forms must feel inviting: generous padding, visible labels above fields, helpful placeholders — never cramped.
- Hardcoded colors, arbitrary sharp corners, and one-off font choices are design-system failures.
- Sameness is failure. If the result could be mistaken for a default Notion clone or a generic SaaS template, iterate before presenting.
- Every full page must have one memorable structural or visual signature, not just "good spacing and cards".
- Do not reuse the same hero, card layout, or dashboard grid across unrelated products without a domain reason.

## Delivery modes

### Greenfield
1. Choose page variant (app, detail, settings, landing, institutional)
2. Load relevant references
3. Apply token scope from `design-tokens.md`
4. Compose layout from `patterns.md` or `websites.md`
5. Build components from `components.md`

### Brownfield
1. Audit existing UI before rewriting
2. Map Warm Craft tokens onto the existing component library
3. Fix token scope issues (font/color variables must be on the correct container)
4. Consolidate duplicate variants before introducing new ones
5. Prefer targeted upgrades over full rewrites unless the user asks for a redesign
