# Websites — Squarespace Homepage

## Page Topology

```
1.  Header              — Sticky navigation with transparency transition
2.  Hero                — Full-viewport dark section with video background + CTA
3.  Grow Your Business  — Feature grid with icons (6 product areas)
4.  One Platform        — Platform card carousel (videos + images)
5.  Get Started         — Teal CTA section with template thumbnails
6.  Your Domain         — Domain search input
7.  How To              — Step-by-step how-to guide section
8.  Customers Served    — Statistics row (large numbers)
9.  Made With SQSP      — Showcase of customer sites
10. FAQ                 — Accordion FAQ section
11. Support             — Support options grid
12. Conversion          — Final dark CTA section with video
13. Footer              — 4-column links + legal
```

## Section Details

### Header
- **Type:** Sticky navigation
- **Background:** Transparent initially, solid white on scroll
- **Content:** Logo (left), Nav links (center), CTAs (right)
- **Mobile:** Hamburger with drawer

### Hero (#homepage-hero)
- **Background:** Black `rgb(0, 0, 0)` + `<video>` background + `rgba(0,0,0,0.52)` overlay
- **Video:** `video-desktop.webm/mp4` (desktop), `video-mobile.webm/mp4` (< 768px)
- **Height:** ~1007px viewport height
- **Content:**
  - H1: "A website makes it happen" (`var(--text-3xl)`, `var(--font-light)`, white)
  - P: "Start free. No credit card required." (`var(--text-xl)`, white)
  - CTA: "Start now" (`.cta--primary.cta--light` — white button, black text, mix-blend-mode hover)

### Grow Your Business (#grow-your-business)
- **Background:** White or off-white
- **Layout:** Content grid
- **Content:** Feature highlights with icons

### One Platform (#one-platform)
- **Background:** Off-white `rgb(245, 245, 244)`
- **Layout:** Split layout (text + visual)

### Get Started (#get-started)
- **Background:** Off-white `rgb(245, 245, 244)` with rotating template thumbnail cards
- **Content:** Centered CTA + 3 template preview images (rotate/reseda/altaloma)
- **Video:** `templates.webm/mp4` — template showcase animation

### Your Domain (#your-domain)
- **Background:** Light gray `rgb(223, 221, 216)`
- **Layout:** Inline input + button
- **Input placeholder:** "Enter your domain"

### How To (#homepage-how-to)
- **Background:** White `rgb(255, 255, 255)`
- **Layout:** Numbered steps with icons
- **Content:** Step-by-step guide to getting started with Squarespace

### Customers Served (#customers-served)
- **Background:** Black `rgb(0, 0, 0)`
- **Layout:** Horizontal stat row
- **Content:** Large numbers + labels
- **Animation:** `.stats__card` uses `fadeIn` 1.2s `var(--ease-sqsp-reveal)` on `.in-view`

### Made With SQSP (#made-with-sqsp)
- **Background:** Off-white `rgb(245, 245, 244)`
- **Layout:** Grid of customer site screenshots
- **Content:** Customer-built site showcases with hover zoom effect
- **Interaction:** `transform: scale(1.04)` on hover, 400ms `var(--ease-sqsp-reveal)`

### FAQ (#homepage-faq)
- **Background:** White `rgb(255, 255, 255)`
- **Layout:** Accordion list — question rows expand to reveal answers
- **Animation:** CSS grid `grid-template-rows: 0fr → 1fr` (same accordion pattern as mobile nav)
- **Interaction:** Click chevron → expand; click again → collapse

### Support (#support)
- **Background:** Off-white
- **Layout:** Grid of support options
- **Content:** Links to help resources

### Conversion (#conversion)
- **Background:** Dark `rgb(26, 26, 26)` (charcoal)
- **Content:** Final headline + CTA
- **Video:** `conversion-centered.mp4` plays in background

### Footer (.footer)
- **Background:** Black
- **Layout:** 4-column grid
- **Columns:** Products, Solutions, Resources, Company
- **Bottom:** Copyright, Privacy, Terms
- **Height:** ~1019px

## Internal Links Discovered

- `/preise` — Pricing page
- `/templates` — Templates gallery
- `/design-de-sites` — Design page
- `/templates/comece-agora` — Start page
- `/sites/construtor-de-sites-com-ai` — AI builder
- `/design-inteligente` — Smart design
- `/websites/criar-um-portfolio` — Portfolio builder
- `/websites/crie-um-blog` — Blog builder
- `/websites/analytics` — Analytics

## Typography Details

### Font Family: Clarkson
- Clarkson is Squarespace's proprietary sans-serif
- Clarkson Serif is the serif variant
- Falls back to Helvetica Neue, Helvetica, Arial, sans-serif

### Font Weights Observed
- 300 (light) — Hero H1
- 400 (normal) — Body, H2, buttons
- 500 (medium) — CTAs, emphasis

### Size Scale
- Hero H1: `var(--text-3xl)` → 42px
- H2: `var(--text-xl)` → 26px
- H3: `var(--text-lg)` → 20px
- Body: `var(--text-base)` → 16px
- Small: `var(--text-sm)` → 14px
- Caption: `var(--text-xs)` → 12px

## Color Palette (Hex)

| Token | Hex |
|-------|-----|
| `--bg-inverse` | #000000 |
| `--bg-charcoal` | #1A1A1A |
| `--bg-teal` | #1E4C41 |
| `--bg-surface` | #F5F5F4 |
| `--bg-elevated` | #DFDDD8 |
| `--text-primary` | #000000 |
| `--text-inverse` | #FFFFFF |
| `--text-muted` | #898989 |
| `--text-light-gray` | #DDDDDD |
| `--border` | #DDDDDD |
| `--error` | #200603 |

## Interaction Summary

1. **Nav scroll:** Transparent → solid at 50px scroll via JS class toggle
2. **Mobile hamburger:** Click → `clip-path: polygon()` wipe animation (600ms) — NOT `translateX`
3. **Mobile accordion:** `grid-template-rows: 0fr → 1fr` CSS transition (700ms)
4. **CTA button hover:** `mix-blend-mode: difference` pseudo-element scales in (300ms) — NOT color transition
5. **Text link hover (`.cta--tertiary`):** Dual linear-gradient `background-position` slide (500ms)
6. **Section scroll-reveal:** `IntersectionObserver` adds `.in-view`, CSS handles `opacity + translateY` (800ms `--ease-sqsp-reveal`)
7. **Stats cards:** Staggered `fadeIn` with 0.1s per card delay
8. **Support arrow hover:** `supportHoverArrow` shimmy keyframe (1.1s infinite)
9. **AI dots:** `rotateAnimation` + `scaleAnimation{Large/Medium/Small}` coordinated (14s infinite)
10. **FAQ accordion:** Same `grid-template-rows` technique as mobile nav

## Design Signatures

1. **Zero border-radius** — Sharp corners everywhere
2. **Clarkson typography** — Distinctive proprietary font
3. **Dark heroes** — Black backgrounds with white text
4. **Teal accents** — Dark teal for CTAs and emphasis
5. **Minimal shadows** — Almost no shadows used
6. **Generous whitespace** — Large section padding
