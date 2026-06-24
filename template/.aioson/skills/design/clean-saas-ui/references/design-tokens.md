# Design Tokens — Clean SaaS UI

This file is the source of truth for all CSS variables. Always apply tokens from this file — never hardcode values.

---

## Token application scope

Place root tokens on the page root or theme container:

```html
<html data-theme="light">
  <!-- or -->
<div data-theme="dark">
```

All token overrides for dark theme go inside `[data-theme="dark"] { ... }`.

---

## Typography

```css
:root {
  --font-display: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-body:    'Inter', system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono:    'JetBrains Mono', ui-monospace, SFMono-Regular, monospace;
}
```

**Both display and body are sans-serif (Inter).** The differentiator is weight and tracking, not font family.

- Headings: `font-weight: 600–700`, `letter-spacing: 0`
- Body: `font-weight: 400`, `letter-spacing: normal`
- Mono: used ONLY for code, IDs, technical metadata — never for paragraphs or navigation

### Font sizes

```css
:root {
  --text-xs:   0.75rem;    /* 12px — helper text, captions, mono labels */
  --text-sm:   0.875rem;   /* 14px — table data, form labels, nav items */
  --text-base: 1rem;       /* 16px — body text */
  --text-lg:   1.125rem;   /* 18px — section titles, card headings */
  --text-xl:   1.25rem;    /* 20px */
  --text-2xl:  1.5rem;     /* 24px — page titles */
  --text-3xl:  1.875rem;   /* 30px — stat numbers */
  --text-4xl:  2.25rem;    /* 36px — hero stat numbers */
  --text-5xl:  3rem;       /* 48px — hero headings (marketing pages only) */
}
```

---

## Colors — Light theme (default)

```css
:root,
[data-theme="light"] {
  /* Backgrounds */
  --bg-void:     #F3F4F6;         /* gray-100 — page background */
  --bg-base:     #F9FAFB;         /* gray-50 — app shell background */
  --bg-surface:  #FFFFFF;         /* cards, panels, sidebar */
  --bg-elevated: #F3F4F6;         /* gray-100 — hover states, nested areas */
  --bg-overlay:  #E5E7EB;         /* gray-200 — overlays, dividers */

  /* Text */
  --text-heading:   #111827;       /* gray-900 — page titles, card headings */
  --text-primary:   #374151;       /* gray-700 — body, table data */
  --text-secondary: #6B7280;       /* gray-500 — helper text, labels */
  --text-muted:     #9CA3AF;       /* gray-400 — placeholders, timestamps */

  /* Accent — professional blue */
  --accent:          #2563EB;      /* blue-600 */
  --accent-strong:   #1D4ED8;      /* blue-700 — hover on primary buttons */
  --accent-dim:      rgba(37, 99, 235, 0.10);  /* bg for accent highlights */
  --accent-hover:    #1D4ED8;
  --accent-contrast: #FFFFFF;      /* text on accent bg */

  /* Borders */
  --border-subtle:  #F3F4F6;       /* gray-100 — very subtle dividers */
  --border-default: #E5E7EB;       /* gray-200 — standard borders */
  --border-medium:  #D1D5DB;       /* gray-300 — input borders, card borders */
  --border-strong:  #9CA3AF;       /* gray-400 — strong dividers */
  --border-accent:  #2563EB;       /* accent border — active states */

  /* Semantic */
  --semantic-success:       #16A34A;   /* green-600 */
  --semantic-success-dim:   rgba(22, 163, 74, 0.10);
  --semantic-warning:       #D97706;   /* amber-600 */
  --semantic-warning-dim:   rgba(217, 119, 6, 0.10);
  --semantic-danger:        #DC2626;   /* red-600 */
  --semantic-danger-dim:    rgba(220, 38, 38, 0.10);
  --semantic-info:          #2563EB;   /* blue-600 — same as accent */
  --semantic-info-dim:      rgba(37, 99, 235, 0.10);
  --semantic-neutral:       #6B7280;   /* gray-500 */
  --semantic-neutral-dim:   rgba(107, 114, 128, 0.10);
}
```

---

## Colors — Dark theme

```css
[data-theme="dark"] {
  /* Backgrounds */
  --bg-void:     #111827;         /* gray-900 */
  --bg-base:     #1F2937;         /* gray-800 */
  --bg-surface:  #374151;         /* gray-700 */
  --bg-elevated: #4B5563;         /* gray-600 */
  --bg-overlay:  #6B7280;         /* gray-500 */

  /* Text */
  --text-heading:   #F9FAFB;       /* gray-50 */
  --text-primary:   #E5E7EB;       /* gray-200 */
  --text-secondary: #9CA3AF;       /* gray-400 */
  --text-muted:     #6B7280;       /* gray-500 */

  /* Accent — slightly brighter blue for dark bg */
  --accent:          #3B82F6;      /* blue-500 */
  --accent-strong:   #2563EB;      /* blue-600 */
  --accent-dim:      rgba(59, 130, 246, 0.15);
  --accent-hover:    #2563EB;
  --accent-contrast: #FFFFFF;

  /* Borders */
  --border-subtle:  #1F2937;
  --border-default: #374151;
  --border-medium:  #4B5563;
  --border-strong:  #6B7280;
  --border-accent:  #3B82F6;

  /* Semantic */
  --semantic-success:       #22C55E;   /* green-500 */
  --semantic-success-dim:   rgba(34, 197, 94, 0.15);
  --semantic-warning:       #F59E0B;   /* amber-500 */
  --semantic-warning-dim:   rgba(245, 158, 11, 0.15);
  --semantic-danger:        #EF4444;   /* red-500 */
  --semantic-danger-dim:    rgba(239, 68, 68, 0.15);
  --semantic-info:          #3B82F6;
  --semantic-info-dim:      rgba(59, 130, 246, 0.15);
  --semantic-neutral:       #9CA3AF;
  --semantic-neutral-dim:   rgba(156, 163, 175, 0.15);
}
```

---

## Shadows — Subtle (more subtle than other skills)

```css
:root {
  --shadow-xs:   0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-sm:   0 1px 3px rgba(0, 0, 0, 0.08);
  --shadow-md:   0 4px 6px rgba(0, 0, 0, 0.07);
  --shadow-lg:   0 10px 15px rgba(0, 0, 0, 0.08);
}
```

**Note:** Shadows in Clean SaaS are nearly imperceptible. Separation comes primarily from borders and background differences, not from elevation shadows. Never use dramatic shadows.

---

## Border radius — Moderate

```css
:root {
  --radius-sm:   0.25rem;    /* 4px — badges, chips, tags */
  --radius-md:   0.375rem;   /* 6px — inputs, buttons */
  --radius-lg:   0.5rem;     /* 8px — cards, panels */
  --radius-xl:   0.75rem;    /* 12px — modals, larger cards */
  --radius-2xl:  1rem;       /* 16px — hero sections (marketing only) */
  --radius-full: 9999px;     /* pills, avatars, toggle switches */
}
```

---

## Spacing — 8px base grid

```css
:root {
  --space-1:  0.25rem;   /* 4px */
  --space-2:  0.5rem;    /* 8px */
  --space-3:  0.75rem;   /* 12px */
  --space-4:  1rem;      /* 16px */
  --space-5:  1.25rem;   /* 20px */
  --space-6:  1.5rem;    /* 24px — standard content padding */
  --space-8:  2rem;      /* 32px */
  --space-10: 2.5rem;    /* 40px */
  --space-12: 3rem;      /* 48px */
  --space-16: 4rem;      /* 64px */
  --space-20: 5rem;      /* 80px */
}
```

---

## Control heights — Strict

```css
:root {
  --control-xs: 1.75rem;   /* 28px — compact table actions, icon buttons */
  --control-sm: 2rem;      /* 32px — small buttons, compact selects */
  --control-md: 2.25rem;   /* 36px — DEFAULT for all inputs and buttons */
  --control-lg: 2.5rem;    /* 40px — prominent inputs, search bars */
}
```

**Note:** `control-md` is 36px (not 40px like warm-craft). Clean SaaS is more compact.

Every button and input **must** use a `--control-*` height. Never freehand a control height.

---

## Z-index scale

```css
:root {
  --z-base:    0;
  --z-raised:  10;
  --z-sticky:  100;    /* sticky headers, filter bars */
  --z-overlay: 200;    /* overlays, backdrops */
  --z-modal:   300;    /* modals, dialogs */
  --z-toast:   400;    /* toast notifications */
  --z-tooltip: 500;    /* tooltips */
}
```

---

## Token scope guardrails

| Token | Allowed on | Never on |
|-------|-----------|---------|
| `--bg-void` | page root, app shell | cards, modals |
| `--bg-surface` | cards, sidebar, modals | page background |
| `--bg-elevated` | hover states, nested panels | main surfaces |
| `--accent` | buttons, links, active states, borders | body text |
| `--accent-dim` | bg of highlighted rows, selected states | interactive elements |
| `--text-muted` | timestamps, metadata, placeholders | headings, primary body |
| `--font-mono` | code, IDs, technical metadata | navigation, headings, paragraphs |
| `--shadow-lg` | modals, popovers | cards (use shadow-sm or shadow-md) |
