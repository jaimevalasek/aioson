# Websites — Glassmorphism UI

Landing pages and marketing sites. The gradient substrate rules remain: no glass without gradient.

---

## Navigation (website)

Glass sticky navigation bar. The signature behavior is becoming more opaque as the user scrolls.

```
Structure:
  position: sticky / fixed
  top: 0
  width: 100%
  height: var(--nav-height-web)   /* 68px */
  background: var(--glass-bg)
  backdrop-filter: var(--glass-blur-lg)
  border-bottom: 1px solid var(--glass-border)
  z-index: 100

  Layout: max-width container (1280px), centered, flex align-center
    Left: logo (40px height) + product name (text-base weight-semibold)
    Center: nav links (text-sm weight-medium text-secondary, hover text-heading)
    Right: CTA button (primary gradient, height control-lg)

Scroll behavior (JS):
  At scroll > 20px: background → var(--glass-bg-hover) via transition-glass
  At scroll > 80px: background → var(--glass-bg-active)
```

Mobile navigation:
```
Hamburger trigger: glass icon button (right of logo)
Menu: full-viewport overlay
  background: var(--glass-bg-active)
  backdrop-filter: var(--glass-blur-xl)
  position: fixed, inset: 0
  flex-col, align-center, justify-center, gap-8
  Nav links: text-2xl weight-semibold
  CTA: primary button
  Close: top-right ghost icon button
Animation: fade + scale-materialize 300ms
```

---

## Hero Patterns (choose one per landing)

### A — Aurora Hero

Best for: product launches, crypto, modern SaaS, fintech marketing.

```
Layout: full-viewport (min-height: 100vh)
Background: aurora gradient (mesh of 3-4 desaturated colors)
  gradient: radial-gradient or conic-gradient mesh — violet, blue, pink, teal tones
  Optional: animated color shift (hue rotation 0→20deg, 8s ease-in-out infinite alternate)

Ambient field layer (optional, enhance the aurora):
  1-2 full-bleed gradient washes, position: absolute, z-index: 0
  inset: -20% -10%, no border-radius
  filter: blur(56px) — broad diffusion, not a visible shape
  opacity: 0.22-0.35
  Colors: use accent, accent-secondary, and a pink/teal complementary

Content (z-index: 1, centered):
  Eyebrow label: glass chip (badge style) — "New: Feature X →"
  Headline: text-5xl weight-bold text-heading, tracking -0.03em
    Optional: gradient text on key words (accent-gradient)
  Subtitle: text-lg text-secondary, max-width 520px, centered
  CTA row: primary gradient button + ghost "Learn more" link
  Social proof: "Trusted by X teams" + avatar group (5-6 overlapping avatars) + text-sm text-muted

Scroll indicator: glass pill (text-xs "Scroll to explore" + chevron-down), centered, bottom-8
  Animation: opacity 0→1 after 1s, chevron bounces subtly
```

### B — Product Float Hero

Best for: apps with a strong product UI to showcase.

```
Layout: full-viewport, 2 columns
Background: gradient (more contained than Aurora — 2 color stops)

Left column (content, aligned center-left):
  Eyebrow: glass chip badge
  Headline: text-5xl weight-bold, left-aligned
  Subtitle: text-lg text-secondary, max-width 440px
  CTA row: primary button + ghost link, left-aligned
  Feature list: 3 items with check icons (accent color), text-sm

Right column (product visual):
  Product screenshot/mockup, "floating" in a glass frame:
    Glass Card (radius-2xl, blur-md, shadow-lg, border glass-border)
    transform: rotate(2deg)   /* subtle tilt */
    box-shadow: var(--shadow-lg) — large colored shadow below
    Inner: ::before top reflection
  Optional: second smaller screenshot overlapping, rotate(-3deg), smaller, glass-elevated bg
```

### C — Glass Showcase Hero

Best for: feature-rich SaaS, platforms with multiple value props.

```
Layout: full-viewport, single column centered
Background: gradient substrate (lavender aurora)

Top section (centered):
  Eyebrow chip
  Headline: text-5xl, max-width 640px, centered
  Subtitle: text-lg text-secondary, max-width 480px, centered
  CTA row: 2 buttons centered

Feature cards grid: 3 columns, glass cards with stagger entrance animation
  Each card: icon area (accent-dim bg) + title + description
  Cards have stagger: 0ms / 50ms / 100ms entrance delay

Social proof strip (glass bar, full width):
  Background: glass-bg, blur-md
  "Trusted by leading companies" text-sm text-muted + logo grid (6-8 logos, grayscale)
```

### D — Immersive Media Hero

Best for: media platforms, gaming, entertainment, storytelling products.

```
Layout: full-viewport
Background: full-bleed image or video

Overlay system:
  Bottom gradient: linear-gradient(to top, rgba(bg-void, 0.9) 0%, transparent 60%)
  Glass strip at bottom (NOT a centered card):
    Glass bar, full width, blur-lg, padding 40px 80px
    Contains: headline text-3xl weight-bold + subtitle text-base + CTA button + badge

Floating glass elements (optional):
  Small glass card (top-right): feature highlight or stat
  Glass pill: "Now playing" or context label

Scroll indicator: glass pill at very bottom-center, animated chevron
```

---

## Section Patterns

### 1. Feature Grid

3-column glass feature cards, with staggered entrance as they scroll into view.

```
Container: section, py-32, max-width content-xl
Header: eyebrow chip + headline text-4xl + subtitle text-lg, centered, mb-16

Grid: 3 columns (1 on mobile, 2 on tablet, 3 on desktop), gap-6
Cards: Feature Card component (art-direction.md)
  Stagger entrance: 0 / 50ms / 100ms per card group
  Animation: float-up + glass fade-in
```

### 2. Alternating Feature

Image and text alternating sides, reinforcing product value.

```
Sections (2-4 alternating rows), py-24, gap-16
Row: 2 columns (image + text), reverse on even index

Image side: product screenshot in Glass Card (radius-2xl, shadow-lg, rotate ±1-2deg)
Text side: aligned center
  Eyebrow: glass chip badge
  Title: text-3xl weight-bold
  Description: text-base text-secondary
  Feature list: 3 items with check icons
  CTA: ghost link or glass button
```

### 3. Testimonial

```
Background: gradient section (different from hero — use subtle variant)
Container: max-width content-md, centered

Glass card (radius-2xl, blur-lg, shadow-md, featured style):
  Quote icon: large, accent-dim color
  Quote text: text-xl italic text-heading, line-height 1.7
  Attribution: avatar (glass-bordered) + name weight-semibold + role text-secondary
```

### 4. Stats Strip

Large numbers that establish credibility.

```
Glass bar (full width, not a card):
  Background: glass-bg, backdrop-filter blur-md
  Border top + bottom: glass-border
  Padding: py-12
  Layout: flex, justify-center, gap-16 (dividers: 1px glass-border between items)

Each stat:
  Number: text-4xl weight-bold gradient text (accent-gradient)
  Label: text-sm text-secondary, mt-1
```

### 5. Pricing Glass

```
Section: py-32, gradient bg
Header: headline + billing toggle (glass toggle switch: monthly/annual)

Cards grid: 2-3 columns, max-width 900px
  Standard card: Glass Card (radius-2xl)
  Featured card ("Most Popular"):
    Glass Card with featured modifier: border 1px rgba(accent 0.30), shadow-glow
    Badge "Most Popular" (glass badge, accent) at top
    Slightly larger/taller than other cards

Each card:
  Plan name: text-lg weight-semibold
  Price: text-4xl weight-bold (gradient text for featured) + /month text-sm text-muted
  Description: text-sm text-secondary
  Feature list: checkmarks with glass icon area
  CTA: primary gradient (featured) or glass button (others)
```

### 6. CTA Section

```
Container: glass card (radius-3xl, blur-lg, shadow-lg, max-width content-lg, mx-auto)
  Background: subtle accent gradient tint (accent-dim, 0.08 opacity) + glass-bg

Inside:
  Eyebrow chip
  Headline: text-4xl weight-bold, centered
  Subtitle: text-lg text-secondary, centered, max-width 480px
  Button row: primary gradient + ghost, centered, gap-4
```

### 7. Logo Cloud

```
Container: py-16
Label: "Trusted by" text-sm text-muted, centered, mb-8

Glass strip (full width):
  Glass bar: blur-md, border top+bottom glass-border, py-8
  Logos: inline-flex, gap-12, overflow hidden (marquee on mobile)
  Logo treatment: grayscale, opacity 0.5, hover: color + opacity 1, transition 200ms
```

### 8. FAQ Accordion

```
Container: Glass Card (radius-2xl, blur-md, max-width content-md, mx-auto)

Item:
  Button (full width): text-base weight-medium text-heading + chevron icon right
  Border bottom: 1px glass-border (except last item)
  Hover: background glass-bg-hover
  Active (open): chevron rotates 180deg

Answer panel:
  Padding: pb-5 px-0 (flush left)
  text-sm text-secondary, line-height 1.7
  Animation: height 0 → auto, opacity 0 → 1, 300ms ease-out
```

---

## Footer

```
Background: glass-bg, backdrop-filter blur-lg
Border top: 1px glass-border
Padding: py-16

Layout: 4 columns
  Col 1: logo + tagline text-sm text-secondary + social icons (glass icon buttons)
  Col 2-4: link groups
    Group label: text-xs uppercase tracking-wider text-muted, mb-4
    Links: text-sm text-secondary, hover text-heading, transition-fast

Bottom bar:
  Border top: 1px glass-border
  mt-12, pt-6
  flex justify-between
  Copyright: text-sm text-muted
  Legal links: text-sm text-secondary, gap-6
```

---

## Anti-Patterns for Websites

1. **Neon colors**: glass marketing is luminous, not neon. Keep saturation < 70%.
2. **Glass over solid white**: if the background is pure white, glass has nothing to reveal. Always use a gradient.
3. **Blur without fallback**: always include `@supports (backdrop-filter: blur(1px))` with a fallback solid background.
4. **Glass on everything**: text, headings, dividers, and inline elements are solid. Glass is for containers (cards, navs, strips, modals).
5. **Dark glass without contrast check**: dark glass can become illegible. Always verify WCAG AA on dark glass cards.
6. **Rainbow gradient**: maximum 3-4 colors in any gradient, all from the same family (cool tones: violet, blue, teal, pink). Never mix warm + cool families.
7. **3+ levels of nested glass cards**: max 2 levels per visible area. More than that creates visual soup and performance issues.
8. **Animated aurora that distracts from content**: if using animated background, keep the animation very slow (8-12s cycle) and very subtle (opacity or hue shift only).
