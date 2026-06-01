---
name: design-patterns
description: Page-level layout patterns for the Cognitive Core design system — dashboard shell, settings page, auth page, list-detail, command center, landing page, frontpage, and institutional page layouts. Load foundations and components first. Use when you need to compose a full page or screen layout.
---

# Patterns — Page-Level Layouts

Requires: `foundations/SKILL.md` + `components/SKILL.md` loaded first.

These patterns define how to compose components into full page layouts. Each pattern includes a structure diagram, which components to use, and spacing rules.

## 1. Dashboard Shell

The base layout for any admin/dashboard interface.

```
┌────────────────────────────────────────────────────────┐
│  TOP BAR (sticky, bg-void, z-sticky)                   │
├────────────────────────────────────────────────────────┤
│  STATS ROW: [StatCard] [StatCard] [StatCard] [StatCard]│
├────────────────────────────────────────────────────────┤
│  TAB BAR (border-bottom)                               │
├───────────┬────────────────────────────────────────────┤
│ SIDEBAR   │  CONTENT                                   │
│ 200-220px │  ┌─ Section Header ──────────────────┐    │
│           │  │ Grid: [Card] [Card] [Card] [Card] │    │
│           │  └───────────────────────────────────┘    │
│           │  ┌─ Section Header ──────────────────┐    │
│           │  │ Grid: [Card] [Card] [Card]        │    │
│           │  └───────────────────────────────────┘    │
└───────────┴────────────────────────────────────────────┘
```

**CSS skeleton:**
```css
.shell { min-height: 100vh; background: var(--bg-base); }
.stats-row { display: flex; gap: var(--space-3); padding: var(--space-5) var(--space-5) 0; flex-wrap: wrap; }
.main-layout { display: flex; min-height: calc(100vh - 230px); }
.sidebar { width: 200px; flex-shrink: 0; border-right: 1px solid var(--border-subtle); padding: var(--space-4); }
.content { flex: 1; padding: var(--space-4) var(--space-5); overflow-y: auto; }
.card-grid { display: grid; gap: var(--space-4); grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
```

**Variant — with feature panels:**
Below stats and above card grid, add a two-column row: `grid-template-columns: 1fr 280px`. Left = DNA Panel. Right = Mode Panel.

## 2. Detail Page (Entity Profile)

For viewing a single entity (product, user, project, contact).

```
┌────────────────────────────────────────────────────────┐
│  TOP BAR                                               │
├────────────────────────────────────────────────────────┤
│  Breadcrumbs: Gallery → Entity Name                    │
│  PROFILE HEADER (avatar, name, badges, stat cards)     │
├────────────────────────────────────────────────────────┤
│  TAB BAR (General | DNA | Communication | History)      │
├───────────┬────────────────────────────────────────────┤
│ SIDEBAR   │  TAB CONTENT                               │
│           │  (varies per tab — DNA panel, card grid,   │
│           │   table, etc.)                             │
└───────────┴────────────────────────────────────────────┘
```

**Breadcrumbs:** `font-size: var(--text-sm)`, `color: var(--text-muted)`, active item in `--text-primary`.

## 3. Settings Page

```
┌────────────────────────────────────────────────────────┐
│  TOP BAR                                               │
├───────────┬────────────────────────────────────────────┤
│ SIDEBAR   │  SETTINGS TITLE                            │
│           │  ┌─ Card ─────────────────────────────┐   │
│ General   │  │ SECTION LABEL                       │   │
│ Security  │  │ [Label] [Input]                     │   │
│ Billing   │  │ [Label] [Input]                     │   │
│ Team      │  │ [Label] [Select]                    │   │
│ API       │  │         [Save Button]               │   │
│           │  └─────────────────────────────────────┘   │
│           │  ┌─ Card ─────────────────────────────┐   │
│           │  │ DANGER ZONE (red border accent)     │   │
│           │  └─────────────────────────────────────┘   │
└───────────┴────────────────────────────────────────────┘
```

- Sidebar items map to form card sections
- Each section is a card with mono label header + form fields
- Danger zone card: `border-color: var(--semantic-red-dim)` with red-tinted actions

## 4. Auth Page (Login / Register)

```
┌────────────────────────────────────────────────────────┐
│                   bg-void (full screen)                 │
│                                                         │
│              ┌─ Card (max-w 420px) ──────────┐         │
│              │  [Logo] AppName                │         │
│              │  SUBTITLE                      │         │
│              │                                │         │
│              │  MONO LABEL: email              │         │
│              │  [Input]                        │         │
│              │  MONO LABEL: password           │         │
│              │  [Input]                        │         │
│              │  [Primary Button: full width]   │         │
│              │                                │         │
│              │  or ─── divider ─── or         │         │
│              │  [Secondary Button: Google]     │         │
│              │  Link: forgot / register        │         │
│              └────────────────────────────────┘         │
│                                                         │
│              radial glow behind card                    │
└────────────────────────────────────────────────────────┘
```

- Full viewport, centered flex, `background: var(--bg-void)`
- Card with `var(--bg-surface)`, `max-width: 420px`, `border-radius: var(--radius-xl)`
- Optional: radial glow effect behind card (like Mode Panel)

## 5. List-Detail (Split View)

```
┌────────────────────────────────────────────────────────┐
│  TOP BAR                                               │
├────────────────────────────────────────────────────────┤
│  TAB BAR + Filter badges                               │
├──────────────────────┬─────────────────────────────────┤
│  LIST (scrollable)   │  DETAIL PANEL                   │
│  ┌──────────────┐    │  Profile Header (compact)       │
│  │ Item (active) │   │  Stat Cards row                 │
│  ├──────────────┤    │  Tab sub-navigation             │
│  │ Item          │   │  Content (DNA Panel, table,     │
│  ├──────────────┤    │  etc.)                          │
│  │ Item          │   │                                 │
│  └──────────────┘    │                                 │
└──────────────────────┴─────────────────────────────────┘
```

- List panel: `width: 340px`, `border-right: 1px solid var(--border-subtle)`
- Active item: `background: var(--bg-elevated)`, `border-left: 3px solid var(--accent)`
- Detail panel: flex: 1, scrollable independently

## 6. Landing Page / Frontpage

Default theme: **light**. Uses generous spacing and hero typography.

```
┌────────────────────────────────────────────────────────┐
│  TOP BAR (transparent → bg-void on scroll)             │
├────────────────────────────────────────────────────────┤
│                                                         │
│  HERO SECTION (padding: space-24)                      │
│  ┌──────────────────────────────────────────────┐     │
│  │ MONO LABEL: tagline                           │     │
│  │ DISPLAY HEADING (text-5xl, weight-black)      │     │
│  │ Subtitle paragraph (text-lg, text-secondary)  │     │
│  │ [CTA Button] [Secondary Button]               │     │
│  └──────────────────────────────────────────────┘     │
│                                                         │
├────────────────────────────────────────────────────────┤
│  FEATURES SECTION (bg-surface, padding: space-20)      │
│  Section Header (centered)                              │
│  [InfoCard] [InfoCard] [InfoCard]  (3-col grid)        │
│                                                         │
├────────────────────────────────────────────────────────┤
│  STATS SECTION (bg-base, padding: space-16)            │
│  [StatCard] [StatCard] [StatCard] [StatCard]           │
│                                                         │
├────────────────────────────────────────────────────────┤
│  SOCIAL PROOF / TESTIMONIALS (bg-surface)              │
│  Quote cards in 2-col grid                              │
│                                                         │
├────────────────────────────────────────────────────────┤
│  CTA SECTION (accent glow background)                  │
│  Display heading + CTA button (centered)                │
│                                                         │
├────────────────────────────────────────────────────────┤
│  FOOTER (bg-void)                                      │
│  Columns: Brand | Links | Links | Newsletter           │
└────────────────────────────────────────────────────────┘
```

**Key differences from dashboard:**
- Sections are full-width with alternating `bg-base` / `bg-surface`
- Spacing between sections: `padding: var(--space-20) var(--space-6)`
- Hero heading: `--text-5xl` on desktop, `--text-3xl` on mobile
- Content max-width: `1200px`, centered with `margin: 0 auto`
- Section headers centered: `text-align: center`
- CTA section: `background: var(--bg-surface)` with `radial-gradient` glow

## 7. Institutional / Corporate

Same as Landing Page but with these pages:

- **About page**: Hero + text blocks + team card grid (avatar cards with name, role, social)
- **Services page**: Hero + service info cards (icon + title + desc) in 3-col grid
- **Contact page**: Two columns — left: text + info cards, right: form card

Team card variant:
```
┌───────────────────┐
│     [Avatar]      │
│    Team Member    │ ← text-heading, weight-bold
│      CEO          │ ← text-accent, italic
│   Short bio text  │ ← text-secondary, text-sm
│   [Social icons]  │
└───────────────────┘
```

## Responsive Breakpoints

Apply to all patterns:
```css
/* Mobile: single column, sidebar collapses, stats stack */
@media (max-width: 768px) {
  .main-layout { flex-direction: column; }
  .sidebar { width: 100%; border-right: none; border-bottom: 1px solid var(--border-subtle); }
  .card-grid { grid-template-columns: 1fr; }
  .stats-row { flex-direction: column; }
  .hero-heading { font-size: var(--text-3xl); }
}
/* Tablet: 2-col grid */
@media (min-width: 768px) and (max-width: 1024px) {
  .card-grid { grid-template-columns: repeat(2, 1fr); }
}
/* Desktop: 3-4 col grid */
@media (min-width: 1024px) {
  .card-grid { grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
}
```
