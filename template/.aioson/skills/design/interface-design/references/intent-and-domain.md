# Intent and Domain — Interface Design

> Read this before touching layout, tokens, or components.
> Generic is the enemy. Every spacing value, typeface choice, and depth strategy is a decision. Own every one of them.

---

## The mandate

If another AI, given the same prompt, would produce substantially the same output — you have failed.
Defaults disguise themselves as infrastructure. Craft means owning every decision.

---

## Design memory and continuity

If `.interface-design/system.md` exists, treat it as the visual source of truth:
- Load it before changing direction, tokens, or component patterns.
- Respect it unless the user explicitly wants a redesign.
- Update it when you introduce a reusable pattern, token rule, or layout decision.

If an `identity.md` exists (`.aioson/briefings/{slug}/identity.md`, else `.aioson/context/identity.md`), treat it as the visual source of truth too — it is the **extracted-from-references** form of `system.md`, distilled once from the user's own reference images (see `.aioson/docs/reference-identity.md`). Load its token sections and `## Component structure notes` before choosing a direction, and **apply** them rather than re-deriving a generic one. It is an input you apply, not a separate design system.

If the file does not exist and the task covers more than one screen or component family, create it with:
- Product context and UI intent
- Chosen design direction and anti-goals
- Token decisions (color, type, spacing, radius, depth, motion)
- Core component patterns (navigation, card, table, form, modal, empty state)
- Open constraints or decisions still pending

One product should not look like it was designed from scratch on every screen.

---

## If the UI already exists

When refining an existing product:
- Identify the current visual direction before proposing a new one.
- Diagnose token drift first: off-grid spacing, repeated hardcoded colors, mixed radii, mixed depth strategies, missing interactive states.
- Improve consistency before re-theming.
- Replace the direction only when the current system blocks the product intent or the user explicitly asked for a redesign.

---

## Phase 0 — Intent first (mandatory, cannot skip)

Before touching layout or tokens, answer three questions with specificity:

1. **Who is this human?** — Actual person, actual context.
   Bad: "a user." Good: "a finance manager reviewing budget reports at 8am before a board meeting."
2. **What must they accomplish?** — A specific verb, not a vague goal.
   Bad: "manage their projects." Good: "approve or reject 15 expense requests before end of day."
3. **What should this feel like?** — Concrete texture, not an adjective.
   Bad: "clean and modern." Good: "a Bloomberg terminal that doesn't exhaust you."

**If you cannot answer all three with specifics — stop. Ask. Do not guess. Do not default.**

---

## Phase 1 — Domain exploration (4 required outputs)

Before proposing any visual direction, produce:

1. **Domain concepts** — 5+ metaphors, patterns, or ideas from the product's world.
   Example (clinic scheduling): appointment slots, patient flow, triage priority, clinical notes, white coat.

2. **Color world** — 5+ colors that exist naturally in that domain.
   Example (clinic): antiseptic white, calm blue (trust, clinical), soft green (go/available), amber (warning/urgent), warm gray (neutral).

3. **Signature element** — One thing that could only belong to THIS product.
   Example: a subtle "pulse" animation on available time slots, echoing a heartbeat.

4. **Defaults to avoid** — 3 obvious, generic choices that must be replaced.
   Example: blue primary button → calm teal; card shadows → border-only depth; Inter font → IBM Plex Sans (clinical precision).

**The identity test:** Remove the product name. Could someone identify what this is for?
