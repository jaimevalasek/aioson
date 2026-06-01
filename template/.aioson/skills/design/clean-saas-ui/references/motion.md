# Motion — Clean SaaS UI

## Principle: functional, not decorative

Animation in Clean SaaS exists for **feedback and orientation**, not for impression.

Every animation must answer: does this help the user understand what happened, or where they are? If not, remove it.

- Keep everything fast: 150-250ms max for interactions, 300ms for page transitions
- Easing: `ease-out` for entrances, `ease-in` for exits
- **ZERO scroll animations on app pages** - only on marketing pages, and with restraint
- If the animation feels fast to the developer, it is probably the right speed for the user

---

## Timing tokens

```css
:root {
  --transition-fast:  100ms ease;
  --transition-base:  150ms ease;
  --transition-slow:  250ms ease;
}
```

These are the only durations used in app pages. Never use values outside this range for UI interactions.

For page-level transitions (route change, modal open): max `300ms`.

---

## Entrances

### Fade In
- `opacity: 0 → 1`
- Duration: `200ms ease-out`
- Use for: any element appearing without positional change — tooltips, inline state changes

```css
@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
```

### Fade Up
- `translateY(8px) → translateY(0)` + `opacity: 0 → 1`
- Duration: `250ms ease-out`
- Use for: cards appearing, dashboard sections loading, notifications
- **8px displacement only** — smaller than warm-craft (12px) and cognitive-core (10px). Clean SaaS moves less.

```css
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

### Scale In
- `scale(0.97) → scale(1)` + `opacity: 0 → 1`
- Duration: `200ms ease-out`
- Use for: modals, dropdowns, popovers, context menus
- **0.97 scale** — barely perceptible, just enough for spatial cue. Not 0.95 (too dramatic).

```css
@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.97); }
  to   { opacity: 1; transform: scale(1); }
}
```

---

## Micro-interactions

### Buttons
- **Hover**: background color shift, `100ms ease`
- **Press**: `scale(0.99)`, `60ms ease-in` — nearly imperceptible, just tactile
- **Loading**: spinner replaces leading icon, text unchanged, cursor: `not-allowed` during load
- **Success**: brief `checkmark` icon flash, `300ms`, then returns to default state

### Cards
- **Hover**: `box-shadow: var(--shadow-sm) → var(--shadow-md)`, `150ms ease`
- **NO translateY lift** — Clean SaaS cards do not "float up" on hover (unlike warm-craft). Cards stay grounded.

### Inputs
- **Focus**: `border-color → var(--accent)`, ring appears `ring-2 ring-accent/20`, `100ms ease`
- **Error**: border goes `border-semantic-danger`, shakes if invalid on submit (see below)
- **Validation success**: brief green border flash before returning to default

### Input shake (validation error)
```css
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%       { transform: translateX(-4px); }
  40%       { transform: translateX(4px); }
  60%       { transform: translateX(-3px); }
  80%       { transform: translateX(3px); }
}
/* Duration: 320ms — fast, firm, not cartoonish */
```

### Dropdowns
- Open: `scaleIn` + `fadeIn`, `150ms ease-out`, origin at trigger
- Close: `opacity: 1 → 0`, `100ms ease-in` — faster out than in

### Toggle switch
- Thumb: `translateX` from off to on position, `150ms ease`
- Background: color transition `bg-border-strong → bg-accent`, `150ms ease`

### Sidebar collapse (mobile)
- `translateX(-256px) → translateX(0)`, `250ms ease-out`
- Backdrop: `opacity: 0 → 0.4`, `200ms ease`

---

## Stagger

When multiple items appear together (card grid, list load, table rows):

- Delay per item: `40ms` — faster than warm-craft (60ms) to match efficiency feel
- Max staggered items: **4** — after 4, all remaining items appear simultaneously
- Base delay: `0ms` (first item appears immediately)

```
Item 1: 0ms delay
Item 2: 40ms delay
Item 3: 80ms delay
Item 4: 120ms delay
Item 5+: 120ms delay (same as item 4 — no more stagger)
```

---

## Page transitions

### Route change
- Old page: `opacity: 1 → 0`, `150ms ease-in`
- New page: `opacity: 0 → 1`, `200ms ease-out`
- Optionally: `translateY(4px) → 0` on new page entry

### Tab switch
- Content: `fadeIn` `200ms ease-out` — do NOT slide tabs horizontally (it's disorienting in data-dense apps)

### Modal open
- Backdrop: `opacity: 0 → 0.4`, `200ms ease`
- Modal: `scaleIn` `200ms ease-out`

### Modal close
- Modal: `scale(1) → scale(0.97)` + `opacity: 1 → 0`, `150ms ease-in`
- Backdrop: `opacity: 0.4 → 0`, `150ms ease`

### Toast
- Enter: `translateX(calc(100% + 16px)) → translateX(0)`, `250ms ease-out` (slides in from right)
- Auto-dismiss: after 5s, `opacity: 1 → 0` over `300ms`
- Manual dismiss: `opacity: 1 → 0` + `scale(0.96)`, `150ms ease-in`

---

## Loading states

### Skeleton pulse
```css
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.5; }
}
/* Duration: 1.5s — slower than a button transition, rhythmic */
```

### Spinner
```css
@keyframes spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
/* Duration: 800ms linear infinite — smooth, not jerky */
```

### Progress bar (indeterminate)
```css
@keyframes indeterminate {
  0%   { left: -35%; right: 100%; }
  60%  { left: 100%; right: -90%; }
  100% { left: 100%; right: -90%; }
}
/* Use only for operations with unknown duration (file upload, long request) */
```

---

## Scroll animations (marketing pages only)

**Zero scroll animations on app pages.** Users in admin panels, dashboards, and forms should never have elements jumping in as they scroll — it breaks focus on data.

On **marketing pages** only:
- `fadeUp` on section entry: `250ms ease-out`, trigger at `20% from bottom`
- Stagger feature cards on scroll: `60ms` delay per card (slightly more generous than app stagger)
- Hero screenshot: `fadeIn` with slight `scale(1.02) → scale(1)` for depth, `400ms ease-out`

---

## Reduced motion

**Required.** All motion must respect `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

When reduced motion is active:
- Transitions still happen but are near-instant
- State changes (hover, focus, active) remain functional — they just don't animate
- Spinners and skeletons still render correctly

---

## Motion anti-patterns

1. `transition: all` — always specify exact properties (`background-color`, `box-shadow`, etc.)
2. Duration > 300ms for any interactive element in the app
3. Bounce or spring easing — not this skill; that is warm-craft
4. Hover that moves the element in XY space (lift, slide) — cards stay grounded in Clean SaaS
5. Staggering more than 4 items
6. Scroll animations on any app page (list, dashboard, form, settings)
7. Animation on focus — focus rings appear instantly, no animation
