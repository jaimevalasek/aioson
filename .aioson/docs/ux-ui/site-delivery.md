---
description: "UI/UX site delivery — landing-page composition rules, hero law, motion standards, copy expectations, CSS techniques, and final HTML structure."
agents: [ux-ui]
modes: [executing]
task_types: [site-delivery, landing-page, static-html]
load_tier: trigger
triggers: [project_type site, landing page, marketing page, index.html, static site, full-page HTML]
---

# UX/UI Site Delivery

Use this module when `project_type=site` or the requested deliverable is full-page HTML.

## Landing page mode

Activate this mode after the design direction is chosen.

## Hero law

The hero is never a grid of cards or a list of steps.

The hero is:
- full viewport
- animated background mesh or full-bleed photo
- one large headline
- 1–2 supporting lines
- two buttons
- optional social-proof strip

Card grids, numbered steps, and feature lists belong below the hero.

## Direction-specific motion

### Bold & Cinematic

Apply all three:

1. animated mesh background
2. animated gradient text on the key headline phrase
3. 3D card tilt on hover for non-touch devices with `prefers-reduced-motion` fallback

### Clean & Luminous

Apply:

1. card lift using shadow
2. subtle hover scale
3. restrained entrance motion rather than tilt

## Content crafting

Write real content from the project description. No placeholders.

### Hero
- headline: 6–10 words, action-oriented
- sub-headline: 1–2 sentences expanding the value proposition
- primary CTA: specific verb
- secondary CTA: lower commitment

### Feature or benefit sections
- icon
- short title
- 2–3 sentence description
- outcome-focused copy, not feature-dump language

### Social proof
- testimonial with quote, name, role, company
- or a lightweight "used by teams at..." strip when evidence is limited

### Final CTA
- repeat the primary CTA with urgency or benefit reminder
- remove competing actions

## Image sourcing

Provide usable Unsplash URLs in the format:

`https://images.unsplash.com/photo-{id}?w=1920&q=80&fit=crop`

Infer the domain and propose:
- the specific search query
- 2–3 suggested image IDs

## Modern CSS arsenal

The output HTML/CSS should use these techniques where appropriate:

### Always

```css
:root {
  --color-bg: hsl(...);
  --color-text: hsl(...);
  --color-accent: hsl(...);
  --font-display: 'Font Name', sans-serif;
  --font-body: 'Font Name', sans-serif;
  --radius: Xpx;
  --section-padding: Xpx;
}

* { box-sizing: border-box; margin: 0; }
img { max-width: 100%; display: block; object-fit: cover; }
```

### Bold & Cinematic examples

```css
.hero-overlay {
  background: linear-gradient(135deg,
    hsla(240, 50%, 8%, 0.92) 0%,
    hsla(270, 60%, 20%, 0.7) 60%,
    hsla(300, 40%, 10%, 0.4) 100%
  );
}

.header-glass {
  backdrop-filter: blur(20px) saturate(180%);
  background: hsla(240, 15%, 8%, 0.7);
  border-bottom: 1px solid hsla(255, 100%, 90%, 0.08);
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(32px); }
  to { opacity: 1; transform: translateY(0); }
}
```

### Clean & Luminous examples

```css
.card {
  background: white;
  border: 1px solid hsl(220, 15%, 92%);
  border-radius: var(--radius);
  box-shadow: 0 1px 3px hsla(220, 30%, 10%, 0.06),
              0 8px 24px hsla(220, 30%, 10%, 0.04);
}

.section-title::after {
  content: '';
  display: block;
  width: 48px;
  height: 3px;
  background: var(--color-accent);
  border-radius: 2px;
  margin-top: 12px;
}
```

## HTML structure

Produce a complete `index.html` in the project root with:
- `<head>` including fonts and CSS
- sticky `<header>` with logo, nav, and CTA
- full-viewport hero
- three feature or benefit sections
- social proof section
- final CTA section
- minimal footer
- responsive CSS with a mobile-first breakpoint strategy
- `@media (prefers-reduced-motion: reduce)` fallback
