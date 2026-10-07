---
name: static-html-patterns
description: Landing page production guide — HTML structure, CSS systems, animations, and premium patterns. Entry point; load the reference files below based on the current task.
load_when:
  structure: "HTML skeleton, hero section, semantic structure, page shell, section layout"
  css-tokens: "CSS tokens, design system, buttons, cards, responsive composition, optional material and motion"
  motion: "GSAP, ScrollTrigger, scroll animations, hero intro timeline, Swiper, slider, carousel, counter animation"
  premium: "optional effectFade, marquee logos, SVG paths, hub-and-spoke, scroll progress, split testimonials, progress bar slider, section contrast, FAQ accordion, watermark footer, cursor trail"
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
| Implementing an effect already justified by the visual direction | `premium.md` |
| Performance, a11y, responsive, images, SCSS | `utilities.md` |
| Planning sections or final QA pass | `checklists.md` |
| Choosing composition, typography, palette or aesthetic register | `.aioson/skills/design/interface-design/SKILL.md` |
| Three.js particles, WebGL effects | `.aioson/skills/static/threejs-patterns.md` (separate skill) |

Reference files are in `.aioson/skills/static/static-html-patterns/`.

---

## Quick rules (always active)

- **Design authority:** the approved prototype and identity govern the result. For origination, use `interface-design` and record a content-specific direction before CSS. This production guide supplies implementation techniques, never a competing aesthetic.
- **Opening composition:** choose its height, alignment, media, density and action count from the visitor's task and available evidence. A product index, typographic opening, photograph, split view or compact introduction can each be appropriate. See `structure.md`.
- **Effects are optional:** static, image-led and typographic pages can meet the premium bar. Mesh, gradient text and tilt are independent techniques, never a bundle or a quality checklist. Reuse the selected identity or `design:seed` tokens, not colors from a code example.
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
