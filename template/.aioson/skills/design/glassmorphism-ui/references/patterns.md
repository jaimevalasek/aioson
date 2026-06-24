# Patterns — Glassmorphism UI

Page composition patterns for apps and dashboards. The substrate always comes first.

---

## The Substrate Rule

Every layout starts with the gradient background applied to the root container (body, html, or `#app`). This is the "glass substrate" — the gradient that makes the glass visible.

```css
body {
  min-height: 100vh;
  background: var(--bg-gradient);
  background-attachment: fixed;   /* gradient stays fixed as content scrolls */
}
```

`background-attachment: fixed` is recommended so the gradient doesn't scroll with the content. Cards will then float over a stable gradient substrate, which looks far more polished.

---

## App Shell

The standard layout for apps, dashboards, and admin panels.

```
┌──────────────────────────────────────────────────────────────────┐
│  GRADIENT BACKGROUND (body, fixed attachment)                    │
│                                                                  │
│  ┌──────────────┐  ┌──────────────────────────────────────────┐ │
│  │ GLASS SIDEBAR│  │ GLASS TOP BAR (sticky, blur-lg)          │ │
│  │ 256px        │  │ Page title / breadcrumb + actions        │ │
│  │ blur-lg      │  ├──────────────────────────────────────────┤ │
│  │ border-right │  │ CONTENT AREA (padding 24px)              │ │
│  │ glass-border │  │                                          │ │
│  │              │  │  Glass cards floating over               │ │
│  │ Logo         │  │  gradient substrate                      │ │
│  │ Nav groups   │  │                                          │ │
│  │ Nav items    │  │                                          │ │
│  │              │  │                                          │ │
│  │ User footer  │  │                                          │ │
│  └──────────────┘  └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

Key decisions:
- Sidebar: `position: fixed`, `backdrop-filter: blur(24px)` — gradient shows through
- Top bar: `position: sticky`, `top: 0`, `backdrop-filter: blur(24px)` — inside content area, not full width
- Content: `margin-left: 256px`, `padding: 24px`, `min-height: 100vh`
- Cards in content: glass cards with `backdrop-filter: blur(16px)` — 2nd glass layer over substrate

---

## Page Patterns

### 1. Dashboard Page

```
Content layout (top to bottom):
  ├─ Page header: title + date range selector + export button
  ├─ Stat cards row: 4 glass stat cards, equal width, 24px gap
  │    Each: metric label + large number (optionally gradient text) + trend badge
  ├─ Primary chart: full-width glass card, area/line chart with gradient fill
  ├─ Secondary row: 2 columns
  │    Left (60%): detailed chart or data table (glass card)
  │    Right (40%): donut/distribution chart or top-N list (glass card)
  └─ Bottom section: glass table with full data
```

Accent moments:
- Hero insight: 1 stat gets gradient text, slightly larger font
- Chart fills: accent gradient (violet → blue), semi-transparent area fills
- Table: glass card container, row hover with glass-bg-hover

### 2. Detail Page

```
Content layout:
  ├─ Glass header card (radius-2xl): avatar/logo + name + status badge + action buttons
  ├─ Tab bar (glass strip): Properties / Activity / Settings / Relations
  └─ Tab content (glass cards per section):
       Properties: 2-column grid of label-value pairs
       Activity: timeline list (glass card, items with glass-border dividers)
       Settings: form groups in glass cards
       Relations: linked records grid (mini glass cards)
```

### 3. List Page

```
Content layout:
  ├─ Glass filter bar (sticky): search input + filter chips + sort dropdown + count badge
  ├─ Glass table card (full width):
  │    Header: sticky, border-bottom glass-border, column labels text-xs uppercase text-muted
  │    Rows: 48px height, hover glass-bg-hover, checkbox left, actions on hover right
  │    Inline actions: appear on row hover (ghost buttons: edit, view, delete)
  └─ Glass pagination bar: page info + prev/next glass buttons + page size selector
```

Scrolling: table scrolls horizontally on mobile (never collapses to cards — see anti-patterns).

### 4. Settings Page

```
Content layout (two-column):
  Left (240px): glass sub-navigation
    ├─ Nav groups: Profile / Security / Notifications / Billing / Integrations
    └─ Glass sidebar style (blur-md, border-right glass-border)
  Right (main): glass form cards per section
    ├─ Section card: glass card with section title + divider + form fields
    ├─ Form fields: labeled inputs, helper text, inline validation
    └─ Save/cancel footer: sticky within card or at page bottom
```

### 5. Auth Page (login / signup / forgot password)

```
Layout: full-viewport gradient background
  Optional: full-bleed ambient gradient wash (absolute positioned, blur-lg, opacity 0.22)

Centered glass card (hero variant):
  max-width: 420px
  border-radius: var(--radius-3xl)
  backdrop-filter: var(--glass-blur-lg)
  padding: var(--space-10)

  Inside:
    Logo: 40px, centered, mb-8
    Title: text-2xl weight-bold text-heading, centered
    Subtitle: text-sm text-secondary, centered, mb-8
    Form: email input + password input + forgot link
    CTA: primary button full-width (accent-gradient)
    Divider: "or continue with"
    Social buttons: glass buttons (Google, GitHub, etc.)
    Footer link: "Don't have an account? Sign up"
```

Ambient placement example: violet wash from the top-right, blue wash from the bottom-left, and a faint pink center highlight. Keep all layers broad enough to read as atmosphere, not shapes.

### 6. Onboarding (multi-step)

```
Layout: full-viewport gradient background

Step progress (glass strip): centered at top
  Step indicators: numbered circles (active: accent-gradient fill, completed: accent border + check, pending: glass-border)
  Connector lines: glass-border, accent-gradient when completed

Centered glass card:
  max-width: 560px, radius-3xl, blur-lg, padding-10
  Inside:
    Step title: text-2xl weight-bold
    Step description: text-sm text-secondary
    Step content: varies (form, selection grid, confirmation)
    Navigation: back (ghost) + next (primary gradient) buttons
    Step count: text-xs text-muted, centered below card

Background gradient shifts subtly between steps (hue rotation 10-15 degrees — very subtle).
```

---

## Responsive

### Breakpoints
- `< 768px`: mobile layout (bottom tab bar, no sidebar)
- `768px – 1024px`: tablet layout (collapsible sidebar or icon-only)
- `> 1024px`: desktop layout (full sidebar)

### Mobile layout
- Sidebar → **glass bottom tab bar** (not hamburger menu)
- Bottom tab bar: `position: fixed`, `bottom: 0`, `left: 0`, `right: 0`, `height: 64px`
  - Glass surface: `background: var(--glass-bg-active)` + `backdrop-filter: var(--glass-blur-lg)`
  - Border top: `1px solid var(--glass-border)`
  - 4-5 icon + label tabs, active with accent color
  - Safe area padding: `padding-bottom: env(safe-area-inset-bottom)` for iOS notch

### Glass adjustments by breakpoint
- Mobile: use `blur-sm` (8px) for cards (performance), `blur-md` (16px) only for bottom sheet
- Tablet: use `blur-md` (16px) for cards
- Desktop: full `blur-md` (16px) for cards, `blur-lg` (24px) for sidebar/nav

### Background gradient on mobile
Simplify to 2-3 color stops (fewer is faster):
```css
@media (max-width: 768px) {
  body {
    background: linear-gradient(135deg, #F0EEF6 0%, #D8E0F0 100%);
  }
}
```

### Content adjustments
- Stat cards: 2 columns on mobile (instead of 4)
- Tables: horizontal scroll (never collapse to card list)
- Sidebar hidden on mobile, accessible via bottom tab bar
- Modal: full-screen on mobile with `border-radius: radius-3xl radius-3xl 0 0` and slides up
