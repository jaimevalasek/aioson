# Websites — Neo-Brutalist UI

Landing pages, marketing sites, personal sites, and product websites. The raw aesthetic applied to first impressions.

---

## Navigation

```css
.site-nav {
  position: sticky;
  top: 0;
  height: 60px;
  background: var(--bg-surface);
  border-bottom: var(--border-thicker);
  display: flex;
  align-items: center;
  padding: 0 var(--space-8);
  gap: var(--space-8);
  justify-content: space-between;
  z-index: var(--z-sticky);
}

.site-nav__logo {
  font-family: var(--font-display);
  font-weight: var(--weight-extrabold);
  font-size: var(--text-lg);
  color: var(--text-heading);
  text-decoration: none;
}

.site-nav__links {
  display: flex;
  gap: var(--space-6);
  align-items: center;
  list-style: none;
}

.site-nav__link {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--text-secondary);
  text-decoration: none;
  padding: var(--space-1) var(--space-3);
  transition: color var(--transition-fast);
}

.site-nav__link:hover {
  color: var(--text-heading);
  /* Thick underline via pseudo-element */
  text-decoration: underline;
  text-decoration-thickness: 2px;
  text-underline-offset: 4px;
}

.site-nav__link--active {
  background: var(--accent);
  color: var(--accent-contrast);
  border-radius: var(--radius-full);  /* pill — playful nav active */
  font-weight: var(--weight-bold);
}

/* CTA in nav: brutalist button */
.site-nav__cta {
  /* use .btn-primary with border-thick */
}
```

### Mobile nav
Below `--breakpoint-lg`:
- Hamburger icon: 3 lines, 2px thick
- Menu: full-screen overlay, `bg-base`, nav items stacked large (`text-xl`), `border-bottom: var(--border-thick)` each item
- Close: `×` bold, top-right

---

## Hero Patterns

### Hero A — Statement Hero

The text IS the visual. No images.

```
bg-base or bg-void
  Optional: pattern-dots or pattern-grid on a background layer (opacity 0.10)

[sticker badge: "[OPEN BETA]" rotated]   ← optional

h1: text-4xl to text-5xl, font-display, weight-extrabold, tracking-normal, max-width 720px

p: text-lg, max-width 560px, color text-secondary, margin-top space-6

[btn-primary (accent, shadow-lg, control-lg)]  [btn-secondary]  ← row, gap space-4, margin-top space-8

[social proof strip: "★★★★★ Loved by 1,200+ indie hackers" in mono text-sm]
```

```css
.hero-statement {
  padding: var(--space-24) var(--space-8);
  max-width: 1200px;
  margin: 0 auto;
  position: relative;
}

.hero-statement h1 {
  font-family: var(--font-display);
  font-size: var(--text-5xl);
  font-weight: var(--weight-extrabold);
  color: var(--text-heading);
  letter-spacing: var(--tracking-tight);
  line-height: 1.1;
  max-width: 720px;
  margin-bottom: var(--space-6);
}

.hero-statement p {
  font-size: var(--text-lg);
  color: var(--text-secondary);
  max-width: 560px;
  line-height: 1.6;
  margin-bottom: var(--space-8);
}

.hero-statement__actions {
  display: flex;
  gap: var(--space-4);
  flex-wrap: wrap;
  align-items: center;
}
```

---

### Hero B — Product Brutalist Hero

Product screenshot in a brutalist browser frame.

```
Left column (50-55%):
  h1: text-3xl, bold
  p: text-base, text-secondary
  [CTA buttons row]

Right column (45-50%):
  [BRUTALIST BROWSER FRAME]
    header bar: bg-elevated, border-bottom: thick, 40px height
    ● ● ● colored dots (red/amber/green) + URL bar mono
    screenshot: border-thicker on the frame itself, shadow-xl
```

```css
.hero-product {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-12);
  align-items: center;
  padding: var(--space-20) var(--space-8);
  max-width: 1200px;
  margin: 0 auto;
}

.browser-frame {
  border: var(--border-thicker);
  box-shadow: var(--shadow-xl);
  background: var(--bg-surface);
  overflow: hidden;
}

.browser-frame__bar {
  height: 40px;
  background: var(--bg-elevated);
  border-bottom: var(--border-thick);
  display: flex;
  align-items: center;
  padding: 0 var(--space-4);
  gap: var(--space-2);
}

.browser-frame__dot {
  width: 12px;
  height: 12px;
  border-radius: var(--radius-full);
  border: var(--border-thick);
}

.browser-frame__dot--red    { background: #EF4444; border-color: #B91C1C; }
.browser-frame__dot--amber  { background: #F59E0B; border-color: #B45309; }
.browser-frame__dot--green  { background: #22C55E; border-color: #15803D; }

.browser-frame__url {
  flex: 1;
  height: 24px;
  background: var(--bg-surface);
  border: var(--border-subtle);
  margin: 0 var(--space-4);
  padding: 0 var(--space-3);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
  display: flex;
  align-items: center;
}

.browser-frame img {
  display: block;
  width: 100%;
}
```

---

### Hero C — Manifesto Hero

Typographic. Like the first page of a self-published zine.

```
bg-base (full width, minimal)

Large text block:
  Mixed sizes: one phrase at text-4xl bold, continuation at text-xl regular
  Specific words with inline highlight: <mark> bg-accent, no border-radius

No images. No decoration. The text is the composition.

CTA: ghost button or text link with thick underline (minimal — not a chunky CTA)
```

```css
.hero-manifesto {
  padding: var(--space-24) var(--space-8);
  max-width: 900px;
  margin: 0 auto;
}

.manifesto-text {
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: var(--weight-bold);
  line-height: 1.3;
  color: var(--text-heading);
  letter-spacing: var(--tracking-tight);
}

/* Inline highlight */
.manifesto-text mark {
  background: var(--accent);
  color: var(--accent-contrast);
  border-radius: 0;
  padding: 2px var(--space-2);
}

.manifesto-cta {
  display: inline-block;
  margin-top: var(--space-10);
  font-family: var(--font-mono);
  font-size: var(--text-base);
  font-weight: var(--weight-bold);
  color: var(--text-heading);
  text-decoration: underline;
  text-decoration-thickness: 3px;
  text-underline-offset: 4px;
}
```

---

### Hero D — Grid Mosaic Hero

Asymmetric grid of colored brutalist cards. Interactive.

```
headline above or overlaid

GRID (asymmetric, e.g. CSS Grid with named areas):
  [2×1 accent card]   [1×1 red card]
  [1×1 blue card]     [1×2 white card with product feature]
  [1×1 green card]    [1×1 accent-dim card]

All cards: border-thicker, shadow-md, hover → shadow-lg push
Background: bg-void
```

```css
.hero-mosaic {
  padding: var(--space-20) var(--space-8);
  background: var(--bg-void);
}

.mosaic-headline {
  font-family: var(--font-display);
  font-size: var(--text-4xl);
  font-weight: var(--weight-extrabold);
  letter-spacing: var(--tracking-tight);
  margin-bottom: var(--space-8);
}

.mosaic-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-template-rows: repeat(3, 160px);
  gap: var(--space-4);
}

.mosaic-card {
  border: var(--border-thicker);
  box-shadow: var(--shadow-md);
  padding: var(--space-6);
  cursor: pointer;
  transition: box-shadow var(--transition-fast);
}

.mosaic-card:hover { box-shadow: var(--shadow-lg); }
.mosaic-card:active { box-shadow: none; transform: translate(4px, 4px); }

.mosaic-card--accent { background: var(--accent); }
.mosaic-card--red    { background: var(--accent-red); color: white; }
.mosaic-card--blue   { background: var(--accent-blue); color: white; }
.mosaic-card--green  { background: var(--accent-green); }
.mosaic-card--white  { background: var(--bg-surface); }
```

---

## Section Patterns

### 1. Feature Grid

3-column grid of brutalist feature cards.

```css
.feature-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-6);
  padding: var(--space-20) var(--space-8);
  max-width: 1200px;
  margin: 0 auto;
}
```

Cards: `.feature-card` component (icon area with bg-accent, title bold, description text-sm).

---

### 2. Alternating Feature

Image and text alternating sides. Images in brutalist frames.

```css
.alternating-feature {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-12);
  align-items: center;
  padding: var(--space-16) var(--space-8);
  max-width: 1200px;
  margin: 0 auto;
}

.alternating-feature:nth-child(even) {
  direction: rtl;  /* swap sides */
}

.alternating-feature img {
  border: var(--border-thicker);
  box-shadow: var(--shadow-lg);
  display: block;
  width: 100%;
}
```

---

### 3. Testimonial

Large centered quote card.

```css
.testimonial {
  background: var(--bg-surface);
  border: var(--border-thicker);
  box-shadow: var(--shadow-md);
  padding: var(--space-10) var(--space-12);
  max-width: 720px;
  margin: var(--space-20) auto;
  text-align: center;
}

.testimonial__quote {
  font-size: var(--text-xl);
  font-style: italic;
  color: var(--text-heading);
  line-height: 1.5;
  margin-bottom: var(--space-6);
}

.testimonial__attribution {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

/* Sticker badge: "[★★★★★]" */
.testimonial__rating {
  /* .sticker component */
  margin-bottom: var(--space-6);
}
```

---

### 4. Stats Strip

Full-width accent band with bold numbers.

```css
.stats-strip {
  background: var(--accent);
  border-top: var(--border-thicker);
  border-bottom: var(--border-thicker);
  padding: var(--space-10) var(--space-8);
}

.stats-strip__grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-8);
  max-width: 1200px;
  margin: 0 auto;
  text-align: center;
}

.stats-strip__number {
  font-family: var(--font-mono);
  font-size: var(--text-3xl);
  font-weight: var(--weight-extrabold);
  color: var(--accent-contrast);
  display: block;
}

.stats-strip__label {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--accent-contrast);
  opacity: 0.75;
}
```

---

### 5. Pricing

2–3 brutalist cards. Featured with sticker badge + shadow-xl.

```css
.pricing-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-6);
  align-items: start;
}

.pricing-card {
  background: var(--bg-surface);
  border: var(--border-thicker);
  box-shadow: var(--shadow-md);
  padding: var(--space-8);
}

.pricing-card--featured {
  box-shadow: var(--shadow-xl);
  position: relative;
}

/* "[BEST VALUE]" sticker — positioned at top-right */
.pricing-card--featured .sticker {
  position: absolute;
  top: calc(-1 * var(--space-3));
  right: var(--space-4);
}

.pricing-price {
  font-family: var(--font-mono);
  font-size: var(--text-3xl);
  font-weight: var(--weight-extrabold);
  color: var(--text-heading);
  margin-bottom: var(--space-6);
}

.pricing-feature {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) 0;
  font-size: var(--text-sm);
  border-bottom: var(--border-subtle);
}

.pricing-feature:last-child { border-bottom: none; }
```

---

### 6. CTA Section

```css
.cta-section {
  background: var(--bg-void);
  padding: var(--space-24) var(--space-8);
  text-align: center;
  position: relative;
  overflow: hidden;
}

/* Optional pattern background */
.cta-section--pattern::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: radial-gradient(var(--border-color) 1px, transparent 1px);
  background-size: 20px 20px;
  opacity: 0.10;
  pointer-events: none;
}

.cta-section h2 {
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: var(--weight-extrabold);
  letter-spacing: var(--tracking-tight);
  margin-bottom: var(--space-8);
  position: relative;
}
```

---

### 7. FAQ

Brutalist accordion — `+` / `−` toggle, not chevron.

```css
.faq-item {
  border: var(--border-thick);
  margin-bottom: -1px;  /* collapse adjacent borders */
}

.faq-trigger {
  width: 100%;
  background: none;
  border: none;
  padding: var(--space-5) var(--space-6);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-family: var(--font-display);
  font-size: var(--text-base);
  font-weight: var(--weight-bold);
  color: var(--text-heading);
  cursor: pointer;
  text-align: left;
}

.faq-trigger:hover { background: var(--bg-elevated); }

.faq-icon {
  font-family: var(--font-mono);
  font-size: var(--text-xl);
  font-weight: var(--weight-bold);
  line-height: 1;
  flex-shrink: 0;
}

.faq-answer {
  padding: 0 var(--space-6) var(--space-5);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  line-height: 1.7;
  border-top: var(--border-subtle);
}
```

---

### 8. Logo Cloud

```css
.logo-cloud {
  padding: var(--space-12) var(--space-8);
  border-bottom: var(--border-thick);
}

.logo-cloud__label {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--text-muted);
  text-align: center;
  margin-bottom: var(--space-6);
}

.logo-cloud__grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-8);
  justify-content: center;
  align-items: center;
}

.logo-cloud__logo {
  /* Black/solid — not grayscale with opacity */
  filter: brightness(0);
  opacity: 0.7;
  height: 28px;
  object-fit: contain;
}

.logo-cloud__logo:hover { opacity: 1; }
```

---

## Footer

```css
.site-footer {
  background: var(--bg-void);
  border-top: var(--border-thickest);
  padding-top: var(--space-12);
}

.site-footer__grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-8);
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 var(--space-8) var(--space-12);
}

.footer-section__title {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: var(--weight-bold);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--text-heading);
  margin-bottom: var(--space-4);
}

.footer-section__link {
  display: block;
  font-size: var(--text-sm);
  color: var(--text-secondary);
  text-decoration: none;
  padding: var(--space-1) 0;
  transition: color var(--transition-fast);
}

.footer-section__link:hover {
  color: var(--text-heading);
  text-decoration: underline;
  text-decoration-thickness: 2px;
}

.site-footer__bottom {
  border-top: var(--border-thick);
  padding: var(--space-4) var(--space-8);
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.site-footer__copyright {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
}

/* Social icons: square frames */
.social-icon {
  width: 36px;
  height: 36px;
  border: var(--border-thick);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-heading);
  text-decoration: none;
  transition: background var(--transition-fast);
}

.social-icon:hover { background: var(--bg-elevated); }
```

---

## Anti-Patterns

These patterns are common mistakes in brutalist UI. Avoid all of them.

| Anti-pattern | Why it's wrong | What to do instead |
|---|---|---|
| `box-shadow: 0 4px 12px rgba(0,0,0,0.15)` | Soft blur shadow = NOT brutalist | `box-shadow: 4px 4px 0 #1A1A1A` — zero blur |
| `backdrop-filter: blur(12px)` | Glassmorphism, opposite of brutalist | Remove entirely. No blur anywhere. |
| `border: 1px solid #e5e7eb` | Thin gray border = clean-saas | `border: 2px solid #1A1A1A` — thick, black |
| `border-radius: 8px` to `16px` | "Normal" radius = medium ground | Use `0` or `9999px` only |
| Pastel backgrounds | Soft pastels = glassmorphism | Saturated flat colors or off-white |
| Gradient fills | Gradients = polished SaaS | Flat solid colors only |
| Illustrated empty states | Cute illustrations = "corporate friendly" | `[NO DATA]` in mono |
| Card without border | Floating card = clean SaaS | Every card has a visible border |
| Thin line dividers (`1px #e5e7eb`) | Invisible separators = invisible structure | `border: 2px solid #1A1A1A` |
| Centered long-form body text | Editorial web convention | Left-aligned paragraphs |
| Muted status colors (`#86efac` light green) | Legibility, not signal strength | Full-saturation semantic colors |
| Hover state that only changes opacity | Too subtle | Change background AND border state |
