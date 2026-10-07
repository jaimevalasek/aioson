# CSS Tokens & Design Systems

> Implementation patterns for a selected visual direction. The approved prototype and identity outrank these examples; origination decisions belong to `interface-design`.

## Resolve tokens before styling

Read the identity record or the selected `design:seed` candidate. Its colors and type pairing are inputs to judgment: validate contrast, glyph coverage, font delivery and fit with the actual content. Record refinements and their product reason. Do not import a fixed palette or font stack from a recipe.

Map the chosen system to semantic roles: ground, surface, raised surface, ink, secondary ink, accent, on-accent, rule, focus and statuses. Status colors communicate meaning; the accent is not every status. Define spacing, type, measure, radius and depth tokens from the chosen density and material strategy. A light or dark pole does not determine the aesthetic register.

The fragments below require those project tokens. Resolve them to real values in the project stylesheet; they are intentionally not a ready-made identity. Include only rules applied by real markup.

```css
:root {
  --color-bg: var(--identity-ground);
  --color-surface: var(--identity-surface);
  --color-text: var(--identity-ink);
  --color-muted: var(--identity-secondary-ink);
  --color-accent: var(--identity-accent);
  --color-on-accent: var(--identity-on-accent);
  --color-rule: var(--identity-rule);
  --font-body: var(--identity-body-face);
  --font-display: var(--identity-display-face);
  --duration-feedback: 180ms;
  --ease-out: cubic-bezier(.16, 1, .3, 1);
}
*, *::before, *::after { box-sizing: border-box; }
body {
  margin: 0;
  font-family: var(--font-body);
  background: var(--color-bg);
  color: var(--color-text);
  line-height: var(--leading-body);
}
img, video { display: block; max-inline-size: 100%; block-size: auto; }
button, input, select, textarea { font: inherit; }
:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 3px; }
::selection { background: var(--color-accent); color: var(--color-on-accent); }
```

A token declaration is not font delivery. Ship the selected face with a working stylesheet or `@font-face`, check the rendered family and preserve a deliberate fallback.

## Type and composition

Choose the heading scale from the content length, viewport and register. Size alone does not establish hierarchy: use weight, measure, line breaks, alignment and the relation to imagery. Small labels cannot carry the argument. Do not force oversized type to satisfy telemetry.

```css
.page-title {
  font-family: var(--font-display);
  font-size: clamp(var(--display-min), var(--display-fluid), var(--display-max));
  line-height: var(--leading-display);
  letter-spacing: var(--tracking-display);
  max-inline-size: var(--measure-display);
  text-wrap: balance;
}
.prose { max-inline-size: var(--measure-reading); }
.container {
  inline-size: min(100% - 2 * var(--page-gutter), var(--content-width));
  margin-inline: auto;
}
.section { padding-block: var(--section-space); }
```

The opening is not implicitly centered or `100dvh`. Choose grid, flex or normal flow from the composition record. For a text/media split, set the ratio from the subject's crop and reading measure; for a typographic opening, let the text and whitespace carry it. Use sticky, absolute positioning and overlap only when they clarify the intended composition.

## Controls and surfaces

```css
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-inline);
  min-block-size: var(--control-height);
  padding: var(--control-padding);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-control);
  font-weight: var(--weight-action);
  text-decoration: none;
  cursor: pointer;
  transition: background-color var(--duration-feedback) var(--ease-out),
              border-color var(--duration-feedback) var(--ease-out);
}
.button--primary {
  background: var(--color-accent);
  color: var(--color-on-accent);
}
.button:hover { border-color: var(--color-accent); }
.button:disabled { opacity: .5; cursor: not-allowed; }
.surface {
  padding: var(--panel-padding);
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-panel);
}
```

A card is a grouping decision, not the default wrapper for every section. Tables, rows, image plates and unboxed text are equally valid. Choose one depth strategy from the register and apply it consistently; a quiet system can be expressed through rules, tonal separation and precise spacing without blur or glow.

## Optional finish and motion

Use `.aioson/docs/design/visual-effects.md` to select an earned technique. Static image treatment, typography and rule hierarchy are first-class finishes. Mesh, animated gradient text, glass and tilt are independent options; no trio is required by a style name.

An atmosphere can inherit the selected palette without defining a new one:

```css
.atmosphere {
  background: radial-gradient(ellipse at var(--atmosphere-origin),
    color-mix(in srgb, var(--color-accent) 14%, transparent),
    transparent 65%);
  pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  .button { transition: none; }
}
```

Add an atmosphere only where the direction calls for it. Do not substitute blurred circles for a missing product image or use animated text where it impairs reading. For selected animated treatments, load `motion.md`; for specific sliders, diagrams or cursor techniques, load `premium.md`. Keep static fallbacks, touch behavior and reduced motion explicit.

## Inspect the actual result

Check the loaded fonts, color contrast, copy length, focal image crop, section rhythm, focus, mobile reading order and component states. Inspect screenshots at desktop and mobile. A score counts detectable techniques; it cannot certify taste. Remove an effect if the same surface communicates more clearly without it, and never add unused CSS to improve a measurement.
