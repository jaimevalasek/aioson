# Patterns — Page Layouts (Cognitive Core UI)

Requires `design-tokens.md` + `components.md` loaded first.

These patterns define how to compose full pages. All use CSS variables from design-tokens.md.

---

## 1. Dashboard Shell

The base layout for any admin/overview interface.

```
┌────────────────────────────────────────────────────────┐
│  TOP BAR (sticky, bg-void, border-bottom)              │
├────────────────────────────────────────────────────────┤
│  STATS ROW: [StatCard] [StatCard] [StatCard] [StatCard]│
├────────────────────────────────────────────────────────┤
│  TAB BAR (full width, border-bottom)                   │
├───────────┬────────────────────────────────────────────┤
│ SIDEBAR   │  CONTENT                                   │
│ 200px     │  ┌─ Section Header ──────────────────┐    │
│ tree nav  │  │ Card Grid (auto-fill, 260px min)  │    │
│           │  └───────────────────────────────────┘    │
│           │  ┌─ Section Header ──────────────────┐    │
│           │  │ Card Grid                         │    │
│           │  └───────────────────────────────────┘    │
└───────────┴────────────────────────────────────────────┘
```

**CSS skeleton:**
```css
.shell { min-height: 100vh; background: var(--bg-base); font-family: var(--font-body); }
.stats-row { display: flex; gap: var(--space-3); padding: var(--space-5) var(--space-5) 0; flex-wrap: wrap; }
.main-layout { display: flex; min-height: calc(100vh - 230px); }
.sidebar { width: 200px; flex-shrink: 0; border-right: 1px solid var(--border-subtle); padding: var(--space-4); transition: var(--transition-theme); }
.content { flex: 1; padding: var(--space-4) var(--space-5); overflow-y: auto; }
.card-grid { display: grid; gap: var(--space-4); grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
.section { margin-bottom: var(--space-8); }
```

**Variant — with feature panels (2-col below stats):**
```css
.feature-row { display: grid; grid-template-columns: 1fr 280px; gap: var(--space-4); padding: var(--space-4) var(--space-5); }
```

---

## 2. Detail / Profile Page

For viewing a single entity (person, product, contact, project).

```
┌────────────────────────────────────────────────────────┐
│  TOP BAR                                               │
├────────────────────────────────────────────────────────┤
│  Breadcrumbs: Gallery → Entity Name                    │
│  PROFILE HEADER                                        │
│  ┌───────────────────────────────────────────────────┐ │
│  │ [Avatar 96px] NAME (text-3xl, black)              │ │
│  │               Role (accent, italic)               │ │
│  │               ✦ Tagline                           │ │
│  │                                                   │ │
│  │  [StatCard] [StatCard] [StatCard]    [Badge][Badge]│ │
│  └───────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────┤
│  TAB BAR (General | DNA | Communication | History | ...) │
├───────────┬────────────────────────────────────────────┤
│ SIDEBAR   │  TAB CONTENT                               │
│ 180px     │  Varies per tab:                           │
│           │  — Card grid (2-col)                       │
│           │  — DNA analysis panels                     │
│           │  — History table                           │
└───────────┴────────────────────────────────────────────┘
```

**Profile Header styles:**
```css
.profile-header {
  padding: var(--space-5) var(--space-6);
  background: var(--bg-base);
  border-bottom: 1px solid var(--border-subtle);
  transition: var(--transition-theme);
}
.profile-avatar {
  width: 96px; height: 96px;
  border-radius: var(--radius-lg);
  border: 2px solid var(--border-subtle);
  object-fit: cover;
}
.profile-name {
  font-family: var(--font-display); font-weight: var(--weight-bold);
  font-size: var(--text-3xl); color: var(--text-heading);
  letter-spacing: var(--tracking-tight); line-height: var(--leading-tight);
}
.profile-role {
  color: var(--accent); font-style: italic; font-size: var(--text-base);
}
.profile-tagline {
  font-family: var(--font-mono); font-size: var(--text-xs);
  color: var(--text-muted); letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
}
.profile-stats { display: flex; gap: var(--space-3); margin-top: var(--space-4); flex-wrap: wrap; }
.profile-badges { display: flex; gap: var(--space-2); align-items: center; }
```

**Featured quote block (inside tab content):**
```css
.quote-block {
  padding: var(--space-8) var(--space-6);
  text-align: center;
  border-bottom: 1px solid var(--border-subtle);
}
.quote-text {
  font-family: var(--font-display); font-size: var(--text-xl);
  font-weight: var(--weight-medium); font-style: italic;
  color: var(--text-primary); line-height: var(--leading-snug);
  max-width: 680px; margin: 0 auto;
}
.quote-attribution {
  font-family: var(--font-mono); font-size: var(--text-xs);
  color: var(--text-muted); letter-spacing: var(--tracking-wider);
  text-transform: uppercase; margin-top: var(--space-3);
}
```

---

## 3. Settings / Config Page

Apply the **Compact Density** scale from `design-tokens.md` throughout. Settings pages are operational UI, not marketing — no generous whitespace.

```
┌────────────────────────────────────────────────────────┐
│  TOP BAR                                               │
├───────────┬────────────────────────────────────────────┤
│ SIDEBAR   │  SETTINGS TITLE (text-2xl, no description) │
│           │                                            │
│ General   │  ┌─ Entity grid ──────────────────────┐   │
│ Security  │  │ [Card 280px] [Card 280px] [Card]    │   │ ← 3-col auto-fill
│ Billing   │  │  name + ID + status badges          │   │
│ Team      │  │  [Ativar btn] [Editar btn]          │   │
│ API       │  └─────────────────────────────────────┘   │
│           │                                            │
│           │  ┌─ Section card (p-4 rounded-[22px]) ─┐   │
│           │  │ eyebrow (mono xs) + title (text-base)│   │
│           │  │ [row] dot · name  model  badges Editar│  │ ← divide-y py-2
│           │  │ [row] dot · name  model  badges Editar│  │
│           │  │  ▸ Sync / secondary tool (details)  │   │ ← collapsed
│           │  └─────────────────────────────────────┘   │
│           │                                            │
│           │  ┌─ Danger Zone Card ──────────────────┐   │
│           │  │ border: var(--semantic-red-dim)      │   │
│           │  └─────────────────────────────────────┘   │
└───────────┴────────────────────────────────────────────┘
```

**Page heading:** `text-2xl` max — no verbose description subtitle on the page header.

**Entity cards (projects, providers, squads):**
- Grid: `grid-cols-[repeat(auto-fill,minmax(280px,1fr))]`, `gap: var(--space-3)`
- Card: `rounded-[18px] p-3`
- Name: `text-sm font-semibold truncate`
- ID: `font-mono text-[0.58rem] truncate`
- Status badges: `px-2 py-0.5 text-[0.58rem]`
- Actions: compact row at bottom — `py-1.5 text-[0.62rem]`

**Add/Edit forms → Modal pattern (not inline expansion):**
```
+ Adicionar button → opens modal (max-w-md, centered, backdrop)
Editar button      → opens same modal pre-filled
Never use accordion/RevealPanel inside entity cards
```

**Section cards (provider lists, license, LLM config):**
- Card: `rounded-[22px] p-4`
- Header row: eyebrow + title + right-side control (select, badge) in one flex row
- File path or meta: `font-mono text-[0.62rem] truncate` — one line below title, no card for it
- Row items: `divide-y divide-[border]` with `py-2`, `text-xs` names, `text-[0.65rem]` models
- Edit button: `px-2.5 py-1 text-[0.65rem] rounded-xl`

**Disclosure pattern for secondary tools:**
```html
<details class="rounded-[16px] border bg-elevated mt-3">
  <summary> <!-- flex: label + status badge + action button in one row --> </summary>
  <div class="border-t px-3 pb-3 pt-2">
    <!-- compact diff rows or secondary form -->
  </div>
</details>
```

**Form inputs inside modals and cards:**
- Input/Select: `px-3 py-2 text-xs rounded-xl`
- Label: `text-[0.65rem] mb-0.5`
- Submit button: `w-full px-3 py-2 text-xs rounded-xl`

---

## 4. Auth Page (Login / Register)

```
┌────────────────────────────────────────────────────────┐
│           bg-void (full viewport, dark)                 │
│                                                         │
│         ┌─ Card max-w: 420px ─────────────────┐        │
│         │  [Logo] AppName (mono, weight-bold)  │        │
│         │  SUBTITLE (mono, xs, muted, upper)   │        │
│         │                                      │        │
│         │  MONO LABEL: EMAIL                   │        │
│         │  [Input]                             │        │
│         │  MONO LABEL: PASSWORD                │        │
│         │  [Input]                             │        │
│         │  [Primary Button: full width]        │        │
│         │  divider ─── ou ───                  │        │
│         │  [Secondary Button: OAuth]           │        │
│         │  Link: esqueceu / criar conta        │        │
│         └──────────────────────────────────────┘        │
│         radial glow behind card (accent-glow)           │
└────────────────────────────────────────────────────────┘
```

```css
.auth-shell {
  min-height: 100vh; background: var(--bg-void);
  display: flex; align-items: center; justify-content: center;
  position: relative;
}
.auth-glow {
  position: absolute;
  width: 600px; height: 600px; border-radius: 50%;
  background: radial-gradient(circle, var(--accent-glow) 0%, transparent 70%);
  pointer-events: none;
}
.auth-card {
  background: var(--bg-surface); border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl); padding: var(--space-8);
  width: 100%; max-width: 420px; position: relative; z-index: 1;
}
```

---

## 5. List-Detail (Split View)

```
┌────────────────────────────────────────────────────────┐
│  TOP BAR                                               │
├────────────────────────────────────────────────────────┤
│  TAB BAR + Filter badges                               │
├──────────────────────┬─────────────────────────────────┤
│  LIST 340px          │  DETAIL PANEL (flex: 1)         │
│  ┌──────────────┐    │  Profile Header (compact)       │
│  │ Item (active)│◄───│  border-left: 3px accent        │
│  ├──────────────┤    │  Stat Cards row                 │
│  │ Item         │    │  Tab sub-navigation              │
│  ├──────────────┤    │  Content (cards, table, DNA)    │
│  │ Item         │    │                                 │
│  └──────────────┘    │                                 │
└──────────────────────┴─────────────────────────────────┘
```

```css
.list-panel { width: 340px; flex-shrink: 0; border-right: 1px solid var(--border-subtle); overflow-y: auto; }
.list-item { padding: var(--space-4); border-bottom: 1px solid var(--border-subtle); cursor: pointer; transition: var(--transition-theme); }
.list-item:hover { background: var(--bg-elevated); }
.list-item.active { background: var(--bg-elevated); border-left: 3px solid var(--accent); }
.detail-panel { flex: 1; overflow-y: auto; }
```

---

## Responsive Rules (all patterns)

```css
@media (max-width: 768px) {
  .main-layout { flex-direction: column; }
  .sidebar { width: 100%; border-right: none; border-bottom: 1px solid var(--border-subtle); }
  .card-grid { grid-template-columns: 1fr; }
  .stats-row { flex-direction: column; }
  .list-panel { width: 100%; border-right: none; border-bottom: 1px solid var(--border-subtle); }
}
@media (min-width: 768px) and (max-width: 1024px) {
  .card-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (min-width: 1024px) {
  .card-grid { grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
}
```
