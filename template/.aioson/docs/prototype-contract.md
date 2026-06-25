---
name: prototype-contract
agents: [product, ux-ui, analyst, architect, pm, orchestrator, dev, validator, sheldon]
modes: [planning, executing]
task_types: [prd, ui-spec, discovery, requirements, architecture, implementation, validation]
load_tier: trigger
triggers: [prototype, prototype.html, prototype reference, app-shell, clickable prototype, casca]
---

# Prototype Contract

When a feature has a clickable prototype from `prototype-forge` (`@briefing-refiner`), that prototype is the
authoritative reference for the feature's screens, navigation, and interactions. This doc defines how each
role uses it so the prototype is honored end-to-end, not lost after refinement.

## Where it lives

- `.aioson/briefings/{slug}/prototype.html` — the clickable app-shell.
- `.aioson/briefings/{slug}/prototype-manifest.md` — screen inventory, Core interactions demonstrated,
  `design_skill` used, and lock status.

It is **mock-only**: no backend, refresh resets. Reproduce its behavior against the real stack — never copy
its mock persistence.

## The PRD pointer

When a prototype exists, `@product` adds a `## Prototype reference` section to the PRD:

```
## Prototype reference
- prototype: .aioson/briefings/{slug}/prototype.html
- manifest: .aioson/briefings/{slug}/prototype-manifest.md
- status: draft | locked-at: {ref}
- Treat as the authoritative screen/interaction reference for this feature.
```

The PRD is the carrier: every downstream agent that reads the PRD discovers the prototype through this section.

## Lock (draft → locked)

The prototype is `draft` while scope is open. When `@product`/`@sheldon` freeze scope, the prototype is
re-synced to match the final PRD and marked `locked-at: {ref}`. The locked version is what implementation
reproduces and what acceptance criteria are derived from. If the PRD and a `draft` prototype diverge at lock,
the approved PRD wins and the prototype is updated to match.

## Role usage

- **@product** — write the `## Prototype reference` section; keep the PRD consistent with the prototype; mark
  it `locked` at scope freeze.
- **@sheldon** — when enriching a PRD that carries a `## Prototype reference`, keep the enrichment and any
  phased plan consistent with the prototype's screens and Core interactions; do not silently enrich away a
  demonstrated interaction. Co-own the `draft → locked` scope freeze with `@product`; if enrichment must
  change a prototyped behavior, record it as an explicit scope decision in the PRD, not a silent drop.
- **@ux-ui** — the prototype is the concrete realization of the design direction. Use it as the authoritative
  screen/interaction/visual reference; the `ui-spec` must not contradict it. Refine visual detail on top of
  it, never around it.
- **@analyst** — turn the prototype's Core screens and interactions into explicit acceptance criteria in
  `requirements-{slug}.md` (e.g. "add card persists and re-renders", "board has a management surface"). This
  is how the prototype reaches `@validator` — as binary criteria, not as a file it reads.
- **@architect / @pm / @orchestrator** — read the prototype + manifest as the reference for screens, flows,
  entities, and scope when planning; do not plan a Core surface the prototype omits without saying so.
- **@dev** — the prototype is the development source for UI and interactions. Reproduce its screens and Core
  interactions against the real stack. Never ship a Core action the prototype demonstrates (e.g. "add card",
  "create board", "manage members") while the build lacks it.
- **@validator** — verifies prototype-derived acceptance criteria as part of the normal binary contract in
  `harness-contract.json`. It does **not** read the prototype directly (its context sandbox forbids
  PRDs/artifacts); the criteria authored by `@analyst` are what it checks.

## Completeness

A feature with a prototype is not "ready for done" until every Core screen and interaction the prototype
demonstrates is either built and verified, or explicitly deferred in the PRD's `## Out of scope`.

## Deterministic guard

Run `aioson prototype:check . --feature={slug}` once `@analyst` has written `requirements-{slug}.md`. It is the
deterministic backstop for this otherwise prose-only contract and fails on: a dangling `## Prototype reference`
(prototype or manifest file missing), a missing requirements bridge, or Core interactions listed in the manifest
that no acceptance criterion echoes (`fail` = none covered, `warn` = some uncovered). It matches interaction
names as folded substrings, so the AC must echo the manifest's interaction name (EN or pt-BR). The check never
reads the prototype's behavior — only that the contract's structural links exist end to end.
