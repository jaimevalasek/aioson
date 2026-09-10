---
description: Refiner prototype route, reference identity extraction, and explicit-model delegation
agents: [refiner]
task_types: [briefing-prototype, visual-refinement, explicit-model-delegation]
triggers: [prototype requested, rich-surface prototype accepted, user names another model]
---

# Briefing Prototype and Delegation

Load for every visible or interaction-bearing feature, or when the user explicitly names another model for a bounded supporting task. A genuinely non-visual feature may record `prototype: not_applicable` with evidence instead.

This module owns only the canonical, feature-owned prototype after a Briefing exists. For screenshot-led experiments, redesign options, or model arenas without a refinable Briefing, load `visual-exploration.md`; never write those candidates into `.aioson/briefings/` or reuse them directly as the approved prototype.

## Explicit model delegation

This route is user-requested only. Load `.aioson/docs/model-delegation.md` and follow it exactly.

1. Keep ownership of scope, Operational Surface Map, completeness, prototype integration, and final readiness.
2. Write `.aioson/briefings/{slug}/delegation-task.md` with one exact question, expected evidence, allowed capabilities, and exclusions. Do not include secrets or hidden reasoning.
3. Plan:

```bash
aioson delegation:plan . --explicit-model-request --host=<current-host> --provider=<requested-provider-or-current-host> --model="<requested-model>" --kind=<kind> --task-file=.aioson/briefings/{slug}/delegation-task.md --research-slug=<research-slug> --json
```

4. For native mode, dispatch exactly one host subagent with `worker_prompt` and explicitly bind `native_dispatch.model`. If binding cannot be proved, use `aioson delegation:run` with the same flags. Use returned external mode for cross-provider work; never silently inherit another model.
5. Validate returned evidence, persist it through the parent-owned `persistence.path`, record material provenance, and resume normal gates. Unavailable delegation is a disclosed limitation, never a fabricated result.

## Prototype trigger and inputs

Prototype mode is required for workspaces, boards/cards, pipelines, CRM/Kanban, dashboards, admin/management, repeated CRUD, builders/editors, and other visible or interaction-heavy surfaces. Approval blocks until the active-feature prototype exists and its owned manifest can be frozen as `status: approved`; only a genuinely non-visual feature may use an explicit `not_applicable` decision.

Read the briefing and its operational surface from `solution-options.md` or `expansion-scout.md`, falling back to `.aioson/docs/feature-expansion-taxonomy.md`.

## Visual route

### Proactive design system offer

Before originating a visual prototype, inspect the active briefing identity, project identity, confirmed applied review decisions, and the manifest's `## Design system decision`. Reuse an existing applicable identity and name its scope; do not offer to recreate it or ask the owner to repeat a recorded choice.

With no identity and no recorded choice, offer once in the interaction language: "Would you like me to create a reusable visual identity — colors, typography, spacing, and component rules — so future screens follow the same design? I can use your references or develop it from this prototype and save it after you accept the visual direction. You can also leave this for later."

Offer **Create from references**, **Create from the prototype without references**, and **Decide later**, recommending the route supported by the available inputs. This is an identity decision, never a design-skill catalog. Combine reference and anti-reference intake with this question; do not ask another version of the same question in the visual route below. Existing explicit authorization counts. With no answer, continue only already-authorized prototype work and record `pending`; never infer consent to save an identity. A declined/deferred choice suppresses repeated offers until the owner reopens it.

Record the choice (`references` | `intent` | `later` | `pending` | `reuse`), authorizing words, intended scope, and consolidation state under `## Design system decision` in the existing prototype manifest when it is created. Default to this briefing's scope; project-wide reuse must be chosen explicitly. This decision neither edits the briefing nor changes the separate refinement budget. For non-visual work, skip the offer.

### Apply the chosen route

Resolve `design_skill` from project context:

- For `interface-design` with specific reference images, ask for identity references in `.aioson/briefings/{slug}/references/identity/` and structural/component references in `.aioson/briefings/{slug}/references/structure/`.
- When the user points at a reference/inspiration **site URL** (effects, motion, layout), load `.aioson/docs/web-capture.md` on demand and apply its capture-route decision; on the AIOSON route, `researchs/<ref-slug>/extract.md` is the identity/effects evidence.
- Load `.aioson/skills/process/reference-identity-extract/SKILL.md`, extract once to `.aioson/briefings/{slug}/identity.md`, then run:

```bash
aioson verify:artifact . --kind=identity --file=.aioson/briefings/{slug}/identity.md --advisory 2>/dev/null || true
```

`identity.md` parameterizes the one chosen design engine; its `## Component structure notes` inform the operational surface. Without images, let `interface-design` operate intent-first. Choosing `intent` schedules consolidation below; keep `identity: none` and record the proposed tokens/direction in `## Visual direction` until the owner accepts the inspected result. Choosing `later` still receives the same visual quality; only reusable identity persistence is deferred.

- With an identity, draw the starting material FROM it: `aioson design:seed . --slug={slug} --json` resolves the briefing record (then the project brand record) by itself — its `theme` fixes the ground pole and an optional `register:` fixes the register; the registry still diversifies hue and pairing, and never flips the pole the owner showed. Record `references: extracted` in the manifest frontmatter only for `source: references`; reusing `source: intent` never implies reference extraction.

- If `design_skill` names a project-forged skill (site-forge or hybrid output), use only that skill.
- If it is blank, default to `interface-design` in intent-first origination mode without asking. Commit to one aesthetic register and one product-specific signature move, then draw the starting material with `aioson design:seed . --register=<register> --slug={slug} --json` and build FROM one candidate — the draw supplies a contrast-solved hue family, ground pole, typeface pairing, and hero posture, diversified against the operator's recent projects, which is what keeps unrelated projects from all wearing the model's favorite palette. Originate the layout from it with premium tokenized craft — palette, typography, depth, and purposeful motion honoring `prefers-reduced-motion` — at the same ambition regardless of which model executes the run. This default is declared, never silent: record `design_skill: interface-design (default)` in `prototype-manifest.md` — the engine is the project's definitive design skill unless the field names a project-forged one, so no finding asks the owner to pick. For a premium-intent surface (marketing, institutional, showcase — anywhere the aesthetic is the argument), ask once, before originating, whether the owner has visual references — screenshots, capture folders, site URLs; owners who care about the aesthetic almost always hold a mental bar they can show. In the same round, ask for **anti-references**: two to five things this must NOT look like (competitors, styles, clichés — "not another dark dashboard with neon", "nothing that looks like a bank"). Owners who cannot articulate the bar can almost always name what breaks it, and a named anti-reference outranks ten positive adjectives: record them in the manifest's `## Visual direction` as its anti-goals, where they bind every later build and review round. References given → the identity route above, which outranks intent-first origination. No references → originate, and record the answer as a manifest fact: `references: declined` (the owner has none) or `references: unavailable` (asked, no answer yet). `verify:artifact --kind=visual` warns `references_unasked` on a brand-surface prototype built `identity: none` with no such line — a missing answer means the question was never asked, and the seed decided the direction alone. A stated ground without images (`--pole=dark|light`) is a preference the draw honors, not an identity.
- The installed skill catalog is never the decision surface. The framework ships no fixed presets; a forged skill is used only when the owner explicitly names one, and enumerating installed skills as a menu turns the aesthetic decision into a re-roll of the same fixed looks.

If the user named another model for reference research or critique, finish explicit delegation first. Otherwise do not delegate merely because it might help.

## Build initial prototype

1. Load `.aioson/skills/process/prototype-forge/SKILL.md`, and — for every surface where the aesthetic argues — `.aioson/docs/design/visual-effects.md` (the effect vocabulary with its CSS recipes and cost contracts) plus the engine's `references/aesthetic-registers.md`: the register's premium bar names the moves, the vocabulary tells how each one is built and what it costs.
2. Follow its build contract and non-regression order for the requested Core screens, navigation, mock behavior and chosen visual direction. For this canonical Refiner route, pause before Prototype Forge's `After the functional build` polish/check/evidence steps. Its full Gate applies to approval-ready handoff, not initial draft delivery; the continuation choice below controls when to run it. Keep the design engine active from the first build.
3. Write:

```text
.aioson/briefings/{slug}/prototype.html
.aioson/briefings/{slug}/prototype-manifest.md
```

The manifest declares `feature: {slug}`, `status: draft`, and the `identity:` record the build consumed (or `none`) during refinement. That identity line is what carries the extracted visual system past briefing approval into the PRD and implementation; omitting it silently strands the record here. Never reuse another briefing's manifest/prototype. The user-controlled `aioson briefing:approve` command changes it to `status: approved`; only then may Product and downstream agents treat it as binding.
## Prototype continuation choice

After creating the initial files, check owner/path and do one opening/primary-action smoke when browser tools are available. Fix an obvious launch blocker once, or disclose it. Deliver the exact prototype path and any known limitations before further visual work.

Ask once in the interaction language: "The initial prototype has been created. Would you like to finish with this version, or let me run a refinement round to improve it?" Offer **Finish with the current prototype** and **Continue refining (more time and tokens)**. This is a terminal choice: stop and wait for the answer before polishing, capturing a route matrix, opening more screenshots, running the full walkthrough, or starting another review pass. No answer authorizes no additional work.

- **Finish:** deliver the files as `status: draft`, name validation still pending, record the choice and end the activation. Do not propose `briefing:approve` or Product as ready. The normal `agent:done` static check may report findings; it does not restart work.
- **Refine:** run one bounded cycle: inspect → repair → final verification, using the existing premium pass and validation below. New warnings, routes, or re-preparing a report do not reset that budget. Return the improved prototype and residual findings; another cycle needs another explicit request.
- **Already authorized:** a prior explicit request to refine automatically for this prototype counts; do not ask again. Honor a smaller named scope or budget. "Create a premium prototype", `recommend_prototype: true`, Autopilot, or a generic "continue" does not itself authorize the refinement loop; a direct answer to this choice does. A request only to change one detail authorizes that change and its focused check.

Record the choice, the user's authorizing words, and the cycle's remaining/consumed budget under `## Refinement budget` in the existing manifest. On resume, read it before work: pending/finish is a stop, and a consumed cycle never restarts itself. Update the record before final measurement so it cannot invalidate its own evidence. A later explicit request to prepare for approval authorizes the outstanding validation; if findings need another repair cycle, report them and obtain that choice. Stopping never waives an approval gate or implies `--accept-craft`/a runtime waiver.

## Authorized refinement and approval validation

Run only after the continuation choice authorizes refinement, or the user explicitly requests approval preparation. Apply Prototype Forge's bounded premium quality pass only when refinement was authorized. Preserve its non-regression and completeness gates. Measure `craft weight N/100` on brand surfaces, `precision N/100` on operate/read surfaces, and runtime fold density where applicable. Presence alone does not prove quality.

Verify owner/path directly because no PRD exists. Product later runs `aioson prototype:check . --feature={slug} --strict`. Measure the built prototype before any PRD binds it:

```bash
aioson verify:artifact . --kind=visual --slug={slug} --advisory --runtime --screenshots 2>/dev/null || true
```

Before this run, declare `## Runtime matrix` in the manifest: one named entry/primary route and one route for every demonstrable loading, empty, error, and success state. The runtime verifier visits that matrix at mobile and desktop, checks that each declared state is structurally visible, and stores first-fold captures at both widths when `--screenshots` is enabled (`--screenshots=full` keeps whole pages for a human scroll). A run over the whole matrix removes the captures it did not produce (a `--route=` run replaces only its own), the evidence records what it holds (`runtime.screenshot_capture`), and a fold finding names the capture that shows it. Open only that capture — at most the flagged route at desktop and mobile per round — never browse the folder: each image read stays in the session for its remaining turns, and a full-page capture is downscaled to illegibility anyway. A later static re-measure of unchanged inputs (the session-end auto-fire included) carries the runtime section forward instead of erasing it; a changed prototype is told `runtime evidence dropped` and needs `--runtime` again. `--route=<hash>` remains the one-off override; a single entry route is not full-surface evidence.

Repair the blocking findings (decorative blob, animation with no `prefers-reduced-motion`, cards three deep, missing/empty manifest `## Visual direction`, primary feature below the fold) in the prototype itself. Threshold warnings — token adherence, off-grid spacing, depth strategies, font count, missing states, emoji-as-icon, uniform card walls, missing tour/primary markers — become structured findings only when this surface cannot justify them.

`--runtime` is always attempted, never assumed: with Playwright present it measures overflow, clipping, off-screen elements, tap targets, computed contrast, exact loaded font faces, broken media, computed material/motion, visible state markers, the primary-feature fold, and the declared route matrix. A run that requested runtime but could not complete it is reported as `UNVERIFIED`, never `ok: true`. When Playwright is absent, surface the enable decision to the user once per feature — "runtime telemetry is off; enable with `npm i -D playwright && npx playwright install chromium`?" — and record the answer. If the owner explicitly waives runtime, rerun without `--runtime` and record the waiver plus reason; that new report is an explicit static-only decision, not a silently degraded runtime run. The manifest's Quality evidence is a machine-bound projection of the persisted report (`verdict`, exact `evidence` path, `craft N/N`, `runtime`, `routes N`), not free-form claims. Briefing approval cross-checks it and refuses missing, stale, failed, or unverified evidence; lifecycle fields and the evidence projection itself do not invalidate the content hash, but changes to the prototype, briefing, identity, manifest decisions, or local visual assets do.
Interactions are proven the way craft is measured, not asserted from the HTML you wrote: author a prototype walkthrough (grammar in `.aioson/docs/qa/browser-walkthrough.md`) whose steps carry the `PROM-*` ids they demonstrate — the first-open tour, each promised state switch, every confirm/cancel path, drag-and-drop persistence within the session — and run `aioson browser:run . --script=<file> --file=.aioson/briefings/{slug}/prototype.html --slug={slug} --prototype 2>/dev/null || true`. Read the page first with `aioson browser:snapshot . --file=.aioson/briefings/{slug}/prototype.html`. The report lands in `.aioson/briefings/{slug}/browser/` beside the manifest; a promise whose step fails is a prototype defect to repair before approval, and `not_reached` is not demonstrated. Prototype walkthroughs never count as delivery AC evidence — QA writes its own against the real application.
Give the exact paths and state that the prototype models the final visual/interaction contract but does not prove backend integration: mock-only behavior is design evidence, never implementation proof, and refresh may reset mock state. Status remains draft until the user approves the briefing, then Product must preserve or explicitly document deviations from the approved binding. If the authorized cycle ends with unresolved findings, report them without claiming approval readiness; do not restart it to make a gate green.

## Consolidate the accepted design system

For a recorded `intent` choice, once the prototype has been inspected and the owner explicitly accepts that visual direction, write the promised `identity.md` without asking for the same creation permission again. Initial delivery, silence, choosing Finish, or passing telemetry is not visual acceptance. If acceptance is still missing, include "Do you accept this visual direction as the reusable identity?" within the existing delivery checkpoint, report consolidation as pending, and stop; do not open a new refinement cycle. Visual acceptance does not approve the briefing.

Use `.aioson/skills/process/reference-identity-extract/references/identity-schema.md` for the exact shape, with `source: intent`, `generated_by: refiner`, and honest provenance describing the accepted prototype rather than nonexistent references. Extract the actual applied values and patterns: pillars, semantic palette, font stacks/scale, spacing/grid/breakpoints, radius/depth, motion/reduced motion, signature moves, anti-goals, and component anatomy, states, interactions, responsive and accessibility rules. Include only decisions demonstrated by the accepted surface; do not invent a component library or claim this document implements one.

Write `.aioson/briefings/{slug}/identity.md` with `scope: briefing` by default. Only for explicitly chosen project-wide reuse, write `.aioson/context/identity.md` with `scope: brand` and `slug: project`; never overwrite an existing brand or promote an exploration silently. An existing applicable identity is reused; an explicit change is reconciled with it, not saved as a competing source of truth.

Run `aioson verify:artifact . --kind=identity --file=<path> --advisory 2>/dev/null || true` and correct incomplete or placeholder content before calling the record complete. Bind the exact path in the draft manifest's `identity:` field and record consolidation/acceptance in `## Design system decision`. This records a system proven by the accepted prototype, not an identity manufactured to justify its own first build. The binding lets Product carry the system into the PRD and subsequent implementation.

Identity and manifest changes invalidate visual evidence: perform consolidation before the final authorized visual verification, or report revalidation pending when approval preparation was not authorized. Never claim old evidence is current, mutate an already frozen manifest, or run `briefing:approve` automatically. Deliver the identity path and scope with the prototype so the client can find and reuse it.

## Rejection closes the loop

When the user rejects a visual that had passed every gate, the rejection is evidence of a harness miss, not just a rebuild order. Before rebuilding, append one learning under `.aioson/learnings/` (plus its `INDEX.md` line) naming: the pattern that slipped through, the gate that stayed green, and the cheapest check that would have caught it. A fingerprint that recurs across features graduates into a project rule via `aioson rule:new`. Then rebuild.

The rebuild itself is re-routed with **new visual input, identity-first** — rerunning the same engine mode on the same inputs, or swapping to another forged skill, is rolling the same dice that just lost:

1. Ask for the owner's references first. Someone who rejected a surface holds a mental bar; ask them to show it (screenshots, capture folders, reference site URLs) and run the identity route above. This is the recommended option whenever the complaint is sameness, "generic", or aesthetic quality.
2. No references available → originate again, but with a **different aesthetic register** executed at its premium bar and a **fresh draw** (`aioson design:seed . --register=<new register> --slug={slug} --seed=<N+1> --json` — the seed override is what makes the re-roll land elsewhere), and treat every craft warning from the rejected build's `kind=visual` report (undelivered typeface, OS-stack typography, `craft floor N/5`, `craft weight N/100`, `bare ground` fold density, `references_unasked`, `cross-project palette repetition`, `shallow material system`, `declared finish never applied`, every `generation tell:`/`copy tell:` line, `browser chrome never themed`) as the explicit fix list of the new build.
3. A forged skill only if the owner names one unprompted. Never present the installed skill catalog as the rebuild menu, and never mark a skill as the recommended answer to a quality or sameness complaint.

When a decision question is genuinely needed, it has exactly this shape — extract identity from your references (recommended; ask for them) / premium origination without references / a specific forged skill you name — never a list of installed skills.

Prototype work never edits `briefings.md`, never becomes canonical feedback, and never trades away a Core screen/action/state for visual polish.
