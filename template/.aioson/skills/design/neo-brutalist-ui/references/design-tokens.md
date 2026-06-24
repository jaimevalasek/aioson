# Design Tokens — Neo-Brutalist UI

Single source of truth for all CSS variables. Apply via `data-theme="light"` / `data-theme="dark"` on the root container.

---

## Font imports

```css
/* Google Fonts */
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
```

System fallbacks (no external fonts):
```css
--font-display: "Arial Black", Impact, system-ui, sans-serif;
--font-body:    -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
--font-mono:    "Courier New", Courier, monospace;
```

---

## Typography

```css
--font-display: 'Space Grotesk', system-ui, sans-serif;
  /* Geometric with personality. Not as neutral as Inter, not as dramatic as Clash Display. */
  /* Alternatives: 'DM Sans', 'Outfit', 'Plus Jakarta Sans' */

--font-body:    'Inter', system-ui, sans-serif;

--font-mono:    'JetBrains Mono', 'Space Mono', ui-monospace, monospace;
  /* FIRST-CLASS CITIZEN: labels, metadata, badges, status, code, numbers, dates, IDs */
```

### Font sizes

```css
--text-xs:   0.75rem;    /* 12px — mono metadata, badges */
--text-sm:   0.875rem;   /* 14px */
--text-base: 1rem;       /* 16px */
--text-lg:   1.25rem;    /* 20px */
--text-xl:   1.5rem;     /* 24px */
--text-2xl:  2rem;       /* 32px */
--text-3xl:  2.5rem;     /* 40px */
--text-4xl:  3.5rem;     /* 56px — hero headlines */
--text-5xl:  5rem;       /* 80px — manifesto/zine statements */
```

### Font weights

```css
--weight-regular:    400;
--weight-medium:     500;
--weight-semibold:   600;
--weight-bold:       700;
--weight-extrabold:  800;  /* headings in indie/zine modes */
```

### Letter spacing

```css
--tracking-tight:  0;   /* large headings */
--tracking-normal:  0em;
--tracking-wide:    0.05em;   /* mono labels, uppercase badges */
--tracking-wider:   0.1em;    /* uppercase section titles */
```

---

## Colors — Light Theme (default)

```css
[data-theme="light"] {
  /* Backgrounds */
  --bg-void:     #F5F0E8;   /* warm off-white — newspaper feel, page background */
  --bg-base:     #FFFDF5;   /* cream white — main content area */
  --bg-surface:  #FFFFFF;   /* pure white — cards, panels */
  --bg-elevated: #F5F0E8;   /* off-white — hover state, nested sections */
  --bg-overlay:  #E8E0D0;   /* deeper off-white — modals overlay, popovers */

  /* Text */
  --text-heading:   #1A1A1A;
  --text-primary:   #2A2A2A;
  --text-secondary: #666666;
  --text-muted:     #999999;
  --text-disabled:  #BBBBBB;

  /* Primary accent — yellow is THE brutalist accent */
  --accent:          #FACC15;            /* yellow-400 */
  --accent-strong:   #EAB308;            /* yellow-500 — pressed state */
  --accent-dim:      rgba(250,204,21,.20);
  --accent-hover:    #EAB308;
  --accent-contrast: #1A1A1A;            /* black text on yellow bg */

  /* Secondary accents — for Creative Playground mode */
  --accent-red:    #EF4444;
  --accent-blue:   #3B82F6;
  --accent-green:  #22C55E;
  --accent-pink:   #EC4899;
  --accent-orange: #F97316;

  /* Borders — THE most important token in this skill */
  --border-subtle:   1px solid #1A1A1A;     /* dividers, table cell borders */
  --border-thick:    2px solid #1A1A1A;     /* default interactive border */
  --border-thicker:  3px solid #1A1A1A;     /* cards, buttons, feature elements */
  --border-thickest: 4px solid #1A1A1A;     /* hero cards, main CTAs */

  /* Border color only (for custom uses) */
  --border-color:        #1A1A1A;
  --border-color-subtle: #CCCCCC;

  /* Semantic */
  --semantic-green:     #22C55E;
  --semantic-green-dim: rgba(34,197,94,.15);
  --semantic-amber:     #F59E0B;
  --semantic-amber-dim: rgba(245,158,11,.15);
  --semantic-red:       #EF4444;
  --semantic-red-dim:   rgba(239,68,68,.15);
  --semantic-blue:      #3B82F6;
  --semantic-blue-dim:  rgba(59,130,246,.15);
}
```

---

## Colors — Dark Theme

```css
[data-theme="dark"] {
  /* Backgrounds */
  --bg-void:     #111111;
  --bg-base:     #1A1A1A;
  --bg-surface:  #242424;
  --bg-elevated: #2E2E2E;
  --bg-overlay:  #383838;

  /* Text */
  --text-heading:   #FFFFFF;
  --text-primary:   #E0E0E0;
  --text-secondary: #999999;
  --text-muted:     #666666;
  --text-disabled:  #444444;

  /* Primary accent — yellow stays strong in dark */
  --accent:          #FACC15;
  --accent-strong:   #EAB308;
  --accent-dim:      rgba(250,204,21,.20);
  --accent-hover:    #EAB308;
  --accent-contrast: #1A1A1A;

  /* Secondary accents — brighter in dark (but NOT neon — saturated and grounded) */
  --accent-red:    #F87171;
  --accent-blue:   #60A5FA;
  --accent-green:  #4ADE80;
  --accent-pink:   #F472B6;
  --accent-orange: #FB923C;

  /* Borders — inverted: light on dark */
  --border-subtle:   1px solid #444444;
  --border-thick:    2px solid #E0E0E0;
  --border-thicker:  3px solid #E0E0E0;
  --border-thickest: 4px solid #E0E0E0;

  --border-color:        #E0E0E0;
  --border-color-subtle: #444444;

  /* Semantic */
  --semantic-green:     #4ADE80;
  --semantic-green-dim: rgba(74,222,128,.15);
  --semantic-amber:     #FCD34D;
  --semantic-amber-dim: rgba(252,211,77,.15);
  --semantic-red:       #F87171;
  --semantic-red-dim:   rgba(248,113,113,.15);
  --semantic-blue:      #60A5FA;
  --semantic-blue-dim:  rgba(96,165,250,.15);
}
```

---

## Shadows — Hard Offset (the most distinctive token)

```css
/* ZERO BLUR. Solid offset. Non-negotiable. */

/* Light theme shadows — black offset */
--shadow-sm:    2px 2px 0 var(--border-color);   /* small elements */
--shadow-md:    4px 4px 0 var(--border-color);   /* cards, buttons */
--shadow-lg:    6px 6px 0 var(--border-color);   /* featured cards, hover state */
--shadow-xl:    8px 8px 0 var(--border-color);   /* hero CTA, main action */

/* Colored shadows — for Creative Playground mode */
--shadow-accent: 4px 4px 0 var(--accent);
--shadow-red:    4px 4px 0 var(--accent-red);
--shadow-blue:   4px 4px 0 var(--accent-blue);
--shadow-green:  4px 4px 0 var(--accent-green);
```

Direction rule: **all hard shadows go bottom-right** (positive x, positive y). Never mix directions on the same page.

In dark theme, `--border-color` resolves to `#E0E0E0`, so shadows automatically invert to light-on-dark.

---

## Border Radius — Extremes Only

```css
--radius-none: 0;            /* DEFAULT — cards, inputs, buttons, most elements */
--radius-sm:   0.25rem;      /* 4px — used rarely, only for very small inner elements */
--radius-md:   0.375rem;     /* 6px — inputs optionally, max allowed before "too normal" */
--radius-full: 9999px;       /* pills — badges, tags, status dots, pill buttons */
```

**Rule:** use `--radius-none` (0) or `--radius-full` (9999px). Nothing between 6px and 9998px. The extreme contrast between square and pill is part of the aesthetic. `8–12px` radius is "clean-saas territory" — forbidden here.

---

## Spacing

4px base rhythm. 8px standard unit.

```css
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
--space-20: 5rem;      /* 80px — section gap minimum */
--space-24: 6rem;      /* 96px */
--space-28: 7rem;      /* 112px */
--space-32: 8rem;      /* 128px */
```

Section gaps: `--space-20` to `--space-28` between major page sections. Generous whitespace makes the thick borders breathe.

---

## Control Heights — Chunky (larger than other skills)

```css
--control-xs: 2rem;      /* 32px */
--control-sm: 2.25rem;   /* 36px */
--control-md: 2.75rem;   /* 44px — DEFAULT input/button */
--control-lg: 3.25rem;   /* 52px — primary CTA button */
```

Brutalist buttons are **chunky, not elegant**. The extra height reinforces the physical, constructed feel.

---

## Decorative Patterns

One pattern maximum per page. Applied to the background of ONE section only — never the whole page.

```css
/* Dots */
.pattern-dots {
  background-image: radial-gradient(var(--border-color) 1px, transparent 1px);
  background-size: 20px 20px;
  opacity: 0.15;
}

/* Horizontal lines */
.pattern-lines {
  background-image: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 19px,
    var(--border-color) 19px,
    var(--border-color) 20px
  );
  opacity: 0.12;
}

/* Full grid */
.pattern-grid {
  background-image:
    linear-gradient(var(--border-color) 1px, transparent 1px),
    linear-gradient(90deg, var(--border-color) 1px, transparent 1px);
  background-size: 20px 20px;
  opacity: 0.10;
}

/* Checkerboard */
.pattern-checks {
  background-image: repeating-conic-gradient(var(--bg-elevated) 0% 25%, transparent 0% 50%);
  background-size: 20px 20px;
}
```

---

## Z-index layers

```css
--z-base:    0;
--z-raised:  1;
--z-dropdown: 100;
--z-sticky:  200;
--z-overlay: 300;
--z-modal:   400;
--z-toast:   500;
```

---

## Breakpoints

```css
--breakpoint-sm:  640px;
--breakpoint-md:  768px;
--breakpoint-lg:  1024px;   /* sidebar collapses to hamburger below this */
--breakpoint-xl:  1280px;
--breakpoint-2xl: 1536px;
```

---

## Chart Color Palette

```css
--chart-1: var(--accent);          /* #FACC15 — yellow — primary series */
--chart-2: var(--accent-red);      /* red — negative / error */
--chart-3: var(--accent-blue);     /* blue — secondary series */
--chart-4: var(--accent-green);    /* green — positive / success */
--chart-5: var(--accent-orange);   /* orange — warning / tertiary */
--chart-6: var(--border-color);    /* black/white — neutral baseline */
```

Chart rules:
- Bar charts: `border: var(--border-subtle)` on each bar, flat fill (no gradient), `--radius-none`
- Line charts: `stroke-width: 2.5px` minimum (thicker than other skills), solid dot markers (not hollow)
- Area charts: flat fill at `opacity: 0.3` (no gradient)
- Grid lines: `--border-subtle`, full grid visible
- Axis labels: `font-family: var(--font-mono)`, `font-size: var(--text-xs)`
