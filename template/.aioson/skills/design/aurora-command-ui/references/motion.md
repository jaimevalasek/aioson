# Motion — Aurora Command UI

Animation system combining glass blur transitions with command center operational feedback.

All animations are CSS-first and stack-agnostic. Add JS (GSAP, Framer Motion, etc.) only when CSS can't achieve the required timing or sequencing.

---

## Timing philosophy

- **Glass transitions**: smooth, unhurried — depth changes feel physical, not instant
- **Data transitions**: fast, precise — numbers and status updates feel live, not laggy
- **Aurora atmosphere**: very slow, almost imperceptible — the background breathes, never distracts
- **Reduced motion**: always provide fallbacks — operational tools are used under pressure

---

## Core easing functions

```css
:root {
  /* Glass physics */
  --ease-glass:     cubic-bezier(0.16, 1, 0.3, 1);   /* spring-like entrance */
  --ease-glass-out: cubic-bezier(0.4, 0, 0.2, 1);    /* glass panel exit */
  --ease-data:      cubic-bezier(0.25, 0.1, 0.25, 1); /* data refresh, counters */
  --ease-command:   cubic-bezier(0.4, 0, 0.6, 1);     /* command strip, alerts */
}
```

---

## 1. Glass entrance — blur-in

The standard entrance animation for glass panels, cards, and modals. Combines fade + Y-translate + blur reveal.

```css
@keyframes glass-entrance {
  from {
    opacity: 0;
    transform: translateY(12px);
    filter: blur(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
    filter: blur(0);
  }
}

.glass-panel {
  animation: glass-entrance 400ms var(--ease-glass) both;
}

/* Staggered entrance for card grids */
.card-grid .glass-panel:nth-child(1) { animation-delay: 0ms; }
.card-grid .glass-panel:nth-child(2) { animation-delay: 60ms; }
.card-grid .glass-panel:nth-child(3) { animation-delay: 120ms; }
.card-grid .glass-panel:nth-child(4) { animation-delay: 180ms; }
```

---

## 2. Glass hover transition

The standard hover state for glass cards — depth increase + glow reveal.

```css
.glass-panel {
  transition:
    background var(--transition-glass),
    box-shadow var(--transition-base),
    border-color var(--transition-base),
    transform 200ms var(--ease-glass);
}

.glass-panel:hover {
  background: var(--glass-elevated);
  box-shadow: var(--shadow-glow);
  transform: translateY(-1px);
}
```

---

## 3. Aurora pulse (background atmosphere)

A very slow, barely perceptible oscillation in the aurora gradient. Creates the sense that the background is alive.

```css
@keyframes aurora-pulse {
  0%   { opacity: 1; }
  50%  { opacity: 0.85; }
  100% { opacity: 1; }
}

@keyframes aurora-drift {
  0%   { transform: translate(0, 0) scale(1); }
  33%  { transform: translate(-20px, 10px) scale(1.02); }
  66%  { transform: translate(10px, -15px) scale(0.98); }
  100% { transform: translate(0, 0) scale(1); }
}

/* Apply only to ambient background field layers */
.aurora-field-layer {
  animation: aurora-drift 20s ease-in-out infinite;
}

.aurora-field-layer-alt {
  animation: aurora-drift 26s ease-in-out infinite reverse;
}
```

**Rule**: aurora-pulse/drift applies only to ambient background field layers. Never animate the page background directly — it causes repaint on every frame.

---

## 4. Command strip live indicator

The pulsing dot on live status items.

```css
@keyframes live-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(0, 200, 232, 0.5);
    opacity: 1;
  }
  50% {
    box-shadow: 0 0 0 6px rgba(0, 200, 232, 0);
    opacity: 0.8;
  }
}

.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent-primary);
  animation: live-pulse 2s ease-in-out infinite;
}

.live-dot.alert {
  background: var(--semantic-amber);
  animation-name: live-pulse-amber;
}

@keyframes live-pulse-amber {
  0%, 100% { box-shadow: 0 0 0 0 rgba(244, 169, 29, 0.5); }
  50%       { box-shadow: 0 0 0 6px rgba(244, 169, 29, 0); }
}
```

---

## 5. Stat counter (number tick-up)

For stat cards and hero metrics. Numbers count up from 0 on page load.

```css
/* CSS-only approach: use a clip animation for the number reveal */
@keyframes number-reveal {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.stat-number {
  animation: number-reveal 600ms var(--ease-glass) 200ms both;
}

/* For JS counter: use this transition on the element */
.stat-number-counting {
  transition: color 200ms ease;
  font-variant-numeric: tabular-nums;
}
```

JS counter snippet (vanilla):
```js
function countUp(el, target, duration = 1200) {
  const start = performance.now();
  const startVal = 0;
  function update(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 4); // ease-out quartic
    el.textContent = Math.floor(startVal + (target - startVal) * ease).toLocaleString();
    if (progress < 1) requestAnimationFrame(update);
    else el.textContent = target.toLocaleString();
  }
  requestAnimationFrame(update);
}
```

---

## 6. Glass panel depth transition (theme switch)

When toggling between dark and light themes, glass surfaces transition smoothly.

```css
[data-theme] * {
  transition:
    background-color 250ms ease,
    color 250ms ease,
    border-color 250ms ease,
    box-shadow 250ms ease,
    backdrop-filter 250ms ease;
}
```

**Warning**: `transition: all` is dangerous for performance in blur-heavy interfaces. Explicitly list only the properties above.

---

## 7. Modal entrance + exit

Glass modal entrance combines scale + blur-in. Exit is the reverse, faster.

```css
@keyframes modal-in {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(8px);
    filter: blur(2px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
    filter: blur(0);
  }
}

@keyframes modal-out {
  from { opacity: 1; transform: scale(1); }
  to   { opacity: 0; transform: scale(0.97); }
}

.modal { animation: modal-in 300ms var(--ease-glass) both; }
.modal.closing { animation: modal-out 180ms var(--ease-glass-out) both; }

/* Overlay */
@keyframes overlay-in {
  from { opacity: 0; backdrop-filter: blur(0); }
  to   { opacity: 1; backdrop-filter: blur(4px); }
}

.modal-overlay { animation: overlay-in 300ms ease both; }
```

---

## 8. Data stream (live activity feed)

For live alert tapes, activity feeds, and command strip updates. New items push in from top.

```css
@keyframes feed-item-enter {
  from {
    opacity: 0;
    transform: translateY(-12px);
    max-height: 0;
  }
  to {
    opacity: 1;
    transform: translateY(0);
    max-height: 80px;
  }
}

.feed-item {
  animation: feed-item-enter 280ms var(--ease-glass) both;
  overflow: hidden;
}
```

---

## 9. Sidebar navigation active state

When navigating between sidebar items, the active indicator slides between items.

```css
.sidebar-item {
  transition:
    background var(--transition-base),
    color var(--transition-base),
    border-color var(--transition-base);
}

/* The accent left border slides in on activation */
.sidebar-item.active {
  border-left: 3px solid var(--accent-primary);
  background: var(--glass-elevated);
  color: var(--text-heading);
}

/* Transition the indicator width from 0 to 3px */
.sidebar-item {
  border-left: 3px solid transparent;
}
```

---

## 10. Chart area fill reveal

For chart area fills — the fill height grows from 0 to full on load.

```css
@keyframes chart-fill-reveal {
  from { opacity: 0; transform: scaleY(0); transform-origin: bottom; }
  to   { opacity: 1; transform: scaleY(1); transform-origin: bottom; }
}

.chart-area-fill {
  animation: chart-fill-reveal 600ms var(--ease-glass) 400ms both;
}
```

---

## Reduced motion

All animations must be disabled or simplified for users with `prefers-reduced-motion: reduce`.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }

  /* Keep only instantaneous opacity transitions — no blur, no movement */
  .glass-panel {
    animation: none;
    opacity: 1;
    transform: none;
    filter: none;
  }

  .aurora-field-layer {
    animation: none;
  }

  .live-dot {
    animation: none;
  }
}
```

---

## Performance rules

1. **Limit simultaneous blur elements** — more than 8-10 `backdrop-filter` composites on screen simultaneously can drop frame rate on lower-end hardware. Use `blur-sm` for cards in grids, `blur-md` for sidebars and top bars.
2. **Use `will-change: transform`** sparingly — only on elements that animate frequently (live dots, feed items).
3. **Ambient field layers use background gradients and opacity**, not `backdrop-filter`. They are environmental, not interactive.
4. **Do not animate `backdrop-filter` blur intensity** — only animate opacity, transform, and box-shadow on glass elements. Animating blur level is expensive.
5. **Frame rate target**: 60fps on modern hardware. Test on an actual mobile device if the product targets mobile users.
