# Patterns — Page Layouts (Aurora Command UI)

Requires `design-tokens.md` + `components.md` loaded first.

These patterns define full-page compositions for aurora-command-ui. All surfaces are dark glass over the aurora gradient substrate.

---

## Foundation rule — always first

Before any layout: the aurora gradient background must be set on the root shell.

```css
.aurora-shell {
  min-height: 100vh;
  background: var(--bg-gradient);
  background-attachment: fixed;
  font-family: var(--font-body);
  color: var(--text-primary);
}
```

Glass panels placed over this shell will reveal the aurora through transparency. If the background is solid, the glass effect fails entirely.

---

## 1. Aurora App Shell (base layout)

The foundation for all app and dashboard views.

```
┌─────────────────────────────────────────────────────────────────┐
│  AURORA GRADIENT BACKGROUND (fixed, full viewport)              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ GLASS TOP BAR (sticky)                                   │   │
│  │ [Logo] ──────── [Tab Nav — center] ──────── [Actions]   │   │
│  ├─────────────────┬────────────────────────────────────────┤   │
│  │ GLASS SIDEBAR   │  SCROLLABLE CONTENT AREA              │   │
│  │ 200-220px       │  [MONO SECTION HEADER]                │   │
│  │ h: 100vh-topbar │  [GLASS STAT ROW]                     │   │
│  │ overflow-y:auto │  [GLASS DATA GRID]                    │   │
│  │                 │  [MONO SECTION HEADER]                │   │
│  │                 │  [GLASS TABLE / CHART]                │   │
│  └─────────────────┴────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**CSS skeleton:**
```css
.aurora-shell {
  min-height: 100vh;
  background: var(--bg-gradient);
  background-attachment: fixed;
}

.app-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

/* Top bar */
.topbar {
  height: 52px;
  flex-shrink: 0;
  background: var(--glass-shell);
  backdrop-filter: var(--glass-blur-lg);
  -webkit-backdrop-filter: var(--glass-blur-lg);
  border-bottom: 1px solid var(--glass-border);
  display: flex;
  align-items: center;
  padding: 0 20px;
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);
}

/* Body row */
.body-row {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* Sidebar */
.sidebar {
  width: 210px;
  flex-shrink: 0;
  background: var(--glass-shell);
  backdrop-filter: var(--glass-blur-md);
  -webkit-backdrop-filter: var(--glass-blur-md);
  border-right: 1px solid var(--glass-border);
  overflow-y: auto;
  padding: var(--space-4) var(--space-3);
}

/* Content */
.content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-5) var(--space-6);
}
```

**Fallback (no backdrop-filter):**
```css
@supports not (backdrop-filter: blur(1px)) {
  .topbar, .sidebar { background: var(--glass-fallback); }
}
```

---

## 2. Dashboard Shell — Eclipse Command

For operational dashboards (SOC, infra, monitoring, live analytics). Dense information above the fold.

```
┌─────────────────────────────────────────────────────────────────┐
│  TOPBAR: [Logo] ── [OVERVIEW / ALERTS / AGENTS / CONFIG] ───   │
├─────────────────────────────────────────────────────────────────┤
│  STAT ROW (4 glass stat cards, full width)                      │
│  [Total Events] [Active Alerts] [Agents Online] [Latency p99]  │
├─────────────────┬───────────────────────────────────────────────┤
│  GLASS SIDEBAR  │  [MONO: LIVE ACTIVITY ▸]                     │
│  Nav tree       │  ┌── HERO CHART PANEL (2/3 width) ────────┐  │
│                 │  │ Area chart — glass container — gradient │  │
│                 │  └─────────────────────────────────────────┘  │
│                 │  ┌── SECONDARY PANEL (1/3 width)          │  │
│                 │  │ Alert tape / Activity feed             │  │
│                 │  └─────────────────────────────────────────┘  │
│                 │  [MONO: ENTITY STATUS ▸]                     │
│                 │  ┌── DATA TABLE (full width) ─────────────┐  │
│                 └───────────────────────────────────────────────┘
```

**Content grid:**
```css
.dashboard-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.stat-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-3);
}

.main-split {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: var(--space-3);
}

.full-table-section {
  width: 100%;
}
```

---

## 3. Dashboard Shell — Quiet Aurora

For analytics and BI dashboards. Less density, more narrative structure. One dominant metric above the fold.

```
┌─────────────────────────────────────────────────────────────────┐
│  TOPBAR                                                         │
├─────────────────────────────────────────────────────────────────┤
│  [HERO METRIC PANEL — full width or 2/3]                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ MONO LABEL: REVENUE PERFORMANCE                         │   │
│  │ $4,820,190  ↑ 12.4%  [this quarter vs last]             │   │
│  │ [Area chart spanning full panel — aurora fill]          │   │
│  └──────────────────────────────────────────────────────────┘   │
├─────────────────┬───────────────────────────────────────────────┤
│  GLASS SIDEBAR  │  SUPPORTING CARDS GRID (3-col)               │
│                 │  [Conversion] [AOV] [CAC]                     │
│                 │  [Table: Top Segments]                        │
└─────────────────┴───────────────────────────────────────────────┘
```

**Hero panel:**
```css
.hero-metric-panel {
  background: var(--glass-surface);
  backdrop-filter: var(--glass-blur-md);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-xl);
  padding: var(--space-6);
  position: relative;
  overflow: hidden;
}

/* Aurora glow behind stat number */
.hero-metric-panel::after {
  content: '';
  position: absolute;
  top: 0; left: 50%;
  transform: translateX(-50%);
  width: 60%;
  height: 1px;
  background: var(--accent-gradient);
  opacity: 0.6;
}
```

---

## 4. Detail / Profile Page

For viewing a single entity — agent, user, contact, project, asset.

```
┌─────────────────────────────────────────────────────────────────┐
│  TOPBAR                                                         │
├─────────────────────────────────────────────────────────────────┤
│  Breadcrumbs: Section › Entity Name                             │
│  ┌── PROFILE HEADER GLASS PANEL (full width) ──────────────┐   │
│  │ [Avatar 80px] [Name text-3xl] [Badges] [Status chip]    │   │
│  │ [Mono: stat row] [Actions: Edit / Message / ...]        │   │
│  └──────────────────────────────────────────────────────────┘   │
│  [TAB BAR: Overview / Activity / Settings / Integrations]       │
├─────────────────┬───────────────────────────────────────────────┤
│  SIDEBAR DETAIL │  CONTENT TAB PANEL                           │
│  Compact info   │  [MONO SECTION HEADER]                       │
│  Key–value rows │  [GLASS CARD GRID: 2-col]                    │
│                 │  [MONO SECTION HEADER]                       │
│                 │  [GLASS TABLE]                               │
└─────────────────┴───────────────────────────────────────────────┘
```

**Profile header:**
```css
.profile-header {
  background: var(--glass-surface);
  backdrop-filter: var(--glass-blur-md);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-xl);
  padding: var(--space-6);
  display: flex;
  align-items: center;
  gap: var(--space-5);
  margin-bottom: var(--space-4);
  position: relative;
}

.profile-header::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: var(--glass-highlight);
  pointer-events: none;
}

.profile-name {
  font-size: var(--text-3xl);
  font-weight: var(--weight-bold);
  letter-spacing: var(--tracking-tight);
  color: var(--text-heading);
}
```

---

## 5. Settings Page (Compact Density)

Follows the admin compact density scale from `design-tokens.md`.

```
┌─────────────────────────────────────────────────────────────────┐
│  TOPBAR                                                         │
├────────────┬────────────────────────────────────────────────────┤
│ SETTINGS   │  [MONO: ACCOUNT SETTINGS ▸]                       │
│ SIDEBAR    │  ┌── L1 glass card ──────────────────────────┐   │
│  – Account │  │ HEADING: Profile (text-base semibold)     │   │
│  – Security│  │ ┌── L2 nested card ────────────────────┐  │   │
│  – API     │  │ │ Name / Email / Avatar fields         │  │   │
│  – Billing │  │ └──────────────────────────────────────┘  │   │
│  – Team    │  │ [Save Changes button]                     │   │
│            │  └───────────────────────────────────────────┘   │
│            │  ┌── L1 glass card: Security ─────────────┐     │
│            │  └───────────────────────────────────────────┘   │
└────────────┴────────────────────────────────────────────────────┘
```

Settings sidebar is narrower (180px). Uses `--text-sm` for nav items. No backdrop-blur on settings sidebar — just glass-border right edge.

---

## 6. Auth / Login Page

Aurora background in full focus. Single centered glass card.

```
┌─────────────────────────────────────────────────────────────────┐
│  AURORA GRADIENT (full viewport, fixed)                         │
│                                                                 │
│            [Ambient aurora field — top-right wash]         │
│            [Ambient aurora field — bottom-left wash]       │
│                                                                 │
│  ┌─────────────────────────────────┐                            │
│  │  GLASS AUTH CARD (max 400px)    │                            │
│  │  Logo + Product name            │                            │
│  │  MONO: SIGN IN TO AURORA        │                            │
│  │  [Email input (glass)]          │                            │
│  │  [Password input (glass)]       │                            │
│  │  [Sign In button — gradient]    │                            │
│  │  Forgot password / Sign up      │                            │
│  └─────────────────────────────────┘                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Auth page:**
```css
.auth-page {
  min-height: 100vh;
  background: var(--bg-gradient);
  background-attachment: fixed;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-6);
  position: relative;
  isolation: isolate;
  overflow: hidden;
}

.auth-card {
  width: 100%;
  max-width: 400px;
  background: var(--glass-surface);
  backdrop-filter: var(--glass-blur-lg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-2xl);
  padding: var(--space-8) var(--space-8);
  position: relative;
  z-index: 1;
}

.auth-card::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: var(--glass-highlight);
  pointer-events: none;
}

/* Ambient aurora field layers */
.auth-page::before,
.auth-page::after {
  content: "";
  position: fixed;
  inset: -20%;
  pointer-events: none;
  z-index: 0;
}

.auth-page::before {
  background: radial-gradient(ellipse at 82% 12%, rgba(0,200,232,0.22), transparent 54%);
  filter: blur(42px);
}

.auth-page::after {
  background: radial-gradient(ellipse at 12% 88%, rgba(124,58,237,0.20), transparent 56%);
  filter: blur(48px);
}
```

---

## 7. List → Detail Layout

For entity galleries, queues, feeds, inbox-style views.

```
┌─────────────────────────────────────────────────────────────────┐
│  TOPBAR                                                         │
├──────────────────────────┬──────────────────────────────────────┤
│  LIST PANEL (360px)      │  DETAIL PANEL (flex: 1)             │
│  ┌── glass card ──────┐  │  [Profile header]                   │
│  │ Entity row 1       │  │  [Tab bar]                          │
│  └────────────────────┘  │  [Detail content]                   │
│  ┌── glass card ──────┐  │                                     │
│  │ Entity row 2       │  │                                     │
│  └────────────────────┘  │                                     │
│  [Load more...]          │                                     │
└──────────────────────────┴──────────────────────────────────────┘
```

```css
.list-detail-layout {
  display: grid;
  grid-template-columns: 360px 1fr;
  height: calc(100vh - 52px);
  overflow: hidden;
}

.list-panel {
  border-right: 1px solid var(--glass-border);
  overflow-y: auto;
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.detail-panel {
  overflow-y: auto;
  padding: var(--space-5) var(--space-6);
}
```

---

## 8. Command Strip Pattern

A command-center signature from cognitive-core-ui, adapted for dark glass surfaces. A horizontal strip showing live system status above the main content.

```
┌─────────────────────────────────────────────────────────────────┐
│ ● SYSTEM STATUS    ● 3 ACTIVE ALERTS    ● 847ms LATENCY  [TEAL] │
└─────────────────────────────────────────────────────────────────┘
```

```css
.command-strip {
  height: 32px;
  background: rgba(0, 200, 232, 0.06);
  border-bottom: 1px solid rgba(0, 200, 232, 0.15);
  display: flex;
  align-items: center;
  padding: 0 var(--space-6);
  gap: var(--space-6);
  overflow-x: auto;
}

.command-strip-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-family: var(--font-mono);
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.10em;
  text-transform: uppercase;
  color: var(--text-secondary);
  white-space: nowrap;
}

.command-strip-item .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent-primary);
  box-shadow: 0 0 6px var(--accent-primary);
}

.command-strip-item.alert .dot { background: var(--semantic-amber); box-shadow: 0 0 6px var(--semantic-amber); }
.command-strip-item.critical .dot { background: var(--semantic-red); box-shadow: 0 0 6px var(--semantic-red); }
```

---

## Responsive notes

- **Sidebar collapse**: below 1024px, the sidebar becomes a slide-over glass panel (position: fixed, full height).
- **Stat row**: `grid-template-columns: repeat(auto-fill, minmax(180px, 1fr))` — gracefully drops to 2-col on tablet.
- **List-detail**: below 768px, the list panel becomes a separate screen/tab — detail occupies full width.
- **Top bar**: below 768px, collapse the center tab nav into a hamburger menu.

---

## Anti-patterns

- Do NOT float glass cards over a solid `#000` or `#0b0f15` background — the glass will look like a flat opaque panel.
- Do NOT skip the `::before` top reflection on glass cards — it is part of the visual signature.
- Do NOT use a stats row of 4 equal cards as the only above-the-fold content every time. Vary with hero metric panels, chart panels, or alert clusters.
- Do NOT use the same padding scale for marketing pages and dashboards. Use compact density in operational UI.
