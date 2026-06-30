---
name: reference-identity-extract
description: "Process skill that distills user-provided reference images — a brand/visual-identity set and an optional component/structure set — into a single text identity.md (token system + per-component structure notes) ONCE, so the build consumes text, not images. Use inside @briefing-refiner (or @setup for project-wide brand) when the user wants a specific, premium look driven by their own references instead of a fixed preset. Pairs with the interface-design engine: identity.md is the extracted-from-references form of its system.md. Owns extraction + the identity record; never owns the build."
---

# Reference Identity Extract

Turn **reference images** into a **text identity record** that the `interface-design` engine
applies. The user drops images — their brand, a product they admire, a screen they want — and this
skill reads them **once** (vision) and writes `identity.md`: real tokens (palette, type, spacing,
depth, motion, signature moves) plus per-component **structure notes**. Every later build reads the
**text**, never the images.

Why text, not images on every build: the build then runs on any harness (a vision-less harness still
reads the record), the user can **correct** the extracted palette, the record is **gateable**
(`verify:artifact --kind=identity`), and two extractions can't silently disagree — the frozen text is
the source of truth.

This generalizes what AIOSON already does when it extracts a real website into a token spec: same
idea, but the **source** is images and the **lifetime** is per-briefing (or per-project brand), not a
frozen preset.

## Division of labor (do not blur)

- **This skill owns** extraction + the `identity.md` record: tokens from identity images, structure
  notes from component/screen images.
- **`interface-design` owns the build**: it *applies* `identity.md` as its identity source-of-truth.
  `identity.md` is an INPUT that parameterizes the one engine — never a second design skill.
- **`prototype-forge` owns** screens/navigation/CRUD/state; it reads `identity.md`'s
  `## Component structure notes` to seed its surface map.

## Two image roles (keep them separate)

| role | folder | feeds |
|---|---|---|
| **Visual identity** (brand: color, type, texture, feel) | `references/identity/` | the token sections |
| **Component / structure** (a board, a table, a screen) | `references/structure/` | `## Component structure notes` → the surface map |

Synthesis = **apply the identity to the structure**. A component image contributes layout/structure
*only* — its own colors/fonts are ignored; the look comes from the identity images.

## Scope & paths (resolve before writing)

- **Per-briefing (default):** record `.aioson/briefings/{slug}/identity.md`; images in
  `.aioson/briefings/{slug}/references/identity/` and `.../references/structure/`.
- **Project brand:** record `.aioson/context/identity.md`; images in
  `.aioson/context/brand-references/identity/` and `.../brand-references/structure/`.

Read order used by every consumer (`@ux-ui`, `prototype-forge`): per-briefing → project brand → none.
The **text record is canonical and committed**; the images are raw source and may be `.gitignore`d —
extraction is one-time, so the build never needs them again.

## Inputs (read in this order)

1. Scope + target path (briefing `{slug}`, or `brand`).
2. Every file under `references/identity/` and `references/structure/` for that scope.
3. `.aioson/context/project.context.md` for `design_skill` / domain (and to confirm interface-design).

## Build contract (enforceable)

1. **One vision pass, then text only.** Read each image once. Identity images →
   palette/type/spacing/radius/depth/motion/signature/anti-goals. Structure images → one
   `### {component}` block each (regions, anatomy, state matrix, interactions). After this pass the
   build never touches images again.
2. **Real values, never placeholders.** Emit concrete hex, named font stacks, numeric scales. Do not
   leave `#RRGGBB`, `{hex}`, `{token}`, `TODO`, `Lorem ipsum`, or any unfilled token — the gate
   rejects them.
3. **Map to interface-design token families.** Palette → foreground/background/border/brand/semantic;
   type → display/body/mono + scale; spacing/radius/depth → the engine's families. Pick **exactly one**
   depth strategy (`borders-only` | `subtle-shadows` | `layered-surfaces`).
4. **Anti-sameness anchors are mandatory.** `## Design pillars` (2–3) and `## Signature moves` (1–3,
   something that could only belong to THIS product) must be present and specific — they are what
   defeat the generic look.
5. **Structure notes drive the surface map.** Each `### {component}` lists regions, anatomy, the
   empty/loading/error/populated/permission states, and the interactions. If no structure images were
   given, write `None — identity-only` under `## Component structure notes`.
6. **Self-gate before handing back.** Run
   `aioson verify:artifact . --kind=identity --file=<path> --advisory 2>/dev/null || true` and fix any
   reported gap before returning.
7. **Generic provenance.** `## Provenance` describes the sources by type only (e.g. "3 identity
   images, 1 board screenshot"). Never name an external product, brand, site, or tool in any field.

## identity.md schema (write exactly these headers)

```markdown
---
kind: identity
scope: briefing            # briefing | brand
slug: {slug}               # briefing slug, or "project" for brand scope
source: references         # references (from images) | intent (image-less fallback)
generated_by: reference-identity-extract
generated_at: {YYYY-MM-DD}
confidence: high           # high | medium | low — how well the images pinned each token
theme: light-dark          # light | dark | light-dark
base_unit: 4px
---

## Design pillars
- <2–3 specific pillars; the primary anti-sameness anchor>

## Palette
- foreground/primary: #RRGGBB   ← real hex only
- foreground/secondary: #RRGGBB
- background/base: #RRGGBB
- background/surface: #RRGGBB
- border/default: rgba(…)
- brand/primary: #RRGGBB
- semantic/success | warning | danger | info: #…, #…, #…, #…

## Typography
- display / body / mono: "<family>", <fallback stack>
- scale: page <px/weight>, section <px/weight>, body <px/weight/line-height>, meta <px/weight>

## Spacing & layout
- base: 4px — scale: 4, 8, 12, 16, 24, 32
- breakpoints: mobile <px> / tablet <px> / desktop <px>
- grid: <cols>-col, gutter <px>

## Radius & depth
- radius ladder: sharp <px> / medium <px> / large <px>
- depth strategy: borders-only        ← exactly ONE of borders-only | subtle-shadows | layered-surfaces

## Motion
- posture: <duration/easing>; entrances <description>
- reduced-motion: honor prefers-reduced-motion

## Signature moves
- <1–3 moves that could only belong to THIS product; second anti-sameness anchor>

## Anti-goals
- <3 generic defaults this identity explicitly replaces>

## Component structure notes
<one ### block per structure image, or "None — identity-only">

### Board
- regions: <…>
- anatomy: <…>
- states: empty, loading, error, populated, permission-denied
- interactions: <add / move / edit / archive / …>

## Provenance
- Generic only. e.g. "identity references: 3 images; structure references: 1 board screenshot."
```

## Image-less fallback (no references given)

Do **not** fabricate a palette. Either:
- **(default)** write nothing and let `interface-design` run its own Phase 0 (intent-first) — its
  domain palette + signature move already defeat sameness; or
- if the user wants a **persisted** system anyway, run interface-design Phase 0 yourself and write
  `identity.md` with `source: intent` and the same schema (still no placeholders).

## Cross-harness note

A vision-less harness cannot run the extraction pass. There, either run extraction once on a
vision-capable harness, or hand-author `identity.md` from the schema above — the gate then proves it
is complete. The build is identical in both cases because it only ever reads the text.

## Output

- The `identity.md` record at the resolved path (briefing or project scope).
- Nothing else. This skill never builds UI, never edits `briefings.md`, and never becomes canonical
  feedback — it produces the identity record the build consumes.
