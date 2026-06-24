# Design Tokens — Warm Craft UI

All components and patterns depend on these tokens. Load this file first before any other reference.

---

## Typography strategy

Default to **system fonts** first. Add Google Fonts only when the agent decides the stack, product context, and delivery constraints justify them.

**System font stack (default — works everywhere, no CDN needed):**
```css
--font-display: Georgia, "Times New Roman", "Noto Serif", serif;
--font-body:    -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", system-ui, sans-serif;
--font-mono:    ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
```

**Google Fonts (optional — use when building the full Warm Craft aesthetic explicitly):**
```css
@import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Inter:wght@400;500;600;700&display=swap');

--font-display: 'Source Serif 4', Georgia, serif;
--font-body:    'Inter', system-ui, sans-serif;
--font-mono:    ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
```

---

## Complete CSS Variables

Include this full block in every project.

```css
/* ═══════════════════════════════════════════
   SHARED TOKENS — in :root (see Token Scope Guardrails)
   ═══════════════════════════════════════════ */
:root {
  /* Typography */
  --font-display: Georgia, "Times New Roman", "Noto Serif", serif;
  --font-body:    -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", system-ui, sans-serif;
  --font-mono:    ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;

  /* Font Sizes */
  --text-xs:   0.75rem;   /* 12px — small labels, metadata */
  --text-sm:   0.875rem;  /* 14px */
  --text-base: 1rem;      /* 16px — default body */
  --text-lg:   1.125rem;  /* 18px */
  --text-xl:   1.25rem;   /* 20px */
  --text-2xl:  1.5rem;    /* 24px */
  --text-3xl:  2rem;      /* 32px */
  --text-4xl:  2.5rem;    /* 40px — stat numbers */
  --text-5xl:  3.5rem;    /* 56px — hero headings */

  /* Font Weights */
  --weight-normal:   400;
  --weight-medium:   500;
  --weight-semibold: 600;
  --weight-bold:     700;

  /* Letter Spacing */
  --tracking-tight:  0;
  --tracking-normal: 0;
  --tracking-wide:   0.02em;
  --tracking-wider:  0.05em;

  /* Line Height */
  --leading-none:    1;
  --leading-tight:   1.2;
  --leading-snug:    1.35;
  --leading-normal:  1.6;
  --leading-relaxed: 1.75;

  /* Spacing — 4px base rhythm */
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

  /* Border Radius — generously rounded */
  --radius-sm:   0.375rem;  /* 6px — badges, small chips */
  --radius-md:   0.5rem;    /* 8px — inputs, small buttons */
  --radius-lg:   0.75rem;   /* 12px — buttons, medium cards */
  --radius-xl:   1rem;      /* 16px — cards, panels */
  --radius-2xl:  1.5rem;    /* 24px — large cards, modals */
  --radius-3xl:  2rem;      /* 32px — hero sections, feature cards */
  --radius-full: 9999px;    /* pills, avatars */

  /* Interactive element heights */
  --control-sm: 2rem;     /* 32px — compact buttons */
  --control-md: 2.5rem;   /* 40px — default buttons and inputs */
  --control-lg: 3rem;     /* 48px — large buttons, prominent inputs */
  --control-xl: 3.5rem;   /* 56px — hero CTAs */

  /* Transitions */
  --transition-fast:  120ms ease;
  --transition-base:  200ms ease;
  --transition-slow:  320ms ease;
  --transition-theme: background 200ms ease, color 200ms ease, border-color 200ms ease, box-shadow 200ms ease;

  /* Focus */
  --focus-ring-width: 2px;
  --focus-ring-offset: 2px;

  /* Z-index */
  --z-base:     0;
  --z-elevated: 10;
  --z-dropdown: 20;
  --z-sticky:   30;
  --z-modal:    50;
  --z-toast:    60;

  /* Content widths */
  --content-sm:   640px;   /* narrow reading column */
  --content-md:   768px;   /* medium content */
  --content-lg:   1024px;  /* standard content */
  --content-xl:   1280px;  /* wide content */
  --content-full: 1440px;  /* max container */
}

/* ═══════════════════════════════════════════
   LIGHT THEME (default)
   ═══════════════════════════════════════════ */
[data-theme="light"] {
  /* Backgrounds — layered warm whites */
  --bg-void:     #F8F6F3;
  --bg-base:     #FDFCFA;
  --bg-surface:  #FFFFFF;
  --bg-elevated: #F3F1ED;
  --bg-overlay:  #EAE7E2;

  /* Borders */
  --border-subtle:        rgba(45, 52, 54, 0.06);
  --border-medium:        rgba(45, 52, 54, 0.12);
  --border-strong:        rgba(45, 52, 54, 0.20);
  --border-accent:        rgba(224, 122, 95, 0.24);
  --border-accent-strong: rgba(224, 122, 95, 0.48);

  /* Text */
  --text-heading:   #2D3436;
  --text-primary:   #4A5568;
  --text-secondary: #8896A6;
  --text-muted:     #B0BCC7;
  --text-accent:    #C4563A;
  --text-inverse:   #FDFCFA;

  /* Accent — terracotta/warm coral */
  --accent:          #E07A5F;
  --accent-strong:   #C4563A;
  --accent-dim:      rgba(224, 122, 95, 0.12);
  --accent-glow:     rgba(224, 122, 95, 0.08);
  --accent-subtle:   rgba(224, 122, 95, 0.05);
  --accent-hover:    #D4694E;
  --accent-contrast: #FFFFFF;

  /* Secondary accent — sage green (for success, secondary actions) */
  --accent-secondary:     #7C9A82;
  --accent-secondary-dim: rgba(124, 154, 130, 0.12);

  /* Tertiary — warm amber (for warnings, highlights) */
  --accent-tertiary:     #D4A76A;
  --accent-tertiary-dim: rgba(212, 167, 106, 0.12);

  /* Semantic */
  --semantic-green:      #5A9E6F;
  --semantic-green-dim:  rgba(90, 158, 111, 0.12);
  --semantic-amber:      #D4A76A;
  --semantic-amber-dim:  rgba(212, 167, 106, 0.12);
  --semantic-red:        #D35D6E;
  --semantic-red-dim:    rgba(211, 93, 110, 0.12);
  --semantic-blue:       #5B8DB8;
  --semantic-blue-dim:   rgba(91, 141, 184, 0.12);
  --semantic-purple:     #9B8EC4;
  --semantic-purple-dim: rgba(155, 142, 196, 0.12);

  /* Shadows — warm-tinted, soft */
  --shadow-xs:   0 1px 2px rgba(45, 40, 35, 0.04);
  --shadow-sm:   0 1px 3px rgba(45, 40, 35, 0.06), 0 1px 2px rgba(45, 40, 35, 0.04);
  --shadow-md:   0 4px 12px rgba(45, 40, 35, 0.08), 0 2px 4px rgba(45, 40, 35, 0.04);
  --shadow-lg:   0 12px 32px rgba(45, 40, 35, 0.10), 0 4px 8px rgba(45, 40, 35, 0.04);
  --shadow-xl:   0 20px 48px rgba(45, 40, 35, 0.12), 0 8px 16px rgba(45, 40, 35, 0.04);
  --shadow-glow: 0 0 0 1px rgba(224, 122, 95, 0.06), 0 8px 24px rgba(45, 40, 35, 0.08);

  /* Scrollbar */
  --scrollbar-track: #F3F1ED;
  --scrollbar-thumb: #D4CFC8;

  /* Focus ring */
  --focus-ring-color: rgba(224, 122, 95, 0.40);
}

/* ═══════════════════════════════════════════
   DARK THEME
   ═══════════════════════════════════════════ */
[data-theme="dark"] {
  /* Backgrounds — layered warm darks */
  --bg-void:     #1A1814;
  --bg-base:     #211F1B;
  --bg-surface:  #2A2824;
  --bg-elevated: #353330;
  --bg-overlay:  #403E3A;

  /* Borders */
  --border-subtle:        rgba(245, 240, 235, 0.06);
  --border-medium:        rgba(245, 240, 235, 0.10);
  --border-strong:        rgba(245, 240, 235, 0.16);
  --border-accent:        rgba(240, 150, 125, 0.22);
  --border-accent-strong: rgba(240, 150, 125, 0.44);

  /* Text */
  --text-heading:   #F5F0EB;
  --text-primary:   #D4CBC2;
  --text-secondary: #9A9088;
  --text-muted:     #6B6460;
  --text-accent:    #F0967D;
  --text-inverse:   #1A1814;

  /* Accent — lighter terracotta for dark backgrounds */
  --accent:          #F0967D;
  --accent-strong:   #E07A5F;
  --accent-dim:      rgba(240, 150, 125, 0.14);
  --accent-glow:     rgba(240, 150, 125, 0.10);
  --accent-subtle:   rgba(240, 150, 125, 0.06);
  --accent-hover:    #F4A68E;
  --accent-contrast: #1A1814;

  /* Secondary accent — sage green */
  --accent-secondary:     #8DB896;
  --accent-secondary-dim: rgba(141, 184, 150, 0.14);

  /* Tertiary — warm amber */
  --accent-tertiary:     #E0BD82;
  --accent-tertiary-dim: rgba(224, 189, 130, 0.14);

  /* Semantic */
  --semantic-green:      #6BB87A;
  --semantic-green-dim:  rgba(107, 184, 122, 0.14);
  --semantic-amber:      #E0BD82;
  --semantic-amber-dim:  rgba(224, 189, 130, 0.14);
  --semantic-red:        #E07080;
  --semantic-red-dim:    rgba(224, 112, 128, 0.14);
  --semantic-blue:       #7CAED4;
  --semantic-blue-dim:   rgba(124, 174, 212, 0.14);
  --semantic-purple:     #B0A2D8;
  --semantic-purple-dim: rgba(176, 162, 216, 0.14);

  /* Shadows */
  --shadow-xs:   0 1px 2px rgba(0, 0, 0, 0.16);
  --shadow-sm:   0 1px 3px rgba(0, 0, 0, 0.20), 0 1px 2px rgba(0, 0, 0, 0.12);
  --shadow-md:   0 4px 12px rgba(0, 0, 0, 0.24), 0 2px 4px rgba(0, 0, 0, 0.12);
  --shadow-lg:   0 12px 32px rgba(0, 0, 0, 0.32), 0 4px 8px rgba(0, 0, 0, 0.16);
  --shadow-xl:   0 20px 48px rgba(0, 0, 0, 0.40), 0 8px 16px rgba(0, 0, 0, 0.20);
  --shadow-glow: 0 0 0 1px rgba(240, 150, 125, 0.06), 0 8px 24px rgba(0, 0, 0, 0.28);

  /* Scrollbar */
  --scrollbar-track: #211F1B;
  --scrollbar-thumb: #403E3A;

  /* Focus ring */
  --focus-ring-color: rgba(240, 150, 125, 0.40);
}

/* ═══════════════════════════════════════════
   BASE STYLES
   ═══════════════════════════════════════════ */
body {
  font-family: var(--font-body);
  font-size: var(--text-base);
  line-height: var(--leading-normal);
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
::-webkit-scrollbar-track { background: var(--scrollbar-track); border-radius: var(--radius-full); }
::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: var(--radius-full); }
::-webkit-scrollbar-thumb:hover { background: var(--border-medium); }

/* Focus rings */
:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
  border-radius: var(--radius-md);
}
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
:root { --font-body: system-ui, sans-serif; --font-display: Georgia, serif; }
body { font-family: var(--font-body); }
.shell[data-theme="light"] { --bg-base: #FDFCFA; }
```

**Safe — theme on shell, font applied there:**
```css
:root { --font-body: system-ui, sans-serif; }
.shell[data-theme="light"] { --bg-base: #FDFCFA; font-family: var(--font-body); }
```

---

## Interaction Guardrails

These rules exist to stop the most common quality failures: invisible hover states, washed-out accents, and contrast issues on warm backgrounds.

1. Primary actions on accent backgrounds must use `var(--accent-contrast)`, not `var(--bg-base)`.
2. Hover state on accent buttons: darken with `var(--accent-hover)`, never lighten.
3. Card hover: lift with shadow (`var(--shadow-md)`) + subtle translate, never change background.
4. Destructive actions: `var(--semantic-red)` as background or text. Never use the warm accent for destructive actions.
5. Disabled state: `opacity: 0.5` + `pointer-events: none`. Never gray out with cold gray — the disabled state should still feel warm.
6. Focus ring: `var(--focus-ring-color)` (warm-tinted), never browser default blue.
7. Link color: `var(--accent-strong)` (darker terracotta for AA compliance on light backgrounds). Never blue unless explicitly part of the domain.
8. Input focus: `border-color: var(--accent)` + `box-shadow: 0 0 0 3px var(--accent-dim)`. Warm, visible, not aggressive.
9. Active nav item: `background: var(--bg-elevated)` + `color: var(--text-heading)` + `border-radius: var(--radius-lg)`. Soft highlight, never hard borders.
10. Toast/notification: `var(--bg-surface)` + `var(--shadow-lg)` + warm border. Never flat-colored blocks.

---

## Typography Rules

1. Headings use `var(--font-display)` (serif). This is non-negotiable — it is the primary visual differentiator.
2. Body text uses `var(--font-body)` (sans-serif). Clean and readable for long sessions.
3. Labels and metadata use `var(--font-body)` at `var(--weight-medium)` with `var(--tracking-wide)`.
4. Stat numbers use `var(--font-display)` at large sizes — serif numbers feel premium.
5. Never use all-uppercase for headings. Warm Craft is sentence-case by default.
6. Mono font (`var(--font-mono)`) is for code blocks only, never for labels or metadata.
7. Line-height for body: `var(--leading-normal)` (1.6) minimum. Generous is correct.
8. Line-height for headings: `var(--leading-tight)` (1.2). Tight but not cramped.
9. Max reading width: `var(--content-sm)` (640px) for long-form text. Never wider.
10. Serif italic (`font-style: italic`) is available for pull quotes, emphasis, and editorial moments — use intentionally.

---

## Warm Palette Rules

1. Never use pure `#FFFFFF` as the app background. Use `var(--bg-base)` which has warm undertones.
2. Never use pure `#000000` for text. Use `var(--text-heading)` which is warm charcoal.
3. All shadows use warm-tinted RGBA (`rgba(45, 40, 35, ...)`) in light theme, never cold black.
4. Accent colors in charts and data visualization must come from the warm family: terracotta, sage, amber, slate-blue, muted purple. Never neon, never saturated primary colors.
5. Semantic colors are desaturated compared to typical UI kits — they feel warm even when communicating error or warning.
6. Background transitions between sections should use warm gradient: `var(--bg-base)` to `var(--bg-void)` or vice versa.
7. Hover and active states should feel like the element is getting closer to a warm light source, not colder.
