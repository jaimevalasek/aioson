# Websites — Clean SaaS UI

Marketing and landing page patterns for B2B SaaS products. Clean, professional, and product-first.

---

## Principles

- **Light by default** — Clean SaaS marketing pages are light. Dark sections exist for contrast moments, not as the base.
- **Product-first** — The product screenshot or demo is the hero, not a generic illustration.
- **Functional copy** — Headlines describe what the product does and for whom. No buzzwords without meaning.
- **Contained radius** — Marketing cards max out at `radius-2xl` (16px). Never rounded beyond that.

---

## Hero Pattern A — Value Proposition Hero

**Use for:** main product landing page, feature launch, primary CTA

```
┌─────────────────────────────────────────────────────────┐
│ [Logo]       Features   Pricing   Docs        [Sign in] [Start free →] │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  The CRM teams          [Product screenshot or          │
│  actually use.           dashboard mockup — right half] │
│                                                          │
│  Manage deals, track     shadow-lg, radius-xl,          │
│  contacts, and close     slight perspective tilt        │
│  more revenue without    (2-3deg) optional              │
│  the complexity.                                         │
│                                                          │
│  [Start free →]  [See demo]                             │
│                                                          │
│  ——————————————————————————————————————                 │
│  Trusted by 1,200+ teams  [logo][logo][logo][logo]      │  ← social proof strip
└─────────────────────────────────────────────────────────┘
```

**Specs:**
- Layout: 50/50 or 55/45 text/visual split — left-aligned text
- Headline: `text-4xl` (desktop) / `text-3xl` (mobile), `font-bold`, `tracking-normal`
- Subtitle: `text-lg text-secondary max-w-md`
- Primary CTA: `control-lg` button, accent
- Secondary CTA: ghost button or text link
- Screenshot: `shadow-lg rounded-xl` — use a real product screenshot, not a mockup illustration
- Social proof: `grayscale` logos, `text-sm text-muted` label above
- Background: `bg-base` or `bg-void` — never a gradient mesh

---

## Hero Pattern B — Centered Announcement Hero

**Use for:** product launch, major feature announcement, simple landing pages

```
┌─────────────────────────────────────────────────────────┐
│                                                          │
│              ┌──────────────────┐                        │
│              │ ✨ New: AI Inbox  │  ← announcement badge │
│              └──────────────────┘                        │
│                                                          │
│         The support tool that scales                     │
│         with your team.                                  │
│                                                          │
│         Handle 10× more tickets without                  │
│         adding headcount.                                │
│                                                          │
│         [Start free →]    [See how it works]             │
│                                                          │
│   ─────────────────────────────────────────────         │
│   [Avatar][Avatar][Avatar] 1,200+ teams love it         │  ← avatar cluster + social proof
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Specs:**
- All centered, `max-w-3xl` container
- Announcement badge: `bg-accent-dim text-accent text-sm px-3 py-1 rounded-full font-medium`
- Headline: `text-5xl font-bold tracking-normal` — up to 2 lines
- Subtitle: `text-xl text-secondary max-w-xl`
- Avatar cluster: 4 overlapping avatars + "X+ teams" text
- Background: `bg-base` — optionally with subtle radial gradient to `bg-void` at bottom

---

## Hero Pattern C — Demo Hero

**Use for:** products where interactivity is the differentiator

```
┌─────────────────────────────────────────────────────────┐
│                                                          │
│   See it in action.                                      │
│   No setup, no credit card.                              │
│                                                          │
│   ┌─────────────────────────────────────────────────┐   │
│   │                                                 │   │
│   │   [Interactive demo or video player]            │   │  ← full-width frame
│   │                                                 │   │
│   └─────────────────────────────────────────────────┘   │
│                                                          │
│        [Start free →]    [Book a demo]                   │
└─────────────────────────────────────────────────────────┘
```

**Specs:**
- Dark section for the demo area — `bg-gray-900` or `bg-void dark` for contrast
- Video/demo frame: `rounded-xl shadow-lg` with browser chrome optional
- Headline above: `text-3xl font-bold text-heading`
- CTAs below the demo, not above
- Keep the section focused — no feature list competing with the demo

---

## Section Patterns

### 1. Feature Grid

**Use for:** feature overview, benefits section

```
┌──────────────────────────────────────────────────────────┐
│         Everything you need to close more deals.          │
│         subtitle text-secondary max-w-2xl centered        │
├──────────────────────┬───────────────────┬───────────────┤
│  [icon]              │  [icon]           │  [icon]       │
│  Pipeline Views      │  Contact Intel    │  Team Inbox   │
│  Visualize your…     │  Never miss a…    │  Collaborate… │
├──────────────────────┼───────────────────┼───────────────┤
│  [icon]              │  [icon]           │  [icon]       │
│  Automation          │  Reporting        │  Integrations │
└──────────────────────┴───────────────────┴───────────────┘
```

- Icon: 24–32px, `text-accent` or semantic color
- Title: `text-base font-semibold text-heading`
- Description: `text-sm text-secondary`
- No card borders, no shadows — clean icon + text on page background
- 3 columns desktop, 2 mobile, 1 below 480px

---

### 2. Feature Deep Dive

**Use for:** flagship features, comparison with competitors, "how it works"

```
┌─────────────────────────────────────────────────────────┐
│  [Product screenshot — left]  The pipeline that moves.  │
│                                No more stale deals.      │
│                                                          │
│                                See exactly where every  │
│                                deal is and what's next. │
│                                                          │
│                                [→ Explore pipeline]      │
├─────────────────────────────────────────────────────────┤
│  Know your customer.          [Product screenshot — right]│
│  Before the call.             ...                        │
└─────────────────────────────────────────────────────────┘
```

- Alternating left/right image+text
- Screenshot: `rounded-xl shadow-md` — browser frame optional
- Headline: `text-2xl font-bold` — benefit-focused, not feature name
- Description: `text-base text-secondary max-w-sm`
- Link: `text-accent font-medium` with `→` arrow

---

### 3. Testimonial Cards

```
┌──────────────────────────────────────────────────────────┐
│  ┌────────────────┐  ┌────────────────┐  ┌─────────────┐│
│  │ "Cut our CRM   │  │ "Finally a     │  │ "The best   ││
│  │ setup time by  │  │ sales tool our │  │ investment  ││
│  │ 80%."          │  │ team loves."   │  │ we made."   ││
│  │                │  │                │  │             ││
│  │ [Avatar]       │  │ [Avatar]       │  │ [Avatar]    ││
│  │ Jane S.        │  │ Mike T.        │  │ Sarah L.    ││
│  │ VP Sales, Acme │  │ Founder, Beta  │  │ Ops, Gamma  ││
│  └────────────────┘  └────────────────┘  └─────────────┘│
└──────────────────────────────────────────────────────────┘
```

- Card: `bg-surface border border-default rounded-xl p-6 shadow-xs`
- Quote: `text-base text-primary` — actual quote, not a paraphrase
- Avatar: 40px, `radius-full`
- Name: `text-sm font-semibold text-heading`
- Role: `text-sm text-secondary`

---

### 4. Pricing Table

```
┌──────────────┬──────────────────┬──────────────┐
│  Starter     │    Pro           │  Enterprise  │
│              │  ┌ Most popular ┐│              │
│  $29/mo      │  │   $79/mo     ││  Custom      │
│              │  └──────────────┘│              │
│  ✓ Feature   │  ✓ Feature       │  ✓ Feature   │
│  ✓ Feature   │  ✓ Feature       │  ✓ Feature   │
│  ✗ Feature   │  ✓ Feature       │  ✓ Feature   │
│              │                  │              │
│  [Get started]│ [Get started]   │  [Contact us]│
└──────────────┴──────────────────┴──────────────┘
```

- Container: `grid grid-cols-3 gap-4`
- Card: `bg-surface border border-default rounded-xl p-6`
- Featured card: `border-accent border-2 shadow-md` — slight elevation
- "Most popular" badge: `bg-accent text-white text-xs font-medium px-3 py-1 rounded-full`
- Price: `text-3xl font-bold text-heading`
- Feature list: `text-sm text-primary`, `✓` in `text-semantic-success`, `✗` in `text-muted`

---

### 5. Integration Logos

```
Works with your existing stack.

[Salesforce]  [HubSpot]  [Slack]  [Zapier]  [Gmail]  [+40 more]
```

- Logos: grayscale, `opacity-60 hover:opacity-100 transition-opacity`
- Grid: `flex flex-wrap gap-8 justify-center items-center`
- Section title: `text-sm font-medium text-muted text-center mb-6`

---

### 6. CTA Banner

```
┌─────────────────────────────────────────────────────────┐
│                                                          │
│       Start closing more deals today.                    │
│       Free for 14 days. No credit card required.         │
│                                                          │
│                  [Start free →]                          │
└─────────────────────────────────────────────────────────┘
```

- Background: `bg-accent-dim` or `bg-elevated` — never full accent background
- Headline: `text-2xl font-bold text-heading text-center`
- Subtitle: `text-base text-secondary text-center`
- CTA: primary button centered, `control-lg`
- Padding: `py-16 px-6`

---

## Navigation (Marketing)

```
[Logo]       Features   Pricing   Customers   Docs      [Sign in]  [Start free →]
```

- Height: `64px`, `bg-surface/90 backdrop-blur sticky top-0 border-b border-default`
- Logo: left-aligned
- Nav links: `text-sm text-secondary hover:text-primary font-medium`
- CTA: primary button `control-md`, right-aligned
- Mobile: hamburger menu, full-screen overlay

---

## Footer

```
[Logo]                     Product      Company      Resources
Tagline                    Features     About        Blog
                           Pricing      Careers      Docs
                           Changelog    Contact      Status

─────────────────────────────────────────────────────────
© 2026 ProductName. All rights reserved.     [Privacy] [Terms]
```

- `bg-surface border-t border-default`
- Logo + tagline: left column
- Link columns: `text-sm text-secondary hover:text-primary`
- Bottom bar: `text-xs text-muted`

---

## Anti-patterns

1. **Gradient mesh backgrounds** — not this skill; cognitive-core can use atmospheric effects
2. **Hand-drawn illustrations** — that is warm-craft; use geometric SVG or product screenshots
3. **Oversized dramatic typography** — that is bold-editorial; clean SaaS headlines are bold but not theatrical
4. **Dark marketing pages as the default** — clean SaaS = light by default; dark sections for contrast moments only
5. **Cards with radius > 16px** — contained radius, moderate feel
6. **More than 2 font weights in a section** — clean, not editorial
7. **Testimonials without real names and companies** — generic "happy customer" kills trust
