---
name: neo-brutalist-ui
description: >-
  Neo-Brutalist UI is a design system for bold, personality-driven interfaces that embrace raw aesthetics, thick borders, hard shadows, and deliberate visual tension. Use it when `design_skill: neo-brutalist-ui` is set in project.context.md OR when the user explicitly asks for "brutalist", "neo-brutalist", "chunky UI", "indie", "bold borders", "hard shadows", "raw aesthetic", "devtools", "hacker", "playful bold", "anti-corporate", "punk UI", or similar. Ideal for indie products, devtools, creative tools, personal sites, side projects, hackathon projects, educational platforms, and any product where personality and memorability matter more than neutrality. Supports apps, dashboards, and websites — light by default with an energetic dark variant. Do NOT use this skill unless explicitly selected.
---

# Neo-Brutalist UI

Neo-Brutalist UI sits at the intersection of **structural honesty** and **chromatic energy** — a design system for products that refuse to look like every other SaaS app. Thick borders, hard shadows, monospace type, and saturated colors are not decoration: they are the structure.

Inspiration: Gumroad (old redesign), Poolsuite.net, Notion blog sticker aesthetics, bfrss.be, terminal/CLI interfaces.

**This is one visual system.** Never combine it with another design skill.

## Package structure

```text
.aioson/skills/design/neo-brutalist-ui/
  SKILL.md                      ← you are here (load this first)
  references/
    art-direction.md            ← 5 expression modes, signature moves, anti-generic tests
    design-tokens.md            ← CSS variables light + dark, thick borders, hard shadows, patterns
    components.md               ← 23 components: brutalist cards, push buttons, full-grid tables, sticker badges, etc.
    patterns.md                 ← App shell, 6 page patterns, responsive rules
    dashboards.md               ← 5 dashboard presets + chart palette + flat-fill rules
    websites.md                 ← 4 hero patterns, 8 section patterns, anti-patterns
    motion.md                   ← Push mechanic, mechanical timings, minimal scroll animations
```

## Activation rules

- Apply this package **only** when `project.context.md` contains `design_skill: "neo-brutalist-ui"` or the user explicitly chooses it.
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
| Motion / animation | add `references/motion.md` when push mechanics and interaction detail matter |
| Full UI build | all seven reference files |

## Visual signature — three pillars

1. **Structural honesty** - Thick, visible borders. Hard shadows with no blur, only solid offsets. Elements feel built, not drawn. Every component exposes its structure: border, fill, shadow. No gradients, no blur, no transparency. What you see is what exists.
2. **Chromatic energy** - Saturated primary colors as accents. Off-white or pure black backgrounds. Maximum contrast. No pastels (that is glassmorphism), no desaturation (that is clean-saas). Colors are vivid, direct, and confident, like protest posters or zine covers.
3. **Typographic personality** - Mono or bold sans-serif as the baseline. Headings may be ultra-bold or uppercase mono. Typography has attitude: it is not neutral, not elegant, but direct. Large sizes with tight tracking for headings; mono for metadata and labels.

## Theme system

```html
<div data-theme="light">   <!-- or data-theme="dark" -->
```

- **Light (default)**: fundo off-white (#FFFDF5), borders pretas, sombras pretas offset, cores saturadas
- **Dark**: near-black background (#1A1A1A), light borders, colored offset shadows, saturated earthy colors (not neon)
- Toggle available

If the user does not specify: default to **light with a theme toggle** in the top bar.

## Visual DNA

### Colors — light theme (default)
- Background void: `#F5F0E8` (warm off-white, newspaper feel)
- Background base: `#FFFDF5` (cream white — main background)
- Surface: `#FFFFFF` (pure white cards)
- Elevated: `#F5F0E8` (off-white hover/nested)
- Primary accent: `#FACC15` (yellow-400 — THE brutalist accent)
- Text heading: `#1A1A1A` (near-black)
- Text primary: `#2A2A2A`
- Text secondary: `#666666`
- Text muted: `#999999`

### Colors — dark theme
- Background void: `#111111`
- Background base: `#1A1A1A`
- Surface: `#242424`
- Elevated: `#2E2E2E`
- Primary accent: `#FACC15` (yellow stays strong)
- Text heading: `#FFFFFF`
- Text primary: `#E0E0E0`

### Typography
- Display/headings: `Space Grotesk`, system-ui, sans-serif — geometric with personality, not neutral
- Body: `Inter`, system-ui, sans-serif
- Mono: `JetBrains Mono`, ui-monospace — **first-class citizen** in this skill. Used for labels, metadata, badges, status, code, and any technical content.
- Headings: weight 700–800, tracking tight
- Body: weight 400, tracking normal
- Mono metadata: uppercase, letter-spacing 0.05em

### Layout structure (app)
```
┌──────────────────────────────────────────────────────────┐
│  SIDEBAR (240px)       │  TOP BAR (56px)                  │
│  border-right: 3px     │  border-bottom: 3px              │
│  Nav items: mono font  ├──────────────────────────────────┤
│  Active: bg accent     │  CONTENT AREA                    │
│          text black    │  bg-base (cream)                 │
│                        │  (brutalist cards / tables)      │
└────────────────────────┴──────────────────────────────────┘
```

### Signature details
- **The push mechanic**: buttons and cards shrink shadow + translate on `:active` — feels like a physical press
- **Hard shadows**: `4px 4px 0 #1A1A1A` — zero blur. This is the single strongest visual differentiator
- **Thick borders**: 2–3px on everything interactive. No borderless components
- **Square + pill extremes**: `border-radius: 0` (cards, inputs, buttons) OR `border-radius: 9999px` (badges, tags). Nothing in between
- **Mono for all data**: numbers, dates, status text, labels — all `font-mono`
- **Chunky controls**: buttons 44–52px height (vs 36px in clean-saas) — brutalist is chunky, not elegant
- **Full-grid tables**: every cell has a visible border. No minimal table borders

## Application rules

- Treat `references/design-tokens.md` as the source of truth for ALL tokens.
- Treat `references/art-direction.md` as the source of truth for expression modes and anti-generic decisions.
- Never combine this package with `interface-design`, `warm-craft-ui`, `clean-saas-ui`, `bold-editorial-ui`, or any other design skill.
- Reuse the project's component library if one exists — map Neo-Brutalist tokens onto it instead of rebuilding primitives.
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
- "for indie developers"
- "show a dashboard"
- "bold and brutalist"

Good answers:
- "indie hacker checking if their side project is growing — wants raw numbers fast, no corporate fluff"
- "developer reviewing build failures — needs to see status at a glance without context switching"
- "unapologetic, fast, honest — looks hand-built by someone who knows exactly what they're doing"

## Workflow discipline

1. Choose one of the 5 expression modes from `references/art-direction.md` before writing any HTML or CSS.
2. Name one signature move and repeat it intentionally across the page.
3. Run the **Brutality Test**: remove all thick borders and hard shadows. If the interface now looks like a generic clean-saas output, the personality was decorative, not structural. Rebuild.
4. Build from tokens first, then components, then page composition.
5. Validate state parity before finishing: default, hover, active, focus, disabled.
6. Validate contrast: body text WCAG AA, mono on accent must remain legible.

## Non-negotiable quality gates

- Never use `box-shadow` with blur-radius > 0. Hard offset only.
- Never use `border-radius` between 6px and 9998px. Zero or pill only.
- Never use `border: 1px solid #ccc` on interactive components. Minimum 2px solid #1A1A1A (light) or #E0E0E0 (dark).
- Never use gradient fills. All colors are flat and solid.
- Never use `backdrop-filter: blur()`. Brutalist UI has zero blur.
- Mono font must be applied to ALL numbers, dates, IDs, statuses, and technical labels — not just code blocks.
- Every interactive element with a hard shadow must implement the push mechanic on `:active`.
- Tables must never stack into card lists on mobile — they scroll horizontally.
- Hardcoded colors, arbitrary shadows, and one-off border widths are design-system failures.
- Sameness is failure. If the result could pass for a default Tailwind UI starter with a yellow accent, iterate.
- Every page must pass the **Brutality Test**: structure must be brutalist even with all color removed.
- Every page must pass the **Corporate Test**: no enterprise product would ship this (good — that's the goal).

## Positioning vs other skills

| Aspect | neo-brutalist-ui | warm-craft-ui | clean-saas-ui | bold-editorial-ui |
|--------|-----------------|---------------|---------------|-------------------|
| Accent | Yellow (#FACC15) | Terracotta | Blue (#2563EB) | Red-orange |
| Borders | 2–3px black, visible on everything | 1px subtle | 1px gray | 1px minimal |
| Shadows | Hard offset (zero blur) | Warm blur | Very subtle blur | Dramatic blur |
| Radius | 0 or 9999px (nothing between) | Large (16px+) | Medium (8px) | Minimal |
| Typography | Mono + bold sans | Serif headings | All sans | Display sans |
| Polish | Anti-polish (intentional) | Warm polish | Professional | Cinematic |
| Best for | Indie, devtools, hackathon, creative | B2C, productivity | B2B SaaS, admin | Marketing, portfolio |

## Delivery modes

### Greenfield
1. Choose expression mode (indie / devtool / creative / zine / dashboard punk) from `art-direction.md`
2. Answer the three Intent questions
3. Load relevant references
4. Apply token scope from `design-tokens.md`
5. Compose layout from `patterns.md` or `websites.md`
6. Build components from `components.md`
7. Run Brutality Test before presenting

### Brownfield
1. Audit existing UI before rewriting
2. Map Neo-Brutalist tokens onto the existing component library
3. Apply thick borders and hard shadows systematically — don't add them ad-hoc
4. Consolidate duplicate component variants before introducing new ones
5. Prefer targeted upgrades over full rewrites unless the user asks for a redesign
