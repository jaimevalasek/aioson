# Design Tokens — Aurora Command UI

This is the source of truth for all CSS custom properties. Apply shared tokens on `:root`, theme-specific tokens on `[data-theme]`. Never hardcode values in components.

---

## Typography strategy

Default to **system fonts** first. Add Google Fonts when the agent determines the stack and context justifies them.

**System font stack (default — works everywhere, no CDN needed):**
```css
--font-display: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", system-ui, sans-serif;
--font-body:    -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", system-ui, sans-serif;
--font-mono:    ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
```

**Google Fonts (optional — use when building a polished product explicitly):**
```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');

--font-display: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
--font-body:    'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
--font-mono:    'JetBrains Mono', ui-monospace, monospace;
```

---

## Complete CSS Variables

Include this full block in every Aurora Command project.

```css
/* ═══════════════════════════════════════════
   SHARED TOKENS — :root (non-theme-specific)
   ═══════════════════════════════════════════ */
:root {
  /* Typography */
  --font-display: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  --font-body:    -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  --font-mono:    ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;

  /* Font Sizes */
  --text-xs:   0.72rem;    /* 11.5px — mono labels, micro badges */
  --text-sm:   0.82rem;    /* 13px */
  --text-base: 0.95rem;    /* 15px — default body */
  --text-lg:   1rem;       /* 16px */
  --text-xl:   1.25rem;    /* 20px */
  --text-2xl:  1.6rem;     /* 25.6px */
  --text-3xl:  2.2rem;     /* 35px */
  --text-4xl:  3rem;       /* 48px — stat numbers */
  --text-5xl:  4rem;       /* 64px — hero headings */

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
  --tracking-wide:    0.04em;
  --tracking-wider:   0.08em;
  --tracking-widest:  0.12em;

  /* Line Height */
  --leading-none:    1;
  --leading-tight:   1.08;
  --leading-snug:    1.24;
  --leading-normal:  1.5;
  --leading-relaxed: 1.68;

  /* Spacing */
  --space-0:  0;
  --space-1:  0.25rem;   /* 4px */
  --space-2:  0.5rem;    /* 8px */
  --space-3:  0.75rem;   /* 12px */
  --space-4:  1rem;      /* 16px */
  --space-5:  1.25rem;   /* 20px */
  --space-6:  1.5rem;    /* 24px */
  --space-8:  2rem;      /* 32px */
  --space-10: 2.5rem;    /* 40px */
  --space-12: 3rem;      /* 48px */
  --space-16: 4rem;      /* 64px */
  --space-20: 5rem;      /* 80px */
  --space-24: 6rem;      /* 96px */
  --space-32: 8rem;      /* 128px — hero sections */

  /* Border Radius */
  --radius-sm:   0.375rem;   /* 6px — badges, chips */
  --radius-md:   0.625rem;   /* 10px — inputs, buttons */
  --radius-lg:   0.875rem;   /* 14px — small cards */
  --radius-xl:   1.125rem;   /* 18px — standard glass cards */
  --radius-2xl:  1.5rem;     /* 24px — large glass cards */
  --radius-3xl:  2rem;       /* 32px — hero glass cards */
  --radius-full: 9999px;     /* pills, avatars, toggles */

  /* Interactive element heights */
  --control-xs: 1.75rem;   /* 28px — compact chips */
  --control-sm: 2rem;      /* 32px — compact controls */
  --control-md: 2.5rem;    /* 40px — standard inputs */
  --control-lg: 2.75rem;   /* 44px — primary buttons */

  /* Layout */
  --sidebar-width: 210px;
  --content-sm:    480px;
  --content-md:    640px;
  --content-lg:    800px;
  --content-xl:    1024px;
  --content-max:   1280px;
  --nav-height:    60px;
  --nav-height-web: 68px;

  /* Transitions */
  --transition-fast:  140ms ease;
  --transition-base:  200ms ease;
  --transition-slow:  300ms cubic-bezier(0.16, 1, 0.3, 1);
  --transition-glass: backdrop-filter 300ms ease, background 300ms ease, border-color 300ms ease, box-shadow 300ms ease;
  --transition-hero:  600ms cubic-bezier(0.16, 1, 0.3, 1);
  --transition-theme: background 240ms ease, color 240ms ease, border-color 240ms ease, box-shadow 240ms ease;

  /* Focus */
  --focus-ring-width:  2px;
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
   DARK THEME (default)
   ═══════════════════════════════════════════ */
[data-theme="dark"] {
  /* ── Aurora Substrate ── */
  --bg-void:     #040609;
  --bg-base:     #060910;
  --bg-gradient: linear-gradient(135deg, #060910 0%, #0A0818 30%, #060C1A 70%, #08060F 100%);

  /* ── Dark Glass Surfaces ── */
  /* These are DARK TINTED — aurora shows through, not bright/white */
  --glass-shell:    rgba(8, 12, 22, 0.75);     /* top bar, sidebar */
  --glass-surface:  rgba(10, 14, 26, 0.65);    /* standard cards */
  --glass-elevated: rgba(14, 20, 36, 0.75);    /* hover, nested cards */
  --glass-overlay:  rgba(6, 10, 18, 0.85);     /* modals, drawers */

  /* ── Glass System Tokens ── */
  --glass-border:        rgba(255, 255, 255, 0.10);
  --glass-border-strong: rgba(255, 255, 255, 0.18);
  --glass-border-accent: rgba(0, 200, 232, 0.30);
  --glass-highlight:     linear-gradient(180deg, rgba(255,255,255,0.07) 0%, transparent 50%);

  /* Fallback (when backdrop-filter is unsupported) */
  --glass-fallback: rgba(8, 12, 22, 0.95);

  /* ── Blur Levels ── */
  --glass-blur-sm: blur(8px);    /* working surfaces, dense data panels */
  --glass-blur-md: blur(16px);   /* standard glass cards */
  --glass-blur-lg: blur(24px);   /* sidebar, top bar, elevated modals */
  --glass-blur-xl: blur(40px);   /* ambient field diffusion, media backdrops */

  /* ── Accents ── */
  --accent-primary:      #00C8E8;   /* teal-electric — operational, active states */
  --accent-violet:       #7C3AED;   /* violet — highlights, CTAs */
  --accent-gradient:     linear-gradient(135deg, #00C8E8, #7C3AED);
  --accent-primary-dim:  rgba(0, 200, 232, 0.15);
  --accent-violet-dim:   rgba(124, 58, 237, 0.15);
  --accent-glow:         rgba(0, 200, 232, 0.12);
  --accent-violet-glow:  rgba(124, 58, 237, 0.18);
  --accent-contrast:     #04090F;   /* text on accent background */

  /* ── Text ── */
  --text-heading:   #F0F4FA;
  --text-primary:   #C8D4E8;
  --text-secondary: #8898B0;
  --text-muted:     #556070;
  --text-accent:    #00C8E8;
  --text-inverse:   #04090F;

  /* ── Semantic Colors ── */
  --semantic-green:      #00D68F;
  --semantic-green-dim:  rgba(0, 214, 143, 0.15);
  --semantic-amber:      #F4A91D;
  --semantic-amber-dim:  rgba(244, 169, 29, 0.15);
  --semantic-red:        #FF5A67;
  --semantic-red-dim:    rgba(255, 90, 103, 0.15);
  --semantic-purple:     #A78BFA;
  --semantic-purple-dim: rgba(167, 139, 250, 0.15);
  --semantic-blue:       #38BDF8;
  --semantic-blue-dim:   rgba(56, 189, 248, 0.15);

  /* ── Shadows — teal-electric tinted ── */
  --shadow-sm:           0 1px 3px rgba(0, 0, 0, 0.30);
  --shadow-md:           0 8px 24px rgba(0, 0, 0, 0.40);
  --shadow-lg:           0 16px 48px rgba(0, 0, 0, 0.50);
  --shadow-glow:         0 0 30px rgba(0, 200, 232, 0.12), 0 8px 24px rgba(0, 0, 0, 0.40);
  --shadow-glow-strong:  0 0 50px rgba(0, 200, 232, 0.22), 0 0 20px rgba(0, 200, 232, 0.12);
  --shadow-violet-glow:  0 0 30px rgba(124, 58, 237, 0.20), 0 8px 24px rgba(0, 0, 0, 0.40);
  --shadow-inner:        inset 0 1px 0 rgba(255, 255, 255, 0.07);

  /* ── Borders (non-glass elements) ── */
  --border-subtle:        rgba(255, 255, 255, 0.06);
  --border-medium:        rgba(255, 255, 255, 0.10);
  --border-strong:        rgba(255, 255, 255, 0.16);
  --border-accent:        rgba(0, 200, 232, 0.26);
  --border-accent-strong: rgba(0, 200, 232, 0.50);

  /* Scrollbar */
  --scrollbar-track: #060910;
  --scrollbar-thumb: rgba(14, 20, 36, 0.90);
}

/* ═══════════════════════════════════════════
   LIGHT THEME (soft aurora — lavender-gray)
   ═══════════════════════════════════════════ */
[data-theme="light"] {
  /* ── Light Aurora Substrate ── */
  --bg-void:     #E5E4EF;
  --bg-base:     #EDEEF6;
  --bg-gradient: linear-gradient(135deg, #EDEEF6 0%, #E0DFEF 30%, #D8DEF0 70%, #EAE6F2 100%);

  /* ── White Glass Surfaces ── */
  --glass-shell:    rgba(255, 255, 255, 0.70);
  --glass-surface:  rgba(255, 255, 255, 0.60);
  --glass-elevated: rgba(255, 255, 255, 0.80);
  --glass-overlay:  rgba(255, 255, 255, 0.40);

  --glass-border:        rgba(255, 255, 255, 0.50);
  --glass-border-strong: rgba(255, 255, 255, 0.70);
  --glass-border-accent: rgba(0, 150, 180, 0.30);
  --glass-highlight:     linear-gradient(180deg, rgba(255,255,255,0.30) 0%, transparent 50%);

  --glass-fallback: rgba(255, 255, 255, 0.95);

  /* Blur levels same as dark */
  --glass-blur-sm: blur(8px);
  --glass-blur-md: blur(16px);
  --glass-blur-lg: blur(24px);
  --glass-blur-xl: blur(40px);

  /* ── Accents (shifted for light legibility) ── */
  --accent-primary:     #0096B0;
  --accent-violet:      #6D28D9;
  --accent-gradient:    linear-gradient(135deg, #0096B0, #6D28D9);
  --accent-primary-dim: rgba(0, 150, 176, 0.12);
  --accent-violet-dim:  rgba(109, 40, 217, 0.10);
  --accent-glow:        rgba(0, 150, 176, 0.10);
  --accent-violet-glow: rgba(109, 40, 217, 0.12);
  --accent-contrast:    #FFFFFF;

  /* ── Text ── */
  --text-heading:   #0F1520;
  --text-primary:   #2A3548;
  --text-secondary: #5A6880;
  --text-muted:     #8898A8;
  --text-accent:    #0096B0;
  --text-inverse:   #FFFFFF;

  /* ── Semantic Colors ── */
  --semantic-green:      #059669;
  --semantic-green-dim:  rgba(5, 150, 105, 0.10);
  --semantic-amber:      #D97706;
  --semantic-amber-dim:  rgba(217, 119, 6, 0.10);
  --semantic-red:        #DC2626;
  --semantic-red-dim:    rgba(220, 38, 38, 0.10);
  --semantic-purple:     #7C3AED;
  --semantic-purple-dim: rgba(124, 58, 237, 0.10);
  --semantic-blue:       #2563EB;
  --semantic-blue-dim:   rgba(37, 99, 235, 0.10);

  /* ── Shadows — tinted with light teal ── */
  --shadow-sm:          0 1px 3px rgba(0, 150, 176, 0.06);
  --shadow-md:          0 8px 24px rgba(0, 150, 176, 0.10);
  --shadow-lg:          0 16px 48px rgba(0, 150, 176, 0.14);
  --shadow-glow:        0 0 30px rgba(0, 150, 176, 0.12), 0 8px 24px rgba(15, 21, 32, 0.08);
  --shadow-glow-strong: 0 0 50px rgba(0, 150, 176, 0.20), 0 0 20px rgba(0, 150, 176, 0.10);
  --shadow-violet-glow: 0 0 30px rgba(109, 40, 217, 0.14), 0 8px 24px rgba(15, 21, 32, 0.08);
  --shadow-inner:       inset 0 1px 0 rgba(255, 255, 255, 0.50);

  /* ── Borders ── */
  --border-subtle:        rgba(15, 21, 32, 0.07);
  --border-medium:        rgba(15, 21, 32, 0.12);
  --border-strong:        rgba(15, 21, 32, 0.18);
  --border-accent:        rgba(0, 150, 176, 0.22);
  --border-accent-strong: rgba(0, 150, 176, 0.40);

  /* Scrollbar */
  --scrollbar-track: #EDEEF6;
  --scrollbar-thumb: rgba(200, 210, 230, 0.80);
}

/* ═══════════════════════════════════════════
   BASE STYLES
   ═══════════════════════════════════════════ */
html, body {
  min-height: 100vh;
  margin: 0;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Aurora substrate — must be on the root element */
body[data-theme], #app[data-theme], .aurora-shell[data-theme] {
  background: var(--bg-gradient);
  background-attachment: fixed;
  font-family: var(--font-body);
  color: var(--text-primary);
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

## Glass Tokens — Usage Guide

### The three glass levels

```css
/* Level 1 — Shell (sidebar, top bar) */
.glass-shell {
  background: var(--glass-shell);   /* dark: rgba(8,12,22,0.75) */
  backdrop-filter: var(--glass-blur-lg);
  border-color: var(--glass-border);
}

/* Level 2 — Surface cards (standard content containers) */
.glass-surface {
  background: var(--glass-surface);   /* dark: rgba(10,14,26,0.65) */
  backdrop-filter: var(--glass-blur-md);
  border-color: var(--glass-border);
}

/* Level 3 — Elevated (hover state, nested cards, modals) */
.glass-elevated {
  background: var(--glass-elevated);   /* dark: rgba(14,20,36,0.75) */
  backdrop-filter: var(--glass-blur-md);
  border-color: var(--glass-border-strong);
}
```

### Mandatory @supports fallback

Every glass surface must have a fallback for browsers that do not support `backdrop-filter`:

```css
.glass-card {
  background: var(--glass-fallback);   /* solid fallback */
}

@supports (backdrop-filter: blur(1px)) {
  .glass-card {
    background: var(--glass-surface);
    backdrop-filter: var(--glass-blur-md);
  }
}
```

### Top reflection pseudo-element

Every glass card must have the `::before` reflection. This is what makes the glass feel real.

```css
.glass-card {
  position: relative;
  overflow: hidden;
}
.glass-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 50%;
  background: var(--glass-highlight);
  pointer-events: none;
  border-radius: inherit;
}
```

---

## Typography Patterns

### Mono Rail — the command spine

The most distinctive element of this skill. Use it exclusively for section headers, stat labels, metadata rails, IDs, and timestamps.

```css
.mono-rail {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-widest);
  text-transform: uppercase;
  color: var(--text-muted);
}
```

**Do not overuse** — if every text element is uppercase mono, the command rails lose their authority.

### Display Heading

```css
.display-heading {
  font-family: var(--font-display);
  font-weight: var(--weight-bold);
  letter-spacing: var(--tracking-tight);
  line-height: var(--leading-tight);
  color: var(--text-heading);
}
/* Sizes: --text-5xl (hero) · --text-3xl (page title) · --text-2xl (section) · --text-xl (card title) */
```

### Stat Number (standard)

```css
.stat-number {
  font-family: var(--font-display);
  font-size: var(--text-4xl);
  font-weight: var(--weight-bold);
  line-height: var(--leading-none);
  color: var(--text-heading);
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum" 1;
}
```

### Gradient Stat Number (hero metric only)

Use for the single most important metric on the page — not all stats.

```css
.stat-number--gradient {
  background: var(--accent-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  font-size: var(--text-4xl);
  font-weight: var(--weight-bold);
  line-height: var(--leading-none);
  font-variant-numeric: tabular-nums;
}
```

### Body Text

```css
.body-text {
  font-family: var(--font-body);
  font-size: var(--text-base);
  font-weight: var(--weight-normal);
  line-height: var(--leading-relaxed);
  color: var(--text-primary);
}
```

---

## Token Scope Guardrails

**Rule 1:** Typography, spacing, radius, and transition tokens belong in `:root` — NOT in `[data-theme]`.

**Rule 2:** Theme-specific colors and glass surfaces belong in `[data-theme]`.

**Rule 3:** If `body` consumes `var(--font-body)`, that variable must exist in `:root` or a scope `body` inherits.

**Rule 4:** If the theme lives on a container (`.shell[data-theme]`), either keep typography in `:root`, or apply `font-family` directly on that shell element.

**Unsafe (font breaks silently):**
```css
/* WRONG — body cannot inherit from .shell */
.shell[data-theme="dark"] { --font-body: 'Inter', sans-serif; }
body { font-family: var(--font-body); }
```

**Safe:**
```css
:root { --font-body: 'Inter', system-ui, sans-serif; }
body { font-family: var(--font-body); }
.shell[data-theme="dark"] { --bg-base: #060910; }
```

---

## Compact Density Scale

For dashboards, admin panels, settings, and any dense operational UI.

### Card container scale

| Level | Use | Padding | Border Radius |
|---|---|---|---|
| L1 — page glass card | top-level section | `var(--space-5)` | `var(--radius-xl)` (18px) |
| L2 — nested glass card | card inside a card | `var(--space-4)` | `var(--radius-lg)` (14px) |
| L3 — inset block | disclosure body, info block | `10px` | `var(--radius-md)` (10px) |

Between L1 cards: `gap: var(--space-3)` (not `--space-6`).

### Form controls — operational context

```
Input  : px-3 py-2  text-xs  border-radius: var(--radius-md)  (~32px height)
Select : px-3 py-2  text-xs  border-radius: var(--radius-md)
Label  : font-mono text-[0.65rem]  mb: var(--space-1)
Button : px-3 py-2  text-xs  border-radius: var(--radius-md)
```

### Badges — compact

```
Status : px-2 py-0.5  text-[0.6rem]  rounded-full
Tag    : px-2 py-0.5  text-[0.58rem]  rounded-full
```

### List rows

```
Row padding : py-2 (8px)  — not py-3 or py-4
Row gap     : gap-2.5 (10px)
```

---

## Chart Palette

Consistent chart colors across all dashboards:

```css
--chart-1: var(--accent-primary);     /* #00C8E8 teal — primary series */
--chart-2: var(--accent-violet);      /* #7C3AED violet — secondary series */
--chart-3: var(--semantic-green);     /* #00D68F emerald — positive metric */
--chart-4: var(--semantic-amber);     /* #F4A91D amber — warning/neutral */
--chart-5: var(--semantic-purple);    /* #A78BFA purple — tertiary series */
--chart-6: var(--semantic-blue);      /* #38BDF8 blue — informational */

/* Area/gradient chart fills */
--chart-fill-1: linear-gradient(180deg, rgba(0, 200, 232, 0.25) 0%, rgba(0, 200, 232, 0) 100%);
--chart-fill-2: linear-gradient(180deg, rgba(124, 58, 237, 0.20) 0%, rgba(124, 58, 237, 0) 100%);
--chart-fill-3: linear-gradient(180deg, rgba(0, 214, 143, 0.20) 0%, rgba(0, 214, 143, 0) 100%);
--chart-fill-4: linear-gradient(180deg, rgba(244, 169, 29, 0.20) 0%, rgba(244, 169, 29, 0) 100%);
```

Chart rules:
- Area charts: always gradient fill (top color → transparent), never solid fill. The fade reveals the glass panel below.
- Grid lines: `rgba(255,255,255,0.06)` on dark, `rgba(0,0,0,0.06)` on light.
- Tooltips: glass card (glass-surface + blur-sm + luminous border) — never a solid white box.
- Axis labels: `var(--text-muted)`, `var(--text-xs)`.

---

## Interaction Guardrails

1. Primary actions on accent backgrounds must use `var(--accent-contrast)`.
2. Hover states must preserve or improve text contrast — never reduce it.
3. Focus styles must be visible on both themes: `outline: var(--focus-ring-width) solid var(--accent-primary)` with `outline-offset: var(--focus-ring-offset)`.
4. Glass hover: `var(--glass-surface)` → `var(--glass-elevated)`, `200ms`.
5. One accent gradient family and two neutral text tiers — do not add decorative colors.

---

## Non-Negotiable Rules

1. Aurora gradient substrate is mandatory. Never place glass panels over a solid background.
2. Dark glass opacity must reveal the aurora — keep alpha at or below 0.75.
3. Use the token system — never freestyle hex values.
4. Teal-electric and violet are the only accents — never introduce a third accent color.
5. Mono labels are structural rails — use them for section headers, stat labels, and metadata only.
6. Always include `@supports (backdrop-filter: blur(1px))` fallback for every glass surface.
7. One gradient stat number per viewport (the hero metric). Do not gradient-text all stats.
8. Compact density for operational UI — never carry marketing spacing into dense dashboards.
9. Shadows must be tinted with `rgba(0,200,232,...)` — never solid black shadows.
10. Every glass card must pass WCAG AA for body text over its dark glass surface.
