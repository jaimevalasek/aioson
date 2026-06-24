# Motion — Bold Editorial UI

Animation and transition specifications. Motion in Bold Editorial is **cinematic and controlled** — every animation should feel like a deliberate cut or a camera movement. Nothing bouncy, nothing playful, nothing soft.

---

## Motion Principles

1. **Cinematic, not lively.** Motion references film editing: cuts, wipes, slow reveals. The opposite of a bouncing spring or a playful wiggle.
2. **Controlled timing.** Precise durations, smooth deceleration curves. Every timing is intentional — never arbitrary millisecond values.
3. **Sequenced.** Elements enter in sequence, not all at once. Each element earns its moment.
4. **Scroll-driven.** Landing pages use scroll as the primary narrative driver. App interactions use near-instant feedback.
5. **Respect user preference.** Always implement `prefers-reduced-motion` — all animations reduce to opacity only or instant.

---

## Timing Tokens

```css
--transition-fast:  100ms ease;
--transition-base:  200ms ease;
--transition-slow:  400ms cubic-bezier(0.16, 1, 0.3, 1);   /* smooth deceleration */
--transition-hero:  800ms cubic-bezier(0.16, 1, 0.3, 1);   /* hero entrances */
```

---

## Easing Curves

```css
/* Standard — most interactions */
--ease-default:   ease;

/* Enter — elements appearing (deceleration) */
--ease-enter:     cubic-bezier(0.0, 0.0, 0.2, 1.0);     /* ease-out */

/* Exit — elements leaving (acceleration) */
--ease-exit:      cubic-bezier(0.4, 0.0, 1.0, 1.0);     /* ease-in */

/* Smooth deceleration — premium feel for reveals */
--ease-decel:     cubic-bezier(0.16, 1, 0.3, 1);
```

Rules:
- Never use `cubic-bezier` with overshoot (no spring/bounce) — that is Warm Craft territory.
- Exit transitions are always faster than enter: rule is 60% of enter duration.

---

## Entrance Animations

### Fade In (default)
```css
@keyframes editorial-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.fade-in {
  animation: editorial-fade-in 300ms var(--ease-enter) both;
}
```

### Fade Up (cards, sections)
```css
@keyframes editorial-fade-up {
  from {
    opacity: 0;
    transform: translateY(24px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.fade-up {
  animation: editorial-fade-up 500ms var(--ease-decel) both;
}
```

Note: 24px translate (larger than warm-craft's 12px) — more cinematic entrance distance.

### Reveal Slide (headlines, images — clip-path)
```css
@keyframes editorial-reveal {
  from { clip-path: inset(0 0 100% 0); }
  to   { clip-path: inset(0 0 0% 0); }
}

.reveal-slide {
  animation: editorial-reveal 600ms var(--ease-decel) both;
}
```

Use for: section headlines, large images, hero text. The content appears as if a curtain lifts.

### Scale Reveal (modals, product frames)
```css
@keyframes editorial-scale-in {
  from {
    opacity: 0;
    transform: scale(0.92);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.scale-in {
  animation: editorial-scale-in 350ms var(--ease-decel) both;
}
```

### Slide In (drawers, side panels)
```css
@keyframes editorial-slide-right {
  from {
    opacity: 0;
    transform: translateX(32px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.slide-in-right {
  animation: editorial-slide-right 350ms var(--ease-decel) both;
}
```

---

## Word-by-Word Reveal (Manifesto / Statement heroes)

For large statement headlines where each word appears sequentially:

```javascript
// Split headline into word spans, apply staggered delays
function setupWordReveal(element) {
  const words = element.textContent.split(' ');
  element.innerHTML = words
    .map((word, i) => `<span class="word-reveal" style="animation-delay:${i * 40}ms">${word}</span>`)
    .join(' ');
}
```

```css
.word-reveal {
  display: inline-block;
  opacity: 0;
  transform: translateY(8px);
  animation: editorial-fade-up 400ms var(--ease-decel) both;
}
```

Rules:
- 40ms per word (faster than character-by-character — more cinematic).
- Max 12 words in a single animated headline — beyond this, split into two separate elements.
- Only for headlines at `text-4xl` and above.

---

## Counter Roll (Stat Numbers)

For metrics and KPI numbers that animate from 0 to their final value on scroll entry:

```javascript
function animateCounter(element, target, duration = 1200) {
  const start = performance.now();
  const update = (now) => {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // ease-out curve
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = Math.floor(eased * target).toLocaleString();
    if (progress < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}
```

Rules:
- Duration: 1200ms (slow enough to feel intentional, fast enough to not frustrate).
- Trigger: on first viewport entry via IntersectionObserver, threshold 0.3.
- Never re-trigger: once counted, never reset on scroll back.
- Format output to match final value (commas, currency symbol, % sign, etc.).

---

## Stagger Sequences

For card grids and feature lists entering together:

```css
.stagger-group > * {
  animation: editorial-fade-up 500ms var(--ease-decel) both;
}

.stagger-group > *:nth-child(1) { animation-delay:   0ms; }
.stagger-group > *:nth-child(2) { animation-delay:  80ms; }
.stagger-group > *:nth-child(3) { animation-delay: 160ms; }
.stagger-group > *:nth-child(4) { animation-delay: 240ms; }
.stagger-group > *:nth-child(5) { animation-delay: 320ms; }
.stagger-group > *:nth-child(6) { animation-delay: 400ms; }
```

Rules:
- Stagger delay: 80ms per item (slower than clean-saas, more deliberate — feels authored).
- Max 6 items staggered. After 6, start together.
- Only stagger on first load or scroll entry. Never on re-render.

---

## Micro-Interactions

### Button Press
```css
button:active {
  transform: scale(0.98);
  transition: transform 80ms ease;
}
```

### Card Hover
```css
.card-interactive {
  transition: transform var(--transition-slow),
              box-shadow var(--transition-slow);
}

.card-interactive:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-md);
}
```

Note: -4px lift (larger than warm-craft's -2px) — more dramatic hover.

### Media Card Image Zoom
```css
.card-media {
  overflow: hidden;
}

.card-media__image {
  transition: transform var(--transition-slow);
}

.card-media:hover .card-media__image {
  transform: scale(1.03);
}
```

### Input Focus
```css
.input {
  transition: border-color var(--transition-fast),
              box-shadow var(--transition-fast);
}

.input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-dim);
}
```

### Underline Link Animation
```css
.link-editorial {
  position: relative;
  text-decoration: none;
  color: var(--text-heading);
}

.link-editorial::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  width: 0;
  height: 1px;
  background: var(--accent);
  transition: width var(--transition-base) var(--ease-decel);
}

.link-editorial:hover::after {
  width: 100%;
}
```

---

## Scroll Animations (websites only)

Use for landing pages and marketing sections. **Never for app pages.**

### Section Reveal
```css
.scroll-reveal {
  opacity: 0;
  transform: translateY(32px);    /* larger offset than warm-craft — more cinematic */
  transition: opacity 600ms var(--ease-decel),
              transform 600ms var(--ease-decel);
}

.scroll-reveal.visible {
  opacity: 1;
  transform: translateY(0);
}
```

```javascript
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target); // trigger once
    }
  });
}, { threshold: 0.10 });   /* 10% — earlier trigger than warm-craft's 15% */

document.querySelectorAll('.scroll-reveal').forEach(el => observer.observe(el));
```

### Image Reveal (clip-path wipe)
```css
.image-reveal {
  clip-path: inset(0 0 100% 0);
  transition: clip-path 800ms var(--ease-decel);
}

.image-reveal.visible {
  clip-path: inset(0 0 0% 0);
}
```

Use for: case study images, hero product shots, portfolio images. The image slides in from the bottom — cinematic.

### Parallax Depth
```javascript
// Apply subtle parallax to background elements (decorative only — product frames, oversized typographic masks)
window.addEventListener('scroll', () => {
  const scrolled = window.scrollY;
  document.querySelectorAll('[data-parallax]').forEach(el => {
    const speed = parseFloat(el.dataset.parallax) || 0.3;
    el.style.transform = `translateY(${scrolled * speed}px)`;
  });
});
```

Rules:
- Max parallax multiplier: 0.3 (subtle — not a parallax circus).
- Apply only to decorative elements (backgrounds, product frames). Never to readable text.
- Disable below 768px for performance.

---

## Page Transitions

### Content Area Change (tab switch, route change)
```css
.page-content-enter {
  animation: editorial-fade-up 350ms var(--ease-decel) both;
}

.page-content-exit {
  animation: editorial-fade-in 150ms var(--ease-exit) reverse both;
}
```

Rule: exit is faster (150ms) than enter (350ms). Content leaves quickly, arrives with intention.

### Modal Enter/Exit
```css
/* Backdrop */
.modal-backdrop-enter {
  animation: editorial-fade-in 200ms ease both;
}

/* Modal content */
.modal-enter {
  animation: editorial-scale-in 300ms var(--ease-decel) both;
  animation-delay: 50ms;
}

.modal-exit {
  animation: editorial-scale-in 180ms var(--ease-exit) reverse both;
}
```

### Drawer Enter/Exit
```css
.drawer-enter {
  animation: editorial-slide-right 350ms var(--ease-decel) both;
}

.drawer-exit {
  animation: editorial-slide-right 200ms var(--ease-exit) reverse both;
}
```

---

## Loading States

### Skeleton Pulse
```css
@keyframes editorial-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}

.skeleton {
  background: var(--bg-elevated);
  border-radius: var(--radius-md);
  animation: editorial-pulse 2s ease-in-out infinite;
}
```

### Spinner
```css
@keyframes editorial-spin {
  to { transform: rotate(360deg); }
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border-medium);
  border-top-color: var(--accent);
  border-radius: var(--radius-full);
  animation: editorial-spin 700ms linear infinite;
}
```

### Progress Bar Fill
```css
.progress-fill {
  transition: width 500ms var(--ease-decel);
}
```

---

## Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Non-negotiable. Always include this in the global stylesheet. Scroll animations, counter rolls, word reveals, and parallax are all disabled. Static state must be correct without animation.
