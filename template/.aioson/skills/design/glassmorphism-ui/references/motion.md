# Motion — Glassmorphism UI

Animation and transition specifications. Glass motion is defined by blur transitions, opacity shifts, and fluid easing — not bounce or spring.

---

## Principles

- **Fluid**: movements smooth as a surface of water. Generous ease-out, never bounce, never overshoot.
- **Layered**: animations respect the depth layers — elements closer to the user animate faster than those further away. Cards animate faster than the background gradient.
- **Luminous**: opacity and blur transitions are first-class citizens (not just position/scale). The "frosting" of a surface appearing or disappearing is a core motion type.
- **Effortless**: nothing should look like it is "trying". Natural movements, no dramatic entrances unless the product is explicitly theatrical (media player, landing hero).

---

## Timing Tokens

```css
--transition-fast:  120ms ease;
--transition-base:  200ms ease;
--transition-slow:  350ms cubic-bezier(0.16, 1, 0.3, 1);
--transition-glass: backdrop-filter 300ms ease,
                    background 300ms ease,
                    border-color 300ms ease,
                    box-shadow 300ms ease;
--transition-hero:  600ms cubic-bezier(0.16, 1, 0.3, 1);
```

`cubic-bezier(0.16, 1, 0.3, 1)` is the smooth deceleration curve — fast start, elegant stop. Use it for entrances and meaningful state changes. Use `ease` for hover/micro-interactions.

---

## Entrance Animations

### 1. Glass Fade In
Card appears as if condensing from air — opacity and blur materialize simultaneously.

```css
@keyframes glass-fade-in {
  from {
    opacity: 0;
    backdrop-filter: blur(0px);
  }
  to {
    opacity: 1;
    backdrop-filter: var(--glass-blur-md);
  }
}
.glass-fade-in {
  animation: glass-fade-in 400ms ease-out forwards;
}
```

Use for: initial page load of glass cards, modal appearance.

### 2. Float Up
Card floats up and materializes — the primary entrance for dashboards and stagger lists.

```css
@keyframes float-up {
  from {
    opacity: 0;
    transform: translateY(16px);
    backdrop-filter: blur(0px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
    backdrop-filter: var(--glass-blur-md);
  }
}
.float-up {
  animation: float-up 450ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
```

Use for: dashboard cards on load, stagger card groups, stat cards appearing.

### 3. Scale Materialize
Element scales up from 95% and solidifies — for modals, dropdowns, and menus.

```css
@keyframes scale-materialize {
  from {
    opacity: 0;
    transform: scale(0.95);
    backdrop-filter: blur(0px);
  }
  to {
    opacity: 1;
    transform: scale(1);
    backdrop-filter: var(--glass-blur-lg);
  }
}
.scale-materialize {
  animation: scale-materialize 350ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
```

Use for: modal open, dropdown menu, context menu, tooltip appearance.

### 4. Glass Slide
Slides in from a direction and materializes — for drawers, panels, and side sheets.

```css
@keyframes glass-slide-right {
  from {
    opacity: 0;
    transform: translateX(-20px);
    backdrop-filter: blur(0px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
    backdrop-filter: var(--glass-blur-lg);
  }
}
@keyframes glass-slide-up {
  from {
    opacity: 0;
    transform: translateY(20px);
    backdrop-filter: blur(0px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
    backdrop-filter: var(--glass-blur-lg);
  }
}
```

Use for: sidebar opening (slide-right), bottom sheet (slide-up on mobile), toast notifications (slide-up from bottom-right).

### 5. Ambient Field Reveal
Background ambient gradient washes appear softly for landing pages and auth pages.

```css
@keyframes ambient-field-reveal {
  from {
    opacity: 0;
    transform: scale(0.8);
  }
  to {
    opacity: 0.45;
    transform: scale(1);
  }
}
.ambient-field-layer {
  animation: ambient-field-reveal 800ms ease-out forwards;
}
```

Use for: ambient gradient washes on landing pages and auth backgrounds. These should be slow and atmospheric.

---

## Glass-Specific Animations

### 1. Blur Shift (nav on scroll)
Navigation glass becomes more opaque and blurred as the user scrolls — structural, not decorative.

```css
/* Applied via JS, toggling a class based on scrollY */
.nav-bar {
  background: var(--glass-bg);
  transition: var(--transition-glass);
}
.nav-bar.scrolled {
  background: var(--glass-bg-hover);
}
.nav-bar.deep-scrolled {
  background: var(--glass-bg-active);
}
```

Breakpoints: `scrollY > 20` → scrolled, `scrollY > 80` → deep-scrolled.

### 2. Opacity Frost (card hover)
The card's glass becomes more opaque on hover — the primary hover behavior for all glass cards.

```css
.glass-card {
  background: var(--glass-bg);
  box-shadow: var(--shadow-sm), var(--shadow-inner);
  transition: var(--transition-glass);
}
.glass-card:hover {
  background: var(--glass-bg-hover);
  box-shadow: var(--shadow-md), var(--shadow-inner);
}
```

Duration: 200ms — fast enough to feel responsive, slow enough to feel smooth.

### 3. Glow Pulse (featured/highlighted elements)
Subtle accent glow pulsing for featured cards, stat heroes, and highlighted elements.

```css
@keyframes glow-pulse {
  0%, 100% { box-shadow: var(--shadow-md), 0 0 20px rgba(124, 58, 237, 0.10); }
  50%       { box-shadow: var(--shadow-md), 0 0 40px rgba(124, 58, 237, 0.20); }
}
.glass-card--glow {
  animation: glow-pulse 2s ease-in-out infinite;
}
```

Use sparingly — only for the 1 "hero" element per screen. Not for every card.

### 4. Shimmer (skeleton loaders)
Gradient light sweeping across glass surface — the loading state for glass components.

```css
@keyframes shimmer {
  to { transform: translateX(100%); }
}
.skeleton {
  position: relative;
  overflow: hidden;
  background: var(--glass-bg);
}
.skeleton::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.10) 50%,
    transparent 100%
  );
  transform: translateX(-100%);
  animation: shimmer 1.5s infinite;
}
```

### 5. Aurora Shift (animated background — landing only)
Very slow color hue shift on the aurora gradient background.

```css
@keyframes aurora-shift {
  0%   { filter: hue-rotate(0deg); }
  50%  { filter: hue-rotate(15deg); }
  100% { filter: hue-rotate(0deg); }
}
body[data-aurora] {
  animation: aurora-shift 10s ease-in-out infinite;
}
```

Constraint: only use on landing pages. Never inside apps or dashboards. Keep cycle slow (8-12s). Intensity very low (max 20deg hue rotation).

---

## Stagger

When animating multiple cards into view simultaneously:

- **Delay per item**: 50ms (between warm-craft at 60ms and clean-saas at 40ms)
- **Maximum stagger group**: 6 items
- **Default animation**: `float-up` with staggered delay
- **Implementation**: CSS custom property or inline `animation-delay`

```css
.stagger-item:nth-child(1) { animation-delay: 0ms; }
.stagger-item:nth-child(2) { animation-delay: 50ms; }
.stagger-item:nth-child(3) { animation-delay: 100ms; }
.stagger-item:nth-child(4) { animation-delay: 150ms; }
.stagger-item:nth-child(5) { animation-delay: 200ms; }
.stagger-item:nth-child(6) { animation-delay: 250ms; }
```

---

## Hover States (summary)

| Element | Hover behavior | Duration |
|---------|---------------|----------|
| Glass Card | `glass-bg` → `glass-bg-hover` + `shadow-sm` → `shadow-md` | 200ms |
| Primary Button | `brightness(1.05)` + `shadow-sm` → `shadow-md` | 120ms |
| Glass Button | `glass-bg` → `glass-bg-hover` | 120ms |
| Nav items (sidebar) | `transparent` → `glass-bg-hover` | 150ms |
| Nav links (website) | `text-secondary` → `text-heading` | 150ms |
| Logo cloud | `grayscale opacity-50` → `color opacity-100` | 200ms |
| Links | underline opacity `0` → `1` | 150ms |
| Images in glass frame | `scale(1)` → `scale(1.02)` inside `overflow: hidden` | 300ms |

---

## Scroll Animations (websites only)

### Ambient Field Drift
Ambient gradient field layers move at a slower rate than the scroll:
```css
/* Applied via JS with requestAnimationFrame */
.ambient-field-layer {
  transform: translateY(calc(var(--scroll-y) * 0.3px));
}
```
Multiplier: 0.3-0.5 for subtle field drift.

### Section Reveal
Glass cards and sections fade up as they enter the viewport:
```javascript
const observer = new IntersectionObserver(
  (entries) => entries.forEach(e => {
    if (e.isIntersecting) e.target.classList.add('float-up');
  }),
  { threshold: 0.1 }
);
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
```
Threshold: 0.1 — triggers when 10% of element is visible.

### Nav Frost (scroll-triggered)
Navigation glass increases opacity as scroll position increases — see Blur Shift above.

---

## Page Transitions

| Transition | In | Out |
|-----------|-----|-----|
| Route change (SPA) | `glass-fade-in` 350ms + `float-up` 350ms | `opacity` 0, 200ms |
| Modal open | `scale-materialize` 300ms | `opacity + scale(0.97)` 150ms |
| Bottom sheet open | `glass-slide-up` 350ms | `glass-slide-up` reversed 250ms |
| Tab content | `opacity 0→1` 200ms | `opacity 1→0` 150ms |
| Toast in | `glass-slide-up` 350ms | `opacity 1→0 + translateY(8px)` 200ms |
| Dropdown open | `scale-materialize` 200ms | `opacity 1→0 + scale(0.97)` 150ms |

---

## Reduced Motion

**Mandatory**: always respect `prefers-reduced-motion: reduce`.

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

Specific overrides for glass:
- No animated shimmer on skeletons — use static `glass-bg`
- No `glow-pulse` — use static `shadow-glow`
- No `aurora-shift` — use static gradient
- No ambient-field parallax — background layers stay fixed
- Glass effects (blur, opacity, borders) remain — they are static visual properties, not animations
- Hover states: instant transitions (no 200ms transitions — snap immediately)
