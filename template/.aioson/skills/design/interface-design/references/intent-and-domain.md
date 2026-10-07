# Intent and Domain — Interface Design

> Read this before touching layout, tokens, or components.
> Generic is the enemy. Every spacing value, typeface choice, and depth strategy is a decision. Own every one of them.

---

## The mandate

If another AI, given the same prompt, would produce substantially the same output — you have failed.
Defaults disguise themselves as infrastructure. Craft means owning every decision.

---

## Design memory and continuity

There is exactly one persisted visual source of truth: the identity record. Resolve it as the PRD's `identity` binding, else the active `.aioson/explorations/{slug}/identity.md` (exploration work only), else the active `.aioson/briefings/{slug}/identity.md`, else `.aioson/context/identity.md`. Its frontmatter states `source: references` when distilled from the owner's references, or `source: intent` when it records a system already proven by an approved build. Never infer one source class from the other.

When it exists:
- Load its token sections and `## Component structure notes` before choosing a direction.
- **Apply** them rather than re-deriving a generic direction. It is an input you apply, not a separate design system.
- Respect it unless the user explicitly wants a redesign.
- Update it when you introduce a reusable pattern, token rule, or layout decision.

Never create a second design-memory file outside `.aioson/` — a legacy `.interface-design/system.md` is superseded by the identity record and must not be treated as a competing authority.

If no identity record exists, stay in origination mode; the absent record must not be created early and then cited as authority for its own decisions. Once a build has been inspected and approved, reusable project-wide decisions may be persisted to `.aioson/context/identity.md` with `scope: brand` and `source: intent`:
- Product context and UI intent
- Chosen design direction and anti-goals
- Token decisions (color, type, spacing, radius, depth, motion)
- Core component patterns (navigation, card, table, form, modal, empty state)
- Open constraints or decisions still pending

Until that approval, the feature manifest's Visual direction is the decision record. One product should not look like it was designed from scratch on every screen, but continuity cannot be manufactured by laundering an untested first guess into “identity”.

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

Reuse answers from the brief and established product. Ask only for a missing fact that would materially change the direction; label reasonable working assumptions instead of inventing audience or brand evidence.

---

## Phase 1 — Domain evidence and composition

For a new page with aesthetic freedom, compare two or three brief composition directions in the existing Visual direction record before choosing tokens. Describe each through **content order, focal subject, typography role, image crop/treatment, density, material and motion**. Distinguish at least two structural axes; three palette swaps over one hero are one direction. These can be short written sketches, not three implemented prototypes or extra approval rounds. A small refinement or approved prototype needs no new alternatives.

Choose by fitness: which direction exposes the visitor's decision, uses the strongest available evidence and belongs to this product? Name the winning reason and one rejected alternative. For each reference supplied, extract a principle and an exclusion; do not clone its whole style or infer animation from a screenshot. If evidence is absent, state that limitation and use the actual copy and assets as the basis.

Record the selected `composition family`, `material family` and `motion family` as labeled bullets under `## Visual direction`, alongside its required register/thesis/anti-goals/signature. Use the candidate's exact family names when retained; a custom family needs a stable descriptive name. These are declared decisions for future draws, separate from the measured composition signature. Keep the record truthful after refinement; no additional design-memory file is needed.

After rendering at desktop and mobile, critique hierarchy, crop, rhythm, line breaks, reading order and recognizability before effects. Compare the result to the thesis and references. Changing only colors, fonts or corner radii does not fix a repeated composition. Keep the structural choice that serves the brief even when a random proposal is more novel.

Before proposing any visual direction, produce:

1. **Domain concepts** — concrete forms, behaviors, artifacts or content structures from the product's world. Prefer observed evidence to decorative metaphor.
   Example (clinic scheduling): appointment slots, patient flow, triage priority, clinical notes, white coat.

2. **Color world** — actual identity or reference colors and the contrast/semantic roles they must serve. Domain associations are hypotheses, not palette assignments.
   With no identity, use the seeded candidates and explain the fit; a category does not mandate a hue.

3. **Signature element** — One thing that could only belong to THIS product.
   Example: a subtle "pulse" animation on available time slots, echoing a heartbeat.

4. **Defaults to avoid** — 3 obvious, generic choices that must be replaced.
   Example: a generic feature-card wall becomes a task comparison when the visitor must choose; an irrelevant gradient becomes the actual product view. Change the composition for a reason, not just its colors.

**The identity test:** Remove the product name. Could someone identify what this is for?
