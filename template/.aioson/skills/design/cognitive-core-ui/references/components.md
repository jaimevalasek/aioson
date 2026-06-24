# Components — Cognitive Core UI

Read after `design-tokens.md`. All components use CSS variables and adapt to dark/light theme automatically.

Code examples use JSX inline style notation as **design specifications** — read property-value pairs as spec, then adapt syntax to the active stack (HTML, Vue, Blade, etc.). The shorthand `TT` means `{ transition: 'var(--transition-theme)' }`.

---

## 1. Top Navigation Bar

```
┌──────────────────────────────────────────────────────┐
│ [Logo] AppName     Link  Link  Link     [☀] [Badge] │
│        SUBTITLE                                       │
└──────────────────────────────────────────────────────┘
```

- Background: `var(--bg-void)`, `position: sticky`, `top: 0`, `z-index: var(--z-sticky)`
- Border-bottom: `1px solid var(--border-subtle)`
- Logo: `36px` square, `background: var(--accent-dim)`, `border: 1px solid var(--accent)`, `border-radius: var(--radius-md)`, icon in `var(--accent)`
- Brand name: `font-family: var(--font-mono)`, `--weight-bold`, `--text-base`, `--text-heading`, `letter-spacing: 0`
- Subtitle: mono, `--text-xs`, `--text-muted`, uppercase, `letter-spacing: 0`
- Nav links: `--text-base`. Active: `var(--text-accent)`. Inactive: `var(--text-secondary)`
- Theme toggle: `36px` button, `var(--bg-surface)`, `1px solid var(--border-subtle)` — only include when the product supports theme switching

---

## 2. Stat Card

Large numeric readout with mono label. Used in stat rows at the top of pages.

```jsx
<div style={{
  background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-lg)', padding: 'var(--space-4) var(--space-5)',
  width: '100%', minWidth: 0, ...TT,
}}>
  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)',
    letterSpacing: 0, textTransform: 'uppercase', fontWeight: 600,
    marginBottom: 'var(--space-1)' }}>LABEL</div>
  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
    <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-4xl)', fontWeight: 700,
      color: 'var(--text-heading)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>42</span>
    <span style={{ fontSize: 'var(--text-lg)', color: 'var(--text-muted)' }}>/100</span>
  </div>
  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 'var(--space-1)' }}>
    subtitle text
  </div>
</div>
```

Accent variant: replace stat number `color` with `var(--semantic-green)`, `var(--semantic-red)`, or `var(--semantic-amber)`.

---

## 3. Card (base)

The fundamental top-level container. Use cards for repeated items and primary sections; use inset rows, dividers, tables, and disclosure bodies inside cards.

```jsx
const cardStyle = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--space-5)',
  transition: 'var(--transition-theme), border-color 150ms ease, box-shadow 150ms ease, transform 150ms ease',
};
// Hover: borderColor → var(--border-medium), boxShadow → var(--shadow-glow), transform → translateY(-1px)
```

---

## 4. Info Card (icon + title + description + quote)

Used in grids for features, capabilities, items.

```
┌─────────────────────────────────┐
│ 📈  [icon]          Badge text  │ ← header row
│ Card Title                      │ ← accent color
│ Description text that explains  │ ← secondary color
│ ┃ "Optional quote text"         │ ← muted, left border
└─────────────────────────────────┘
```

- Header: `display: flex; justify-content: space-between`. Icon left, badge right (mono, `--text-xs`, muted).
- Title: `--text-lg`, `--weight-semibold`, `color: var(--text-accent)`
- Description: `--text-base`, `--text-secondary`, `line-height: 1.5`
- Quote: italic, `--text-muted`, `border-left: 2px solid var(--accent-dim)`, `padding-left: var(--space-3)`

---

## 5. Profile Header

Entity header with avatar, name, role, badges, and stat cards.

```
┌──────────────────────────────────────────────────────────┐
│ [Avatar 96px]  BIG NAME           [Badge] [Badge]        │
│ ID: XXX        Role (italic, accent)                     │
│                ✦ TAGLINE (mono, xs, muted)                │
│                                                           │
│ ┌─StatCard─┐  ┌─StatCard─┐  ┌─StatCard─┐               │
└──────────────────────────────────────────────────────────┘
```

- Avatar: `96px`, `border-radius: var(--radius-lg)`, `border: 2px solid var(--border-subtle)`
- Name: `--text-3xl`, `--weight-bold` by default, `--weight-black` only for a deliberately dramatic hero/profile treatment, `letter-spacing: 0`, `--text-heading`
- Role: `color: var(--text-accent)`, `font-style: italic`, `--text-lg`
- Tagline: mono, `--text-xs`, `--text-muted`, `letter-spacing: 0`, uppercase
- ID: mono, `--text-xs`, muted, placed in the metadata column or under the name; never absolutely positioned below the avatar
- Stat cards: same as component 2, `min-width: 130px`

---

## 6. Badge / Chip

Three variants — all use mono font, uppercase, `letter-spacing: 0`, `font-size: var(--text-xs)`.

**Accent badge** (active states, primary tags):
```jsx
{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--border-accent)',
  fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', fontWeight: 600,
  letterSpacing: 0, textTransform: 'uppercase',
  padding: '2px 10px', borderRadius: 'var(--radius-sm)' }
```

**Outline badge** (neutral tags):
```jsx
{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-medium)',
  /* same font styles as accent */ }
```

**Semantic badges** (status — swap vars):
- Success: `background: var(--semantic-green-dim)`, `color: var(--semantic-green)`, `border: 1px solid rgba(22,199,132,0.3)`
- Danger: `var(--semantic-red-dim)`, `var(--semantic-red)`, red border
- Warning: `var(--semantic-amber-dim)`, `var(--semantic-amber)`, amber border
- Info: `var(--semantic-blue-dim)`, `var(--semantic-blue)`, blue border

Status dot: `width: 5px; height: 5px; border-radius: 50%; background: currentColor; display: inline-block; margin-right: 5px`

---

## 7. Tab Navigation

```jsx
<div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border-subtle)',
  padding: '0 var(--space-6)', overflowX: 'auto', ...TT }}>
  <button style={{
    fontFamily: 'var(--font-body)', fontSize: 'var(--text-base)',
    color: isActive ? 'var(--text-accent)' : 'var(--text-secondary)',
    background: 'none', border: 'none',
    padding: 'var(--space-3) var(--space-4)',
    borderBottom: `2px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
    transition: 'color 150ms ease, border-color 150ms ease',
  }}>
    <span>icon</span> Label
  </button>
</div>
```

Hover (non-active): `background: var(--bg-elevated)`, `border-radius: var(--radius-md) var(--radius-md) 0 0`

---

## 8. Sidebar Tree

```
┌──────────────────┐
│ SECTION LABEL    │ ← mono, xs, muted, uppercase, tracking-normal
│  ⊞ Item Active   │ ← bg-elevated, border-left: 3px solid var(--accent), text-heading
│  📊 Item         │ ← text-secondary, transparent bg
│  💬 Item         │
│                  │
│ SECTION LABEL    │
│  ○ Category      │ ← text-muted (inactive)
│  ● Category (on) │ ← text-accent (active)
└──────────────────┘
```

Width: `200–220px`. Items: `padding: var(--space-2) var(--space-3)`, `border-radius: var(--radius-md)`.
Active item: `background: var(--bg-elevated)`, `border-left: 3px solid var(--accent)`.
Hover: `background: var(--bg-elevated)`, `color: var(--text-primary)`.

---

## 9. Section Header

```jsx
<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
  padding: 'var(--space-6) 0 var(--space-4)' }}>
  <span style={{ color: 'var(--accent)', fontSize: 'var(--text-lg)' }}>⚡</span>
  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)',
    fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>Title</h2>
</div>
```

---

## 10. Progress Bar

```jsx
<div style={{ height: 5, background: 'var(--bg-elevated)',
  borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
  <div style={{ height: '100%', borderRadius: 'var(--radius-full)',
    background: color, width: `${pct}%`,
    transition: 'width 300ms cubic-bezier(0.16, 1, 0.3, 1)' }} />
</div>
```

Colors: `var(--accent)`, `var(--semantic-green)`, `var(--semantic-red)`, `var(--semantic-amber)`, `var(--semantic-purple)`.

---

## 11. Mode Panel (accent feature box)

Centered panel with radial glow — for "operating mode", featured status, or a primary CTA.

```
┌─────────── border-accent ──────────┐
│         ◆ BADGE PILL              │
│            [Icon 56px]             │ ← accent border + glow shadow
│          MONO LABEL               │
│        Large Title                │
│       "Subtitle italic"           │
│   radial-gradient glow behind     │
└────────────────────────────────────┘
```

- Border: `1px solid var(--border-accent)`, `border-radius: var(--radius-xl)`
- Background: `var(--bg-surface)` with `radial-gradient(ellipse at 50% 0%, var(--accent-glow), transparent 70%)`
- Icon: `56px`, circular, `background: var(--accent-dim)`, `border: 1px solid var(--accent)`, `color: var(--accent)`

---

## 12. DNA Panel (sliders + tags)

Combined panel with labeled progress metrics and a tag group. The "personality" card of any entity.

```
┌─────────────────────────────────────────┐
│ ✦ PANEL TITLE                           │
│                                          │
│ LABEL  ████████████████░░░░  72%        │
│ LABEL  ██████████░░░░░░░░░  58%        │
│ LABEL  █████████████░░░░░░  85%        │
│                                          │
│ [Badge] [Badge] [Badge] [Badge]         │
└─────────────────────────────────────────┘
```

Each metric row: `display: flex; align-items: center; gap: var(--space-3)`.
Label: `min-width: 80px; font-family: var(--font-mono); font-size: var(--text-xs); color: var(--text-muted)`.
Bar: fills the remaining row width with `min-width: 0` on the metric row (use Progress Bar component).
Value: mono, `--text-sm`, `--text-secondary`, `min-width: 40px; text-align: right`.
Tags: flex-wrap, `gap: var(--space-2)` (use Badge/Chip component).

---

## 13. Data Table

```
┌────────────────────────────────────────────────────┐
│ NAME ▲        CATEGORY    STOCK    STATUS    PRICE │ ← mono header
├────────────────────────────────────────────────────┤
│ Product Name  Laptops     23       [●OK]    R$12k  │
│ Product Name  Phones      5        [●Crit]  R$8k   │
└────────────────────────────────────────────────────┘
```

**Premium table CSS (preferred — surfaced rows with hover):**

```css
table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0 8px;
}

thead th {
  padding: 0 16px 8px;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0;
  text-transform: uppercase;
  color: var(--text-muted);
  text-align: left;
  font-weight: 600;
}

tbody td {
  padding: 14px 16px;
  background: var(--bg-surface);
  border-top: 1px solid var(--border-subtle);
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-primary);
  font-size: var(--text-base);
  transition: var(--transition-theme);
  font-variant-numeric: tabular-nums;
}

tbody td:first-child {
  border-left: 1px solid var(--border-subtle);
  border-top-left-radius: var(--radius-lg);
  border-bottom-left-radius: var(--radius-lg);
}

tbody td:last-child {
  border-right: 1px solid var(--border-subtle);
  border-top-right-radius: var(--radius-lg);
  border-bottom-right-radius: var(--radius-lg);
}

tbody tr:hover td {
  background: var(--bg-elevated);
  border-color: var(--border-medium);
}
```

**Rules:**
- Never use `border-collapse: collapse` with `tr` backgrounds in this visual system — hover fills look like hard painted rectangles.
- If the existing stack forces `collapse`, style `td` cells as the surface, not `tr`.
- In brownfield: check if the table should stay a table or become a list-detail surface before rewriting.

**Failure signs to fix:**
- Serif fallback or typography mismatch inside the table only → font scope bug
- Row hover painting a hard rectangle → use `border-collapse: separate` + `td` surfaces
- Status chips squeezed between columns → widen the lane or reduce chip padding
- Numbers misaligned → add `font-variant-numeric: tabular-nums`

---

## 14. Form Elements

**Input:**
```jsx
{ background: 'var(--bg-surface)', border: '1px solid var(--border-medium)',
  borderRadius: 'var(--radius-md)', padding: 'var(--space-2) var(--space-3)',
  color: 'var(--text-primary)', fontSize: 'var(--text-base)',
  fontFamily: 'var(--font-body)', outline: 'none', ...TT }
// Focus: borderColor → var(--border-accent-strong), boxShadow → 0 0 0 3px var(--accent-glow)
```

**Label:** mono label style (xs, muted, uppercase, tracking-normal). Place above input with `margin-bottom: var(--space-1)`.

**Button primary:**
```jsx
{ background: 'var(--accent)', color: 'var(--text-inverse)', border: 'none',
  borderRadius: 'var(--radius-md)', padding: 'var(--space-2) var(--space-5)',
  fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontWeight: 600,
  letterSpacing: 0, textTransform: 'uppercase', cursor: 'pointer',
  transition: 'background 150ms ease' }
// Hover: background → var(--accent-hover)
```

**Button secondary:**
```jsx
{ background: 'transparent', color: 'var(--text-secondary)',
  border: '1px solid var(--border-medium)',
  /* rest same as primary */
}
// Hover: borderColor → var(--border-accent), color → var(--text-accent)
```

---

## 15. Modal / Detail Overlay

```
┌─────────────── backdrop (rgba, z-modal) ───────────────┐
│                                                          │
│    ┌─ Card max-w: 700px ─────────────────────────┐     │
│    │  HEADER: title + close button               │     │
│    │  ─────────────────────────                  │     │
│    │  BODY: stat cards, progress, badges, etc.   │     │
│    └─────────────────────────────────────────────┘     │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

- Backdrop: `rgba(0,0,0,0.6)`, centered flex, `z-index: var(--z-modal)`
- Content card: `var(--bg-base)`, `border: 1px solid var(--border-subtle)`, `border-radius: var(--radius-xl)`, `max-width: 700px`
- Header: flex, space-between, `padding: var(--space-5) var(--space-6)`, `border-bottom: 1px solid var(--border-subtle)`
- Body: `padding: var(--space-6)` — reuse stat cards, progress bars, badges, section headers
- Animation: `scaleIn 300ms cubic-bezier(0.16, 1, 0.3, 1)` (see motion.md)

---

## 16. Theme Toggle

```jsx
<button
  onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
  style={{
    width: 36, height: 36, borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)',
    color: 'var(--text-secondary)', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '1rem', ...TT,
  }}
>
  {theme === 'dark' ? '☀' : '☾'}
</button>
```

Hover: `borderColor → var(--border-accent)`, `color → var(--accent)`.

---

## Component layout integrity

- Any component that can contain long names, IDs, file paths, emails, or generated labels must include `min-width: 0` on the text column and either `overflow-wrap: anywhere` or `text-overflow: ellipsis`.
- Icon buttons use fixed square dimensions (`--control-sm` or `--control-md`) so labels and hover states cannot resize the toolbar.
- Repeated cards live in responsive grids. Do not manually place 3-4 cards in a fixed row unless a media query or `auto-fit` grid is present.
- When a component example uses inline style notation, translate numeric widths to CSS constraints (`minmax`, `min()`, `max-width`) before building production CSS.
- Do not put a `.card` inside another `.card`. Use `.inset-section`, table rows, `<details>`, or a modal body.
