# Handoff and Quality — Interface Design

---

## Quality checks (run before delivering)

### Swap test
Would swapping the typeface or layout make the design look like a different product?
If yes — good. If no — the design has no identity.

### Squint test
Blur your eyes (or the screenshot). Does the visual hierarchy still read clearly?
If not — the hierarchy is too weak.

### Signature test
Can you point to five specific decisions where your craft appears?
If you cannot name five — you defaulted somewhere.

### Token test
Do your CSS variable names sound like they belong to THIS product?
Generic: `--color-primary`. Specific: `--slot-available`, `--urgency-amber`.

### Asset test
Does the first viewport show a real product, place, person, object, UI state, generated bitmap, photo, or video when the surface is a website or landing page?
If not, the page is probably decoration plus copy, not a visual experience.

### Responsive fit test
Do all labels, buttons, counters, cards, tables, media, and headings fit at mobile and desktop widths without overlap, clipping, or layout shift?
If not, add explicit constraints: grid `minmax()`, `aspect-ratio`, fixed control heights, line wrapping, overflow rules, and stable media dimensions.

### Font delivery test
Are the named fonts actually loaded through the stack's supported mechanism?
If not, declare a credible fallback stack and preserve the intended contrast with weight, scale, and line-height instead of pretending the unavailable font exists.

### Motion test
Does motion communicate feedback, state, navigation, or reveal?
If not, remove it. If yes, include a `prefers-reduced-motion` fallback.

### Browser inspection test
If a runnable UI exists, inspect it in a browser at one mobile and one desktop viewport before delivery.
Screenshots beat imagination: fix blank renders, overflow, text collision, illegible contrast, missing assets, and awkward crop/framing before handoff.

---

## Self-critique before delivery

Walk through each section before handing off:

1. **Composition** — Does the layout have rhythm? Are proportions intentional? Is there one clear focal point?
2. **Craft** — Is every spacing value on-grid? Does typography use weight + line-height + size (not size alone)? Do surfaces carry hierarchy without thick borders or dramatic shadows?
3. **Content** — Does the spec tell one coherent story? Could a real person at a real company act on this?
4. **Structure** — Are there any hacks? Negative-margin workarounds? Arbitrary pixel values? Fix them.

**Ask yourself: "If a design lead reviewed this, what would they call out?" Fix that thing. Then ask again.**

---

## Handoff to @dev

A strong handoff includes:
- Explicit visual direction and anti-goals
- Design token block (fonts, colors, spacing, radius, depth strategy, motion posture)
- Per-screen layout notes with component names mapped to real library components
- Full state matrix (default / hover / focus / active / disabled / loading / empty / error / success)
- Responsive rules (mobile breakpoints, collapse behavior)
- Accessibility checklist items
- Any signature visual moves with implementation notes
- Anti-patterns to avoid

The `ui-spec.md` must be concise enough to code from directly. Not a design document — a build contract.

---

## Update design memory

When the work introduces or changes reusable design decisions, update `.interface-design/system.md` with:
- Final direction and anti-goals
- Token block
- Component pattern notes
- New exceptions or constraints

This file is the continuity layer between screens, agents, and future sessions.

---

## Quality bar

1. The result must not look generic.
2. Repeated elements must share spacing, radius, and depth logic.
3. Typography hierarchy must be legible without decorative tricks.
4. The screen must communicate purpose before style.
5. The delivered UI must survive real viewport inspection: no overlap, clipped text, missing states, broken font loading, unsupported assets, or default-template composition.
