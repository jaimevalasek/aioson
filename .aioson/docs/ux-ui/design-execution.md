---
description: "UI/UX design execution — entry check, refine-vs-rebuild routing, design intent, domain exploration, direction selection, and delivery quality rules."
agents: [ux-ui]
modes: [executing]
task_types: [ui-design, ui-spec-writing, refine-spec, visual-direction]
load_tier: trigger
triggers: [default-create, refine-spec, writing ui-spec, rebuild UI, existing UI]
---

# UX/UI Design Execution

Use this module for the default creation flow and for `refine-spec`.

> Throughout this module, `ui-spec.md` is shorthand for the slug-resolved path: `ui-spec-{slug}.md` in feature mode, bare `ui-spec.md` only for project-level work. Resolve `{slug}` per `@ux-ui`'s **Feature slug resolution** (`aioson feature:current .`) before reading or writing it — never write feature UI to the bare path.

## Entry check

Run before Step 1:

1. Does `.aioson/context/ui-spec.md` exist?
2. Does `index.html` exist in the project root? Relevant when `project_type=site`.
3. Do component or layout files exist in `src/`, `components/`, `app/`, or `pages/`?

If none exist, proceed directly to the creation flow.

If any exist, ask:

> "I can see this project already has UI. What would you like to do?
> → **Audit** — I'll review the existing UI, identify issues, and propose specific improvements.
> → **Refine spec** — I'll update `ui-spec.md` without touching the existing implementation.
> → **Rebuild** — I'll create a fresh visual direction from scratch (existing files will be replaced)."

Routing:
- **Audit** → switch to `audit-mode.md`
- **Refine spec** → read `ui-spec.md`, identify gaps or drift, update in place
- **Rebuild** → warn that `index.html` and `ui-spec.md` will be overwritten, then confirm before continuing

## Step 1 — Intent

Answer these three questions before any layout or token work:

1. Who exactly is visiting this?
2. What must they do or feel?
3. What should this feel like?

If you cannot answer all three with specifics, ask. Do not guess.

## Step 2 — Domain exploration

Produce all four before proposing visuals:

1. **Domain concepts** — 5+ metaphors or patterns from this product's world
2. **Color world** — 5+ colors that exist naturally in this domain
3. **Signature element** — one visual thing that could only belong to this product
4. **Defaults to avoid** — 3 generic choices to replace with intentional ones

Identity test: remove the product name. Can someone still identify what this is for?

## Step 3 — Design direction

Choose one direction. Never mix incompatible directions.

### For apps, dashboards, SaaS
- **Precision & Density** — dashboards, admin, dev tools. Borders-only, compact, cool slate.
- **Warmth & Approachability** — consumer apps, onboarding. Shadows, generous spacing, warm tones.
- **Sophistication & Trust** — fintech, enterprise. Cold palette, restrained layers, firm typography.
- **Premium Dark Platform** — premium dark product UI, controlled contrast, restrained layers, catalog cards, and clean navigation.
- **Minimal & Calm** — near-monochrome, whitespace as design element, hairline borders.

### For landing pages and sites
- **Clean & Luminous** — light surfaces, one strong accent, large confident headings, subtle fade-up animation.
- **Bold & Cinematic** — dark hero, full-bleed photography, gradient overlays, scroll reveals.

## Visual continuity

When the work spans more than one screen:
- shared surfaces must stay visually identical across screens
- token values must be consistent for the same purpose
- component variants must be reused, not reinvented
- depth strategy must stay consistent across screens
- when adding a new screen, explicitly note which existing components and tokens are being reused

## Non-site fallback

If `project_type≠site` and the user explicitly proceeds without a registered `design_skill`, use the fallback directions in this module and output:
- `ui-spec.md` with token block
- token ownership
- screen map
- component state matrix
- responsive rules
- handoff notes

## Working rules
- Stack first: use the project's existing design system before proposing custom UI.
- Ask about style only when the ambiguity would materially change the result.
- Define complete design tokens: spacing, typography, semantic colors, radius, and depth strategy.
- Declare token ownership explicitly.
- Commit to one depth strategy per surface type.
- Accessibility first: keyboard flow, visible focus rings, semantic HTML, and 4.5:1 contrast minimum.
- State completeness: default, hover, focus, active, disabled, loading, empty, error, success.
- Mobile-first: small screens defined before desktop enhancements.
- `prefers-reduced-motion` fallback required for any motion.
- Scope proportional to classification: MICRO → root HTML only, SMALL → spec + HTML, MEDIUM → full spec.

## Quality checks
- **Swap test** — would changing the typeface make this look like a different product?
- **Squint test** — does hierarchy survive when blurred?
- **Signature test** — can you name 5 design decisions unique to this product?
- **Wow test** — for landing pages only, would someone screenshot this and share it? If not, revise.

## Self-critique

Before delivering, check:

1. **Composition** — rhythm, intentional proportions, one clear focal point per screen
2. **Craft** — spacing on-grid, typography uses weight + tracking + size, surfaces whisper hierarchy
3. **Content** — real copy, real image URLs, coherent story from hero to final CTA
4. **Structure** — no placeholder text, no arbitrary pixel values, no hacks
