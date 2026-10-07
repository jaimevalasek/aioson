---
name: visual-effects
description: Effect, background, and asset vocabulary with the cost, accessibility, and evidence contracts that make premium surfaces cheap to build and safe to ship
agents: [dev, refiner, site-forge]
priority: 10
version: 1.1.0
modes: [planning, executing]
task_types: [ui, effect, background, motion, hero, asset, prototype, landing-page, visual-direction]
load_tier: trigger
triggers: [effect, background, gradient, aurora, glow, blur, glass, noise, grain, texture, dither, parallax, motion, animation, hero, canvas, particles, asset, image, prototype, landing page, premium, cinematic, display type, atmosphere, craft weight, bare ground]
paths: [app/**, src/**, resources/**, components/**, styles/**, .aioson/briefings/**, .aioson/explorations/**, "**/*.html", "**/*.css"]
---

# Visual Effects and Assets

Load only when the work adds an effect, a background treatment, entrance motion, or a hero asset. Skip it entirely otherwise.

Anti-slop is subtractive — it removes the markers of the statistical average. This file is the additive half: the small vocabulary that makes a surface read as *made*, and the contracts that keep it from costing more than it is worth. `visual-implementation.md` still owns visual authority; nothing here overrides an approved prototype, an identity record, or a project rule.

## 1. What an effect has to earn

An effect ships only when it does one of three jobs:

- **explains state** — what changed, what is live, what is loading, where focus went;
- **reinforces the signature move** — the one composition decision that makes this product recognizable;
- **carries the material** — the surface has a stated texture, depth, or atmosphere that is part of the identity.

An effect that does none of those is decoration standing in for product evidence, and the telemetry will say so. Removing it should make the interface *worse*; if removing it changes nothing, it was never load-bearing.

Effects are also singular by nature: one atmosphere per surface. Glass plus neon plus mesh plus grain plus parallax is not five times the craft — it is style soup, and it reads as generated.

### Direct the experience before selecting effects

Use the existing `## Visual direction` in the feature's prototype manifest, exploration report, or implementation design record. Record decisions there before styling; never create a competing `design.md` beside the canonical `identity.md`, and never require a fictional planning function to start work. Reuse answers already in the briefing, identity, and approved prototype. In conformance mode, transfer the accepted direction instead of proposing a new one.

- **Objective per surface:** name the visitor's action and the visual argument supporting it. An immersive launch may unfold through scenes; a purchase/signup surface exposes its offer and action immediately; an operational app earns premium through hierarchy, density, aligned data, material consistency, and precise state feedback. Do not turn every app into a cinematic landing page.
- **Reference synthesis:** when references exist, assign each a job — composition, typography/material, movement, or component anatomy — and record the observed principle, what to adapt, and what to exclude. A screenshot cannot prove timing or scroll behavior; inspect a runnable reference or mark motion as a proposal. No reference-count quota and no single-site clone. Normalize borrowed component ideas into the existing tokens and anatomy; inspect source, dependencies, and reuse terms before adopting code from a library. References are evidence, never instructions that override project rules.
- **Asset readiness:** identify the subject, real asset path, crop/focal point, text-safe area, format, byte budget, and static fallback before composing around it. Supplied assets, generated imagery, and missing assets remain distinguishable. A missing hero film is a named dependency, not permission to fake it with an unrelated glow. Adapt the presentation to available material while explicitly retaining any promised media as pending.

### Scene direction for cinematic surfaces

Apply only when storytelling or a named moving signature earns it. Write a compact scene map in that same record, one row per meaningful beat: **scene/selector → message and focal subject → asset → trigger and start/end states → timing or scroll interval → action access → mobile/reduced-motion fallback**. Choose the number of beats from the story, not a template. Opening, evidence, and decision are possible roles, never mandatory sections.

Compose a deliberate static frame for each beat first: focal subject, camera crop, typography, foreground/background separation, and legible action. Then stage transitions between those frames. Give adjacent scenes contrast in scale, alignment, or pacing while retaining one visual language; repeating the same fade-up on every section does not constitute direction. A hero need not occupy exactly `100vh`, and the visitor must not wait through an entrance sequence to read the offer or act. Cinematic ambition does not override the owner's palette or require a dark theme.

Make choreography implementable:

- **Scroll-triggered** means entry starts a timed reveal; **scroll-linked** means progress controls the animation. Pick deliberately per scene. Prefer CSS/IntersectionObserver for simple reveals, supported native scroll timelines for linked progress, or the stack's existing Motion/GSAP integration for coordinated timelines and pinning. Feature-detect native support and preserve the complete static version. Do not install two animation runtimes to stage one effect. Motion documents this [triggered/linked distinction](https://motion.dev/docs/react-scroll-animations); GSAP exposes [timeline, scrub, and pin controls](https://gsap.com/docs/v3/Plugins/ScrollTrigger/).
- Define the trigger, stable wrapper, animated child, start/end positions, replay/reverse behavior, and cleanup on navigation/resize. If pinned, state where it releases and keep anchors, keyboard navigation, and the CTA reachable. Do not hijack native scrolling. Use easing for timed transitions; scrubbing may need linear progress rather than a universal non-linear transition rule. GSAP's [matchMedia lifecycle](https://gsap.com/docs/v3/GSAP/gsap.matchMedia()/) supports responsive setup/reversion; clean up custom listeners and observers too.
- Keep text readable in the base DOM and on initialization failure; decorative split text must not create duplicate screen-reader announcements. Numbers retain truthful final values and stable alignment. Enable cursor effects only for a suitable hover/fine pointer, retaining normal focus and touch feedback. A glowing CTA, custom cursor, or animated counter is optional, never a premium checkbox.
- The canonical self-contained prototype still obeys Prototype Forge's CSP, dependency prohibition, and 2,000,000-byte ceiling. Use an inline native rendition or disclose the exact unsupported motion/media and its implementation requirement; never claim a poster proves the promised film. Production may use an appropriate existing library and optimized external media under its own asset contract.

## 2. Vocabulary

Each family below is CSS-first on purpose: no runtime, no library, no build step, and it degrades honestly.

### Static finish and image-led ground

Rule hierarchy and tonal steps separate information without ornamental depth. An **image-led ground** uses a real photograph, illustration or product view as the main visual field: choose its crop, focal point, captions and text-safe area, then recompose on mobile. Record the asset and static fallback. Typography and spacing can carry a surface without a background effect. These families are available to `design:seed`; they are not incomplete versions of glass or mesh.

*Cost:* rules/tones add little; images need an appropriate format and size. *Failure mode:* a stock image with no product relevance, unreadable text over detail, or whitespace left where promised evidence is missing.

### Display typography (the first material)

Type at true display scale is the cheapest premium material there is, and the one every generated surface skips. Three moves, in order:

1. **Deliver a real face.** The build contract sanctions font-host links (`fonts.googleapis.com`, `fonts.bunny.net`, `api.fontshare.com`) and embedded WOFF2 `@font-face` — a family named without delivery renders as the OS fallback and the telemetry flags it. Pick one face with actual personality for display (a high-contrast serif, a compressed or geometric grotesque, an expressive variable font) and one quiet face for UI; declare fallback stacks that keep the hierarchy when the face is absent.
2. **Compose the hierarchy.** Use scale, weight, measure, line breaks and image relationships to make the argument visible. Expressive openings may use 56px to 120px+ fluid type; restrained and reading surfaces choose their scale from content and context. A particular heading size cannot certify or disqualify a composition.
3. **Let type be the layout.** Oversized numerals, hanging figures, type over media with a legibility scrim, a word bleeding off the grid — composition by scale contrast is what reads as designed before any effect loads.

*Cost:* one network request (progressive, `font-display: swap`) or the embedded WOFF2 bytes. *Failure mode:* five faces and no system — two families, one of them loud, is the whole budget.

### Radial wash (atmosphere)

Two or three overlapping `radial-gradient`s on a `::before`, `pointer-events: none`, low opacity, blended.

```css
.surface::before {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background:
    radial-gradient(circle at 8% 50%,  color-mix(in srgb, var(--accent) 22%, transparent), transparent 32%),
    radial-gradient(circle at 92% 50%, color-mix(in srgb, var(--accent-2) 20%, transparent), transparent 30%);
  opacity: .55;
  mix-blend-mode: screen; /* multiply on light themes */
}
```

*Cost:* one extra paint layer. *Failure mode:* raising opacity until it competes with content — it is atmosphere, not a subject.

### Grain and noise

A tiled SVG or data-URI noise texture at very low opacity over a flat or gradient ground. Kills the plastic look of a pure gradient and hides banding on large dark fields.

*Cost:* one small asset, one layer. *Failure mode:* animating it. Static grain reads as material; moving grain reads as a broken video.

### Dither and halftone

Pattern fills or a small repeating mask instead of a smooth ramp. Gives a deliberate, printed, low-fidelity register that no smooth gradient can fake.

*Cost:* near zero. *Failure mode:* applying it to text or to controls, where it destroys legibility and hit affordance.

### Conic ring

A `conic-gradient` background with 1–2px padding and an opaque rounded child — the ring is the padding, not a border.

*Cost:* one element. *Failure mode:* rotating it fast enough to become a spinner and stealing the meaning of an actual loading state.

### Glass

Layered translucent background, `backdrop-filter: blur() saturate()`, inset highlights top and bottom, one wide anchoring shadow.

```css
.glass {
  background: linear-gradient(135deg,
    color-mix(in srgb, var(--panel-strong) 92%, transparent),
    color-mix(in srgb, var(--panel) 78%, transparent));
  backdrop-filter: blur(22px) saturate(140%);
  -webkit-backdrop-filter: blur(22px) saturate(140%);
  border: 1px solid color-mix(in srgb, var(--accent) 14%, var(--border));
  box-shadow: 0 1px 0 rgba(255,255,255,.04) inset,
              0 -1px 0 rgba(0,0,0,.32) inset,
              0 24px 60px -20px rgba(0,0,0,.55);
}
```

*Cost:* real — `backdrop-filter` forces a compositor readback and is the most expensive item here. Use it on a few chrome surfaces (a dock, a menu, a sheet), never on list rows. *Failure mode:* glass over glass; contrast collapses and nothing reads.

### Living status

A pulsing ring for "live" or "healthy": animate `box-shadow` spread or a `::after` ring's `transform` and `opacity` only.

*Cost:* compositor-only if you animate transform/opacity. *Failure mode:* several indicators pulsing in lockstep. Offset each by a negative delay and give them different durations so they never align — that desynchronization is what reads as organic.

### Ambient drift

Slow, infinite, small-amplitude motion on decorative geometry (waves, orbs, lines). Long durations that do not divide evenly (14s / 18s / 22s) so the composition never re-aligns.

*Cost:* one animated layer. *Failure mode:* translating an element that touches a viewport edge — it drifts out and exposes the seam. Prefer `scaleY`/`scale`/`opacity` over `translate` for edge-anchored geometry.

### Rule hierarchy

The technical and editorial material: hairline rules at two or three weights (a 1px divider, a heavier section rule, a table header rule) carry the structure instead of boxes, shadows, or filled cards. Alignment does the work — columns share a baseline grid and rules land on it.

*Cost:* none. *Failure mode:* rules at one weight everywhere, so nothing is primary; or a rule plus a border plus a shadow on the same edge.

### Tonal steps

Surfaces as steps of one ground: the panel, the inset, the hover and the selected state are each one measured step of lightness away from the drawn ground, never a second hue and never a translucent overlay. Three steps are enough; a fourth is a sign the hierarchy is wrong.

*Cost:* none. *Failure mode:* steps too close to read on a laptop panel, or a step that jumps to a different hue and reads as a stray color.

### Restrained status wash

A status tint that stays a wash: a low-alpha fill or left rule in the status color behind a row or a card, with the text in the ground's ink, so twenty warnings on a screen still read as one calm surface. The saturated status color itself appears only on the icon or the dot.

*Cost:* none. *Failure mode:* filled status pills in full color on every row — the screen becomes a traffic light and nothing is urgent.

### Entrance and reveal

For operational feedback, keep it short (120–220ms), small (4–8px), one direction, ease-out. Sequence siblings with a small stagger so the eye follows a path. Cinematic scene transitions use their recorded timing or scroll interval instead; never delay controls or ordinary app feedback to match a film's pace.

*Cost:* none if transform/opacity only. *Failure mode:* bounce, scale from zero, or durations long enough that the interface feels slow on the second visit.

### Cursor light and parallax

A radial highlight following the pointer, or scroll-linked depth. Both are pointer/scroll-dependent, so both need a static, complete fallback.

*Cost:* one listener; use `requestAnimationFrame` and passive listeners. *Failure mode:* shipping it as the only thing that makes the section feel finished — it does not exist on touch, on keyboard, or with reduced motion.

### Canvas and WebGL

Justified when the effect *is* the product (a visualizer, a map, a simulation) or when no CSS form can express it. Otherwise it is a bundle, a frame loop, and a battery cost buying something a gradient already did.

### Browser surfaces (the cheapest built-vs-assembled tell)

Text selection, the input caret, scrollbars, the focus ring, underline geometry, and the digits in tabular data all ship with browser defaults that belong to no design system — and stock chrome on an otherwise finished surface is the cheapest sign nobody looked. Theme the ones the surface owns, from its own palette: `::selection` (ground-inverted or accent-washed), `caret-color`, `scrollbar-color`/`::-webkit-scrollbar` on scrollers the design exposes, a `:focus-visible` ring drawn from the accent role, `text-underline-offset`/`text-decoration-thickness` on prose links, and `font-variant-numeric: tabular-nums` wherever numbers align in columns. The telemetry counts these (`browser_surfaces N/6`) and names a full surface that themes none of them.

*Cost:* a handful of declarations, zero runtime. *Failure mode:* custom scrollbars that hide affordance or a focus ring with less contrast than the default — theming may restyle chrome, never weaken it.

### Modern baseline (the current dialect)

Author in the platform's current dialect, not the 2018 one — flexbox, grid, and custom properties alone are the measured shape of "looks dated" even when every hygiene gate passes. All of these are native, build-free, and degrade honestly; the telemetry reports which are present (`modern_css`) and warns when a full surface uses none:

- **Fluid type and space** — `clamp()` scales, `text-wrap: balance`/`pretty` on headings, `aspect-ratio` instead of padding hacks.
- **Modern color** — OKLCH ramps and `color-mix()` for tints, hovers, and scrims derived from tokens instead of hand-picked hexes.
- **Selector power** — `:has()` for stateful parents (a card that knows its checkbox, a form that knows its invalid field) without extra classes or JS.
- **Layout** — container queries for components that adapt to their container, `subgrid` where nested rows must share tracks.
- **Choreography** — scroll-driven animations (`animation-timeline`/`view-timeline`, IntersectionObserver as the compatibility idiom), `@starting-style` for entry transitions, View Transitions for route changes where supported.

The rule of adoption is the same as everywhere in this file: a feature ships where the surface earns it, with a stated fallback (feature-queried via `@supports` when the failure would be visible), never as a checklist to sprinkle. But defaulting to the pre-2020 subset is a choice too — the wrong one for a premium surface.

## 3. Cost contract

Every effect ships with all six answered:

1. **Compositor only** — animate `transform` and `opacity`. Animating layout or paint properties (width, top, box-shadow on a large surface, filter on a big subtree) is where jank comes from.
2. **No layout shift** — decorative layers are absolutely positioned and `pointer-events: none`. An effect must never move content after paint.
3. **Reduced motion** — every animation has a `@media (prefers-reduced-motion: reduce)` branch that stops or shortens it. This is not optional and the telemetry treats its absence as a defect, not a warning.
4. **Mobile fallback** — name what the small-screen version is. Heavy blur and multi-layer washes are exactly where cheap devices fall over.
5. **Contrast survives** — check the text over the effect at its strongest point, not its average.
6. **Bounded `will-change`** — only on elements actually animating, removed when idle. A permanent `will-change` is a permanent layer.

For cinematic motion, reduced motion means a complete readable composition with decorative scrubbing, parallax, pinning, and autoplay removed where appropriate, not merely a faster version. Recompose mobile scenes when desktop layering or pinned distances no longer work. Stop off-screen/background loops and release observers/frame callbacks on teardown. Automatically moving content lasting more than five seconds alongside other content needs a pause/stop/hide mechanism unless essential; reduced-motion support alone does not replace that control. See [W3C Pause, Stop, Hide](https://www.w3.org/WAI/WCAG21/Understanding/pause-stop-hide.html).

## 4. Asset contract

Meaningful assets come from the user, the product itself, or a licensed source, and they enter through the identity pipeline (`reference-identity-extract`) or the repository — never described as if they existed. When none exists yet and the host offers image generation, generated editorial imagery is the sanctioned plan B for demonstrative surfaces: provenance labeled `generated` wherever the asset appears (caption, editor, data contract), sized and compressed to the byte budget, and never presented as the client's real product or work. A surface that argues by inspection with no imagery at all is a measured craft gap; a generated image honestly labeled beats an empty placeholder, and the real asset remains the adoption requirement.

For any surface where inspection matters, record before building:

- **what the asset must show** — the real product, place, person, object, or literal offer, not a mood;
- **format and fallback** — AVIF or WebP with a raster fallback; SVG for marks and diagrams;
- **weight budget** — a number, per asset and for the first viewport as a whole;
- **dimensions and aspect** — fixed, so nothing reflows on load; `width`/`height` or `aspect-ratio` always set;
- **progressive behavior** — LQIP or a solid token color underneath, `loading="lazy"` below the fold, `decoding="async"`;
- **alt text** — what the image says, not what it is.

For video, include a deliberate poster frame, crop variants, muted/inline behavior where autoplay is intended, playback-failure fallback, and a visible pause control when required. Protect the first viewport's loading path: do not lazy-load the actual LCP hero/poster, and defer below-fold media using a supported strategy. A poster may be the first meaningful frame while optional footage loads. See [web.dev video loading](https://web.dev/articles/lazy-loading-video). Do not embed a heavyweight film merely to satisfy a self-contained prototype.

## 5. Placeholder is a state, not a finish

A prototype may ship a clearly labeled placeholder — that is honest design evidence. An implementation may not: a decorative shape standing where product evidence belongs is the single most recognizable slop marker there is.

When the real asset does not exist yet, the surface says so — an explicit empty or pending state — instead of hiding the gap behind a blurred blob.

## 6. A named signature is a deliverable

When the recorded sources name a moving signature — an animated background, a canvas or WebGL surface, **animated** noise/grain, a moving aurora or mesh gradient, scroll-driven storytelling — that is scope, not mood. Static grain remains material and never creates a motion obligation. A named moving signature ships, or the manifest records which constraint killed it and what carries the moment instead. "The brief asked for it" is measured now: `kind=visual --slug=<feature>` reads the briefing, the manifest and the PRD, and reports `motion_ambition` — what was asked, and whether the delivery answers it.

Motion is measured as three different things, and only the last two count as craft:

| Reported | What it is |
|---|---|
| `transitions` | state feedback on hover, focus, disabled — hygiene, present on every page |
| `designed` | a keyframe system with reduced-motion, a scroll reveal, or a signature surface |
| `signature` | paint that moves on its own: canvas/WebGL, an animated backdrop, a scroll-driven timeline |

A wall of hover transitions is not choreography, and one `infinite` badge pulse is not a backdrop: an ambient surface animates paint (`background`, `background-position`, `filter`, `mask`), not just a transform. A page whose only motion is hover reports `motion is hover-only`.

## 7. Prove it

```bash
aioson verify:artifact . --kind=visual --dir=<front-end root> --advisory 2>/dev/null || true
```

The telemetry catches the defects this file most often prevents: a decorative blob, animation with no reduced-motion branch, depth strategies stacked on top of each other, motion that never leaves hover, and a signature moving surface that was asked for and never built. It cannot judge whether the effect earned its place — that stays with §1.

For a scene map, use the existing authorized browser inspection to exercise the named triggers: forward/backward scroll, fast passage, resize, touch/keyboard access, reduced motion, and media failure where relevant. Compare actual opening/middle/end states to the recorded beat and verify that pinning releases and the action remains usable. Record the observed result per scene in existing Quality evidence; a static screenshot or an animation count cannot establish temporal behavior. Keep captures selective under the current evidence budget. Report anything unobserved as unverified; this is a review responsibility, not a new deterministic `verify:artifact` capability.

On the served production surface, measure loading, interaction delay, and layout stability separately from craft. Use the current [Core Web Vitals](https://web.dev/articles/vitals) targets as a baseline (LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 at the 75th percentile, separately for mobile/desktop). A lab run is diagnostic, not proof of field percentiles or conversion improvement. Name the tested device/network and any missing measurement. A premium claim needs observed visual quality and working actions, not just passing metrics.

Keep the existing bounded polish/approval workflow. This guide improves composition during the authorized build and verification during the authorized check; it never restarts Refiner's loop after an initial draft or grants another cycle because a new effect was suggested.
