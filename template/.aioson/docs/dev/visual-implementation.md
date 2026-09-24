---
name: visual-implementation
description: Visual authority resolution and anti-slop implementation criteria for user-facing interfaces, prototypes, and visual states
agents: [dev, qa, site-forge]
priority: 10
version: 1.0.0
modes: [planning, executing]
task_types: [implementation, ui, layout, prototype, visual-state, responsive, accessibility]
load_tier: trigger
triggers: [UI, interface, layout, screen, component, prototype, visual, responsive, mobile, styling, design skill, identity]
paths: [app/**, src/**, resources/**, components/**, pages/**, styles/**, .aioson/briefings/**, .aioson/explorations/**]
---

# Visual Implementation

Load when the active phase touches a user-facing interface, prototype, or visual state. Skip entirely for non-visual work — that is the point of routing it here instead of carrying it in the kernel.

## 1. Query the visual-quality brain

```bash
aioson brain:query . --agent=dev --tags=visual-quality,layout --min-quality=4 --format=index 2>/dev/null || true
```

Apply matched nodes with `q >= 4`; never implement a node marked `AVOID`. The index prints one line per node (title and first sentence, a quarter of the compact cost); open a node's full statement with `--id=<id> --format=compact` when its title names the decision in front of you.

**Precedence** is node `vq-000`: a project rule under `.aioson/rules/` outranks every node here. Create one with `aioson rule:new`.

## 2. Resolve visual authority before styling

Resolve from the PRD binding, in this order:

1. the `identity` / `identity_status` record — load the record itself, it is the extracted token and component-structure system, not a summary
2. the approved prototype (`prototype_status: current`) and its manifest `## Visual direction`
3. the project's selected `design_skill`
4. existing repository component language

Do not replace missing visual direction with a generic layout. A genuinely unresolved visual decision is a product question for `@product`, or a prototype gap for `@refiner`; never invent a second visual system to fill it.

When none of the four resolves — a bare repository, no prototype, no identity record — the first screen is a **cold start**, and the palette a model picks unprompted is the same one in every project (measured: four product UIs landed in one 75° band of the wheel with every gate green). Run `aioson design:seed . --register=<register> --slug=<feature> --json` and build FROM one candidate, exactly as the design skill's origination mode does. The draw is recorded next to the feature, and `kind=visual` reads it back as `palette.origin` — `seed`, `identity`, or `prior`; `origination without a draw` and `draw ignored` name the two ways the prior wins. Once the system is inspected and approved, persist it as `.aioson/context/identity.md` (scope `brand`, source `intent`) so later features inherit a record instead of re-rolling.

When an approved prototype exists, the design skill runs in **conformance mode**: transfer the approved direction, do not re-decide it. A deviation must already be recorded in the PRD as an approved deviation — never introduced silently as an improvement.

## 3. Run the replaceability test

If the screen still looks complete after removing its domain nouns, it needs a stronger product-specific signature. Reconsider centered hero + gradient/blob + equal cards, card multiplication, style soup, or decorative effects without a functional reason.

Common patterns remain valid when the approved identity and evidence justify them. The test is about whether the composition is *specific*, not whether it is *unusual*.

**Name what the visitor came to do on this surface first — decide, operate, read, or inhabit — because the premium bar flips with the answer.** On surfaces the user came to *operate* (dashboards, admin, editors, settings, recurring CRUD) the failure mode is not flatness but purposeless strangeness, and the bar is **earned familiarity**: a fluent user trusts the screen immediately and the tool disappears into the task. There, one family is usually enough; type runs a fixed rem scale (no fluid `clamp()` headings inside app chrome) at a tighter ratio (1.125–1.2); accent marks only primary actions, selection, and state; motion is 150–250ms state feedback with no page-load orchestration; skeletons replace spinners mid-content; empty states teach the interface; overlays escape clipped containers; modal is the last resort. The craft floor still binds — delivered face, tokened finish, themed browser chrome — spent on precision and density instead of ornament. Persuade/experience surfaces (landing, showcase, marketing) keep the expressive bar; the mode is per surface, never per project. The telemetry measures it: `metrics.surface_mode` is detected from structure (a sidebar shell, a data table, a toolbar, dense forms read as operate; a hero, display type and marketing sections as brand), the prototype manifest's `surface_mode:` or `--surface-mode=` on the command pins it, and on an operate surface the craft floor is `craft N/4 (operate)` — typeface, material, motion, themed chrome — with a workhorse face in the display role sanctioned, never a tell.

## 4. Prove the states, not just the happy path

Inspect real content at desktop and mobile widths, plus the material loading, empty, error, focus, disabled, success, and reduced-motion states before marking visual work complete. Short placeholder copy hides layout failures — use realistic domain data.

Mobile is a recomposition, not a shrunken desktop: re-evaluate order, density, controls, wrapping, and interaction priority.

## 5. Adding an effect, a background, or a hero asset

Load `.aioson/docs/design/visual-effects.md`. It carries the effect vocabulary (display typography first, then atmosphere), the Modern baseline dialect, plus the cost and asset contracts: an effect must explain state, reinforce the signature move, or carry the material — and it ships with reduced-motion, a mobile fallback, and no layout shift. Meaningful assets come from the user, the product, or the repository through the identity pipeline; when none exists and the host offers image generation, generated imagery with provenance labeled `generated` is the sanctioned plan B — never presented as the client's real work.

## 6. Measure what you built

Before declaring visual work complete, run the telemetry over the front-end you touched:

```bash
aioson verify:artifact . --kind=visual --dir=<front-end root> --advisory --runtime 2>/dev/null || true
```

It returns arithmetic, not opinion: token adherence, spacing off the 4px grid, active depth strategies, typeface delivery (`font_delivery` — a named face with no webfont link or `@font-face` silently renders the OS fallback), display scale, the craft levers (`craft N/5`; on an operate or read surface `craft N/4` plus `precision N/100` — the familiarity bar graded from typeface, tokens, rhythm, states, chrome, tells and dialect, held at 60 exactly like the brand weight), the finish depth (`materials N/7` — how many physical finish techniques actually paint; `shallow material system` means the palette is wearing no clothes and needs the tokened shadow/wash/texture system every route inherits, and `declared finish never applied` names effect tokens or `@keyframes` no rule references), the generation tells (`tells N` — the category defaults every generative prior converges on: gradient text, colored side borders, kicker/eyebrow labels, the icon-tile card grid, zero-offset glows, hard-offset block shadows, saturated display faces, bounce easing, sub-11px text, buzzword and negation-pivot copy; each `generation tell:`/`copy tell:` warning names its counter-move, and `browser chrome never themed` names the cheap positive twin — ::selection, caret, scrollbar, :focus-visible, underline tuning, tabular numerals drawn from the palette), the CSS dialect (`modern_css`), the palette fingerprint (`accent ~H° on <pole>`, compared against the operator's recent projects — a `cross-project palette repetition` warning means this surface is re-wearing another project's palette and needs a diversified draw or a recorded brand reason), reduced-motion coverage, state coverage, card nesting. Repair the blocking findings — decorative blob, animation with no `prefers-reduced-motion`, cards three deep. Treat the threshold warnings as evidence for the decision you already owe: either fix the drift or name why this surface is the exception.

In conformance mode the approved prototype's measured verdict is also the floor: an implementation whose craft regresses below it — the delivered face dropped for a system stack, the material, imagery, or reveals lost in translation, the dialect downgraded — is drift exactly like a layout deviation, and gets fixed or recorded in the PRD as an approved deviation. The real stack makes the craft easier, not harder: webfonts load natively, images are real files, and the Modern baseline features are all build-free. This comparison is **measured at your session end**: `agent:done --agent=dev` resolves the interface root from the files the feature changed (common ancestor of the html/css/tsx/vue… in the delivered change set — a backend-only change skips), runs `kind=visual` over it with `--conformance={slug}`, and reports craft, materials, tells and every axis that regressed below the prototype's recorded evidence; the result is persisted next to the prototype's (`features/{slug}/visual-implementation.json`) and carried by `feature:trace`. Run it earlier yourself with `aioson verify:artifact . --kind=visual --dir=<root> --conformance={slug} --advisory`.

The corpus is the whole interface, not the `.css` files: `--dir` reads documents, stylesheets (`.css/.scss/.sass/.less`) and component sources (`.tsx/.jsx/.vue/.svelte/.astro/.js/.ts` — JSX markup, SFC `<style>` blocks, styled-components/Emotion template literals), and skips tests, stories and type declarations. Finish applied from a `style={{ … }}` prop or an inline `animation:` is live finish; copy inside components is copy. `metrics.corpus` says what was read and names a truncated walk — point `--dir` at the interface root (`src/`, `app/`), never at the repository.

A utility-class codebase returns `applicable: false`; that is a scope statement, not a pass. The craft duties still bind there through conformance and the runtime pass — the prototype's delivered typeface, materials, and choreography survive the translation to utility classes even when the static telemetry cannot measure them.

`--runtime` is part of the default invocation because it measures what only exists after layout — horizontal overflow at 360px, clipped text, elements pushed off-screen, undersized tap targets, and real computed contrast. It needs a page to open: a built `index.html` via `--file`, or the served app via `--url=http://localhost:<port>` — a framework source tree has no document, and the command says so instead of skipping in silence. Without Playwright installed it reports that it did not run (never a silent pass); state that outcome when declaring visual work complete, and `aioson doctor` shows how to enable it.

A measurement is not a mutation: a diagnostic run over someone else's tree, a fixture, or a surface you are only inspecting takes `--no-persist` — no report in `.aioson/context/`, no entry in the operator's palette registry. The feature-owned run (`--slug`) is the one that records: its report lands in `.aioson/context/features/{slug}/visual-evidence.json`, where `feature:trace` carries it to QA and `feature:close` records it at closure.

## 7. Reuse before adding

Map each region to a real component in this project's library. A new component needs a named reason. Off-grid spacing, hardcoded colors, mixed radii, and mixed depth strategies are drift — fix them rather than adding another variant.
