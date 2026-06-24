# Design Tokens — pt.squarespace.com

```css
:root {
  /* === COLORS === */

  /* Background hierarchy */
  --bg-base: rgb(255, 255, 255);        /* White page background */
  --bg-surface: rgb(245, 245, 244);     /* Off-white section background */
  --bg-elevated: rgb(223, 221, 216);    /* Light gray surfaces */
  --bg-inverse: rgb(0, 0, 0);           /* Black — hero, footer */
  --bg-charcoal: rgb(26, 26, 26);       /* Dark sections */
  --bg-teal: rgb(30, 76, 65);           /* Teal accent sections */

  /* Text hierarchy */
  --text-primary: rgb(0, 0, 0);         /* Primary text on light */
  --text-muted: rgb(137, 137, 137);    /* Secondary/muted text */
  --text-inverse: rgb(255, 255, 255);  /* Text on dark backgrounds */
  --text-light-gray: rgb(221, 221, 221);/* Light gray text */

  /* Brand / Accent */
  --accent: rgb(30, 76, 65);            /* Teal accent color */
  --accent-hover: rgb(50, 50, 50);      /* Darker shade for hover */

  /* Borders */
  --border: rgb(221, 221, 221);         /* Default border color */
  --border-dark: rgb(50, 50, 50);       /* Dark section borders */

  /* Semantic */
  --success: rgb(30, 76, 65);           /* Teal as success */
  --error: rgb(32, 6, 3);               /* Dark red for errors */
  --warning: rgb(137, 137, 137);       /* Gray for warnings */

  /* Overlays */
  --overlay-light: rgba(255, 255, 255, 0.1);
  --overlay-dark: rgba(0, 0, 0, 0.52);  /* Hero video overlay — real value from index.css */

  /* === TYPOGRAPHY === */

  /* Font families */
  --font-display: 'Clarkson', Helvetica, sans-serif;
  --font-body: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  --font-serif: 'Clarkson Serif', Georgia, serif;
  --font-mono: 'Courier New', monospace;

  /* Type scale (based on observed values) */
  --text-xs: 12px;
  --text-sm: 14px;
  --text-base: 16px;
  --text-lg: 20px;
  --text-xl: 26px;
  --text-2xl: 34px;
  --text-3xl: 42px;  /* Hero headline size */

  /* Font weights */
  --font-light: 300;
  --font-normal: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --font-bold: 700;

  /* Line heights */
  --leading-tight: 1.2;
  --leading-normal: 1.5;
  --leading-relaxed: 1.75;

  /* Letter spacing */
  --tracking-tight: 0;
  --tracking-normal: 0;
  --tracking-wide: 0.05em;

  /* === SPACING === */

  /* Base unit: 4px */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-8: 48px;
  --space-10: 64px;
  --space-12: 96px;
  --space-16: 128px;
  --space-20: 160px;

  /* Section-specific spacing */
  --section-padding-y: 80px;
  --section-padding-x: 24px;
  --hero-padding-y: 120px;

  /* === RADIUS === */

  /* Sharp corners — signature Squarespace aesthetic */
  --radius-none: 0px;                  /* Default — sharp corners */
  --radius-sm: 0px;
  --radius-md: 0px;
  --radius-lg: 0px;
  --radius-full: 9999px;               /* Only for pills/avatars if ever needed */

  /* === SHADOWS === */

  /* Minimal shadow usage — only when functionally necessary */
  --shadow-sm: none;
  --shadow-md: none;
  --shadow-lg: none;
  --shadow-xl: none;

  /* === MOTION === */

  /* Timing functions — verbatim from pt.squarespace.com/css/index.css */
  --ease-default: cubic-bezier(0.455, 0.03, 0.515, 0.955);  /* General transitions */
  --ease-sqsp-reveal: cubic-bezier(0.23, 1, 0.32, 1);        /* Scroll reveals, stats — Squarespace signature ease */
  --ease-sqsp-cta: cubic-bezier(0.645, 0.045, 0.355, 1);     /* CTA hover, mobile menu, dropdowns */
  --ease-sqsp-menu: cubic-bezier(0.165, 0.84, 0.44, 1);      /* Mobile menu swipe, accordion */
  --ease-out: ease-out;
  --ease-in: ease-in;
  --ease-in-out: ease-in-out;

  /* Durations */
  --transition-fast: 100ms;    /* Micro color changes */
  --transition-base: 200ms;    /* Standard hover */
  --transition-medium: 300ms;  /* Nav dropdowns, CTA hover overlay */
  --transition-slow: 400ms;    /* Layout transitions */
  --transition-reveal: 800ms;  /* Scroll-triggered section reveals */
  --transition-reveal-slow: 1200ms;  /* Stats card reveal */

  /* Full transition shorthand */
  --transition-all: all var(--transition-medium) var(--ease-default);
  --transition-colors: color var(--transition-base) var(--ease-default),
                       background-color var(--transition-base) var(--ease-default);

  /* === LAYOUT === */

  --container-max: 1200px;
  --container-narrow: 800px;
  --grid-gap: 32px;
  --global-nav-height: 80px;    /* Sticky nav height — used for hero padding-top offset */
  --grid-gutter-width: 40px;    /* Column gutter observed in content sections */

  /* === Z-INDEX === */

  --z-base: 0;
  --z-dropdown: 100;
  --z-sticky: 200;
  --z-overlay: 300;
  --z-modal: 400;
  --z-toast: 500;
}
```
