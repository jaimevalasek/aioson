# Design Tokens — Glassmorphism UI

This is the source of truth for all CSS custom properties. Apply these on `:root` (or `[data-theme]`) and never hardcode values in components.

---

## Typography

### Font families
```css
--font-display: 'Inter', -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif;
--font-body:    'Inter', -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
--font-mono:    'JetBrains Mono', ui-monospace, 'Cascadia Code', monospace;
```

Note: SF Pro as first system fallback gives the Apple/iOS feel when Inter is not loaded. The differentiator in glassmorphism is not the typeface — it is the glass effects. Use headings weight 600-700, tracking -0.02em. Body weight 400.

### Font sizes
```css
--text-xs:   0.75rem;    /* 12px */
--text-sm:   0.875rem;   /* 14px */
--text-base: 1rem;       /* 16px */
--text-lg:   1.125rem;   /* 18px */
--text-xl:   1.25rem;    /* 20px */
--text-2xl:  1.5rem;     /* 24px */
--text-3xl:  2rem;       /* 32px */
--text-4xl:  2.5rem;     /* 40px — stat numbers, hero subheadings */
--text-5xl:  3.5rem;     /* 56px — hero headlines */
```

---

## Colors — Light Theme (default)

Apply on `:root` or `[data-theme="light"]`.

```css
/* Backgrounds */
--bg-void:     #E8E6F0;
--bg-base:     #F0EEF6;
--bg-gradient: linear-gradient(135deg, #F0EEF6 0%, #E0DFF0 30%, #D8E0F0 70%, #EDE8F0 100%);

/* Glass surfaces — TRANSPARENT by design */
--bg-surface:  rgba(255, 255, 255, 0.60);   /* standard glass card */
--bg-elevated: rgba(255, 255, 255, 0.80);   /* hover state, nested card */
--bg-overlay:  rgba(255, 255, 255, 0.40);   /* transparent overlay */

/* Text */
--text-heading:   #1A1A2E;
--text-primary:   #2D2D44;
--text-secondary: #6B6B8A;
--text-muted:     #9B9BB5;

/* Accent */
--accent:          #7C3AED;                              /* violet-600 */
--accent-strong:   #6D28D9;                              /* violet-700 */
--accent-dim:      rgba(124, 58, 237, 0.12);
--accent-hover:    #6D28D9;
--accent-contrast: #FFFFFF;

/* Accent secondary + gradient */
--accent-secondary: #3B82F6;                             /* blue-500 */
--accent-gradient:  linear-gradient(135deg, #7C3AED, #3B82F6);

/* Semantic */
--semantic-green:     #10B981;
--semantic-green-dim: rgba(16, 185, 129, 0.12);
--semantic-amber:     #F59E0B;
--semantic-amber-dim: rgba(245, 158, 11, 0.12);
--semantic-red:       #EF4444;
--semantic-red-dim:   rgba(239, 68, 68, 0.12);
--semantic-blue:      #3B82F6;
--semantic-blue-dim:  rgba(59, 130, 246, 0.12);
```

---

## Colors — Dark Theme

Apply on `[data-theme="dark"]`.

```css
/* Backgrounds */
--bg-void:     #0F0F1A;
--bg-base:     #141425;
--bg-gradient: linear-gradient(135deg, #141425 0%, #1A1535 30%, #151A30 70%, #1A1425 100%);

/* Glass surfaces — TRANSPARENT by design */
--bg-surface:  rgba(255, 255, 255, 0.08);
--bg-elevated: rgba(255, 255, 255, 0.12);
--bg-overlay:  rgba(255, 255, 255, 0.05);

/* Text */
--text-heading:   #F0F0FA;
--text-primary:   #C8C8E0;
--text-secondary: #8888A8;
--text-muted:     #5A5A78;

/* Accent */
--accent:          #8B5CF6;                              /* violet-500 — brighter for dark */
--accent-strong:   #7C3AED;
--accent-dim:      rgba(139, 92, 246, 0.18);
--accent-hover:    #7C3AED;
--accent-contrast: #FFFFFF;

/* Accent secondary + gradient */
--accent-secondary: #60A5FA;                             /* blue-400 */
--accent-gradient:  linear-gradient(135deg, #8B5CF6, #60A5FA);

/* Semantic (same values work on dark) */
--semantic-green:     #10B981;
--semantic-green-dim: rgba(16, 185, 129, 0.15);
--semantic-amber:     #F59E0B;
--semantic-amber-dim: rgba(245, 158, 11, 0.15);
--semantic-red:       #EF4444;
--semantic-red-dim:   rgba(239, 68, 68, 0.15);
--semantic-blue:      #60A5FA;
--semantic-blue-dim:  rgba(96, 165, 250, 0.15);
```

---

## Glass Tokens (unique to this skill)

These tokens define the glass effect system. They are the core differentiator.

```css
/* Blur intensities */
--glass-blur-sm: blur(8px);    /* subtle — zen mode, mobile (performance) */
--glass-blur-md: blur(16px);   /* standard — most cards and containers */
--glass-blur-lg: blur(24px);   /* strong — sidebars, modals, nav bars */
--glass-blur-xl: blur(40px);   /* extreme — media player, ambient diffusion */

/* Glass surfaces — light theme */
--glass-bg:           rgba(255, 255, 255, 0.60);
--glass-bg-hover:     rgba(255, 255, 255, 0.75);
--glass-bg-active:    rgba(255, 255, 255, 0.85);
--glass-border:       rgba(255, 255, 255, 0.40);   /* luminous border */
--glass-border-focus: rgba(124, 58, 237, 0.50);    /* accent ring */
--glass-highlight:    linear-gradient(180deg, rgba(255, 255, 255, 0.25) 0%, rgba(255, 255, 255, 0) 50%);

/* Glass surfaces — dark theme */
--glass-bg-dark:           rgba(255, 255, 255, 0.08);
--glass-bg-dark-hover:     rgba(255, 255, 255, 0.12);
--glass-bg-dark-active:    rgba(255, 255, 255, 0.16);
--glass-border-dark:       rgba(255, 255, 255, 0.12);
--glass-highlight-dark:    linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0) 50%);

/* Fallback (when backdrop-filter is unsupported) */
--glass-fallback-bg:  rgba(255, 255, 255, 0.95);   /* light */
--glass-fallback-dark: rgba(20, 20, 37, 0.95);      /* dark */
```

Usage note: always wrap `backdrop-filter` in `@supports`:
```css
.glass-card {
  background: var(--glass-fallback-bg);
}
@supports (backdrop-filter: blur(1px)) {
  .glass-card {
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur-md);
  }
}
```

---

## Shadows (colored, not black)

Shadows use the accent color (violet) at very low opacity, creating a subtle glow instead of a dark shadow. Combined with `--glass-highlight` for the top reflection.

```css
--shadow-xs:    0 1px 3px rgba(124, 58, 237, 0.04);
--shadow-sm:    0 4px 12px rgba(124, 58, 237, 0.06);
--shadow-md:    0 8px 24px rgba(124, 58, 237, 0.08);
--shadow-lg:    0 16px 48px rgba(124, 58, 237, 0.10);
--shadow-glow:  0 0 40px rgba(124, 58, 237, 0.15);    /* accent glow for featured elements */
--shadow-inner: inset 0 1px 0 rgba(255, 255, 255, 0.15);  /* top inner highlight */
```

Dark theme shadow adjustment (same structure, slightly more visible):
```css
--shadow-sm:  0 4px 12px rgba(0, 0, 0, 0.20);
--shadow-md:  0 8px 24px rgba(0, 0, 0, 0.30);
--shadow-lg:  0 16px 48px rgba(0, 0, 0, 0.40);
--shadow-glow: 0 0 40px rgba(139, 92, 246, 0.25);
```

---

## Border Radius (generous)

```css
--radius-sm:   0.375rem;   /* 6px — badges, chips */
--radius-md:   0.5rem;     /* 8px — inputs, small buttons */
--radius-lg:   0.75rem;    /* 12px — small cards, dropdowns */
--radius-xl:   1rem;       /* 16px — standard cards */
--radius-2xl:  1.25rem;    /* 20px — large cards, modals */
--radius-3xl:  1.5rem;     /* 24px — hero cards, feature cards */
--radius-full: 9999px;     /* pills, avatars, toggles */
```

---

## Control Heights

```css
--control-xs: 1.75rem;    /* 28px — compact chips */
--control-sm: 2rem;       /* 32px — compact controls */
--control-md: 2.25rem;    /* 36px — standard inputs */
--control-lg: 2.75rem;    /* 44px — glass buttons (generous touch target) */
```

---

## Spacing

4px rhythm base (same as other skills):

```css
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
```

---

## Layout

```css
--sidebar-width:   256px;
--content-sm:      480px;
--content-md:      640px;
--content-lg:      800px;
--content-xl:      1024px;
--content-max:     1280px;

--nav-height:      64px;   /* glass top bar */
--nav-height-web:  68px;   /* glass website nav */
```

---

## Breakpoints

```css
--breakpoint-sm:  640px;
--breakpoint-md:  768px;
--breakpoint-lg:  1024px;
--breakpoint-xl:  1280px;
```

---

## Transitions

```css
--transition-fast:  120ms ease;
--transition-base:  200ms ease;
--transition-slow:  350ms cubic-bezier(0.16, 1, 0.3, 1);
--transition-glass: backdrop-filter 300ms ease, background 300ms ease, border-color 300ms ease, box-shadow 300ms ease;
--transition-hero:  600ms cubic-bezier(0.16, 1, 0.3, 1);
```
