# Website Layouts — Bold Editorial UI

Composition guides for landing pages, product pages, and marketing sites. Uses tokens from `design-tokens.md` and components from `components.md`.

---

## General Website Rules

1. **Typography dominates.** The headline is the hero. If the design relies on an image to carry impact, the type is not working hard enough.
2. **Dark default, light as contrast.** Marketing pages use near-black backgrounds. Light sections feel like spotlights — use them intentionally.
3. **Editorial pacing.** Every page must follow a rhythm: dense impact → white space → impact → pause. Never four identical sections.
4. **Mono captions everywhere.** Every overline, category, date, and section label uses `var(--font-mono)` + uppercase + wide tracking.
5. **One accent moment per viewport.** The CTA button or the one key visual element gets `--shadow-glow`. Nothing else.
6. **Real copy.** No Lorem ipsum. Headlines must be uncomfortable to read — not clever taglines, but statements that mean something.
7. **No warm aesthetics.** No rounded corners above `radius-xl`, no serif fonts, no warm beige backgrounds.

---

## Navigation

```
STICKY HEADER
  height: 64px
  background: rgba(10, 10, 10, 0.85)  /* --bg-base + opacity */
  backdrop-filter: blur(12px)
  border-bottom: 1px solid var(--border-subtle)
  position: sticky; top: 0
  z-index: var(--z-sticky)
  padding: 0 var(--space-8)
  display: flex; align-items: center; justify-content: space-between

  Logo (left):
    font-display, weight-bold, text-lg, text-heading, no decoration

  Nav links (center):
    font-body, text-sm, weight-medium, text-secondary
    hover: text-heading
    active: text-heading + 1px solid border-accent bottom (optional)

  CTA (right):
    .btn-primary, compact height 36px
    OR .btn-ghost + .btn-primary side by side

MOBILE (< 768px)
  Hamburger icon → full-screen overlay menu
  background: var(--bg-base) at 0.96 opacity
  Nav items stacked vertically, text-xl, font-display
  CTA at bottom
  Close button top-right
```

---

## Hero Patterns

### Pattern A — Statement Hero

```
+-----------------------------------------------------------+
|  BACKGROUND: var(--bg-base) or var(--bg-void)             |
|  Optional: grain texture overlay at 3% opacity            |
|                                                           |
|  MONO OVERLINE (centered or left)                         |
|  "INTRODUCING / PRODUCT — 2025" in font-mono              |
|                                                           |
|  HEADLINE                                                 |
|  font-display, text-5xl, weight-bold                     |
|  letter-spacing: var(--tracking-tighter)                  |
|  line-height: var(--leading-tight)                        |
|  max-width: 800px, text-align: left or center            |
|  color: var(--text-heading)                               |
|                                                           |
|  SUBTITLE                                                 |
|  font-body, text-lg, text-primary, max-width: 560px      |
|                                                           |
|  [CTA Hero Button]   [Ghost Button — optional]           |
|  .btn-hero with shadow-glow                               |
|                                                           |
|  SOCIAL PROOF (optional)                                  |
|  "Used by engineers at [logos]" — mono text-xs           |
|                                                           |
+-----------------------------------------------------------+
```

Use when: the message IS the product. Vision, manifesto, or pure product statement. No visual needed.

### Pattern B — Product Theater Hero

```
+---------------------------+---------------------------+
|                           |                           |
|  OVERLINE (mono)          |  PRODUCT VISUAL           |
|                           |  screenshot / terminal    |
|  HEADLINE                 |  floating at 1-2deg tilt  |
|  text-4xl or text-5xl    |  border: --border-medium  |
|  font-display, bold       |  radius: --radius-lg      |
|                           |  shadow: --shadow-xl      |
|  SUBTITLE                 |    + shadow-glow          |
|  text-lg, text-primary   |                           |
|  max-width: 480px         |  gradient radial behind   |
|                           |  the product (subtle      |
|  [Hero CTA]               |  spotlight effect)        |
|                           |                           |
|  MONO TRUST LINES         |                           |
|  version badge + metrics  |                           |
|                           |                           |
+---------------------------+---------------------------+
```

Use when: product has a strong visual — UI, terminal, API, diagram. Let the product be the proof.

### Pattern C — Split Cinematic Hero

```
+-------------------+-----------------------------------+
|                   |                                   |
|  HEADLINE         |  HIGH-CONTRAST VISUAL             |
|  text-5xl+       |  Full-bleed image or video        |
|  bold, white     |  Dark overlay gradient             |
|                   |  (rgba(10,10,10,0.4))             |
|  SUBTITLE        |                                   |
|                   |  OR: Abstract dark illustration  |
|  [CTA]           |  code aesthetic, data visualization|
|                   |                                   |
+-------------------+-----------------------------------+
```

Use when: brand-heavy experience, premium product, emotional product story.

### Pattern D — Full-Bleed Hero

```
+-----------------------------------------------------------+
|  FULL-VIEWPORT background                                 |
|  Video or high-contrast dark photography                  |
|  Gradient overlay: rgba(10,10,10,0.55) uniform           |
|  OR darker at bottom — text area                          |
|                                                           |
|  Centered content, max-width: var(--content-sm)          |
|                                                           |
|  MONO OVERLINE                                            |
|  HEADLINE — white, text-5xl, centered                    |
|  [CTA — accent, centered]                                 |
|                                                           |
|  SCROLL INDICATOR (bottom center)                         |
|  animated chevron or line pulsing down                    |
|                                                           |
+-----------------------------------------------------------+
```

Use when: cinematic, atmospheric, experience-first products.

---

## Section Patterns

### Feature Alternating

```
SECTION 1 (visual left, text right)
+---------------------------+---------------------------+
|  [Product screenshot      |  MONO OVERLINE            |
|   or illustration        |  DISPLAY TITLE (text-2xl) |
|   radius-lg, shadow-lg]   |  DESCRIPTION              |
|                           |  BULLET POINTS or LIST    |
|                           |  [CTA link →]             |
+---------------------------+---------------------------+

SECTION 2 (text left, visual right)
+---------------------------+---------------------------+
|  MONO OVERLINE            |  [Product screenshot      |
|  DISPLAY TITLE            |   different angle]        |
|  DESCRIPTION              |                           |
+---------------------------+---------------------------+
```

Rules:
- Always alternate sides.
- Product visuals get `radius-lg` + `shadow-lg`. Never flat or borderless.
- Vertical padding between sections: `var(--space-24)` minimum.

---

### Metrics Strip

```
HORIZONTAL STRIP (full width, bg-surface card)
  3-5 metrics side by side, divided by 1px border-subtle

  Each metric:
    MONO LABEL (text-xs, text-muted, uppercase, tracking-widest)
    DISPLAY NUMBER (font-display, text-4xl, weight-bold, text-heading)
    TREND (mono text-xs, semantic color)

  padding: var(--space-8) var(--space-12)
  border: 1px solid var(--border-subtle)
  radius: var(--radius-lg)
  shadow: var(--shadow-sm)
```

Rules:
- Numbers animate on scroll entry (see `motion.md` — Counter Roll).
- No individual card frames around each metric — one unified strip.

---

### Testimonial Editorial

```
PULL QUOTE (centered, max-width: 680px)
  Opening quote mark: oversized, accent color, font-display
  QUOTE TEXT: font-display, text-2xl, italic, text-heading, line-height: var(--leading-snug)

  ATTRIBUTION (below quote)
    avatar (40px, radius-md) + name (font-body, weight-semibold) + title + company
    font: text-sm, text-secondary

BACKGROUND: alternating — if page is dark, testimonial section is light (white spotlight moment)
```

Rules:
- One testimonial section per page. Make it count.
- Pull quote is strongly preferred over card grid — this is editorial, not social media.
- Never a gray box. Either dramatic editorial treatment or nothing.

---

### Case Study Cards

```
GRID (2 columns on desktop)
  Each card:
    background: var(--bg-surface)
    border: 1px solid var(--border-subtle)
    radius: var(--radius-lg)
    overflow: hidden

    IMAGE (top, aspect-ratio: 4/3, object-fit: cover)
      On hover: image scale(1.03), dark overlay fades in with project details

    BODY (padding var(--space-6))
      MONO CAPTION — year + category
      TITLE — font-display, text-xl, weight-bold
      DESCRIPTION — font-body, text-sm, text-secondary
```

---

### Logo Cloud

```
HORIZONTAL ROW
  "TRUSTED BY TEAMS AT" — mono label, text-xs, text-muted, uppercase
  Logos: monochrome white (dark theme) or black (light theme), opacity 0.5
  Hover: opacity 1, transition var(--transition-base)
  Container: bg-surface, border-y: var(--border-subtle), padding var(--space-6) 0
```

---

### Pricing Section

```
SECTION HEADER (centered)
  mono overline: "PRICING"
  display title: "Simple, transparent." (font-display, text-3xl)
  subtitle: font-body, text-lg, text-secondary

PRICING CARDS (2-3 columns, centered grid)
  Each card:
    background: var(--bg-surface)
    border: 1px solid var(--border-subtle)
    radius: var(--radius-lg)
    padding: var(--space-8)

    PLAN NAME: mono, text-sm, uppercase, tracking-widest, text-secondary
    PRICE: font-display, text-4xl, weight-bold, text-heading
    PER PERIOD: mono, text-xs, text-muted
    FEATURE LIST: body text-sm, checkmark icons in semantic-green
    CTA: .btn-primary or .btn-secondary (full width)

  Featured card:
    border: 1px solid var(--accent)
    shadow: var(--shadow-lg) + var(--shadow-glow)
    "RECOMMENDED" mono badge above card (rotated -2deg optional)
```

---

### CTA Section (pre-footer)

```
BACKGROUND: alternating from page (if page dark → section light; if page light → section dark)
MAX-WIDTH: var(--content-lg), centered, margin auto
PADDING: var(--space-20) var(--space-8)

MONO OVERLINE: "START TODAY"
DISPLAY TITLE: font-display, text-3xl, weight-bold
SUBTITLE: font-body, text-lg, text-secondary, max-width: 480px
BUTTONS: [Hero CTA] + [Ghost optional]
```

---

## Footer

```
BACKGROUND: var(--bg-void)
BORDER-TOP: 1px solid var(--border-subtle)
PADDING: var(--space-16) var(--space-8) var(--space-8)

LAYOUT (4 columns on desktop, stacked on mobile)
  Column 1: Logo + tagline (font-display, text-sm, italic, text-secondary) + social icons
  Columns 2-4: Link groups

  Link group title:
    font-family: var(--font-mono)
    font-size: var(--text-xs)
    font-weight: var(--weight-medium)
    letter-spacing: var(--tracking-widest)
    text-transform: uppercase
    color: var(--text-muted)
    margin-bottom: var(--space-4)

  Links:
    font: var(--font-body), var(--text-sm), var(--text-secondary)
    hover: var(--text-heading)
    line-height: 2

BOTTOM BAR
  border-top: 1px solid var(--border-subtle)
  margin-top: var(--space-8)
  padding-top: var(--space-6)
  display: flex; justify-content: space-between
  copyright: font-mono, text-xs, text-muted, uppercase
  legal links: font-body, text-xs, text-secondary
```

---

## Anti-Patterns — Never Do This

1. **Generic dark landing page**: gradient mesh background, centered headline, abstract 3D shape in the background. The visual signature of AI-generated zero-personality marketing.
2. **Gradient mesh backgrounds**: `#8B5CF6` → `#EC4899` → `#EF4444` in an mesh. This is explicitly NOT Bold Editorial.
3. **Purple or blue as accent**: this system is red-orange. Blue and purple belong to Glassmorphism and Clean SaaS.
4. **Rounded pill buttons everywhere**: hero buttons use `radius-md` (6px). Only secondary badges are pills. Pill-everything belongs to Warm Craft.
5. **Serif fonts**: Source Serif or any editorial serif is Warm Craft territory. Bold Editorial uses display sans only.
6. **Card grid features with icon + 1-line description**: lazy and undifferentiated. Use alternating features or full feature sections instead.
7. **Equal-size section layout**: four sections all the same height and width. Editorial rhythm requires scale variation.
8. **Emoji as decoration**: never as icons, never as visual anchors.
9. **Stock illustrations**: geometric or hand-drawn generic illustrations. Product screenshots, code, or nothing.
10. **Warm beige backgrounds**: `#FDF8F0` or similar. That's Warm Craft. Bold Editorial uses off-white `#FAFAF7` (light) or near-black (dark).
