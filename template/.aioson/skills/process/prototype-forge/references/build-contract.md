---
description: Enforceable structure, behavior, state, and CSP contract for Prototype Forge
agents: [refiner]
task_types: [app-prototype-build]
triggers: [prototype forge execution, operational surface map approved]
enforcement: no-native-dialogs
---

# Prototype Forge Build Contract

## Artifact

Produce one `prototype.html` under 2,000,000 bytes with inline CSS, JS, SVG, and optional data/blob images. Use hash routing. No network request, external script/style/service, iframe, module import, or CDN. It must work in the Play viewer's CSP and directly in a browser.

**Typeface delivery is the one sanctioned external resource.** A surface whose typography never leaves the OS default stacks renders as a default document on every machine — the most visible "cheap" tell there is, and the telemetry measures it. Deliver one real typeface either way:

- a stylesheet `<link>` to a dedicated font host only (`fonts.googleapis.com`/`fonts.gstatic.com`, `fonts.bunny.net`, `api.fontshare.com`) — never a general CDN; or
- an embedded `@font-face` with a data-URI WOFF2 inside the byte budget.

Font delivery is progressive enhancement by contract: declare a deliberate fallback stack that preserves hierarchy and scale, so the file still reads offline and under a CSP that blocks the host. Naming a family without any delivery mechanism is worse than naming none — the chosen face silently never reaches the owner.

**Asset zone: embedded bytes never sit among authored code.** A data-URI font or image inflates the file every later pass has to read — measured on a consumer prototype: 1.8 MB, 98% base64, a 155 KB stylesheet that was 139 KB of WOFF2 — so each surgical polish reread font bytes to find a rule. Put every embedded asset in one trailing zone at the end of `<body>`: the `@font-face` rules with their WOFF2 payloads in `<style data-aioson-assets>` (nothing else in that block), images and media in `<script type="application/json" data-aioson-assets>` keyed by name and hydrated on load into `[data-asset]` elements (or `--asset-*` custom properties for CSS backgrounds). Authored CSS and markup reference assets by name only. The telemetry reports `embedded_assets` and names an authored zone still carrying more than 32 KB of base64 (`embedded assets inside the authored stylesheet` / `inside the markup`).

In `canonical-briefing`, the artifact belongs to `.aioson/briefings/{slug}/`. In `visual-exploration`, it belongs only to the parent-assigned `.aioson/explorations/{slug}/runs/{variant}/`; never read a sibling variant under isolated policy.

## State and navigation

- Seed realistic state for the selected experience; for managed data, demonstrate populated and applicable empty states.
- Every Core object the promise requires users to manage has reachable list/index, detail, and management behavior as applicable. A vehicle, obstacle, lesson or simulation element does not imply a CRUD screen.
- Authenticated products include functional account/user navigation and implied persistent chrome.
- Assign stable `data-aioson-id` anchors to meaningful regions and Core actions.
- Mark the one region rendering the briefing's #1 differentiator with `data-aioson-primary`. It must start inside the first viewport of its screen at desktop and mobile — the runtime fold check anchors on this marker, and a differentiator below the fold is a feature the owner never sees.

## First-open explainer

The prototype exists so the owner can validate how the app works; an owner who has to ask "how would I use this?" means the prototype failed its one job. Overlay the first open with a 3–5 step tour in lay language — each step translated from a briefing promise (`PROM-*`), anchored to a `data-aioson-tour` region with a visible highlight — dismissible, and reopenable through a persistent `?` control. The tour is part of the artifact, not polish.

## Behavior

When in scope, create, edit, delete, archive, and restore mutate in-memory state and re-render. Use design-system modals, drawers, inline forms, and toasts where those interactions belong. Never use native `alert`, `confirm`, or `prompt`; dead controls are failures.

Render and make demonstrable the states applicable to the selected promise: loading, empty, error, populated, and permission-denied where those conditions exist. Record non-applicability with a reason instead of inventing accounts, permissions or fake loading. An explicit approved defer may replace an operation, but silence may not.

For games, implement the selected playable interaction, not only its UI: input changes play state, consequences are legible, the objective can resolve, and restart restores a valid initial state. Test relevant control release/focus loss, timing, collision and progress behavior within the parent's authorized verification budget. A local playable simulation is appropriate; label simplifications and unobserved checks. Keep menus, tours and HUD readable without covering the play area. Genre examples in the taxonomy suggest choices; they do not approve rivals, items, audio or additional modes.

## Interaction patterns

Before building forms or transitions, read matching `.aioson/rules/` and project docs; they are binding over these defaults.

- Structured form fields (documents, phones, postal codes, dates, currency) carry working masks, correct input semantics, and inline layered validation with specific error copy in the project locale. Static unmasked inputs in a form surface are blocking.
- Controls that change status, delete, archive, or apply a hard-to-reverse edit confirm through a design-system modal naming the action, object, and consequence.
- A recurrent bidirectional status flow (kanban, pipeline, ordered queue) moves primarily by working drag-and-drop over mock state — drag states, drop targets, optimistic move with undo — plus an accessible menu/keyboard fallback. Destructive drop targets still confirm.
- A management product (CRM, ERP, cockpit, admin) opens on a home with 3–6 decision-driving widgets fed by the seeded data: KPIs with unit and trend, attention indicators, each drilling into the filtered records.

## Visual engine

Load the selected design skill before layout. Use semantic, product-specific tokens and realistic interface copy. Honor reduced motion, responsiveness, contrast, and the skill's stability rules. Avoid generic AI-dashboard gradients, repeated card grids, excessive pills/glows, and nested containers unless the selected identity calls for them.

Anti-slop is the subtractive half; the craft floor is the additive half, and hygiene alone does not clear it. `kind=visual` measures five ambition levers — a delivered typeface, display-scale type (56px+ where the surface argues in the first viewport), one earned material atmosphere (`.aioson/docs/design/visual-effects.md` owns the vocabulary and cost contracts), motion choreography, and evidence imagery. Each lever is optional; shipping with the aggregate floor warning unaddressed is not. For surfaces that argue by inspection and have no real asset yet, host image generation (when available) is the sanctioned plan B — provenance labeled `generated`, never presented as the client's real work.

`identity.md`, when selected, supplies the engine's tokens and augments component regions/anatomy/states; it does not create a parallel visual system.

## Blocking gaps

A promised management object without its required surface, a broken selected core loop, an action without its intended effect, a missing required state, dead authenticated chrome, or a prohibited external dependency is a blocking gap. Cite the selected promise; optional enhancements never become blockers merely by appearing in a scout.
