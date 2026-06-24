# External Source Ingestion

> Load this reference when a primary parent or a modifier is an **external DESIGN.md source**
> (a refero.design md-example, or a similar portable design spec extracted from a real site)
> instead of a local AIOSON design skill.

The hybrid model is unchanged: **exactly 2 primary parents**, optional modifiers. This reference only
widens where a parent can come from — a parent may now be local (an AIOSON design skill) or external
(a DESIGN.md source). Everything downstream (crossover protocol, output contract, quality gates) runs the
same, operating on the normalized DNA produced here.

## What an external DESIGN.md is

A DESIGN.md is a portable, prose+token description of a real product's visual system — e.g. refero.design
publishes curated examples (Apple, Linear, Stripe, Mercury, Superhuman, Raycast, …). It typically carries:

- color palette
- typography
- spacing / layout rhythm
- component patterns
- overall visual tone / feel

It is the "system behind the screenshot", meant to be **pasted as context**, not copied pixel for pixel.

## Accepted forms

Take the source in whichever form the user has:

1. **Pasted content** — the user pastes the DESIGN.md text into the conversation.
2. **Local file** — the user saved it at `.aioson/context/design-sources/{source}.design.md`.
3. **URL** — the user gives a link (refero.design or similar). Fetch it; if the page is JS-heavy or the
   fetch returns little, ask the user to paste the DESIGN.md text instead. Never block on a flaky fetch.

## Normalize to parent DNA

Map the source onto the same DNA dimensions the crossover protocol expects from a local parent:

| Dimension | Pull from the source |
|---|---|
| Substrate / background model | base background, surface model, depth/elevation approach |
| Structure / layout | layout rhythm, density, grid/spacing scale |
| Tokens | color palette, typography, spacing, radius, shadow/depth |
| Components | the component patterns described (buttons, cards, nav, inputs, …) |
| Motion / feel | transitions, easing, the stated tone/feel |
| Signature | the one or two moves that make it recognizable |

If a dimension is missing in the source, mark it `not provided` — the **other** (local) parent or the
modifiers fill it. Do not invent brand-specific detail the source did not state.

## Eligibility: primary parent vs modifier

- **Primary parent** requires at least: a clear substrate/background model **and** a token system
  (color + typography) **and** a handful of components.
- A source that only yields accent, motion, or typographic flavor is a **modifier**, not a primary parent
  (modifiers never own substrate or structure — same rule as local modifiers).

## Provenance (mandatory)

Record every external source in `.skill-meta.json` under `sources[]`:

```json
"sources": [
  { "type": "local",    "name": "cognitive-core-ui" },
  { "type": "external", "name": "linear", "url": "https://styles.refero.design/...",
    "retrieved_at": "{ISO-date}", "license": "unspecified — reference only",
    "note": "refero.design md-example; used as reference, not copied" }
]
```

refero.design and similar sites publish these as **references, not templates**, with no explicit license.
Treat them accordingly: use the system, attribute the source in metadata, do not redistribute the source
file as your own.

## Anti-clone (hard)

An external source contributes DNA exactly like a local parent — the crossover still synthesizes a
distinct third identity. Therefore:

- Never reproduce the source's brand name, logo, wordmark, or trademarked assets.
- Never copy the source's exact palette or type ramp 1:1 — the hybrid accent must be a genuine fusion
  (the existing accent rule), not the source's accent.
- Never name the hybrid after the source brand (no `linear-hybrid`, no `stripe-core`).
- The hybrid's `## Hybrid DNA` section names the source as a parent and states what it contributed and
  what is new — same explicitness required of local parents.

## Hand-off

Once normalized and validated, treat the external source as an ordinary parent/modifier and continue with
`references/crossover-protocol.md` (identity synthesis + crossover spec) exactly as for local parents.
