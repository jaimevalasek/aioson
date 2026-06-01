# Components — pt.squarespace.com

## Button

### Variants

| Variant | Description | Token Usage |
|---------|-------------|-------------|
| `primary` | Solid white bg, dark text | `bg: white`, `color: black` |
| `secondary` | Ghost/outline style | `border: 1px solid var(--border)` |
| `inline` | Text with arrow suffix | `color: var(--text-primary)` |
| `cta--light` | For dark backgrounds | `bg: white`, `color: black` |
| `cta--dark` | For light backgrounds | `bg: black`, `color: white` |

### States

- **default:** Base colors per variant
- **hover (primary/secondary):** `mix-blend-mode: difference` pseudo-element scales in — NOT a color transition. The white pseudo-element with blend mode creates a color inversion effect.
- **active:** Slight scale (0.98) if any
- **disabled:** `opacity: 0.5`, `pointer-events: none`
- **loading:** Spinner or text change

### CTA Hover Mechanic — mix-blend-mode: difference

**This is Squarespace's real CTA effect.** Do NOT implement as a simple `background-color` transition:

```css
.cta--primary,
.cta--secondary {
  position: relative;
  overflow: hidden;
}

.cta--primary::after,
.cta--secondary::after {
  content: '';
  mix-blend-mode: difference;
  background-color: white;
  transform-origin: 0;
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  transform: scaleX(0);
  transition: transform 0.3s cubic-bezier(0.645, 0.045, 0.355, 1);
}

.cta--primary:hover::after,
.cta--secondary:hover::after {
  transform: scaleX(1);
}
```

**Effect:** The white fill + `difference` blend mode inverts the button colors — a black button with white text becomes white with black text without any `color:` change.

### DOM Structure
```html
<a class="cta cta--primary cta--light">Button Text</a>
<!-- or -->
<button class="cta cta--primary">Button Text</button>
```

### Tokens Applied
- `font-family: var(--font-display)`
- `font-size: var(--text-sm)`
- `font-weight: var(--font-medium)`
- `padding: var(--space-3) var(--space-4)`
- `border-radius: var(--radius-none)` (0px)
- `transition: var(--transition-all)`
- `cursor: pointer`

### Tertiary CTA — Sliding Underline (.cta--tertiary)

Text links with an animated dual-gradient underline. The underline slides in from left on hover and out to right on mouse-leave:

```css
.cta--tertiary {
  background-image:
    linear-gradient(currentColor, currentColor),
    linear-gradient(currentColor, currentColor);
  background-size: 100% 1px, 0% 1px;
  background-repeat: no-repeat;
  background-position: -200% 100%, -100% 100%;
  animation: 0.5s cubic-bezier(0.645, 0.045, 0.355, 1) forwards ctaUnderlineSlideOut;
}

.cta--tertiary:hover {
  animation: 0.5s cubic-bezier(0.645, 0.045, 0.355, 1) forwards ctaUnderlineSlideIn;
}
```

Requires `@keyframes ctaUnderlineSlideIn / ctaUnderlineSlideOut` from `motion.md`.

---

## Navigation

### Variants

| Variant | Description |
|---------|-------------|
| `desktop` | Horizontal links, logo left, CTAs right |
| `mobile` | Hamburger + slide-out drawer |

### States

- **default:** Transparent background initially
- **scrolled:** Solid background (e.g. `bg: white`) kicks in after ~50px scroll
- **mobile-open:** Hamburger becomes X, drawer wipes in from right via `clip-path` animation (NOT `translateX`)

### Mobile Menu — clip-path Swipe

The mobile drawer does NOT use `transform: translateX`. It uses `clip-path: polygon()` animation:

```css
/* Open */
.global-navigation__mobile-menu--open {
  animation: 0.6s cubic-bezier(0.165, 0.84, 0.44, 1) forwards swipeIn;
}

/* Close */
.global-navigation__mobile-menu--close {
  animation: 0.6s cubic-bezier(0.165, 0.84, 0.44, 1) forwards swipeOut;
}
```

Requires `@keyframes swipeIn / swipeOut` from `motion.md`. The menu covers full viewport, background `rgb(0, 0, 0)` with white links.

### Accordion (Mobile Nav)

Sub-menus use CSS grid transition — no JS height calculation:

```css
.global-navigation__accordion-content {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.7s cubic-bezier(0.165, 0.84, 0.44, 1),
              padding 0.7s cubic-bezier(0.165, 0.84, 0.44, 1);
}
.global-navigation__accordion-content--open {
  grid-template-rows: 1fr;
}
```

### DOM Structure
```html
<header class="global-navigation">
  <a class="global-navigation__logo-link">Logo</a>
  <nav class="global-navigation__links">
    <a class="cta cta--inline">Products</a>
    <a class="cta cta--inline">Solutions</a>
    <button class="cta cta--inline">Resources</button>
  </nav>
  <div class="global-navigation__cta">
    <a class="cta cta--inline">Login</a>
    <a class="cta cta--primary cta--light">Get Started</a>
  </div>
  <button class="global-navigation__hamb">☰</button>
</header>
```

### Tokens Applied
- `font-family: var(--font-body)`
- `font-size: var(--text-base)`
- `font-weight: var(--font-normal)`
- `padding: var(--space-4) var(--space-4)`
- `gap: var(--space-4)`
- `transition: top var(--transition-medium) var(--ease-sqsp-cta)`

---

## Link

### Variants

| Variant | Description | Context |
|---------|-------------|---------|
| `nav-link` | Navigation links | Header |
| `footer-link` | Footer links | Footer |
| `cta--inline` | Inline CTA with arrow | Various |

### States

- **default:** `color: var(--text-primary)` or `var(--text-inverse)`
- **hover:** `color: var(--text-muted)`, optional underline

### Tokens Applied
- `font-family: var(--font-body)`
- `font-size: var(--text-base)`
- `font-weight: var(--font-normal)`
- `transition: var(--transition-colors)`

---

## Input

### Variants

| Variant | Description |
|---------|-------------|
| `text` | Standard text input |
| `domain` | Domain search input with search button |

### States

- **default:** `border: 1px solid var(--border)`
- **focus:** Border color changes to accent
- **error:** Border color `var(--error)`
- **disabled:** `opacity: 0.5`

### DOM Structure
```html
<div class="input-wrapper">
  <input type="text" class="input input--domain" placeholder="Enter your domain">
</div>
```

### Tokens Applied
- `background: var(--bg-base)`
- `border: 1px solid var(--border)`
- `border-radius: var(--radius-none)`
- `padding: var(--space-3)`
- `font-family: var(--font-body)`
- `font-size: var(--text-base)`

---

## Card

### Variants

| Variant | Description |
|---------|-------------|
| `feature-card` | Icon + title + description |
| `stat-card` | Large number + label |
| `pricing-card` | Price + features + CTA |

### States

- **default:** No shadow, flat design
- **hover:** May have subtle color shift

### Tokens Applied
- `background: var(--bg-surface)` or transparent
- `border-radius: var(--radius-none)`
- `box-shadow: var(--shadow-sm)` (none typically)
- `padding: var(--space-5)`

---

## Card Carousel (Platform / One Platform section)

A horizontally scrollable row of cards that loop. Each card holds a `<video>` or `<img>` with an absolute text label.

### DOM Structure
```html
<div class="card-carousel">
  <div class="card-carousel__track">
    <div class="card-carousel__card">
      <video autoplay muted loop playsinline preload="none">
        <source src="/videos/website-editing.webm" type="video/webm">
      </video>
      <span class="card-carousel__label">Website editing</span>
    </div>
    <!-- repeat cards -->
  </div>
</div>
```

### Key CSS
```css
.card-carousel__card {
  position: relative;
  flex-shrink: 0;
  border-radius: var(--radius-none);
  overflow: hidden;
}

.card-carousel__label {
  position: absolute;
  bottom: var(--space-4);
  left: var(--space-4);
  font-family: var(--font-display);
  font-size: var(--text-sm);
  color: var(--text-inverse);
  background: rgba(0, 0, 0, 0.55);
  padding: var(--space-2) var(--space-3);
}
```

Cards use `preload="none"` — only hero video is eager-loaded.

---

## Section

### Hero Section
- Full viewport dark background (`background: var(--bg-inverse)`)
- Video background: `<video autoPlay muted loop playsInline preload="auto">` with WebM + MP4 sources
- Dark overlay: `rgba(0, 0, 0, 0.52)` absolute layer over video
- Centered content
- Large headline: `font-family: var(--font-display)`, `font-size: var(--text-3xl)`, `font-weight: var(--font-light)`
- Single CTA button (`.cta--primary.cta--light`)

### Content Section
- Max-width container
- Light background
- H2 headline
- Grid or flex content layout

### CTA Section
- Colored background (teal or dark)
- Centered headline + CTA
- White text

### Footer
- Dark background (`bg: var(--bg-inverse)`)
- 4-column grid of links
- Bottom row with legal text
- `padding: var(--space-16) var(--space-8)`

---

## Typography Components

### Display Heading (H1)
```css
font-family: var(--font-display);
font-size: var(--text-3xl);
font-weight: var(--font-light);
color: var(--text-inverse);
line-height: var(--leading-tight);
```

### Section Heading (H2)
```css
font-family: var(--font-display);
font-size: var(--text-xl);
font-weight: var(--font-normal);
color: var(--text-primary);
line-height: var(--leading-normal);
```

### Serif Heading (H3)
```css
font-family: var(--font-serif);
font-size: var(--text-lg);
font-weight: var(--font-normal);
color: var(--text-inverse);
```

### Body Text
```css
font-family: var(--font-body);
font-size: var(--text-base);
font-weight: var(--font-normal);
color: var(--text-primary);
line-height: var(--leading-relaxed);
```

### Caption/Muted
```css
font-family: var(--font-body);
font-size: var(--text-sm);
font-weight: var(--font-normal);
color: var(--text-muted);
```
