---
name: clean-saas-ui
description: >-
  Clean SaaS UI is a design system for professional, neutral B2B interfaces that prioritize clarity, consistency, and efficiency. Use it when `design_skill: clean-saas-ui` is set in project.context.md OR when the user explicitly asks for "clean SaaS", "professional dashboard", "business app", "admin panel", "neutral UI", "no-frills", "enterprise", "CRM", "ERP", "internal tool", or similar. Ideal for B2B SaaS products, admin panels, CRM systems, project management tools, internal enterprise apps, and any product where reliability and efficiency matter more than visual flair. Supports apps, dashboards, and marketing sites — light by default with a polished dark variant. Do NOT use this skill unless explicitly selected.
---

# Clean SaaS UI

Clean SaaS UI sits at the intersection of **professional neutrality** and **systematic precision** — a design system optimized for the humans who live inside B2B software for 8 hours a day. No personality for personality's sake. No decoration that costs attention. Just excellent, reliable, efficient UI.

Inspiration: Stripe Dashboard, Linear app, GitHub, Notion (app), Figma (panels).

**This is one visual system.** Never combine it with another design skill.

## Package structure

```text
.aioson/skills/design/clean-saas-ui/
  SKILL.md                      ← you are here (load this first)
  references/
    art-direction.md            ← intent, expression modes, signature moves, anti-generic tests
    design-tokens.md            ← CSS variables light + dark, typography, spacing, radius, shadows
    components.md               ← All reusable components (table, filter bar, sidebar, form groups, etc.)
    patterns.md                 ← Page layouts: app shell, list, detail, form, dashboard, settings, onboarding
    dashboards.md               ← Dashboard presets: SaaS metrics, CRM, PM, support, admin overview
    websites.md                 ← Landing/marketing page patterns + anti-patterns
    motion.md                   ← Animations: fast functional transitions, micro-interactions, reduced motion
```

## Activation rules

- Apply this package **only** when `project.context.md` contains `design_skill: "clean-saas-ui"` or the user explicitly chooses it.
- If another design skill is selected, do **not** load this package.
- Never auto-select this skill — always require explicit confirmation.
- If no skill is set yet, the active agent must ask or confirm before applying.

## Responsibility boundary

This skill defines:
- Visual direction and aesthetic DNA
- Design tokens (colors, typography, spacing, radius, shadows)
- Component vocabulary and anatomy
- Page composition patterns
- Theme switching behavior (light default / dark optional)

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

1. **Professional neutrality** - Neutral colors with one accent blue (not teal, not terracotta - a classic trust-building blue). Zero excessive personality. The design is invisible: users focus on the work, not the UI. It feels like it has always been there.
2. **Systematic consistency** - Every component follows a strict grid. Base spacing is 8px. Control heights are fixed. No ad hoc components. Everything comes from the system. The result should feel like a high-quality commercial kit (Stripe Dashboard, Linear app).
3. **Data-friendly density** - Medium density: more compact than warm-craft, less dense than cognitive-core. Tables, forms, and lists are first-class citizens. The system is optimized to show data cleanly and make scanning fast.

## Theme system

```html
<div data-theme="light">   <!-- or data-theme="dark" -->
```

- **Light (default)**: apps, dashboards, admin — a maioria dos SaaS B2B
- **Dark**: optional, for user preference or low-light environments
- Toggle always available by default

If the user does not specify: default to **light with a theme toggle** in the top bar.

## Visual DNA

### Colors — light theme (default)
- Background void: `#F3F4F6` (gray-100)
- Background base: `#F9FAFB` (gray-50)
- Surface: `#FFFFFF`
- Elevated: `#F3F4F6` (gray-100 — hover, nested)
- Primary accent: `#2563EB` (blue-600 — professional blue)
- Text heading: `#111827` (gray-900)
- Text primary: `#374151` (gray-700)
- Text secondary: `#6B7280` (gray-500)
- Text muted: `#9CA3AF` (gray-400)

### Colors — dark theme
- Background void: `#111827` (gray-900)
- Background base: `#1F2937` (gray-800)
- Surface: `#374151` (gray-700)
- Elevated: `#4B5563` (gray-600)
- Primary accent: `#3B82F6` (blue-500 — brighter for dark bg)
- Text heading: `#F9FAFB`
- Text primary: `#E5E7EB`

### Typography
- Headings and body: `Inter`, system-ui, sans-serif — both. Differentiator is weight and tracking, not family.
- Headings: weight 600–700, letter-spacing -0.02em
- Body: weight 400, tracking normal
- Mono (metadata only): `JetBrains Mono`, uppercase, 0.675rem — used sparingly in code, IDs, table row metadata

### Layout structure (app)
```
┌──────────────────────────────────────────────────────────┐
│  SIDEBAR (256px)  │  PAGE HEADER: title + actions         │
│  Logo             ├──────────────────────────────────────┤
│  Nav groups       │  FILTER BAR (when list/table page)   │
│  Active: blue     ├──────────────────────────────────────┤
│  left border 2px  │  CONTENT AREA                        │
│                   │  (table / form sections / charts)    │
│  Footer: user     │                                      │
└───────────────────┴──────────────────────────────────────┘
```

### Signature details
- Active sidebar item: `border-left: 2px solid var(--accent)` + `bg-elevated`
- Active tab: `border-bottom: 2px solid var(--accent)` + accent text
- Inputs: 36px height (control-md), 1px border, 6px radius
- Card hover: shadow-sm → shadow-md, 150ms, no translateY lift
- Separator: borders over shadows — clean and flat
- Buttons: flat, no gradients, consistent 36px height
- Badges: radius-full, height 20px, px-2, 6 semantic variants
- Tables: alternating row bg optional, sticky header, inline actions on hover

## Application rules

- Treat `references/design-tokens.md` as the source of truth for ALL tokens.
- Treat `references/art-direction.md` as the source of truth for expression and anti-generic decisions.
- Never combine this package with `interface-design`, `cognitive-core-ui`, `warm-craft-ui`, `bold-editorial-ui`, or any other design skill.
- Reuse the project's component library if one exists — map Clean SaaS tokens onto it instead of rebuilding primitives.
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
- "manage data"
- "clean and modern"

Good answers:
- "operations manager reviewing team workload before assigning a new batch"
- "account exec scanning their CRM pipeline for deals at risk"
- "calm, efficient, trustworthy, invisible — the tool gets out of their way"

## Workflow discipline

1. Audit the current page or existing UI before changing visuals.
2. Explore the product domain and choose one expression mode from `references/art-direction.md`.
3. Name one signature move and repeat it intentionally across the page.
4. Consolidate repeating patterns instead of inventing new card/button/table variants for each screen.
5. Build from tokens first, then components, then page composition.
6. Validate state parity before finishing: default, hover, active, focus, disabled.
7. Validate contrast before shipping: body text must meet WCAG AA, controls must stay legible in all themes.

## Non-negotiable quality gates

- Never use a lighter hover state if it reduces text contrast.
- Never put near-white text on a bright accent in light theme. Use a darker accent or a darker foreground token.
- Do not use mono for navigation groups, paragraphs, or long button copy.
- Keep one spacing rhythm per surface: 8px increments, aligned text edges, consistent control heights.
- When a layout feels chaotic, reduce variant count first. Do not add decorative layers.
- Hardcoded colors, arbitrary shadows, and one-off font choices are design-system failures.
- Sameness is failure. If the result looks like a default Tailwind UI starter, iterate before presenting.
- Every page must pass the Blue Test: does the accent blue feel "chosen" or "default"?
- Every full page must pass the Template Test: if you remove the logo and change the accent, does it still look like your product?
- Tables must never stack into card lists on mobile — they scroll horizontally.

## Positioning vs other skills

| Aspect | clean-saas-ui | warm-craft-ui | cognitive-core-ui |
|--------|--------------|---------------|-------------------|
| Accent | Blue (#2563EB) | Terracotta | Teal/Cyan |
| Headings | Sans-serif (Inter) | Serif (Source Serif) | Sans-serif (Inter) |
| Radius | Medium (8px cards) | Large (16px+ cards) | Small-Medium |
| Density | Medium | Low | High |
| Personality | Neutral/professional | Warm/human | Premium/tactical |
| Default theme | Light | Light | Dark |
| Best for | B2B SaaS, admin, CRM | B2C, productivity, health | Command centers, ops |

## Delivery modes

### Greenfield
1. Choose page variant (list, detail, form, dashboard, settings, onboarding, landing)
2. Load relevant references
3. Apply token scope from `design-tokens.md`
4. Compose layout from `patterns.md` or `websites.md`
5. Build components from `components.md`

### Brownfield
1. Audit existing UI before rewriting
2. Map Clean SaaS tokens onto the existing component library
3. Fix token scope issues (font/color variables must be on the correct container)
4. Consolidate duplicate variants before introducing new ones
5. Prefer targeted upgrades over full rewrites unless the user asks for a redesign
