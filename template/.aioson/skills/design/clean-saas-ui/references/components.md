# Components — Clean SaaS UI

All components must use tokens from `design-tokens.md`. Never hardcode values. Never invent a new variant without a domain reason.

---

## 1. Table (first-class citizen)

Tables are the most important component in this skill. Treat them with the same care you would a hero section in a marketing page.

```
┌─────────────────────────────────────────────────────────┐
│ ☐  Column A ↕   Column B ↕   Status      Actions       │  ← sticky header
├─────────────────────────────────────────────────────────┤
│ ☐  Row data    Row data     ● Active     [Edit][Delete] │  ← actions on hover
│ ☐  Row data    Row data     ○ Inactive                  │
│ ☐  Row data    Row data     ⚠ Warning                   │
├─────────────────────────────────────────────────────────┤
│ Showing 1–25 of 143    [← Prev]  1 2 3 ...  [Next →]   │  ← pagination footer
└─────────────────────────────────────────────────────────┘
```

**Anatomy:**
- Header: `bg-surface`, `border-bottom: 1px var(--border-medium)`, `position: sticky; top: 0`, `text-sm font-medium text-secondary uppercase tracking-wide`
- Row height: 48px (comfortable) or 40px (compact mode)
- Row hover: `bg-elevated`
- Striped variant: alternate rows `bg-void` / `bg-surface`
- Checkbox column: 40px, left-aligned
- Sort indicators: `↕` inactive, `↑`/`↓` active with accent color
- Inline actions: appear on row hover, right-aligned, `control-xs` height
- Bulk action bar: slides in below header when rows selected, `bg-accent-dim border-y border-accent`
- Pagination: `flex between`, `text-sm text-secondary`, page buttons `control-sm`
- Column resize handles: `4px drag zone` at column edge
- Expandable rows: `▸` toggle, expanded area uses `bg-elevated` with inner padding

---

## 2. Filter Bar

```
[ Search...  🔍 ]  [ Status ▾ ]  [ Date range ▾ ]  [ Owner ▾ ]  ×2 active  [Clear all]
```

- Container: `bg-surface border-b border-default px-6 py-3`
- Search input: `control-md`, left icon, `w-64`
- Filter dropdowns: `control-md`, label + chevron
- Active filter badges: `bg-accent-dim text-accent text-xs px-2 py-0.5 rounded-full` with `×` dismiss
- Clear all: `text-sm text-secondary hover:text-primary`

---

## 3. Sidebar

```
┌───────────────────┐
│ [Logo] Product    │  ← 56px top bar
├───────────────────┤
│ ▸ Dashboard       │
│ ▸ Contacts        │  ← active item: blue left border 2px + bg-elevated
│   ├ Leads         │
│   └ Accounts      │  ← sub-items indented 16px
│ ▸ Reports         │
│ ▸ Settings        │
├───────────────────┤
│ [Avatar] J. Smith │  ← user footer
└───────────────────┘
```

- Width: `256px` fixed, `bg-surface border-r border-default`
- Nav group label: `text-xs font-semibold text-muted uppercase tracking-wider mb-1 px-3`
- Nav item: `height: 36px px-3 flex items-center gap-2 text-sm text-primary rounded-md`
- Active item: `border-l-2 border-accent bg-elevated text-accent font-medium` (no pl adjustment needed if border is inside)
- Hover item: `bg-elevated`
- Sub-items: `pl-8` indent, `text-sm text-secondary`, same hover/active states
- Collapsible: toggle `▸`/`▾` with `150ms ease` transition
- User footer: `border-t border-default px-3 py-3 mt-auto`, avatar 32px + name + role

---

## 4. Page Header

```
[ Breadcrumb > Trail ]

Contacts                                    [Export]  [+ New Contact]
Active CRM contacts                         (secondary action) (primary action)
```

- Container: `px-6 py-5 border-b border-default`
- Breadcrumbs: `text-sm text-secondary` with `/` separator, active item `text-primary`
- Title: `text-2xl font-bold text-heading tracking-normal`
- Subtitle: `text-sm text-secondary mt-0.5`
- Actions: right-aligned, `gap-2`, secondary button + primary button

---

## 5. Stat Card

```
┌──────────────────────────┐
│ Monthly Revenue     [⋯]  │
│ $48,250              ↑   │
│              +12.3%      │
│ ▁▂▃▄▅▆▇█  sparkline     │
└──────────────────────────┘
```

- Container: `bg-surface border border-default rounded-lg p-4 shadow-xs`
- Label: `text-sm text-secondary font-medium`
- Number: `text-3xl font-bold text-heading tracking-normal mt-1`
- Trend: `text-sm font-medium` — green for positive, red for negative, inline with icon `↑`/`↓`
- Sparkline: `height: 32px`, accent color, no axes, no labels
- Overflow menu: `control-xs` icon button, top-right

---

## 6. Badge

```
● Active       ○ Inactive     ⚠ Warning     ✕ Cancelled     ℹ Draft     ● Custom
```

- Height: `20px`
- Padding: `px-2`
- Font: `text-xs font-medium`
- Radius: `radius-full`
- 6 semantic variants:
  - `success`: `bg-semantic-success-dim text-semantic-success`
  - `warning`: `bg-semantic-warning-dim text-semantic-warning`
  - `danger`: `bg-semantic-danger-dim text-semantic-danger`
  - `info`: `bg-accent-dim text-accent`
  - `neutral`: `bg-semantic-neutral-dim text-secondary`
  - `default`: `bg-elevated text-primary border border-default`
- Optional leading dot `●` 6px with matching color

---

## 7. Button

```
[Primary]    [Secondary]    [Ghost]    [Danger]    [Icon only]
```

- Height: `control-md` (36px) default, `control-sm` (32px) small, `control-lg` (40px) large
- Radius: `radius-md` (6px)
- Font: `text-sm font-medium`
- Padding: `px-4`
- **Primary**: `bg-accent text-accent-contrast hover:bg-accent-strong`
- **Secondary**: `bg-surface text-primary border border-medium hover:bg-elevated`
- **Ghost**: `text-primary hover:bg-elevated` (no border, no bg)
- **Danger**: `bg-semantic-danger text-white hover:bg-red-700`
- **Icon only**: `w-9 h-9 p-0 flex items-center justify-center` (for control-md)
- Disabled: `opacity-50 cursor-not-allowed`
- Loading: spinner replaces leading icon, text unchanged

---

## 8. Form Group

```
Label *
[___________________________]  ← input control-md
Helper text or error message
```

- Label: `text-sm font-medium text-primary mb-1`
- Required marker: `text-semantic-danger ml-0.5`
- Input: `control-md w-full border border-medium rounded-md px-3 text-sm text-primary bg-surface`
- Input focus: `outline-none ring-2 ring-accent/20 border-accent`
- Helper text: `text-xs text-secondary mt-1`
- Error: `text-xs text-semantic-danger mt-1` — border becomes `border-semantic-danger`
- Select: same as input + trailing chevron icon

---

## 9. Dropdown Menu

```
┌──────────────────┐
│ ✏ Edit           │
│ ⧉ Duplicate      │
├──────────────────┤
│ 🗑 Delete        │  ← destructive: text-semantic-danger
└──────────────────┘
```

- Container: `bg-surface border border-default rounded-lg shadow-md py-1 min-w-48`
- Item: `height: 36px px-3 flex items-center gap-2 text-sm text-primary hover:bg-elevated cursor-pointer`
- Divider: `border-t border-default my-1`
- Destructive item: `text-semantic-danger hover:bg-semantic-danger-dim`
- Leading icon: 16px, `text-secondary` (except destructive)

---

## 10. Modal

```
┌────────────────────────────────────────┐
│ Modal Title                         ✕  │  ← header border-b
│────────────────────────────────────────│
│                                        │
│   Content area                         │
│                                        │
│────────────────────────────────────────│
│                   [Cancel]  [Confirm]  │  ← footer border-t
└────────────────────────────────────────┘
```

- Container: `bg-surface rounded-xl shadow-lg max-w-[560px] w-full`
- Header: `px-6 py-4 border-b border-default flex justify-between items-center`
- Title: `text-lg font-semibold text-heading`
- Close button: `control-xs ghost`
- Body: `px-6 py-5`
- Footer: `px-6 py-4 border-t border-default flex justify-end gap-2`
- Backdrop: `bg-black/40 fixed inset-0`
- Max height: `80vh` with internal scroll

---

## 11. Toast

```
┌──────────────────────────────────────────┐
│ ‖ Your changes were saved successfully.  │ ← success: green left border 4px
└──────────────────────────────────────────┘
```

- Container: `bg-surface border border-default rounded-lg shadow-md px-4 py-3 max-w-sm`
- Left border: `4px solid` matching semantic color
- Icon: 16px semantic color
- Message: `text-sm text-primary`
- Auto-dismiss: 5s, progress bar optional
- Position: `fixed bottom-4 right-4`
- Variants: success / warning / danger / info (same structure, different border + icon color)

---

## 12. Tabs

```
Overview    Contacts    Activity    Documents
─────────────────────────────────────────────
              ‾‾‾‾‾‾‾‾  ← active tab: 2px accent bottom border
```

- Container: `border-b border-default`
- Tab item: `px-4 py-2 text-sm font-medium text-secondary hover:text-primary cursor-pointer`
- Active tab: `text-accent border-b-2 border-accent -mb-px`
- Count badge: `ml-1.5 bg-elevated text-xs px-1.5 rounded-full`

---

## 13. Breadcrumbs

```
Contacts  /  Acme Corp  /  Overview
```

- Container: `flex items-center gap-1 text-sm`
- Item: `text-secondary hover:text-primary`
- Separator: `text-muted` — `/`
- Active (last): `text-primary font-medium` (not a link)

---

## 14. Avatar

- Sizes: 24px / 32px / 40px / 48px
- Radius: `radius-full`
- Image: `object-cover`
- Fallback: initials, `bg-accent-dim text-accent font-semibold`
- Group: `-ml-2` overlap, `border-2 border-surface`
- Max visible in group: 4, then `+N` chip

---

## 15. Tooltip

- Container: `bg-gray-900 text-white text-xs rounded-md px-2 py-1 shadow-sm`
- Max width: `200px`
- Delay: 400ms before showing
- Always appears above target unless obstructed

---

## 16. Progress Bar

```
[██████████░░░░░░░]  67%
```

- Container: `bg-elevated rounded-full h-1.5`
- Fill: `bg-accent rounded-full h-1.5`
- Semantic fill variants: success (green), warning (amber), danger (red)
- Label: `text-xs text-secondary ml-2` (optional)

---

## 17. Toggle Switch

```
●──  OFF         ──●  ON
```

- Container: `w-10 h-5` (40×20px), `rounded-full`
- Off state: `bg-border-strong`
- On state: `bg-accent`
- Thumb: `w-4 h-4 bg-white rounded-full shadow-xs` — translates `150ms ease`
- Label: `text-sm text-primary ml-2`

---

## 18. Empty State

```
        [geometric illustration]

        No contacts yet

        Start by importing your contacts
        or adding them manually.

              [+ Add Contact]
```

- Container: `flex flex-col items-center justify-center py-16 px-6`
- Illustration: simple geometric SVG — clean, not hand-drawn, not emoji
- Title: `text-lg font-semibold text-heading mt-4`
- Description: `text-sm text-secondary text-center max-w-xs mt-1`
- CTA: primary button `mt-6`

---

## 19. Loading Spinner

- Size: `20px` circle
- Border: `2px solid var(--border-medium)`
- Active arc: `border-top-color: var(--accent)`
- Animation: `spin 0.8s linear infinite`

---

## 20. Skeleton

- Container matches the real element's shape and size
- Background: `bg-elevated` with `animate-pulse`
- Text skeleton: `h-4 rounded-md` (varies)
- Card skeleton: full card shape with header + body regions
- Table skeleton: rows with alternating cell widths

---

## Component interaction states (all components)

Every interactive component must handle:

| State | Treatment |
|-------|-----------|
| Default | As specified above |
| Hover | `bg-elevated` or `border-medium` shift |
| Focus | `ring-2 ring-accent/20 border-accent` |
| Active/pressed | `scale(0.99)` 60ms |
| Disabled | `opacity-50 cursor-not-allowed` |
| Loading | Spinner + muted label |
| Error | `border-semantic-danger` + error text |
