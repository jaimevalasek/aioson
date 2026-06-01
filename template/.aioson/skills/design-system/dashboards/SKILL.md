---
name: design-dashboards
description: Dashboard-specific presets and compositions for the Cognitive Core design system — premium control center, admin analytics, ops cockpit, and CRM layouts. Load foundations, components, and patterns first. Use when building dashboards, admin panels, monitoring tools, or any data-heavy operational interface.
---

# Dashboards — Preset Compositions

Requires: `foundations/SKILL.md` + `components/SKILL.md` + `patterns/SKILL.md` loaded first.

These presets combine the patterns and components into ready-to-build dashboard configurations. Each preset defines what components go where, what data shape to expect, and how to adapt the layout to a specific domain.

## Preset 1: Premium Control Center

The "Synthetic Minds" signature layout. Command center aesthetic with DNA panels and mode indicators.

**Best for:** AI systems, monitoring, intelligence platforms, premium SaaS.

**Default theme:** Dark.

**Layout composition:**
```
TOP BAR: Logo + COGNITIVE CORE subtitle + Nav + Theme Toggle + [● SYSTEM OPERATIONAL] badge
STATS ROW: 4 stat cards with large numbers
TAB BAR: General | DNA | Communication | History | Artifacts | Prompts | Domain
SIDEBAR + CONTENT:
  Content top row: [DNA Panel (2/3)] + [Mode Panel (1/3)]
  Section "Sistema Operacional": 4-col info card grid
  Section "Arsenal": 4-col info card grid with quotes
```

**Domain mapping template:**

| Generic Concept | Your Domain |
|---|---|
| Entity (Alex Hormozi) | Main subject: product, user, project |
| Apex Score (8.5/100) | Primary metric |
| Neural Data (9 files) | Data volume / complexity |
| Top Skill | Primary category or strength |
| Surgical DNA (sliders) | Attribute breakdown (3-5 axes) |
| Power Words (tags) | Tags, features, capabilities |
| Mode Panel | Current status / active mode |
| Sistema Operacional (cards) | Capabilities, features, rules |
| Rhetorical Arsenal (cards w/ quotes) | Tools, strategies, items with descriptions |

**How to adapt:**
1. Replace entity name/avatar/role with your domain's primary subject
2. Map 3-4 key metrics to stat cards
3. Pick 3-5 slider axes for the DNA Panel (always with mono labels, progress bars, and tag groups)
4. Write 4+ system cards (icon + title + description + optional quote)
5. The Mode Panel always shows current active state/mode

## Preset 2: Admin Analytics

Focused on data visualization and metrics tracking.

**Best for:** SaaS admin, e-commerce analytics, marketing dashboards.

**Default theme:** Dark (light works well too).

**Layout composition:**
```
TOP BAR: Logo + App Name + Nav + Filters + Theme Toggle
STATS ROW: 4-6 stat cards (revenue, users, conversion, growth)
TAB BAR: Overview | Revenue | Users | Products | Settings
NO SIDEBAR (full-width content)
CONTENT:
  Row 1: [Chart card (2/3)] + [Top items list card (1/3)]
  Row 2: 3-col stat breakdown (stat cards with trend indicators)
  Section "Recent Activity": Data table with sortable headers
  Section "Quick Actions": 4-col info cards
```

**Key differences from Control Center:**
- No sidebar — tabs control all navigation
- Data table replaces card grid for transactional data
- Chart placeholder cards (note: describe chart intent, use recharts/Chart.js if available)
- Trend indicators on stat cards: `↑ 12%` in green or `↓ 3%` in red

**Stat card with trend — structure:**
```
┌──────────────────┐
│ REVENUE          │ ← mono, text-xs, text-muted
│ R$ 45k           │ ← text-3xl, weight-bold, text-heading
│ ↑ 12.5%          │ ← text-sm, semantic-green, weight-semibold
└──────────────────┘
```
Trend color: `var(--semantic-green)` for positive, `var(--semantic-red)` for negative.

## Preset 3: Ops Cockpit

Real-time monitoring with status indicators and alert feeds.

**Best for:** DevOps, server monitoring, IoT, logistics tracking.

**Default theme:** Dark (strongly recommended).

**Layout composition:**
```
TOP BAR: Logo + OPS COCKPIT subtitle + Nav + Alert counter badge + Theme Toggle + [● OPERATIONAL] / [⚠ DEGRADED] badge
STATS ROW: Status-colored stat cards (green = healthy, red = alerts, amber = warnings)
NO TAB BAR (single view, dense)
SIDEBAR (compact, 180px):
  Section: SYSTEMS — list of systems with status dots (●green, ●red, ●amber)
  Section: FILTERS — checkbox filters
CONTENT (3-column grid):
  Col 1: Alert feed (stacked event cards, newest first)
  Col 2: System status cards (grid of status cards with pulse animation)
  Col 3: Quick stats + Mode Panel (stacked)
```

**Alert feed card:**
```
┌───────────────────────────────────────┐
│ ⚠  12:34  [CRITICAL badge]          │
│ Server db-prod-01 CPU at 98%         │
│ Triggered by: auto-monitor            │
└───────────────────────────────────────┘
```
- Left border: 3px solid `var(--semantic-red)` (or amber/green)
- Timestamp: mono, `--text-xs`, `--text-muted`

**Status card with pulse:**
```
┌──────────────────┐
│  MONO LABEL      │
│  ●  ONLINE       │ ← green dot with pulseGlow animation
│  CPU: 45%  ███░  │
│  MEM: 72%  █████ │
│  DISK: 31% ██░░  │
└──────────────────┘
```

## Preset 4: CRM / Contact Manager

Entity-centric with list-detail split view.

**Best for:** CRM, contact management, customer support, HR.

**Default theme:** Light (dark optional).

**Layout composition:**
```
TOP BAR: Logo + CRM subtitle + Nav + Search input + Theme Toggle
TAB BAR: Contacts | Companies | Deals | Pipeline | Settings
LIST-DETAIL SPLIT:
  List (340px): Contact cards (avatar 40px + name + role + status badge)
  Detail: Profile Header (compact) + Stat cards + Sub-tabs (Info | History | Notes)
```

**Contact list item:**
```
┌──────────────────────────────────────┐
│ [Avatar 40px]  Name               ● │
│                Role, Company         │
│                Last: 2 days ago      │
└──────────────────────────────────────┘
```
Active: `border-left: 3px solid var(--accent)`, `background: var(--bg-elevated)`

## How an Agent Uses a Preset

1. **User says:** "Build me an inventory management dashboard"
2. **Agent reads:** `design/SKILL.md` → classifies as "Dashboard"
3. **Agent reads:** `foundations/SKILL.md` → gets CSS variables
4. **Agent reads:** `components/SKILL.md` → gets building blocks
5. **Agent reads:** `patterns/SKILL.md` → gets Dashboard Shell layout
6. **Agent reads:** `dashboards/SKILL.md` → picks **Premium Control Center** preset
7. **Agent maps domain:**
   - Entity → Product
   - Apex Score → Stock Health Score
   - DNA Panel → Product metrics (stock level, turnover, margin)
   - System Cards → Features (auto-restock, alerts, tracking, sync)
   - Mode Panel -> "Intelligent Management" / current operational mode
8. **Agent builds** the interface using all tokens and patterns, in whatever technology the agent is targeting

## Mixing Presets

Presets can be combined. Common mixes:

- **Control Center + Analytics**: DNA panels at top, data tables below
- **Analytics + CRM**: Stats row + split view with table on left, detail on right
- **Ops Cockpit + Control Center**: Alert feed sidebar + Mode Panel + DNA metrics

Always use the Dashboard Shell from patterns as the outer frame.
