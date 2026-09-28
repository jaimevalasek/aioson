---
description: Bounded premium polish, inspection evidence, and manifest contract for Prototype Forge
agents: [refiner]
task_types: [prototype-quality, prototype-handoff]
triggers: [functional prototype complete, prototype manifest]
---

# Prototype Forge Quality and Manifest

This reference has two explicit phases. Before coding, execute only the decision record in the next paragraph. After functional completeness, resume at the numbered polish pass. Do not pull polish forward and do not postpone composition until after layout.

Before UI coding — in every mode, identity included — write the manifest's `## Visual direction` first: the chosen aesthetic register, one visual thesis, two or three anti-goals, and one product-specific signature move, with the composition signature stated in a single sentence. When the owner named anti-references during intake ("must not look like X"), they enter here verbatim as anti-goals — owner-named anti-references outrank invented ones and bind every later round. An identity record supplies tokens; it never substitutes for this decision, and swapping tokens over the default generative composition is a re-skin that fails the replaceability test. `verify:artifact --kind=visual --slug` refuses a manifest without this section. After the functional build:

1. Re-read the existing HTML and perform exactly one surgical polish pass; do not regenerate the artifact for style.
2. Apply the design skill's swap, squint, signature, token, responsive, contrast, and interaction-state checks.
3. Inspect DOM/CSS. When browser/screenshot tools exist, inspect at least one mobile and one desktop viewport. In `visual-exploration`, an available browser is mandatory: run exactly one `render → screenshot/DOM critique → repair → final render` loop. If unavailable, disclose the limitation and never claim visual inspection.
4. Fix overflow, hierarchy, type rhythm, contrast, unsupported assets, dead controls, generic composition, and model-cadence copy without losing any Core screen/action/state. Copy cadence is judged on the whole corpus: spaced em dashes accumulated across toasts, placeholders, empty states, tour steps, and seed data (`em_dash_prose` in the visual telemetry is the count) get rewritten with periods, colons, or shorter sentences, and seed content must read like something a real user typed.
   Load `.aioson/docs/design/visual-effects.md` for the polish pass itself — not only when an effect was already chosen. Deciding the surface's one earned atmosphere IS part of the pass; a model that waits for a reason to open the additive vocabulary never opens it, and the result is the flat default. Honor its cost and asset contracts: an effect that explains no state and reinforces no signature move is decoration, and a decorative shape standing where product evidence belongs is the most recognizable slop marker there is.
5. The polish pass delivers at least two microinteractions bound to the signature move (named in Quality evidence, honoring `prefers-reduced-motion`) **and clears the measured craft floor**: run `aioson verify:artifact . --kind=visual --slug={slug} --advisory` and treat every craft warning — a typeface named but not delivered, typography that never leaves the OS default stacks, the `craft floor N/5` aggregate — and every `generation tell:`/`copy tell:` line as a rewrite directive: fix it, or justify the specific lever or tell in Quality evidence with its measured number (the kicker tell has no justification — delete the label). `browser chrome never themed` is part of the same pass: theme `::selection`, the focus ring, and the numerals the surface owns from its palette. Hygiene metrics passing while no ambition lever is active is the measured shape of "cheap default", and it is exactly what this pass exists to prevent. Polish that could ship on any product is not polish — it is the flat default with better spacing.
6. Run the first-contact walkthrough: with genuinely fresh eyes — a subagent when the host offers one, told only "you have never seen this product; open it and describe what each screen is for and what you would do first" — walk the prototype including its tour. A description that does not match the briefing's promises is a **blocking** completeness finding, never a style note. Record the walkthrough verdict in Quality evidence.
7. Record only checks actually performed. Never claim screenshot evidence when none ran.

The manifest includes:

- screen-inventory rows for the selected experience and its meaningful states; include management surfaces only for objects the promise requires users to manage
- `## Core interactions`, one backticked interaction token per line so `aioson prototype:check` can trace it to acceptance criteria
- selected `design_skill`
- frontmatter `identity:` naming the exact record the prototype was built from — the feature-owned `.aioson/briefings/{slug}/identity.md`, the shared `.aioson/context/identity.md`, or `none` for an intent-first build. This is the provenance the PRD must carry forward; `aioson prototype:check` fails when the manifest names a record and the PRD drops it. Never name an exploration identity: it is non-canonical and cannot bind downstream.
- explicit “mock only — refresh resets, no backend”
- `draft` or `locked-at: {ref}`
- `## Visual direction`: register, thesis, anti-goals, signature move (authored before layout — see above)
- `## Runtime matrix`: one named route for entry/primary plus one named route per applicable demonstrable loading, empty, error, and success state (`- loading: #/orders?state=loading`). Record why a state is inapplicable; do not fabricate permission or loading screens for a local game. `kind=visual --runtime` visits the matrix at mobile and desktop and refuses a declared state whose structural marker is not visible. Record gameplay checks separately in Quality evidence: a route visit does not prove control response, collisions or a completed lap.
- frontmatter `surface_mode:` — `operate`, `brand` (persuade/inhabit), or `read` — what the visitor came to do on this surface. The telemetry detects it from structure (sidebar + data table + toolbar reads as operate; hero + display type + marketing sections as brand); the declaration outranks the detection, and on an operate surface the premium bar is measured as precision (delivered workhorse face, tokened finish, state motion, themed chrome — `craft N/4 (operate)`) instead of display type and atmosphere, and scored as `precision N/100` (typeface, tokens, rhythm, states, chrome, tells, dialect) against the same 60 bar `briefing:approve` reads — restraint is a posture, never an exemption from the number
- `## Quality evidence`: checks and limitations, including the tour, the `data-aioson-primary` fold outcome, the signature microinteractions, and the first-contact walkthrough. Its machine-bound core is exactly `verdict: pass|fail|unverified`, `evidence: .aioson/context/features/{slug}/visual-evidence.json`, `craft: N/N`, `runtime: measured` (or an explicit unavailable/waived decision and reason), and `routes: N`. Approval cross-checks these values against the persisted content-addressed report; prose length cannot make the section valid.
- `## Delegation provenance` only when another model was explicitly used

Exploration mode writes no briefing manifest. Its append-only `report.md` carries the same visual direction and truthful evidence, plus `<!-- aioson:reusable-prompts -->`, the exact generation prompt, a reusable one-shot prompt, an incremental prompt sequence, and any next-run corrective prompt.

Final checks:

- Core inventory and interactions match the surface map.
- Applicable empty and error states are visible; non-applicability has a reason.
- No native dialogs, dead avatar/menu, or external dependencies.
- Visual system is selected-skill-specific rather than generic.
- Polish preserved functional completeness.
- Missing selected behavior is reported as blocking; optional ideas and inapplicable management flows are not.
