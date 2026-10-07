# Components and States — Interface Design

---

## Component quality (mandatory for every component)

Define the reachable states before handing off to @dev; static content owes no artificial loading or disabled state:

| State | What to specify |
|---|---|
| Default | Baseline appearance |
| Hover | Subtle shift (background, border, or opacity) |
| Focus | Visible ring — `outline: 2px solid brand/primary; outline-offset: 2px` |
| Active / pressed | Slight scale or brightness change |
| Disabled | Reduced opacity (0.4–0.5), no cursor pointer, no hover effect |
| Loading | Skeleton or spinner — never block critical flow |

Container components also need:
- **Empty state** — illustration or message + primary action
- **Error state** — clear message + recovery action
- **Success confirmation** — when relevant, transient (not permanent)

---

## Forms

- Labels outside placeholders. Placeholders are hints, not labels.
- Validate on blur (not on keystroke, not on submit only).
- Inline field errors directly below the field. One global summary for multi-field failures.
- Disable the submit button and show progress during async operations.
- Input height minimum: 40px (desktop), 44px (mobile/touch) — **consumer/public-facing forms only.**

**Operational forms:** use the existing density tokens. Compact desktop controls can be appropriate for repetitive work; authentication does not establish input method or accessibility needs. Keep labels readable (never below the 11px telemetry floor), test long values and errors, and increase targets for touch. See `tokens-and-depth.md` for the density decision.

**Entity editing:** choose inline, modal, drawer or dedicated page by field count, need for surrounding context and task duration. A modal is useful for a short bounded task; it is not the default for every entity. Keep focus return, cancel and unsaved-input behavior explicit.

---

## Typography hierarchy

Size alone is never enough. Use weight + tracking + opacity to create layers:

```
Page title    : largest size, 600-weight, tight tracking
Section title : medium-large, 500-weight, normal tracking
Body          : base size, 400-weight, comfortable line-height (1.5–1.6)
Helper / meta : small, 400-weight, muted color
Data / mono   : monospace for numbers in tables, code, metrics
```

---

## Layout and composition

- **Rhythm** — interfaces breathe unevenly: dense tool areas give way to open content. Same card size, same gaps everywhere = flatness = no one decided.
- **Proportions declare intent** — a 280px sidebar says "navigation serves content." A 360px sidebar says "these are peers." Know what your proportions are saying.
- **One focal point per screen** — the primary action dominates through size, position, contrast, or surrounding space. When everything competes equally, nothing wins.
- **Reading order** — 1. Page intent → 2. Primary action → 3. Supporting data. Never invert.

---

## Accessibility baseline (non-negotiable)

- Semantic HTML and proper landmarks (`<main>`, `<nav>`, `<header>`, `<aside>`)
- Full keyboard navigation — Tab order must match visual reading order
- Visible focus rings on all interactive elements
- Color contrast: 4.5:1 for body text, 3:1 for large text and UI components
- Never convey meaning through color alone — add icon, pattern, or text
- `aria-label` on icon-only buttons, `aria-live` on dynamic status regions
- `prefers-reduced-motion` fallback for all animations

---

## Motion rules

- Motion clarifies transitions, it does not decorate them.
- Duration: micro-interactions 100–150ms, page transitions 200–300ms.
- Easing: ease-out for entrances, ease-in for exits.
- Never animate properties that affect layout (width, height, padding). Animate transform and opacity only.
- Always provide `prefers-reduced-motion: reduce` fallback.

---

## Stack-specific notes

| Stack | Priority |
|---|---|
| Laravel + TALL | Flux UI / Livewire primitives first; custom only for signature moves |
| Filament | Built-in Filament components before any override |
| Next.js + shadcn/ui | shadcn primitives + Tailwind tokens; keep component boundaries clean |
| React + Tailwind | Design token CSS vars → Tailwind config → components |
| Vue + Nuxt | Nuxt UI or PrimeVue first; avoid mixing component libraries |
| Vanilla HTML | Define CSS custom properties at `:root`, semantic class names only |
