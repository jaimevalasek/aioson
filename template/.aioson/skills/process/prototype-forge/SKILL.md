---
name: prototype-forge
description: "Process skill for generating a clickable, self-contained HTML app-shell prototype from an operational surface map. Use in @briefing-refiner (optional visual refinement) when a rich-surface product — workspaces, boards, cards, pipelines, CRM/Kanban, dashboards, editors/builders, admin/management surfaces, repeated-use CRUD — needs its screens, navigation, and CRUD interactions validated before the PRD. Delegates all visual language to the selected design_skill; owns structure, behavior, and state."
---

# Prototype Forge

Generate a clickable, self-contained HTML **app-shell prototype** that materializes a product's
operational surface map — every screen, navigation path, and CRUD interaction — so completeness and
interaction are validated *visually* before the PRD, not discovered later as gaps in a broken first build.

This is an **app** prototype skill. It is not the landing-page guide
(`.aioson/skills/static/static-html-patterns.md`, which `skip_if: app dashboard, admin panel`).

## When to run

Optional and user-invoked, inside `@briefing-refiner`. Run when a rich-surface product would benefit
from seeing its screens and interactions before committing scope: workspaces, boards, cards, pipelines,
CRM/Kanban, dashboards, editors/builders, admin/management surfaces, repeated-use CRUD.

Skip for tiny single-screen features, one-field CRUD, or pure content/marketing pages.

## Division of labor (do not blur)

- **prototype-forge owns** structure + behavior + state: which screens exist, navigation/routing,
  seeded mock data, client-side CRUD, and the empty/loading/error/permission state matrix.
- **The selected `design_skill` owns visuals**: tokens, component anatomy, page composition, motion.
  Read `design_skill` from `.aioson/context/project.context.md` and compose from that skill's
  components. Never invent a second visual system. (e.g. `cognitive-core-ui` already ships `modal`,
  `table`, `list-detail`, `settings`, and a `CRM` dashboard preset — compose from those.)

The "add card doesn't work" and "no board-management screen" failures live in **this** skill's layer,
not in the design skill's.

## Inputs (read in this order)

1. The operational surface map: `.aioson/briefings/{slug}/solution-options.md` (the chosen shape) or
   `.aioson/briefings/{slug}/expansion-scout.md`, falling back to the Operational Surface Map in
   `.aioson/docs/feature-expansion-taxonomy.md`.
2. `.aioson/briefings/{slug}/briefings.md` for problem, users, and the chosen direction.
3. `design_skill` from `.aioson/context/project.context.md`; load that skill before any layout.
4. When `design_skill: interface-design`, resolve an `identity.md` — `.aioson/briefings/{slug}/identity.md`,
   else `.aioson/context/identity.md`. If one exists it is the visual source of truth the engine **applies**:
   tokens come from its `## Palette` / `## Typography` / `## Spacing & layout` / `## Radius & depth` /
   `## Motion` sections, and its `## Component structure notes` augment the surface map (input 1) with
   per-component regions, anatomy, and states. `identity.md` overlays the one engine — it is **not** a
   second visual system. If none exists, `interface-design` runs intent-first.

If no operational surface map exists, build one first — it is the screen inventory, and without it the
prototype cannot be complete.

## Build contract (enforceable)

1. **Single self-contained file** — one `prototype.html`, inline CSS + JS, no build, no external
   services, opens in a browser. (Mirrors `review.html`.)
2. **Seeded realistic mock state** — plausible data for every Core object (e.g. 2-3 workspaces, a few
   boards, several cards), never lorem ipsum. Enough to look real *and* to toggle the empty state. When
   the product is authenticated, seed the logged-in app chrome too: a working account/user menu
   (profile, settings, switch account, sign out) and any always-present chrome (search, notifications)
   the product implies — a bare avatar with no menu is incomplete.
3. **Navigational completeness** — every Core object in the surface map gets a reachable screen via
   in-file routing (hash routes/tabs): a list/index surface, a detail surface, and its management
   surface (page, panel, modal, drawer, or settings screen). A surface-map object with no reachable
   screen is a **blocking gap**, not a backlog item.
4. **Real client-side CRUD** — create/edit/delete/archive/restore mutate in-memory state and re-render.
   "Add card"-class actions must actually add and persist for the session. Use modals/drawers/toasts
   for feedback. A button that does nothing is a failure. Never use native `alert()`/`confirm()`/
   `prompt()` — every create/edit/delete and every confirmation is an in-system modal, drawer, or
   inline form styled by the `design_skill` (a destructive confirm is a styled dialog, not `confirm()`).
   Native browser dialogs break visual fidelity and leave @dev with no spec for that surface.
5. **State matrix** — empty, loading, error, populated, and permission-denied are each renderable and
   toggleable, not only the happy path.
6. **Visual fidelity** — all look-and-feel comes from the `design_skill`; honor its quality and
   stability gates (tokens first, no nested cards, responsive grid constraints, prefers-reduced-motion).
7. **Prototype as reference** — it is the downstream development reference. Record its lock status in
   the manifest (`draft` until @product/@sheldon freeze scope, then re-synced and locked).

## Output

Write to `.aioson/briefings/{slug}/`:

- `prototype.html` — the clickable app-shell.
- `prototype-manifest.md` — the screen inventory (one row per Core object: screens + management
  surface); a `## Core interactions` section listing every demonstrated interaction as a backtick token,
  one per line (e.g. `` - `add card` — adds a card to a list ``), so `aioson prototype:check` can verify each
  one is later echoed by an acceptance criterion; the `design_skill` used, an explicit
  "mock only — refresh resets, no backend" note, and lock status (`draft` / `locked-at: {ref}`).

## Completeness gate (before handing back)

- Every Core object is reachable **and** manageable (create/list/edit/archive/restore, or an explicit defer).
- Every Core action named in the surface map works against mock state and re-renders.
- Empty and error states are visible, not implied.
- No action falls back to a native browser dialog; every create/edit/delete/confirm is an in-system surface.
- When the product is authenticated, the account/user menu is present and functional, not a dead avatar.
- The visual is faithful to the `design_skill`, not generic.
- If any Core object cannot be managed in the prototype, report it as a blocking gap — never hand back a
  prototype that looks complete but cannot manage its own objects.
