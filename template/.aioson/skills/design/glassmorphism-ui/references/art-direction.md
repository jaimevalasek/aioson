# Art Direction — Glassmorphism UI

Read this file for any page-level work where differentiation matters: apps, dashboards, landing pages, and major flows.

This file exists to stop Glassmorphism UI from collapsing into the same "blur everything and call it done" result every time.

The glass system stays coherent, but the expression must change with the product, the user, and the dominant task.

---

## Core Rule

**Same glass system, different expressions.**

Keep the Glassmorphism DNA:
- gradient background substrate (always)
- backdrop-filter blur as structural depth
- luminous borders (rgba white)
- violet-blue accent with colored shadows
- desaturated, luminous palette

But do **not** keep the exact same card grid, blur intensity, gradient colors, or sidebar composition from product to product.

---

## Mandatory Pre-Build Outputs

Before designing a full page, produce all of these:

1. **Human**
   The real person using this page right now.

2. **Main action**
   The one decision, action, or question that matters most on this screen.

3. **Felt quality**
   Concrete words such as `immersive`, `premium`, `fluid`, `calm`, `sophisticated`, `focused`, `alive`, `trustworthy`.
   Never use empty labels like `modern`, `glassmorphic`, or `beautiful`.

4. **Domain vocabulary**
   At least 5 concepts from the product's world.
   Example for fintech: `portfolio`, `allocation`, `yield`, `position`, `rebalance`.

5. **Material world**
   At least 5 tones or materials that belong to that product world.
   Example for crypto: deep space navy, aurora violet glow, crystalline white, signal green, amber alert.

6. **Defaults to avoid**
   Name 3 obvious glass UI choices that would make the result generic.
   Example: purple gradient background on everything, neon glow borders, glass card with no content hierarchy.

7. **Signature move**
   One memorable glass detail that appears in at least 5 places on the page.
   Example: "stat numbers with accent-gradient text, repeated in hero, chart labels, and metric badges."

If you cannot produce these seven, you are not ready to compose the page.

---

## Expression Modes

Choose **one primary mode** per screen. You may borrow a small amount from a secondary mode only after the main expression is clear.

### 1. Crystal Dashboard
- **For**: fintech, crypto, investment portfolios, modern analytics
- **Feel**: premium, trustworthy, sophisticated, modern
- **Composition**: gradient background → glass stat cards floating → charts with gradient fills → translucent sidebar
- **Visual cues**: strong backdrop-blur (20px+), luminous borders, large numbers in cards with transparent background, gradient fills in chart areas
- **Signature ideas**: glass stat cards with inner glow on hover; chart area fill matches background gradient hue; glass sidebar showing gradient behind it
- **Blur level**: `blur-md` (16px) for cards, `blur-lg` (24px) for sidebar

### 2. Floating Mobile
- **For**: mobile apps, PWAs, iOS-style interfaces, media players
- **Feel**: modern, fluid, polished, delightful
- **Composition**: cards floating over gradient background, glass bottom sheet, floating action buttons, translucent tab bar
- **Visual cues**: very rounded corners (radius-2xl+), glass bottom sheets revealing blurred content behind, inset shadows on cards, icon backgrounds with blur
- **Signature ideas**: bottom sheet revealing glass blur of content underneath; swipeable glass cards; glass tab bar matching iOS Control Center vibe
- **Blur level**: `blur-sm` (8px) for performance on mobile, `blur-md` (16px) for key surfaces

### 3. Aurora Landing
- **For**: product launches, fintech marketing, modern SaaS marketing, crypto projects
- **Feel**: futuristic, elegant, immersive, aspirational
- **Composition**: hero with aurora gradient background (mesh of 2-3 pastel colors), floating glass feature cards, social proof in glass strip
- **Visual cues**: aurora mesh gradient background (color-shifting atmospheric field), glass hero card, floating product screenshots in glass frame, broad ambient light layers
- **Signature ideas**: animated aurora background with slow color shift; glass pricing cards with luminous highlight on featured; glass navigation becoming more opaque on scroll
- **Blur level**: `blur-lg` (24px) for hero card, `blur-md` (16px) for feature cards, `blur-xl` (40px) for background atmosphere

### 4. Media Player
- **For**: music apps, video platforms, podcast players, streaming dashboards
- **Feel**: immersive, atmospheric, contextual, alive
- **Composition**: background is album art with extreme blur, controls over glass surfaces, playlist in glass sidebar, now-playing as central glass card
- **Visual cues**: background adapts to dominant color of current media (color extraction), extreme blur (40px+), glass controls and buttons, progress bar over glass strip
- **Signature ideas**: background color changes based on current media (smooth transition); glass now-playing card with album art reflection effect; volume and progress controls with glass knobs
- **Blur level**: `blur-xl` (40px) for media background, `blur-lg` (24px) for player card, `blur-md` (16px) for playlist

### 5. Zen Workspace
- **For**: note-taking, writing tools, meditation apps, wellness dashboards
- **Feel**: calm, focused, clean, serene
- **Composition**: very subtle gradient background (almost solid), minimal glass cards, generous whitespace, clean typography
- **Visual cues**: light blur (8-12px), almost invisible borders, ultra-subtle gradients, thin/line iconography
- **Signature ideas**: focus mode where glass cards dim everything except the active card; soft ambient background with breathing opacity shift (very slow); glass toolbar that disappears during writing
- **Blur level**: `blur-sm` (8px) throughout — restraint is the signature

---

## Signature Library

These details are immediately available for any glass composition. Pick at least 2 per screen.

| Detail | Usage |
|--------|-------|
| Gradient text on stat numbers | Hero metrics, KPI cards, price displays |
| Top reflection `::before` | Every glass card, modal, sidebar |
| Glass sidebar showing gradient behind | App shell, always |
| Luminous border (rgba white) | All glass containers |
| Colored shadow with violet tint | Cards, modals, elevated elements |
| Accent gradient on primary CTA | Buttons, progress fills, chart fills |
| Glass badge with semantic color tint | Status, labels, chip filters |
| Inner glow on hover | Featured cards, stat cards |
| Glass bottom sheet | Mobile overlays, drawers |
| Aurora gradient background | Marketing heroes, login pages |
| Ambient gradient field | Landing pages, auth pages |
| Glass nav becoming more opaque on scroll | All website navigation |

---

## Anti-Generic Tests

Run all five before presenting the result.

### Glass Test (unique to this skill)
Remove `backdrop-filter: blur(...)` from all cards. If the interface still looks visually coherent and attractive, the glass is decorative, not structural. The transparency must be essential to the hierarchy — background must show through, gradient must be visible behind cards. Fix: reduce glass-bg opacity and ensure gradient substrate is visible.

### Neon Test
Is any color at saturation > 80%? If yes, you're building cyberpunk, not glassmorphism. Glass is desaturated and luminous. Fix: reduce saturation, shift to pastel variants, use violet-blue as accent only.

### Depth Test
Squint your eyes. Can you distinguish 3+ layers of depth? If everything feels flat, the glass isn't working. Fix: increase blur intensity on deeper layers, reduce opacity on background surfaces, add more distinct gradient between layers.

### Squint Test
Does the visual hierarchy hold without reading the text? Glass cards should create visible structure. If everything blurs into the same luminous soup, reduce glass nesting and increase contrast between layers.

### Performance Test
Does the blur cause excessive repaint? Every `backdrop-filter` creates a composite layer. More than 8-10 simultaneous blur elements on one screen can cause performance issues on mobile. Fix: use `blur-sm` on mobile, reduce glass nesting to 2 levels, use `will-change: transform` sparingly.

---

## What Makes Each Mode Distinct

These are the diverging choices — the things that make mode 1 impossible to confuse with mode 5.

| | Crystal Dashboard | Floating Mobile | Aurora Landing | Media Player | Zen Workspace |
|---|---|---|---|---|---|
| Blur intensity | 16-24px | 8-16px | 16-40px | 24-40px | 8-12px |
| Card radius | radius-xl (16px) | radius-2xl+ (20px+) | radius-2xl (20px) | radius-2xl (20px) | radius-xl (16px) |
| Background | Lavender aurora | Clean gradient | Color-shifting aurora | Album art (blurred) | Near-solid subtle gradient |
| Signature element | Gradient stat numbers | Glass bottom sheet | Animated aurora field | Color-responsive background | Disappearing toolbar |
| Motion | Card glow on hover | Swipe gestures | Slow field drift | Color transition on track change | Breathing opacity |
| Density | Medium | Low (mobile) | Low (marketing) | Low (immersive) | Very low |
