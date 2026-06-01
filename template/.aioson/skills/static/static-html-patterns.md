---
name: static-html-patterns
description: Landing page production guide — HTML structure, CSS systems, animations, and premium patterns. Entry point; load the reference files below based on the current task.
load_when:
  structure: "HTML skeleton, hero section, semantic structure, page shell, section layout"
  css-tokens: "CSS tokens, design system, Bold & Cinematic, Clean & Luminous, buttons, cards, glassmorphism, gradient text, animated mesh, 3D card tilt"
  motion: "GSAP, ScrollTrigger, scroll animations, hero intro timeline, Swiper, slider, carousel, counter animation"
  premium: "premium patterns, award-worthy, Aigocy, effectFade, marquee logos, SVG paths, hub-and-spoke, scroll progress, split testimonials, progress bar slider, box-black/box-white, FAQ accordion, watermark footer, cursor trail"
  utilities: "performance, lazy loading, fetchpriority, BEM, responsive, accessibility checklist, a11y, Unsplash images, SCSS architecture"
  checklists: "section checklist, pre-delivery, QA, which sections to include, final check"
skip_if: "app dashboard, admin panel, React/Vue/Next.js component — this skill is for static landing pages only"
---

# Static HTML Patterns — Landing Page Production Guide

> Read this skill when building any landing page (`project_type=site`).
> This index is ~100 lines. Load only the reference files you need for the current task.

---

## Loading guide

| Task | Load |
|---|---|
| Building any new page from scratch | `structure.md` + `css-tokens.md` |
| Setting up CSS tokens and design system | `css-tokens.md` |
| Adding animations, scroll reveals, or sliders | `motion.md` |
| Elevating to premium / award-worthy quality | `premium.md` |
| Performance, a11y, responsive, images, SCSS | `utilities.md` |
| Planning sections or final QA pass | `checklists.md` |
| Bold & Cinematic animated mesh, gradient text, 3D tilt | `css-tokens.md` |
| Three.js particles, WebGL effects | `.aioson/skills/static/threejs-patterns.md` (separate skill) |

Reference files are in `.aioson/skills/static/static-html-patterns/`.

---

## Quick rules (always active)

- **Hero law:** the hero is NEVER a grid of cards. Full viewport, animated background, ONE headline, TWO buttons. See `structure.md` Section 0.
- **Bold & Cinematic mandatory trio:** animated mesh + animated gradient text + 3D card tilt. All three required. See `css-tokens.md` Section 2a-extra.
- **Three.js is always additive** — it enhances background/scene layer only. The CSS/design skill tokens govern everything else.
- **No placeholder text in final output.** Real copy or nothing.
- **`prefers-reduced-motion: reduce`** must disable all animations, every time.

---

## 15. When CSS Is Not Enough — Three.js WebGL Patterns

The patterns above (Sections 1–14) cover 95% of landing page visual needs.
When the user explicitly requests particle systems, WebGL scenes, holographic effects,
interactive 3D objects, or scroll-driven 3D camera movement:

**Load `.aioson/skills/static/threejs-patterns.md` instead.**

This is on-demand — never auto-loaded. The triggers are:
- "3D", "WebGL", "three.js", "Three.js"
- "particles", "particle system"
- "cena 3D", "3D scene", "objeto 3D interativo"
- "holographic", "hologram effect"
- "floating objects", "3D cards", "3D background"
- Any explicit request for WebGL or Three.js CDN patterns

**Decision guide — CSS vs Three.js:**

| Effect needed | CSS approach | Three.js needed? |
|---|---|---|
| Mesh gradient background drift | `@keyframes meshDrift` | No — CSS is cleaner |
| Animated gradient text | `@keyframes textGradient` | No |
| 3D card tilt on hover | `perspective(700px) rotateY/X` | No |
| Floating orbs | CSS `border-radius: 50%` + blur | No |
| Canvas cursor trail | Canvas 2D dot array | No |
| Particle aurora (thousands of points) | Canvas 2D limited | **Yes** — WebGL required |
| Interactive 3D object (orbit/rotate) | Not possible | **Yes** |
| Holographic glass with bloom | Not possible | **Yes** |
| Scroll-driven 3D camera parallax | Not possible | **Yes** |
| Floating 3D card grid | Not possible | **Yes** |

Three.js patterns are CDN-only (no npm install) and always additive —
the CSS/design skill tokens continue to govern typography, colors, and layout.
