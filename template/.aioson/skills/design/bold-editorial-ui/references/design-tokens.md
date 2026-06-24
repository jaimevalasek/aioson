# Design Tokens — Bold Editorial UI

All CSS custom properties for the Bold Editorial system. Apply these to the root `:root` or a `[data-theme]` container.

**Token scope rule**: always declare tokens on the topmost shared ancestor, never inline. Never hardcode a color, font, or size that has a token equivalent.

---

## Font Imports

```css
/* Clash Display — Fontshare (free for commercial use) */
@import url('https://api.fontshare.com/v2/css?f[]=clash-display@200;300;400;500;600;700&display=swap');

/* Fallback if Fontshare unavailable: Cabinet Grotesk or Syne */
/* @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&display=swap'); */

/* Body + Mono */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
```

---

## Typography Tokens

```css
:root {
  /* Font families */
  --font-display: 'Clash Display', 'Cabinet Grotesk', 'Syne', Impact, "Arial Black", system-ui, sans-serif;
  --font-body:    'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  --font-mono:    'JetBrains Mono', 'Space Mono', ui-monospace, 'Courier New', monospace;

  /* Font sizes — editorial scale, larger than most systems */
  --text-xs:   0.75rem;    /* 12px — mono metadata, captions */
  --text-sm:   0.875rem;   /* 14px — body small */
  --text-base: 1rem;       /* 16px — body */
  --text-lg:   1.25rem;    /* 20px — lead paragraph */
  --text-xl:   1.5rem;     /* 24px — subheadings */
  --text-2xl:  2rem;       /* 32px — section titles */
  --text-3xl:  3rem;       /* 48px — page headlines */
  --text-4xl:  4.5rem;     /* 72px — hero headlines */
  --text-5xl:  6rem;       /* 96px — statement text */
  --text-6xl:  8rem;       /* 128px — manifesto / display — maximum impact */

  /* Font weights */
  --weight-regular:   400;
  --weight-medium:    500;
  --weight-semibold:  600;
  --weight-bold:      700;

  /* Line heights */
  --leading-none:    0.9;    /* text-5xl, text-6xl — tight for display */
  --leading-tight:   1.05;   /* text-4xl — headlines */
  --leading-snug:    1.2;    /* text-3xl, text-2xl */
  --leading-normal:  1.5;    /* text-lg, text-xl — comfortable reading */
  --leading-relaxed: 1.65;   /* text-base — body */
  --leading-loose:   2;      /* text-sm, text-xs in tables */

  /* Letter spacing */
  --tracking-tighter: 0;  /* display headings at large sizes */
  --tracking-tight:   0;  /* section headlines */
  --tracking-normal:   0;
  --tracking-wide:     0.05em;  /* subheadings, labels */
  --tracking-wider:    0.08em;  /* mono labels, uppercase */
  --tracking-widest:   0.15em;  /* mono overlines, badges, category text */
}
```

### Typography usage rules

- `--font-display` for all headlines `text-2xl` and above. Never use body font for display sizes.
- `--font-body` for all body copy, descriptions, form labels, navigation.
- `--font-mono` for all overlines, category labels, dates, version badges, metadata, code. This is non-negotiable.
- At `text-5xl` and `text-6xl`: always `line-height: var(--leading-none)` + `letter-spacing: var(--tracking-tighter)`.
- At `text-3xl` and `text-4xl`: `line-height: var(--leading-tight)` + `letter-spacing: var(--tracking-tight)`.
- Mono text: always `uppercase` + `letter-spacing: var(--tracking-widest)`.

---

## Color Tokens — Dark Theme (default)

```css
[data-theme="dark"],
:root {
  /* Backgrounds — near-black, not navy or warm */
  --bg-void:      #050505;
  --bg-base:      #0A0A0A;
  --bg-surface:   #141414;
  --bg-elevated:  #1E1E1E;
  --bg-overlay:   #282828;

  /* Text */
  --text-heading:   #FFFFFF;
  --text-primary:   #B8B8B8;
  --text-secondary: #787878;
  --text-muted:     #484848;
  --text-inverse:   #0A0A0A;   /* for text on light surfaces */

  /* Accent — red-orange, energetic */
  --accent:          #FF4D2A;
  --accent-strong:   #E03A18;
  --accent-dim:      rgba(255, 77, 42, 0.15);
  --accent-hover:    #FF6647;
  --accent-contrast: #FFFFFF;

  /* Borders */
  --border-subtle:   rgba(255, 255, 255, 0.06);
  --border-medium:   rgba(255, 255, 255, 0.12);
  --border-strong:   rgba(255, 255, 255, 0.22);

  /* Semantic */
  --semantic-green:        #22C55E;
  --semantic-green-dim:    rgba(34, 197, 94, 0.15);
  --semantic-amber:        #F59E0B;
  --semantic-amber-dim:    rgba(245, 158, 11, 0.15);
  --semantic-red:          #EF4444;
  --semantic-red-dim:      rgba(239, 68, 68, 0.15);
  --semantic-blue:         #60A5FA;
  --semantic-blue-dim:     rgba(96, 165, 250, 0.15);
  --semantic-purple:       #A78BFA;
  --semantic-purple-dim:   rgba(167, 139, 250, 0.15);
}
```

---

## Color Tokens — Light Theme

```css
[data-theme="light"] {
  /* Backgrounds — off-white, slightly cool */
  --bg-void:      #F5F5F0;
  --bg-base:      #FAFAF7;
  --bg-surface:   #FFFFFF;
  --bg-elevated:  #EFEFEA;
  --bg-overlay:   #E5E5DF;

  /* Text */
  --text-heading:   #0A0A0A;
  --text-primary:   #3A3A3A;
  --text-secondary: #7A7A7A;
  --text-muted:     #AAAAAA;
  --text-inverse:   #FFFFFF;

  /* Accent — deeper red-orange for light backgrounds */
  --accent:          #E03A18;
  --accent-strong:   #C42E0F;
  --accent-dim:      rgba(224, 58, 24, 0.10);
  --accent-hover:    #FF4D2A;
  --accent-contrast: #FFFFFF;

  /* Borders */
  --border-subtle:   rgba(0, 0, 0, 0.06);
  --border-medium:   rgba(0, 0, 0, 0.12);
  --border-strong:   rgba(0, 0, 0, 0.22);

  /* Semantic */
  --semantic-green:        #16A34A;
  --semantic-green-dim:    rgba(22, 163, 74, 0.10);
  --semantic-amber:        #D97706;
  --semantic-amber-dim:    rgba(217, 119, 6, 0.10);
  --semantic-red:          #DC2626;
  --semantic-red-dim:      rgba(220, 38, 38, 0.10);
  --semantic-blue:         #2563EB;
  --semantic-blue-dim:     rgba(37, 99, 235, 0.10);
  --semantic-purple:       #7C3AED;
  --semantic-purple-dim:   rgba(124, 58, 237, 0.10);
}
```

---

## Shadow Tokens

```css
:root {
  /* Dark theme — deep cinematic shadows */
  --shadow-xs:    0 1px 4px rgba(0, 0, 0, 0.20);
  --shadow-sm:    0 2px 8px rgba(0, 0, 0, 0.25);
  --shadow-md:    0 8px 24px rgba(0, 0, 0, 0.35);
  --shadow-lg:    0 16px 48px rgba(0, 0, 0, 0.45);
  --shadow-xl:    0 24px 64px rgba(0, 0, 0, 0.55);

  /* Accent glow — ONE element per viewport maximum */
  --shadow-glow:  0 0 60px rgba(255, 77, 42, 0.15);

  /* Light theme shadows — visible but measured */
  --shadow-xs-light:  0 1px 3px rgba(0, 0, 0, 0.08);
  --shadow-sm-light:  0 2px 8px rgba(0, 0, 0, 0.10);
  --shadow-md-light:  0 8px 24px rgba(0, 0, 0, 0.12);
  --shadow-lg-light:  0 16px 48px rgba(0, 0, 0, 0.14);
}
```

Shadow rules:
- On dark theme: use `--shadow-*` (black-based).
- On light theme: use `--shadow-*-light` (softer).
- `--shadow-glow` is for ONE featured element per viewport (hero CTA, featured pricing card). Never apply to more than one element in the same scroll viewport.

---

## Spacing Tokens

```css
:root {
  --space-1:  0.25rem;    /*  4px */
  --space-2:  0.5rem;     /*  8px */
  --space-3:  0.75rem;    /* 12px */
  --space-4:  1rem;       /* 16px */
  --space-5:  1.25rem;    /* 20px */
  --space-6:  1.5rem;     /* 24px */
  --space-8:  2rem;       /* 32px */
  --space-10: 2.5rem;     /* 40px */
  --space-12: 3rem;       /* 48px */
  --space-16: 4rem;       /* 64px */
  --space-20: 5rem;       /* 80px */
  --space-24: 6rem;       /* 96px */
  --space-32: 8rem;       /* 128px — hero and editorial sections */
  --space-40: 10rem;      /* 160px — maximum editorial breathing room */
}
```

---

## Border Radius Tokens

```css
:root {
  /* Minimal radius — editorial and adult, not bubbly */
  --radius-sm:   0.25rem;    /*  4px — badges, chips */
  --radius-md:   0.375rem;   /*  6px — buttons (default) */
  --radius-lg:   0.5rem;     /*  8px — cards (default) */
  --radius-xl:   0.75rem;    /* 12px — modals, larger containers */
  --radius-2xl:  1rem;       /* 16px — featured cards, hero containers */
  --radius-full: 9999px;     /* pills — used sparingly */
}
```

Radius rules:
- Default radius for cards: `--radius-lg` (8px).
- Default radius for buttons: `--radius-md` (6px).
- Never exceed `--radius-2xl` (16px) in this system — no warm-craft-style extreme rounding.
- `--radius-full` is allowed for badge pills and avatar circles only.

---

## Layout Tokens

```css
:root {
  /* Content widths */
  --content-xs:   480px;
  --content-sm:   640px;
  --content-md:   768px;
  --content-lg:   1024px;
  --content-xl:   1280px;
  --content-full: 1440px;

  /* Breakpoints */
  --breakpoint-sm:  640px;
  --breakpoint-md:  768px;
  --breakpoint-lg:  1024px;
  --breakpoint-xl:  1280px;
  --breakpoint-2xl: 1536px;

  /* Z-index scale */
  --z-below:   -1;
  --z-base:     0;
  --z-raised:   10;
  --z-overlay:  20;
  --z-sticky:   30;
  --z-fixed:    40;
  --z-modal:    50;
  --z-toast:    60;
  --z-tooltip:  70;
}
```

---

## Transition Tokens

```css
:root {
  --transition-fast:  100ms ease;
  --transition-base:  200ms ease;
  --transition-slow:  400ms cubic-bezier(0.16, 1, 0.3, 1);
  --transition-hero:  800ms cubic-bezier(0.16, 1, 0.3, 1);

  /* Theme switch — all affected properties together */
  --transition-theme: background-color 200ms ease,
                      color 200ms ease,
                      border-color 200ms ease,
                      box-shadow 200ms ease;
}
```

---

## Token Scope Guardrails

| What | Rule |
|------|------|
| Background colors | Only `--bg-*` tokens. Never hardcode hex for surfaces. |
| Text colors | Only `--text-*` tokens. Never `color: white` or `color: #fff` inline. |
| Accent usage | `--accent` for CTAs, active states, single highlights. Never for borders, background sections, or repeated decorative elements. |
| `--shadow-glow` | One element per scroll viewport. The hero CTA or featured card. |
| Font sizes | Only `--text-*` scale tokens. Never arbitrary `font-size: 53px`. |
| Spacing | Only `--space-*` tokens. Never arbitrary `margin: 17px`. |
| Border radius | Only `--radius-*` tokens. Never `border-radius: 10px` inline. |
| Borders | Only `--border-*` tokens. Never `border: 1px solid rgba(...)` inline. |
| Shadows | Only `--shadow-*` tokens. Never arbitrary `box-shadow` values. |

---

## Interaction Guardrails

| Rule | Why |
|------|-----|
| Never use blue as accent | This is red-orange. Blue breaks the visual DNA instantly. |
| Never use warm beige (`#FDF8F0`) as base | That belongs to Warm Craft. Bold Editorial uses cool off-whites. |
| Never use `border-radius > --radius-2xl` | Sharp edges define this system. Extreme rounding destroys the editorial feel. |
| Never use blur/glass effects | That belongs to Glassmorphism UI. Bold Editorial surfaces are opaque. |
| Never use `--shadow-glow` on more than one element per viewport | The glow exists to draw the eye. If everything glows, nothing does. |
| Mono captions are mandatory for all metadata | Overlines, categories, timestamps, version tags — always `--font-mono` + `uppercase` + wide tracking. |
| Serif fonts prohibited | Source Serif belongs to Warm Craft. Bold Editorial uses display sans and body sans only. |
