# Design Tokens — Cognitive Core UI

All components and patterns depend on these tokens. Load this file first before any other reference.

---

## Typography strategy

Default to **system fonts** first. Add Google Fonts only when the agent decides the stack, product context, and delivery constraints justify them.

**System font stack (default — works everywhere, no CDN needed):**
```css
--font-display: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", system-ui, sans-serif;
--font-body:    -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", system-ui, sans-serif;
--font-mono:    ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
```

**Google Fonts (optional - use when building the Synthetic Minds aesthetic explicitly):**
```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');

--font-display: 'Inter', system-ui, sans-serif;
--font-body:    'Inter', system-ui, sans-serif;
--font-mono:    'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
```

---

## Complete CSS Variables

Include this full block in every project.

```css
/* ═══════════════════════════════════════════
   SHARED TOKENS — in :root (see Token Scope Guardrails)
   ═══════════════════════════════════════════ */
:root {
  /* Typography (set defaults here; override with Google Fonts if needed) */
  --font-display: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", system-ui, sans-serif;
  --font-body:    -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", system-ui, sans-serif;
  --font-mono:    ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;

  /* Font Sizes */
  --text-xs:   0.72rem;   /* 11.5px — micro labels, mono uppercase */
  --text-sm:   0.82rem;   /* 13px */
  --text-base: 0.95rem;   /* 15px — default body */
  --text-lg:   1rem;      /* 16px */
  --text-xl:   1.25rem;   /* 20px */
  --text-2xl:  1.6rem;    /* 25.6px */
  --text-3xl:  2.2rem;    /* 35px */
  --text-4xl:  3rem;      /* 48px — stat numbers */
  --text-5xl:  4rem;      /* 64px — hero headings */

  /* Font Weights */
  --weight-light:    300;
  --weight-normal:   400;
  --weight-medium:   500;
  --weight-semibold: 600;
  --weight-bold:     700;
  --weight-black:    800;

  /* Letter Spacing */
  --tracking-tight:   0;
  --tracking-normal:  0;
  --tracking-wide:    0;
  --tracking-wider:   0;
  --tracking-widest:  0;

  /* Line Height */
  --leading-none:    1;
  --leading-tight:   1.08;
  --leading-snug:    1.24;
  --leading-normal:  1.5;
  --leading-relaxed: 1.68;

  /* Spacing */
  --space-0:  0;
  --space-1:  0.25rem;
  --space-2:  0.5rem;
  --space-3:  0.75rem;
  --space-4:  1rem;
  --space-5:  1.25rem;
  --space-6:  1.5rem;
  --space-8:  2rem;
  --space-10: 2.5rem;
  --space-12: 3rem;
  --space-16: 4rem;
  --space-20: 5rem;
  --space-24: 6rem;

  /* Border Radius */
  --radius-sm:   0.375rem;
  --radius-md:   0.625rem;
  --radius-lg:   0.875rem;
  --radius-xl:   1.125rem;
  --radius-2xl:  1.5rem;
  --radius-full: 9999px;

  /* Interactive element heights */
  --control-xs: 1.75rem;
  --control-sm: 2rem;
  --control-md: 2.5rem;
  --control-lg: 3rem;

  /* Transitions */
  --transition-fast:  140ms ease;
  --transition-base:  200ms ease;
  --transition-slow:  300ms ease;
  --transition-theme: background 240ms ease, color 240ms ease, border-color 240ms ease, box-shadow 240ms ease;

  /* Shared interaction tokens */
  --focus-ring-width: 2px;
  --focus-ring-offset: 2px;

  /* Z-index */
  --z-base:     0;
  --z-elevated: 10;
  --z-dropdown: 20;
  --z-sticky:   30;
  --z-modal:    50;
  --z-toast:    60;
}

/* ═══════════════════════════════════════════
   DARK THEME
   ═══════════════════════════════════════════ */
[data-theme="dark"] {
  /* Backgrounds — layered navy depth */
  --bg-void:     #060910;
  --bg-base:     #0b0f15;
  --bg-surface:  #111827;
  --bg-elevated: #172133;
  --bg-overlay:  #223148;

  /* Borders */
  --border-subtle:        rgba(255, 255, 255, 0.06);
  --border-medium:        rgba(255, 255, 255, 0.10);
  --border-strong:        rgba(255, 255, 255, 0.16);
  --border-accent:        rgba(34, 211, 238, 0.26);
  --border-accent-strong: rgba(34, 211, 238, 0.50);

  /* Text */
  --text-heading:   #f7fafc;
  --text-primary:   #dbe4ee;
  --text-secondary: #95a3b8;
  --text-muted:     #6b778c;
  --text-accent:    #34d8ff;
  --text-inverse:   #081018;

  /* Accent — teal/cyan */
  --accent:        #22d3ee;
  --accent-strong: #09bfe0;
  --accent-dim:    rgba(34, 211, 238, 0.16);
  --accent-glow:   rgba(34, 211, 238, 0.12);
  --accent-subtle: rgba(34, 211, 238, 0.08);
  --accent-hover:  #06b6d4;
  --accent-contrast: #07131a;

  /* Semantic */
  --semantic-green:      #16c784;
  --semantic-green-dim:  rgba(22, 199, 132, 0.18);
  --semantic-amber:      #f4a91d;
  --semantic-amber-dim:  rgba(244, 169, 29, 0.18);
  --semantic-red:        #ff5a67;
  --semantic-red-dim:    rgba(255, 90, 103, 0.18);
  --semantic-blue:       #59a7ff;
  --semantic-blue-dim:   rgba(89, 167, 255, 0.18);
  --semantic-purple:     #a78bfa;
  --semantic-purple-dim: rgba(167, 139, 250, 0.18);

  /* Shadows */
  --shadow-sm:          0 1px 2px rgba(0, 0, 0, 0.22);
  --shadow-md:          0 8px 24px rgba(0, 0, 0, 0.32);
  --shadow-lg:          0 16px 40px rgba(0, 0, 0, 0.44);
  --shadow-glow:        0 0 0 1px rgba(34, 211, 238, 0.05), 0 10px 28px rgba(3, 12, 22, 0.42);
  --shadow-glow-strong: 0 0 30px rgba(34, 211, 238, 0.20), 0 0 10px rgba(34, 211, 238, 0.10);

  /* Scrollbar */
  --scrollbar-track: #0b0f15;
  --scrollbar-thumb: #172133;
}

/* ═══════════════════════════════════════════
   LIGHT THEME
   ═══════════════════════════════════════════ */
[data-theme="light"] {
  /* Backgrounds — layered white/gray */
  --bg-void:     #edf3f9;
  --bg-base:     #f5f8fc;
  --bg-surface:  #ffffff;
  --bg-elevated: #eaf0f6;
  --bg-overlay:  #dde8f1;

  /* Borders */
  --border-subtle:        rgba(12, 23, 40, 0.07);
  --border-medium:        rgba(12, 23, 40, 0.12);
  --border-strong:        rgba(12, 23, 40, 0.18);
  --border-accent:        rgba(14, 165, 233, 0.22);
  --border-accent-strong: rgba(14, 165, 233, 0.42);

  /* Text */
  --text-heading:   #0f172a;
  --text-primary:   #334155;
  --text-secondary: #61748a;
  --text-muted:     #8b9aae;
  --text-accent:    #0f766e;
  --text-inverse:   #f8fbff;

  /* Accent — deeper teal for AA-friendly buttons and links */
  --accent:        #0f766e;
  --accent-strong: #115e59;
  --accent-dim:    rgba(15, 118, 110, 0.10);
  --accent-glow:   rgba(15, 118, 110, 0.08);
  --accent-subtle: rgba(15, 118, 110, 0.05);
  --accent-hover:  #115e59;
  --accent-contrast: #f8fbff;

  /* Semantic */
  --semantic-green:      #059669;
  --semantic-green-dim:  rgba(5, 150, 105, 0.10);
  --semantic-amber:      #d97706;
  --semantic-amber-dim:  rgba(217, 119, 6, 0.10);
  --semantic-red:        #dc2626;
  --semantic-red-dim:    rgba(220, 38, 38, 0.10);
  --semantic-blue:       #2563eb;
  --semantic-blue-dim:   rgba(37, 99, 235, 0.10);
  --semantic-purple:     #7c3aed;
  --semantic-purple-dim: rgba(124, 58, 237, 0.10);

  /* Shadows */
  --shadow-sm:          0 1px 2px rgba(15, 23, 42, 0.04);
  --shadow-md:          0 12px 30px rgba(15, 23, 42, 0.08);
  --shadow-lg:          0 20px 48px rgba(15, 23, 42, 0.12);
  --shadow-glow:        0 0 0 1px rgba(14, 165, 233, 0.04), 0 14px 28px rgba(15, 23, 42, 0.06);
  --shadow-glow-strong: 0 4px 16px rgba(14, 165, 233, 0.12);

  /* Scrollbar */
  --scrollbar-track: #f5f8fc;
  --scrollbar-thumb: #cbd5e1;
}

/* ═══════════════════════════════════════════
   BASE STYLES
   ═══════════════════════════════════════════ */
body {
  font-family: var(--font-body);
  margin: 0;
  -webkit-font-smoothing: antialiased;
}

[data-theme] {
  color: var(--text-primary);
  background: var(--bg-base);
  transition: var(--transition-theme);
}

*, *::before, *::after { box-sizing: border-box; }

/* Custom scrollbar */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: var(--scrollbar-track); }
::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: var(--radius-full); }
::-webkit-scrollbar-thumb:hover { background: var(--border-medium); }
```

---

## Token Scope Guardrails

**This is the most critical implementation rule.** Font and typography bugs almost always come from scope violations.

**Rule 1:** Put typography, spacing, radius, and transition tokens in `:root` — not in `[data-theme]`.

**Rule 2:** Put theme-specific colors and surface values on the theme owner (`[data-theme]`).

**Rule 3:** If `body` consumes `var(--font-body)`, that variable must exist in `:root` or in a scope `body` inherits.

**Rule 4:** If the theme lives on a shell container instead of `body`, either keep typography in `:root`, or apply `font-family` directly on that shell.

**Safe — typography in :root:**
```css
:root { --font-body: system-ui, sans-serif; }
body { font-family: var(--font-body); }
.shell[data-theme="dark"] { --bg-base: #0b0f15; }
```

**Safe — theme on shell, font applied there:**
```css
:root { --font-body: system-ui, sans-serif; }
.shell[data-theme="dark"] { --bg-base: #0b0f15; font-family: var(--font-body); }
```

---

## Interaction Guardrails

These rules exist to stop the most common quality failures: illegible hover states, washed-out light theme buttons, and decorative overload.

1. Primary actions on accent backgrounds must use `var(--accent-contrast)`, not `var(--bg-base)`.
2. Hover states may change brightness, but must preserve or improve text contrast.
3. Focus styles must be visible on both themes. Minimum: `outline: var(--focus-ring-width) solid var(--accent)` with `outline-offset: var(--focus-ring-offset)`.
4. If a control background becomes lighter on hover, its foreground must be re-evaluated. Do not assume the base text color still works.
5. Favor one accent family and two neutral text tiers over adding extra decorative colors.

**Unsafe (font breaks silently):**
```css
/* WRONG */
.shell[data-theme="dark"] { --font-body: 'Inter', sans-serif; } /* defined on child */
body { font-family: var(--font-body); } /* body can't inherit from .shell */
```

---

## Typography Patterns

### Mono Label — the system's most distinctive element

```css
font-family: var(--font-mono);
font-size: var(--text-xs);
font-weight: var(--weight-semibold);
letter-spacing: 0;
text-transform: uppercase;
color: var(--text-secondary);
```

Use for: section headers, stat labels, nav labels, badge text, timestamps, IDs.
**Do not overuse** — if everything is uppercase mono, nothing has emphasis.

### Display Heading

```css
font-family: var(--font-display);
font-weight: var(--weight-bold);
letter-spacing: 0;
line-height: var(--leading-tight);
color: var(--text-heading);
```

Sizes: `--text-5xl` (hero) · `--text-3xl` (page title) · `--text-2xl` (section) · `--text-xl` (card title).

### Stat Number

```css
font-family: var(--font-display);
font-size: var(--text-4xl);
font-weight: var(--weight-bold);
line-height: var(--leading-none);
color: var(--text-heading);
font-variant-numeric: tabular-nums;
```

Pair with suffix: `font-size: var(--text-lg); color: var(--text-muted)`.

### Body Text

```css
font-family: var(--font-body);
font-size: var(--text-base);
font-weight: var(--weight-normal);
line-height: var(--leading-relaxed);
color: var(--text-primary);
```

### Primary Action

```css
background: var(--accent);
color: var(--accent-contrast);
border: none;
font-family: var(--font-body);
font-size: var(--text-sm);
font-weight: var(--weight-semibold);
letter-spacing: 0;
```

Use mono only for short command-like labels. Default buttons should stay in the body family for better readability.

### Numbers in tables and lists

```css
font-variant-numeric: tabular-nums;
font-feature-settings: "tnum" 1;
```

---

## Alignment Rules

1. Keep text on a shared rhythm — headings, helpers, and numbers should align to the same left edge inside a card.
2. Avoid micro-copy smaller than `--text-xs` unless it is true metadata.
3. In dashboards: one card = one dominant metric or one dominant action. Do not stack equal-priority text blocks.
4. Above the fold: prefer 1 primary content block + 1 support block + 1 contextual rail — not a wall of equal cards.
5. Mono labels are separators, not decoration. If everything is uppercase mono, nothing is important.
6. In brownfield: fix cascade and token-scope errors before changing colors, layout, or density.
7. Interactive controls must align on shared heights (`--control-sm`, `--control-md`, `--control-lg`) and shared text baselines.

---

## Mode Guidance

### Dashboard / Admin
- Dark theme is often the best default.
- Dense, compact spacing — tighter headings, shorter line-height, less breathing room than marketing.
- Use mono labels selectively for status, timestamps, identifiers, section rails.
- Favor grouped blocks over large card matrices above the fold.

### Landing Page / Website
- Much more vertical breathing room (use `--space-16` to `--space-24` between sections).
- Prefer display + body pairings over mono-heavy layouts.
- Accent glow sparingly — trust typography and section rhythm.
- One message per section. No dashboard chrome (sidebars, status feeds, dense badges).

---

## Admin / Operational Compact Density

Use these values whenever building settings pages, admin panels, config screens, entity lists, or any dense operational UI. These replace the more generous defaults in those contexts.

### Card container scale

| Level | Use | Padding | Border Radius |
|---|---|---|---|
| L1 — page card | top-level section card | `var(--space-4)` (16px) | `22px` |
| L2 — inset section | section inside a page card | `var(--space-3)` (12px) | `18px` |
| L3 — inset block | info block, disclosure body | `10px` | `14px` |

Between L1 cards: `gap: var(--space-3)` — not `--space-4` or `--space-6`.

### Card heading inside a panel

```
Eyebrow  : text-[0.68rem] uppercase tracking-normal color: var(--text-muted)
Title    : text-base (15px) font-semibold  ← never text-xl or text-2xl inside a card
Meta     : font-mono text-[0.62rem] color: var(--text-muted) truncate  ← path, ID, single-line
```

**Do not write verbose description paragraphs inside admin cards.** Replace with: mono path text, status badges, or a single collapsed `<details>` block.

### Form controls — admin context

```
Input    : px-3 py-2  text-xs  border-radius: var(--radius-md)  (height ~32px)
Select   : px-3 py-2  text-xs  border-radius: var(--radius-md)
Label    : text-[0.65rem]  mb: 2px (mb-0.5)
Button   : px-3 py-2  text-xs  border-radius: var(--radius-md)
```

These override the default `px-4 py-3 text-sm rounded-2xl` — that scale is for consumer/marketing UI, not admin density.

### List / row items

```
Row padding  : py-2 (8px top/bottom)  — not py-3 or py-4
Row gap      : gap-2.5 (10px)
Provider dot : h-2 w-2  — not h-2.5 w-2.5
Name column  : w-24 text-xs font-medium  — not w-28 text-sm
```

### Badges / chips — compact

```
Status badge : px-2 py-0.5  text-[0.6rem]  rounded-full
Tag badge    : px-2 py-0.5  text-[0.58rem]  rounded-full
```

Never use `px-3 py-1 text-xs` for inline status chips — that scale is for navigation and page-level badges.

### Entity grid (projects, providers, squads)

Never full-width stack same-type entities. Use:

```css
grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
/* or explicit: sm:grid-cols-2 lg:grid-cols-3 */
gap: var(--space-3);
```

### Modal pattern for add / edit forms

Entity add/edit forms belong in a modal, not inline expansion (accordion/RevealPanel):

```
Modal max-width : 448px (28rem)
Modal padding   : var(--space-5)
Overlay         : bg-black/50 backdrop-blur-sm
Border radius   : var(--radius-xl) — 22px
Max height      : 90vh  overflow-y: auto
```

### Disclosure / collapse pattern

Secondary tools (sync assistant, cloud connect, advanced config) go behind `<details>`:

```
Summary row : flex items-center justify-between px-3 py-2.5
              label (text-xs) + status badge (left) + action button (right)
Body        : border-t px-3 pb-3 pt-2
```

Never keep secondary tools always visible — they crowd the primary content.

### Anti-patterns in admin/operational UI

- `p-6 rounded-[28px]` on inner section cards — too large, use L1/L2/L3 scale above
- `text-xl` or `text-2xl` headings inside settings/admin cards
- Verbose description paragraphs (`text-sm leading-7`) in every card — remove them
- Full-width stacked cards for entity lists (projects, providers) — use the grid
- Inline accordion/RevealPanel for add/edit forms — use a modal
- `px-4 py-3 text-sm` for inputs and buttons in dense admin context

---

## Non-Negotiable Rules

1. Use the token system — never freestyle random hex values.
2. Keep at most **three surface levels** visible in the same viewport.
3. Teal/cyan is the **only accent** — never change it.
4. Do not default to Google Fonts when system stacks deliver the right tone.
5. Do not use mono labels as the main reading experience.
6. Keep **one obvious focal block** per viewport.
7. Fix token scope and cascade bugs before redesigning colors or layout.
8. In admin/operational UI, apply the **Compact Density** scale — never carry consumer/marketing spacing into dense panels.
9. Validate contrast and hover/focus parity before considering a screen finished.
10. Validate layout mechanics before polishing: shell regions need `minmax(0, ...)`, scroll panes need `min-height: 0`, and cards/media/controls need stable dimensions.
