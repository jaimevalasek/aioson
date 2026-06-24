# Dashboard Presets — Cognitive Core UI

Read after `design-tokens.md`, `components.md`, and `patterns.md`.

These presets help choose a fitting operational composition instead of defaulting to random card grids.

---

## How to choose

1. Start from the product's **main operational pressure**, not from a visual trope.
2. Pick **one dominant preset** per screen.
3. Mix small traits from another preset only when the primary composition is already clear.
4. Choose one opening composition from the library below before placing a stat row.

## Layout implementation rules

Use these rules for every dashboard preset:

- Implement the shell as CSS grid with named regions when possible. Minimum: `topbar`, `status`, `main`, and optional `sidebar` / `rail`.
- Main dashboard regions must use `minmax(0, 1fr)` and every scrollable panel must have `min-width: 0; min-height: 0`.
- Rails are constraints, not fixed layout promises: use `minmax(220px, 260px)` or `minmax(280px, 360px)` inside a grid, then collapse them below tablet width.
- Stat cards use `repeat(auto-fit, minmax(min(100%, 160px), 1fr))`.
- Long tables, feeds, paths, IDs, and names must have an explicit overflow strategy before styling begins.
- Above the fold, one surface owns attention. Supporting rails must not visually compete with it.

---

## Opening Composition Library

Do not let every dashboard begin with `4 KPI cards + tabs + equal grid`.

Choose one primary opening move:

### 1. Dominant Hero Surface

Use when:
- the screen has one main operational story
- users need a fast read on what matters most

Composition:
- one large hero analysis panel
- 2-3 supporting metrics beside or below
- secondary cards deferred downward

Best for:
- control centers
- analytics
- AI orchestration

### 2. Alert and Queue First

Use when:
- urgency beats summary
- users act from exceptions, incidents, or pending work

Composition:
- alert cluster or priority queue above the fold
- supporting health metrics nearby
- context rail for recent events

Best for:
- ops
- support
- logistics
- monitoring

### 3. Trend First

Use when:
- change over time matters more than static totals
- the main question is movement, not snapshot

Composition:
- chart or trend ribbon as the hero
- compact stat strip
- ranked list or narrative summary below

Best for:
- revenue
- analytics
- performance

### 4. Profile or Entity First

Use when:
- one active entity anchors the workflow
- the user is working inside a person, account, project, or agent

Composition:
- profile header or entity summary surface
- focused stat cards
- detail tabs and contextual rails

Best for:
- CRM
- account management
- AI agent panels

### 5. Workspace First

Use when:
- the dashboard is really a working surface, not just a summary
- users spend time editing, reviewing, or operating from this page

Composition:
- tool surface or main work pane dominates
- navigation and status become secondary chrome
- metrics move to support rails

Best for:
- admin tools
- builder UIs
- review flows

---

## Anti-Template Rules

- Never open every dashboard with four equal stat cards unless the product truly lives and dies by four equal KPIs.
- Never let the stat row be the most memorable part of the page.
- If the layout could be mistaken for a generic admin starter after removing the colors, redesign the composition.
- One strong focal block beats six medium-interest cards.
- Use `references/art-direction.md` to choose a signature move before styling panels.

---

## Preset 1: Inventory Operations Board

**Best for:** stock control, inventory movement, replenishment monitoring, product catalog operations, supply dashboards.

**Default theme:** Dark.

**Layout composition:**
```
TOP BAR: Logo + product name + compact status badge + account/actions
STATS ROW: 3-4 high-signal cards only
SUBNAV: Dashboard | Products | Movements (or equivalent)
MAIN GRID:
  LEFT RAIL (minmax(220px, 260px)): monitoring blocks, quick filters, credential/mode section
  CENTER (minmax(0, 1fr)): stock radar / urgent items / operational summary
  RIGHT RAIL (minmax(280px, 360px)): recent movements / alerts / short activity feed
```

**Why it works:**
- One central operational story above the fold
- Urgent items visible without a product-wall overload
- Movement history stays contextual, not dominant
- Left rail gives monitoring without stealing the main stage

**Rules:**
- Do not render the full product catalog above the fold. Show 2–4 urgent cards in the central radar.
- Use color semantics sparingly: green = stable, amber = low, red = zero/critical.
- Prefer operational labels: `Baixo estoque`, `Zerados`, `Saude do estoque`, `Movimentacao recente`.
- Keep the focal block calm. Do not turn it into a second dashboard shell inside the dashboard.
- For tables: treat each row as an intentional operational lane — aligned numbers, consistent padding, enough breathing room around status chips.
- Implementation default: `grid-template-columns: minmax(220px, 260px) minmax(0, 1fr) minmax(280px, 360px)`. Below 1100px, move the right rail below the center. Below 760px, collapse both rails into tabs/drawers.

---

## Preset 2: Premium Control Center

**Best for:** AI systems, orchestration panels, intelligence products, multi-module operational platforms, command centers.

**Default theme:** Dark.

**Layout composition:**
```
TOP BAR: Logo + system subtitle + nav + status badge
STATS ROW: 4 stat cards
SECONDARY NAV: domain tabs
MAIN GRID:
  PRIMARY PANEL: single large analysis/control surface
  SUPPORT PANEL: mode/status block
  LOWER PANELS: grouped operational cards or capabilities
```

**Guardrail:**
- Use only when the product genuinely needs command-center semantics.
- DNA panels, mode panels, and labeled capability cards are optional, not default.
- Do not use for inventory just because the product is dark and premium.
- Implementation default: `grid-template-columns: minmax(0, 1.6fr) minmax(280px, 0.8fr)` for the primary/support row, with lower panels in `auto-fit` grids.

---

## Preset 3: Admin Analytics

**Best for:** analytics, SaaS admin, revenue tracking, performance reporting dashboards.

**Default theme:** Dark or Light.

**Layout composition:**
```
TOP BAR
STATS ROW
FILTER / DATE BAR
MAIN:
  Chart panel (full width or 2/3)
  Ranked list or summary panel (1/3)
  Table or report panel (full width below)
```

**Guardrail:**
- Let charts and tables do the work.
- Do not overload with decorative status cards.
- Implementation default: chart and ranked list use `grid-template-columns: minmax(0, 2fr) minmax(260px, 1fr)`, then collapse to one column below 900px.

---

## Preset 4: Ops Cockpit

**Best for:** system monitoring, logistics control, incident response, infra operations, real-time dashboards.

**Default theme:** Dark.

**Layout composition:**
```
TOP BAR
STATUS ROW (alert counts + system health)
MAIN GRID:
  Alert feed (primary, left/center)
  System status cluster (grouped service cards)
  Quick stats / context rail (right)
```

**Guardrail:**
- Alerts must be scannable first. Status color must carry meaning, not atmosphere.
- Implementation default: alert feed gets `minmax(0, 1fr)` and the context rail gets `minmax(260px, 320px)`. Never let the rail set the page width.

---

## Preset 5: CRM / Contact Manager

**Best for:** CRM, support tools, people directories, account management, talent pipelines.

**Default theme:** Light or Dark.

**Layout composition:**
```
TOP BAR
TAB BAR (with filter badges)
LIST-DETAIL SPLIT:
  Entity list (minmax(280px, 340px), scrollable)
  Active profile/detail view (minmax(0, 1fr))
    → Profile Header (compact) + Stat Cards + Tab sub-nav + Content
```

Below 760px, the entity list becomes a capped-height selection panel above the detail view or a drawer. Do not stack a full infinite list above the detail page.

---

## Operational Table Guardrails

Dashboards often have tables. This is where otherwise-good boards lose quality.

### Goals
- Rows scannable in under 1 second
- Same premium density as the rest of the board
- Avoid the feeling of "spreadsheet leftovers pasted into a polished shell"

### Rules
1. Use `font-variant-numeric: tabular-nums` for quantities, prices, thresholds, and derived values.
2. Keep status, quantity, and actions visually separated — they should not collapse into one dense block.
3. Status chips must sit comfortably inside row rhythm. If they crowd neighboring columns, widen the lane.
4. Action buttons in tables should read as a grouped control cluster, not as independent floating pills.
5. Row hover must feel like a surface state, not a hard painted rectangle.
6. `border-collapse: separate` + `td` surfaces = premium. `border-collapse: collapse` + `tr` backgrounds = amateur.

### Failure signs
- Serif fallback inside the table only → font scope bug in `td`
- Row hover painting a hard rectangle → wrong collapse mode or `tr` background
- Status chips squeezed → widen the column or reduce chip padding
- Numbers misaligned → missing `font-variant-numeric: tabular-nums`
- Page opens with a large hero-like block → reduce stat row height, tighten typography
- Cards feel puffy and over-padded → reduce `padding`, `border-radius`, and grid gap
- Layout reads like a polished demo instead of an operational surface → density is part of the identity

---

## Inventory Mapping Guide

| Inventory concept | UI treatment |
|---|---|
| Low stock | Urgent card in stock radar |
| Zero stock | Critical card in stock radar (semantic-red) |
| Recent entry/exit | Right-rail activity list |
| Valuation / total items | Top stat row |
| Category / supplier monitoring | Left rail blocks or filters |
| Replenishment threshold | Progress bar + limit helper |
