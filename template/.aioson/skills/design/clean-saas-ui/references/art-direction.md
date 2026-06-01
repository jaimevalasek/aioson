# Art Direction — Clean SaaS UI

Read this file for any page-level work where differentiation matters: apps, dashboards, landing pages, websites, and major flows.

This file exists to stop Clean SaaS UI from collapsing into the same generic Tailwind admin starter every time.

The system stays coherent, but the expression must change with the product, the user, and the dominant task.

---

## Core Rule

**Same system, different expressions.**

Keep the Clean SaaS DNA:
- systematic component consistency
- neutral professional blue accent
- data-friendly medium density
- light-first with controlled shadows and borders

But do **not** keep the exact same composition, header, table layout, or sidebar structure from product to product.

---

## Mandatory Pre-Build Outputs

Before designing a full page, produce all of these:

1. **Human**
   The real person using this page right now.

2. **Main action**
   The one decision, action, or question that matters most on this screen.

3. **Felt quality**
   Concrete words such as `efficient`, `trustworthy`, `methodical`, `calm`, `precise`, `grounded`, `authoritative`.
   Never use empty labels like `clean`, `modern`, or `professional`.

4. **Domain vocabulary**
   At least 5 concepts from the product's world.
   Example for CRM: `deal`, `pipeline`, `stage`, `account`, `close date`.

5. **Color world**
   At least 5 tones or materials that belong to that product world.
   Example for finance: cool gray, document white, navy authority, amber caution, muted green approval.

6. **Defaults to avoid**
   Name 3 obvious UI choices that would make the result generic.

7. **Signature move**
   One memorable design detail that can appear in at least 5 places on the page.

If you cannot produce these seven, you are not ready to compose the page.

---

## Expression Modes

Choose **one primary mode** per screen. You may borrow a small amount from a secondary mode only after the main expression is clear.

### 1. Structured Workspace

Use for:
- project management
- task trackers
- team collaboration tools
- sprint boards

Feel:
- organized
- reliable
- efficient
- predictable

Composition:
- sidebar navigation clara, content area com sections bem definidas
- consistent header actions at the top of the page
- breadcrumb trail always present
- collapsible sidebar with smooth transition

Visual cues:
- subtle borders for section separation (not shadows)
- badge chips para status
- avatar groups para team
- inline editable fields

Signature ideas:
- breadcrumb + page title always together, never separated
- task row with hover reveal for inline actions
- sidebar with labeled collapsible groups

---

### 2. Data Table Pro

Use for:
- CRM
- ERP
- analytics admin
- inventory management
- financial data

Feel:
- efficient
- scannable
- precise
- trustworthy

Composition:
- table as the dominant page element
- filter bar horizontal acima da table
- bulk actions bar aparece ao selecionar linhas
- column sorting e pagination clean abaixo

Visual cues:
- alternating row backgrounds sutis (gray-50 / white)
- sticky header da tabela
- inline action buttons aparecem no hover da row
- status badges inside cells

Signature ideas:
- advanced filter builder como drawer lateral
- column customization via dropdown
- inline cell editing com confirmation bar

---

### 3. Form-Heavy Admin

Use for:
- settings
- configuration panels
- user management
- compliance tools
- onboarding setup

Feel:
- clear
- methodical
- helpful
- professional

Composition:
- multi-section forms with strict vertical rhythm
- section dividers com header e description
- inline validation em tempo real
- sticky save bar in the footer

Visual cues:
- label-above-input pattern consistent across every form
- helper text em toda parte (text-xs, text-secondary)
- section cards with their own header
- progress indicator se for multi-step

Signature ideas:
- auto-save indicator no header ("Saved 2 min ago")
- left-side section navigation for long forms
- inline diff preview for critical changes

---

### 4. Metric Hub

Use for:
- metrics dashboards
- reporting
- KPI tracking
- executive views
- analytics

Feel:
- informative
- clean
- authoritative
- at-a-glance

Composition:
- KPI cards → charts → tables (hierarquia vertical)
- date range selector proeminente no header
- export actions no header
- drill-down available in every section

Visual cues:
- system chart colors (blue-first, not default library colors)
- stat cards with trends (+ / - and semantic color)
- sparklines inline nos stat cards
- chart backgrounds levemente separados do bg-base

Signature ideas:
- comparison toggle (vs previous period)
- goal progress indicators em stat cards
- drill-down table abaixo do chart

---

### 5. Onboarding Flow

Use for:
- setup wizards
- account creation
- integration config
- first-run experiences

Feel:
- guided
- clear
- encouraging
- professional

Composition:
- step progress bar no topo
- content area centralizado, max-width 480–560px
- clear actions in the footer (back + continue)
- completion feedback visual

Visual cues:
- numbered steps com estado visual (done / active / pending)
- completion percentage ou progress bar
- simple geometric illustrations (not hand-drawn)
- contextual help tooltips

Signature ideas:
- checklist progress card como elemento central
- integration logo grid for connections
- inline preview of what will be created

---

## Signature Move Library

Pick one and commit. Do not apply three weak gestures when one strong one would do.

### Apps & Dashboards
- filter bar always visible above any table - never hidden in a modal
- consistent page header: left (title + breadcrumb) + right (actions) - same structure on every page
- sidebar active item: blue left border 2px + bg-elevated — sem glow, sem gradiente

### Data Heavy Pages
- sticky table header with sort indicators always visible
- bulk action bar that slides up when rows are selected
- inline row actions that appear on hover (not in a separate dropdown)

### Forms & Settings
- section cards com header azul (text accent) + description text-secondary
- auto-save indicator discreto no corner superior direito
- input helper text always present, even before an error

### Marketing Pages
- product screenshot com shadow-lg + radius-xl ligeiramente inclinado (2–3deg)
- feature grid with icon + title + description - clean, with no card background
- pricing table com coluna "most popular" com accent border e slight elevation

---

## Anti-Generic Tests

Run these before presenting:

### Template Test
Remove the logo and change the accent color. Does the result still look like a specific product, or does it look like a Tailwind UI starter?

If it looks like a starter: add one signature move.

### Density Test
Are there wasted empty zones OR areas that feel cramped?

Clean SaaS = equilibrium — nem esparramo nem cramped. Medium density aplicado consistentemente.

### Consistency Test
- All inputs have the same height (36px control-md)?
- All buttons have the same radius (6px)?
- All tables have the same header style?
- All page headers follow the same left/right pattern?

Inconsistency is a system failure, not a style choice.

### Blue Test (unique to this skill)
Does the accent blue feel like "a chosen blue" or "default bootstrap blue"?

The accent blue should have a personality — `#2563EB` (blue-600) is sharp and decisive, not soft and corporate. It should feel intentional, not default.

### Domain Test
Hide the product name. Does the page still feel like it was built for this specific product world? Or could it be any SaaS product?

If generic: inject domain vocabulary into labels, section names, empty states, and helper text.

---

## Variation Rules By Surface Type

### Apps
- Do not always start with a stat row — some apps start with a table, a queue, or a task list.
- Do not always use a fixed left sidebar if a top nav fits better (simpler products).
- Active state must be unambiguous — blue left border is the primary indicator, not color alone.

### Dashboards
- Avoid four equal KPI cards as the only opening move.
- Prefer one focal story above the fold: MRR trend, team workload, queue status, or alert count.
- Charts must use the system's chart palette — never the library's default rainbow.

### Forms & Settings
- Every section must have a clear header — do not run form fields without grouping.
- Validation must be inline — not only on submit.
- Long forms must have a section navigation mechanism (sidebar links or step tabs).

### Landing Pages
- Do not default to centered hero + three feature cards + testimonials + CTA.
- Use at least one composition break: offset screenshot, split layout, or alternating sections.
- Every section should have a different job — not the same card rhythm repeated.

---

## Non-Negotiable Expression Rules

1. One accent color (blue), one expression mode, one signature move per page.
2. The page must feel designed for this specific domain, not for "a SaaS product."
3. Typography carries the neutral character — weight and tracking, not family variety.
4. Borders and backgrounds separate zones — shadows are minimal and purposeful.
5. If the design feels familiar, push the composition before adding decoration.
