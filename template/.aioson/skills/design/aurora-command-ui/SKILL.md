---
name: aurora-command-ui
description: >-
  Aurora Command UI is a hybrid design system fusing command-center structure with dark glass surfaces over a mandatory aurora gradient substrate. Use it when `design_skill: aurora-command-ui` is set in project.context.md OR when the user explicitly asks for "aurora command", "dark glass dashboard", "glass command center", "aurora dark UI", "teal violet glass", "dark frosted panels", "aurora infra dashboard", or similar. Ideal for SOC platforms, AI tools, security dashboards, dev platforms, CRM with presence, and any product where operational authority and visual depth must coexist. Dark by default with a light aurora option. Do NOT use this skill unless explicitly selected.
---

# Aurora Command UI

Aurora Command UI lives at the intersection of **military-grade data command center** and **layered glass depth**. It is built from the structural DNA of Cognitive Core (mono rails, dense stat numbers, section zones, command shell) fused with the glass substrate engine of Glassmorphism (backdrop-filter surfaces, aurora gradient, luminous borders, ::before reflections).

The result: a dark glass shell where every panel reveals the aurora gradient underneath, operational data reads with precision, and the interface feels simultaneously tactical and premium.

**This is one visual system.** Never combine it with another design skill.

## Package structure

```text
.aioson/skills/design/aurora-command-ui/
  SKILL.md                      ← you are here (load this first)
  references/
    art-direction.md            ← intent, 5 expression modes, signature library, anti-generic tests
    design-tokens.md            ← CSS variables dark + light, glass tokens, typography, spacing, shadows
    components.md               ← 22+ components (glass variants + command structure)
    patterns.md                 ← Page layouts: aurora app shell, dashboard, detail, settings, auth, list-detail
    dashboards.md               ← 5 dashboard presets + chart palette + glass panel rules
    websites.md                 ← Aurora landing page patterns, hero variants, section patterns
    motion.md                   ← Animations: glass entrances, aurora-aware motion, command transitions
```

## Activation rules

- Apply this package **only** when `project.context.md` contains `design_skill: "aurora-command-ui"` or the user explicitly chooses it.
- If another design skill is selected, do **not** load this package.
- Never auto-select this skill — always require explicit confirmation.
- If no skill is set yet, the active agent must ask or confirm before applying.

## Responsibility boundary

This skill defines:
- Visual direction and aesthetic DNA (dark glass over aurora gradient, command structure)
- Design tokens (glass surfaces, accent fusion, shadows, typography, spacing, radius)
- Component vocabulary and anatomy (22+ components — glass shell + command mono rails)
- Page composition patterns (aurora substrate → glass shell → glass panels → mono section rails → content)
- Theme switching behavior (dark default / light aurora option)

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
| Detail / profile page | `references/art-direction.md` + `references/design-tokens.md` + `references/components.md` + `references/patterns.md` |
| Landing page or website | `references/art-direction.md` + `references/design-tokens.md` + `references/components.md` + `references/websites.md` |
| Motion / animation | add `references/motion.md` when animation materially improves the result |
| Full UI build | all seven reference files |

## Visual signature — three pillars

1. **Aurora depth** — A dark aurora gradient (`linear-gradient(135deg, #060910 0%, #0A0818 30%, #060C1A 70%, #08060F 100%)`) is the mandatory substrate. Dark glass panels (`rgba(10,14,26,0.65)` with `backdrop-filter`) float over it, revealing the aurora below. The gradient is not decoration — it is structurally required. Remove it and the glass has nothing to reveal.
2. **Command authority** — Mono uppercase rails on every section. Dense stat numbers. Compact density that communicates operational mastery. The information structure feels like a mission control panel: labeled zones, one focal block per viewport, restrained accent usage.
3. **Teal-violet fusion** — A single accent gradient `linear-gradient(135deg, #00C8E8, #7C3AED)` used on CTAs, active states, stat numbers, borders, and glow shadows. Teal-electric (`#00C8E8`) is the operational signal. Violet (`#7C3AED`) is the highlight and CTA. They only appear as a gradient pair — never in isolation except for semantic purposes.

## Hybrid DNA

**From cognitive-core-ui (structure side):**
- Command center shell with mono section rails
- Dense stat numbers (text-4xl, tabular-nums)
- Top bar + sidebar + tab navigation structure
- Compact density system for dashboards and admin
- Section headers with mono labels and icon rails
- Sidebar active item: border-left 3px accent + elevated surface

**From glassmorphism-ui (glass side):**
- `backdrop-filter: blur()` on all major surfaces
- Aurora gradient substrate — mandatory, not decorative
- Luminous borders: `rgba(255,255,255,0.10)` on dark glass
- Top reflection `::before` on every glass card
- `@supports (backdrop-filter: blur(1px))` fallback always required
- Glass levels: shell → surface → elevated (3 distinct opacity layers)

**New in aurora-command-ui (hybrid elements):**
- Dark tinted glass: panels use `rgba(10,14,26,0.65)` — NOT white-transparent. The aurora shows through dark glass, not bright glass.
- Accent gradient on stat numbers, not just CTAs
- Teal-electric glow shadows: `0 0 30px rgba(0,200,232,0.12)`
- Aurora glow behind hero metric panels: `radial-gradient(circle at 50% 0%, rgba(0,200,232,0.08), transparent 70%)`

## Theme system

```html
<div data-theme="dark">   <!-- or data-theme="light" -->
```

- **Dark (default)**: All operational products — dashboards, monitoring, security, AI tools, dev platforms. The aurora gradient is deep navy + deep violet. Glass is dark tinted.
- **Light**: Client-facing apps, institutional variants, content-heavy pages. The aurora gradient is soft lavender-gray. Glass is white tinted.

If the user does not specify: default to **dark with a theme toggle** in the top bar.

## Visual DNA — dark theme

### Aurora substrate (mandatory)
```css
background: linear-gradient(135deg, #060910 0%, #0A0818 30%, #060C1A 70%, #08060F 100%);
background-attachment: fixed;
```

### Dark glass surfaces
- Shell (sidebar, top bar): `rgba(8, 12, 22, 0.75)` + `backdrop-filter: blur(24px)`
- Surface cards: `rgba(10, 14, 26, 0.65)` + `backdrop-filter: blur(16px)`
- Elevated (hover, nested): `rgba(14, 20, 36, 0.75)` + `backdrop-filter: blur(16px)`

### Accents
- Teal-electric: `#00C8E8` (operational signals, active states, glow)
- Violet: `#7C3AED` (CTAs, highlights, gradient endpoint)
- Accent gradient: `linear-gradient(135deg, #00C8E8, #7C3AED)`
- Glow shadow: `0 0 30px rgba(0,200,232,0.12), 0 8px 24px rgba(0,0,0,0.40)`

### Typography
- Headings: `Inter`, weight 700, `letter-spacing: 0`
- Body: `Inter`, weight 400, `line-height: 1.6`
- Mono rails: `JetBrains Mono`, weight 600, uppercase, `letter-spacing: 0.12em`, `font-size: 0.675rem`
- Stats: `Inter`, weight 700, `font-size: var(--text-4xl)`, gradient text on hero metric

## Layout structure (aurora app shell)

```
┌─────────────────────────────────────────────────────────────────┐
│            AURORA GRADIENT BACKGROUND (substrate, fixed)        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ GLASS TOP BAR — backdrop-blur-lg, glass-shell            │   │
│  │ [Logo] ─── [Tab Nav Center] ─── [Actions + Toggle]      │   │
│  ├─────────────────┬────────────────────────────────────────┤   │
│  │ GLASS SIDEBAR   │  CONTENT AREA                         │   │
│  │ 200-220px       │  [MONO SECTION HEADER]                │   │
│  │ backdrop-blur   │  [GLASS STAT CARDS — aurora showing]  │   │
│  │ glass-shell     │  [GLASS DATA TABLE]                   │   │
│  │ glass-border    │  [GLASS CHART CONTAINER]              │   │
│  │ aurora visible  │                                       │   │
│  │                 │                                       │   │
│  └─────────────────┴────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Signature details
- Glass cards always have `::before` top reflection: `linear-gradient(180deg, rgba(255,255,255,0.07) 0%, transparent 50%)`
- Teal-electric bottom border on active tabs: `3px solid #00C8E8`
- Sidebar active item: `border-left: 3px solid var(--accent-primary)` + `background: var(--glass-elevated)`
- Mono section headers always precede content zones
- Hero stat card: gradient text on main number (`background: var(--accent-gradient); -webkit-background-clip: text`)
- Every glass container uses `@supports (backdrop-filter: blur(1px))` fallback

## Application rules

- Treat `references/design-tokens.md` as the source of truth for ALL tokens.
- Treat `references/art-direction.md` as the source of truth for expression, signature, and anti-generic decisions.
- The aurora gradient substrate is **non-negotiable** — never place glass panels over a solid background.
- Dark glass opacity must be enough to reveal the aurora. If panels are too opaque, reduce `rgba` alpha toward 0.55.
- Limit glass nesting to 3 levels max. Each `backdrop-filter` is a composite layer.
- Always include `@supports (backdrop-filter: blur(1px))` fallbacks.
- Mono rails are the structural backbone — use them for section headers, stat labels, and metadata rails ONLY. Do not mono-label paragraphs, nav links, or body copy.
- The teal-violet gradient is the single accent family. Do not introduce secondary accent colors.
- Never combine this package with `cognitive-core-ui`, `glassmorphism-ui`, `interface-design`, or any other design skill.
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
- "dark and cool"

Good answers:
- "security analyst identifying active threats during a live incident"
- "AI platform admin comparing agent performance across production workloads"
- "surgical, atmospheric, authoritative — the aurora background communicates depth, the mono rails communicate precision"

## Workflow discipline

1. Confirm the aurora gradient substrate is in place before building any component.
2. Choose one expression mode from `references/art-direction.md`.
3. Name one signature glass+command move and repeat it intentionally across the page.
4. Run the Glass Test: remove `backdrop-filter` from all cards — if the UI looks fine without it, glass is decorative, not structural. Fix: reduce dark glass opacity so the aurora is clearly visible behind panels.
5. Build from tokens first, then components, then page composition.
6. Validate state parity: default, hover, active, focus, disabled — all glass token transitions.
7. Validate contrast: dark glass surfaces must meet WCAG AA. Increase opacity on body text surfaces if needed.

## Non-negotiable quality gates

- The aurora gradient substrate is non-negotiable. No gradient = no glass system.
- Dark glass must reveal the aurora — opacity must stay at or below 0.75. Do not "solidify" panels.
- Never use saturated neon colors. Teal-electric is at the saturation limit — do not push beyond it.
- Never nest more than 3 glass layers (performance + visual confusion).
- Shadows must be tinted with teal-electric, not plain black. `rgba(0,200,232,0.12)` is the glow baseline.
- Fallback without `backdrop-filter` must be tested: use `rgba(8,12,22,0.95)` solid for dark, `rgba(255,255,255,0.95)` for light.
- Every page must pass the **Glass Test**: backdrop-blur is structural, aurora is visible behind panels.
- Every page must pass the **Command Test**: mono rails appear on section headers, stat labels, and metadata only — not overused.
- Every page must pass the **Depth Test**: squinting reveals at least 3 depth layers (substrate → glass panel → content).
- Sameness is failure. If the result looks like a default dark admin with blur added, iterate on composition before finishing.

## Positioning vs parent skills

| Aspect | aurora-command-ui | cognitive-core-ui | glassmorphism-ui |
|--------|------------------|-------------------|-----------------|
| Surfaces | Dark glass (rgba dark tinted) | Solid surfaces (bg-surface) | White glass (rgba light tinted) |
| Background | Aurora gradient (mandatory) | Solid void/base | Lavender aurora gradient |
| Accent | Teal-electric + Violet gradient | Teal/cyan only | Violet-blue |
| Default theme | Dark | Dark | Light |
| Depth model | Blur layers (dark) | Border/shadow depth | Blur layers (light) |
| Mono usage | Section rails + stats | Section rails + stats | None (uses plain sans) |
| Best for | SOC, AI platforms, dev tools | Command centers, SaaS | Fintech, mobile, media |

## Delivery modes

### Greenfield
1. Choose expression mode (Eclipse Command, Deep Analytics, Void Editorial, Quantum Workspace, Crystal Intelligence)
2. Establish aurora gradient background substrate first
3. Load relevant references
4. Apply token scope from `design-tokens.md` (glass tokens are the foundation)
5. Compose layout from `patterns.md` or `websites.md`
6. Build components from `components.md`

### Brownfield
1. Audit existing UI before rewriting
2. Check if the aurora gradient background can be introduced without breaking existing work
3. Map Aurora Command tokens onto the existing component library
4. Add glass surfaces progressively: start with top bar + sidebar, then cards
5. Consolidate duplicate variants before introducing new ones
6. Prefer targeted upgrades over full rewrites unless the user asks for a redesign
