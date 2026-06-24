---
name: glassmorphism-ui
description: >-
  Glassmorphism UI is a design system for modern, layered interfaces that use frosted glass effects, subtle transparency, and light gradients to create depth and elegance. Use it when `design_skill: glassmorphism-ui` is set in project.context.md OR when the user explicitly asks for "glassmorphism", "glass UI", "frosted glass", "blur cards", "translucent", "Apple-like", "iOS-style", "modern fintech", "floating cards", "layered depth", "aurora gradients", or similar. Ideal for fintech apps, crypto dashboards, modern mobile apps, music/media apps, portfolio sites, and any product where visual sophistication and perceived depth matter. Supports apps, dashboards, and marketing sites — light by default with an elegant dark variant. Do NOT use this skill unless explicitly selected.
---

# Glassmorphism UI

Glassmorphism UI is built around **perceived depth through transparency** — a design system where surfaces appear as frosted glass floating over gradient backgrounds. Unlike flat or shadow-depth systems, the UI structure itself is visible through its layers. The background shows through the cards. The cards show through the modals. Depth is real, not simulated.

Inspiration: Apple.com product pages, iOS Control Center, Linear marketing site, Raycast.com, Revolut/N26 apps.

**This is one visual system.** Never combine it with another design skill.

## Package structure

```text
.aioson/skills/design/glassmorphism-ui/
  SKILL.md                      ← you are here (load this first)
  references/
    art-direction.md            ← intent, 5 expression modes, signature library, anti-generic tests
    design-tokens.md            ← CSS variables light + dark, glass tokens, typography, spacing, radius, shadows
    components.md               ← 22 components (all with glass variant), glass rules, fallbacks
    patterns.md                 ← App shell glass, 6 page patterns, responsive with mobile bottom tab bar
    dashboards.md               ← 5 dashboard presets + chart palette + gradient fill rules
    websites.md                 ← 4 hero patterns, 8 section patterns, glass nav, anti-patterns
    motion.md                   ← Fluid transitions, 5 entrances with blur, glass-specific animations, reduced motion
```

## Activation rules

- Apply this package **only** when `project.context.md` contains `design_skill: "glassmorphism-ui"` or the user explicitly chooses it.
- If another design skill is selected, do **not** load this package.
- Never auto-select this skill — always require explicit confirmation.
- If no skill is set yet, the active agent must ask or confirm before applying.

## Responsibility boundary

This skill defines:
- Visual direction and aesthetic DNA (blur layers, transparency, gradient backgrounds)
- Design tokens (glass surfaces, colors, typography, spacing, radius, shadows)
- Component vocabulary and anatomy (22 glass-variant components)
- Page composition patterns (gradient substrate → glass sidebar → glass cards)
- Theme switching behavior (light default / dark optional)

This skill does **not** decide:
- Stack (React, Vue, Blade, HTML, etc.)
- Output format (single file, multi-file, CSS modules, Tailwind, etc.)
- Icon library choice
- Whether a theme toggle exists in the product (the agent decides)
- Animation library (CSS or JS — motion.md is stack-agnostic)

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

1. **Layered depth** — The interface is built in visible layers: background → substrate → glass cards → elevated elements. Each layer has distinct blur and transparency. Depth does not come from shadows (as in warm-craft) but from real transparency between layers. The user "feels" the layers as stacked glass surfaces.
2. **Luminous subtlety** — Soft gradients, luminous borders (1px rgba white), subtle reflections at the top of cards. No neon, no saturation. Light comes from background gradients and edge reflections — like light hitting real glass. Colors are pastel and desaturated.
3. **Fluid precision** — Generous radius (more than clean-saas, comparable to warm-craft), fluid transitions, micro-interactions with depth shift. The interface feels liquid but controlled — not gelatinous, not elastic. Movements smooth as a slider on glass.

## Theme system

```html
<div data-theme="light">   <!-- or data-theme="dark" -->
```

- **Light (default)**: lavender gradient background, white glass cards with backdrop-blur — bright, elegant, iOS-like
- **Dark**: deep navy background with dark aurora gradients, dark glass cards — premium, immersive, Raycast-like
- Toggle always available by default

If the user does not specify: default to **light with a theme toggle** in the navigation bar.

## Visual DNA

### Foundation rule: gradient substrate is mandatory
Glass only works over a gradient background. Never place glass cards over a solid white or solid black background — the blur has nothing to reveal. The gradient substrate is not decoration; it is functional.

### Colors — light theme (default)
- Background gradient: `linear-gradient(135deg, #F0EEF6 0%, #E0DFF0 30%, #D8E0F0 70%, #EDE8F0 100%)`
- Glass surface: `rgba(255, 255, 255, 0.60)` — TRANSPARENT
- Glass elevated: `rgba(255, 255, 255, 0.80)` — hover, nested
- Primary accent: `#7C3AED` (violet-600)
- Secondary accent: `#3B82F6` (blue-500) — for gradients
- Accent gradient: `linear-gradient(135deg, #7C3AED, #3B82F6)` — violet → blue
- Text heading: `#1A1A2E` (deep navy)
- Text primary: `#2D2D44`
- Text secondary: `#6B6B8A`

### Colors — dark theme
- Background gradient: `linear-gradient(135deg, #141425 0%, #1A1535 30%, #151A30 70%, #1A1425 100%)`
- Glass surface: `rgba(255, 255, 255, 0.08)` — TRANSPARENT
- Primary accent: `#8B5CF6` (violet-500 — brighter for dark bg)
- Secondary accent: `#60A5FA` (blue-400)
- Text heading: `#F0F0FA`
- Text primary: `#C8C8E0`

### Typography
- Headings and body: `Inter`, `-apple-system`, `BlinkMacSystemFont`, `system-ui` — differentiator is the glass effects, not the font family
- Headings: weight 600–700, letter-spacing -0.02em
- Body: weight 400, tracking normal
- System fallback: SF Pro Display/Text (Apple vibe) — use `-apple-system, BlinkMacSystemFont` as first fallback
- Mono: `JetBrains Mono` for code, IDs, metadata only

### Layout structure (app)
```
┌──────────────────────────────────────────────────────────────┐
│          GRADIENT BACKGROUND (substrate)                     │
│  ┌────────────────┐  ┌──────────────────────────────────┐   │
│  │ GLASS SIDEBAR  │  │ GLASS TOP BAR (sticky)           │   │
│  │ 256px          │  ├──────────────────────────────────┤   │
│  │ blur-lg        │  │ CONTENT AREA                     │   │
│  │ border-right   │  │ Glass cards floating over        │   │
│  │ glass-border   │  │ gradient substrate               │   │
│  └────────────────┘  └──────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

### Signature details
- Glass cards: `backdrop-filter: blur(16px)` + `background: rgba(255,255,255,0.60)` + `border: 1px solid rgba(255,255,255,0.40)`
- Top reflection pseudo-element `::before`: `linear-gradient(180deg, rgba(255,255,255,0.25) 0%, transparent 50%)`
- Card hover: opacity increase (0.60 → 0.75) + shadow-sm → shadow-md, 200ms
- Shadows: colored with violet (not black): `0 8px 24px rgba(124, 58, 237, 0.08)`
- Accent gradient on CTAs and stat numbers: `linear-gradient(135deg, #7C3AED, #3B82F6)`
- Active sidebar item: `background: rgba(124,58,237,0.12)` + `border-left: 2px solid var(--accent)`
- Active tab: `border-bottom: 2px solid` accent gradient underline
- Buttons: gradient primary (accent-gradient), glass secondary variant
- Border radius: generous — cards at 16px (radius-xl), hero cards at 24px (radius-3xl)

## Application rules

- Treat `references/design-tokens.md` as the source of truth for ALL tokens.
- Treat `references/art-direction.md` as the source of truth for expression and anti-generic decisions.
- Never combine this package with `interface-design`, `clean-saas-ui`, `warm-craft-ui`, `bold-editorial-ui`, or any other design skill.
- Glass requires a gradient background — if the existing project uses a solid background, update it.
- Reuse the project's component library if one exists — map Glassmorphism tokens onto it instead of rebuilding primitives.
- Always include `@supports (backdrop-filter: blur(1px))` fallbacks: when unsupported, use solid `bg-surface` at 0.95 opacity.
- Limit glass nesting to 3 levels max. Each `backdrop-filter` creates a composite layer.
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
- "show data"
- "modern and elegant"

Good answers:
- "crypto trader scanning their portfolio performance at market open"
- "music listener discovering new artists through their listening history"
- "premium, focused, immersive — the data feels curated, not dumped"

## Workflow discipline

1. Confirm the gradient substrate is in place before building any component.
2. Explore the product domain and choose one expression mode from `references/art-direction.md`.
3. Name one signature glass move and repeat it intentionally across the page.
4. Run the Glass Test: remove backdrop-blur from all cards — if the UI still looks fine, glass is decorative not structural. Fix it.
5. Build from tokens first, then components, then page composition.
6. Validate state parity: default, hover, active, focus, disabled — all using glass token transitions.
7. Validate contrast: glass surfaces must meet WCAG AA. Increase glass-bg opacity if needed.

## Non-negotiable quality gates

- The gradient substrate is non-negotiable. No gradient = no glass system.
- Never use saturated colors above 70% saturation. Glass is luminous, not neon.
- Never nest more than 3 glass layers (performance + visual confusion).
- Never use solid black shadows — always violet-tinted (`rgba(124, 58, 237, ...)`).
- Fallback without `backdrop-filter` must be tested: use `bg-surface` solid with opacity 0.95.
- Every glass card must pass WCAG AA for body text.
- Every page must pass the **Glass Test**: backdrop-blur is structural, not decorative.
- Every page must pass the **Depth Test**: squinting reveals 3+ visible depth layers.
- Every page must pass the **Neon Test**: no color at saturation > 80%. Glass ≠ cyberpunk.
- Sameness is failure. If the result looks like a default Tailwind starter with blur added, iterate.

## Positioning vs other skills

| Aspect | glassmorphism-ui | warm-craft-ui | clean-saas-ui | bold-editorial-ui |
|--------|-----------------|---------------|---------------|-------------------|
| Accent | Violet-blue (#7C3AED) | Terracotta | Blue | Red-orange |
| Depth model | Blur layers | Shadow depth | Border/bg | Light/dark contrast |
| Radius | Large (16px+) | Large (16px+) | Medium (8px) | Minimal (4-6px) |
| Background | Gradient (required) | Warm solid | Neutral solid | Dark solid |
| Borders | Luminous (rgba white) | Subtle solid | Solid gray | Minimal |
| Headings | Sans-serif (Inter/SF) | Serif (Source Serif) | Sans-serif (Inter) | Sans-serif (bold) |
| Best for | Fintech, mobile, media | B2C, productivity | B2B SaaS, admin | Marketing, portfolio |
| Default theme | Light (lavender gradient) | Light (warm) | Light (neutral) | Dark |

## Delivery modes

### Greenfield
1. Choose page variant (dashboard, mobile app, landing, detail, auth, onboarding)
2. Establish gradient background substrate first
3. Load relevant references
4. Apply token scope from `design-tokens.md` (glass tokens are the foundation)
5. Compose layout from `patterns.md` or `websites.md`
6. Build components from `components.md`

### Brownfield
1. Audit existing UI before rewriting
2. Check if a gradient background can be added without breaking existing work
3. Map Glassmorphism tokens onto the existing component library
4. Fix non-glass surfaces first: add backdrop-blur and transparency progressively
5. Consolidate duplicate variants before introducing new ones
6. Prefer targeted upgrades over full rewrites unless the user asks for a redesign
