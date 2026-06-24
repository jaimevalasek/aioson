# Websites & Landing Pages — Aurora Command UI

Landing pages, marketing sites, and product websites using the aurora-command-ui system.

Requires `design-tokens.md` + `components.md`.

---

## General rules

1. **Aurora gradient spans the full page** — `background-attachment: fixed`, no section resets the background.
2. **Glass nav becomes more opaque on scroll** — starts at `glass-blur-md`, opacity increases as user scrolls.
3. **Aurora field as environmental atmosphere** — page-level radial and linear gradient layers anchored to sections. Keep it broad, subtle, and never shaped like isolated circles.
4. **Mono labels on section eyebrows** — every section starts with a mono uppercase label before the section heading.
5. **One gradient CTA per page** — the primary call-to-action button uses the full `--accent-gradient`. Do not overuse it.
6. **Section contrast through glass density** — vary glass opacity between sections to create visual rhythm. Not every section at the same blur level.

---

## Page shell (landing)

```css
.landing-shell {
  min-height: 100vh;
  background: var(--bg-gradient);
  background-attachment: fixed;
  font-family: var(--font-body);
  color: var(--text-primary);
  overflow-x: hidden;
}

/* Glass navigation */
.landing-nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: var(--z-sticky);
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-8);
  background: rgba(8, 12, 22, 0.40);
  backdrop-filter: var(--glass-blur-md);
  border-bottom: 1px solid var(--glass-border);
  transition: background 300ms ease, backdrop-filter 300ms ease;
}

/* Nav becomes more opaque on scroll — add via JS */
.landing-nav.scrolled {
  background: rgba(8, 12, 22, 0.80);
  backdrop-filter: var(--glass-blur-lg);
}
```

---

## 1. Aurora Hero — Split Layout

For product launches, platform marketing. Avoids the generic centered hero.

```
┌─────────────────────────────────────────────────────────────────┐
│  GLASS NAV                                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  LEFT (text side, 55%):          RIGHT (visual side, 45%):     │
│  [MONO: PLATFORM · V2.0 LAUNCH]  [Glass product card / UI      │
│  [Heading text-5xl tight]         screenshot in glass frame,   │
│  [Subheading text-xl muted]       floating over ambient aurora field]    │
│  [CTA Row: [Gradient Button] [Ghost Button]]                   │
│  [Social proof: 4,200+ teams]    [Teal ambient glow behind frame]  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

```css
.hero-section {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 55% 45%;
  align-items: center;
  padding: 0 var(--space-16);
  padding-top: 80px; /* account for fixed nav */
  position: relative;
}

.hero-text { padding-right: var(--space-12); }

.hero-heading {
  font-size: var(--text-5xl);
  font-weight: var(--weight-black);
  line-height: var(--leading-tight);
  letter-spacing: var(--tracking-tight);
  color: var(--text-heading);
  margin-bottom: var(--space-5);
}

.hero-heading-accent {
  background: var(--accent-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero-subheading {
  font-size: var(--text-xl);
  color: var(--text-secondary);
  line-height: var(--leading-relaxed);
  margin-bottom: var(--space-8);
}

/* Glass product frame */
.product-frame {
  background: var(--glass-surface);
  backdrop-filter: var(--glass-blur-md);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-2xl);
  overflow: hidden;
  position: relative;
  box-shadow: var(--shadow-glow);
}

.product-frame::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--glass-highlight);
  pointer-events: none;
  z-index: 1;
  border-radius: inherit;
}

/* Ambient aurora field behind product frame */
.hero-ambient-field {
  position: absolute;
  inset: -12% -8% -10% 42%;
  background:
    radial-gradient(ellipse at 70% 35%, rgba(0,200,232,0.18), transparent 58%),
    linear-gradient(135deg, rgba(124,58,237,0.16), transparent 62%);
  filter: blur(36px);
  opacity: 0.75;
  pointer-events: none;
}
```

---

## 2. Aurora Hero — Centered (atmospheric)

For manifesto pages, product teasers, atmospheric launches.

```
┌─────────────────────────────────────────────────────────────────┐
│  [Teal aurora field — top center, full-width]                         │
│                                                                 │
│                   [MONO: BUILT FOR SCALE]                      │
│              [Heading — text-5xl, 2–3 lines, center]           │
│           [Subtext — text-xl, max-width 600px, center]         │
│                 [CTA Row — centered]                           │
│                                                                 │
│      [Glass feature strip — 3 items horizontal, below fold]    │
└─────────────────────────────────────────────────────────────────┘
```

Use this variant only when the product visual is not available or the focus is the manifesto text. The aurora field creates the depth.

---

## 3. Feature Section — Glass Cards Grid

```
MONO EYEBROW: PLATFORM CAPABILITIES
Heading: The control center you always wanted. (text-4xl, left-aligned)
Subtext: One line max. (text-lg, muted)

GLASS CARDS GRID (3 col):
┌─────────────────────────────────────────────────────────────────┐
│ ┌────────────────┐  ┌────────────────┐  ┌────────────────┐     │
│ │ [Icon — teal]  │  │ [Icon — teal]  │  │ [Icon — violet]│     │
│ │ Feature title  │  │ Feature title  │  │ Feature title  │     │
│ │ Short desc     │  │ Short desc     │  │ Short desc     │     │
│ └────────────────┘  └────────────────┘  └────────────────┘     │
│ ┌────────────────┐  ┌────────────────┐  ┌────────────────┐     │
│ │ ...            │  │ ...            │  │ ...            │     │
│ └────────────────┘  └────────────────┘  └────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

```css
.features-section {
  padding: var(--space-24) var(--space-16);
  position: relative;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-4);
  margin-top: var(--space-10);
}

.feature-card {
  background: var(--glass-surface);
  backdrop-filter: var(--glass-blur-sm);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-xl);
  padding: var(--space-6);
  position: relative;
  transition: background var(--transition-glass), box-shadow var(--transition-base);
}

.feature-card:hover {
  background: var(--glass-elevated);
  box-shadow: var(--shadow-glow);
}

.feature-card::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: var(--glass-highlight);
  pointer-events: none;
}

.feature-icon {
  width: 40px; height: 40px;
  background: var(--accent-primary-dim);
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--space-4);
  color: var(--accent-primary);
}
```

---

## 4. Stats / Proof Rail

A horizontal glass strip showing key social proof numbers.

```
┌─────────────────────────────────────────────────────────────────┐
│   4,200+          99.9%          <500ms         SOC 2 Type II  │
│   Teams using     Uptime SLA     Avg latency    Certified       │
└─────────────────────────────────────────────────────────────────┘
```

```css
.proof-rail {
  background: var(--glass-surface);
  backdrop-filter: var(--glass-blur-md);
  border-top: 1px solid var(--glass-border);
  border-bottom: 1px solid var(--glass-border);
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  padding: var(--space-8) var(--space-16);
}

.proof-item {
  text-align: center;
  padding: var(--space-4);
  border-right: 1px solid var(--glass-border);
}

.proof-item:last-child { border-right: none; }

.proof-number {
  font-size: var(--text-3xl);
  font-weight: var(--weight-bold);
  background: var(--accent-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  display: block;
}

.proof-label {
  font-family: var(--font-mono);
  font-size: 0.625rem;
  letter-spacing: 0.10em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-top: var(--space-1);
}
```

---

## 5. Pricing Section

Three glass cards. Center card is elevated/featured with gradient border.

```
MONO: PRICING PLANS
Heading: Start free. Scale confidently.

┌──────────────┐  ┌──────────────────┐  ┌──────────────┐
│  STARTER     │  │  PRO (featured)  │  │  ENTERPRISE  │
│  $0/mo       │  │  $49/mo (grad)   │  │  Custom      │
│  Features... │  │  Features...     │  │  Features... │
│  [Ghost btn] │  │  [Gradient btn]  │  │  [Ghost btn] │
└──────────────┘  └──────────────────┘  └──────────────┘
```

```css
.pricing-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-4);
  align-items: start;
}

.pricing-card-featured {
  background: var(--glass-elevated);
  backdrop-filter: var(--glass-blur-lg);
  border-radius: var(--radius-2xl);
  padding: var(--space-8);
  position: relative;
  box-shadow: var(--shadow-glow-strong);
  /* Gradient border */
  background-clip: padding-box;
  border: 1px solid transparent;
}

.pricing-card-featured::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background: var(--accent-gradient);
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}
```

---

## 6. Testimonials Section

```
MONO: TRUSTED BY TEAMS WORLDWIDE
Heading: The command center that teams rely on.

[Glass testimonial cards — masonry or 3-col grid]
Each card:
  Quote text (italic, text-base)
  Avatar + Name + Role/Company
  Teal-electric accent line at top of card
```

---

## 7. Footer

Minimal. Glass strip at the bottom of the aurora background.

```css
.footer {
  background: var(--glass-shell);
  backdrop-filter: var(--glass-blur-md);
  border-top: 1px solid var(--glass-border);
  padding: var(--space-8) var(--space-16);
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
}
```

---

## Anti-patterns

- **Do NOT** reset the background in each section — the aurora gradient must flow continuously top to bottom.
- **Do NOT** use a centered hero with generic "Modern Platform" headline as the only opening move. Use split layout, offset frame, or atmospheric centered with real copy.
- **Do NOT** repeat the same glass card layout in every section. Vary: glass strip, glass split, proof rail, centered manifesto.
- **Do NOT** add neon glows or saturated circular aurora shapes. The field is atmospheric, not decorative neon.
- **Do NOT** use glass pricing cards without the featured-card distinction. The featured card must feel more elevated than the others.
- **Do NOT** put a plain solid white footer on an aurora background page.
