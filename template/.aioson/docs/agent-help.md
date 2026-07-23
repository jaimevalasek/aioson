---
description: "Per-agent quick help printed by the --help activation token. Each section is keyed by `## @<agent>`; the agent prints ONLY its own section, translated to the interaction language, and stops."
task_types: [help]
triggers: [help, --help, agent options]
---

# Agent quick help (--help token)

Consumed by the `## Help (--help)` section of each agent kernel: a standalone `--help` in the activation arguments makes the agent print its section below (localized) and stop — no work, no CLI calls, no questions. Keep every section short: what / when / options / typical calls / produces / next.

## @product

- **What:** product discovery — defines what to build, for whom, and why; writes the PRD base.
- **When:** starting a new feature or project definition; the kickoff of every feature chain.
- **Options:** `--auto` (autopilot through implementation and review, stopping before the human `feature:close` gate), `--step` (manual handoffs for this activation). Without a token, follows the feature scheme/project default.
- **Typical:** `/product --auto build email notifications`, `/product redesign checkout`.
- **Produces:** one `prd-{slug}.md` product authority with explicit feature-owned prototype status (`current`/`none`) plus the `features.md` index row.
- **Next:** `@planner` for every feature classification; optional `@sheldon` only for requested/concrete independent enrichment; `@copywriter` for a site-specific content detour.

## @briefing

- **What:** turns raw sketches from `plans/` into a structured, approved pre-production briefing.
- **When:** an early idea needs framing and evaluation BEFORE committing to a PRD.
- **Options:** none — point it at a `plans/` sketch or describe the idea.
- **Typical:** `/briefing evaluate plans/loyalty-program.md`, `/briefing frame this idea: ...`.
- **Produces:** `.aioson/briefings/{slug}/briefings.md` (+ prototype when the flow calls for it).
- **Next:** `@briefing-refiner` (refine) or `@product` (PRD).

## @briefing-refiner

- **What:** iterative review of an existing briefing before PRD generation — the agent audits (findings), the CLI renders `review.html` (`aioson briefing:review`), you decide in the browser, structured feedback is applied back (`aioson briefing:apply-feedback`), and the loop repeats until nothing blocks the PRD.
- **When:** a briefing exists but needs corrections, scope trims, or decisions; optionally a clickable prototype (and a reference-image visual identity) before @product.
- **Options:** none — it locates the briefing by slug or asks which one.
- **Typical:** `/briefing-refiner refine loyalty-program`.
- **Produces:** review rounds (`review.html` + feedback JSON + report, archived per round) and the updated briefing (contract preserved); optionally `identity.md` + feature-owned `prototype.html`/`prototype-manifest.md`.
- **Next:** `@product` (after `aioson briefing:approve`), or prototype mode first for rich surfaces.

## @dev

- **What:** implements the reviewed PRD through the approved implementation plan — code, migrations, interfaces, and stack-native tests on the production path.
- **When:** implementation entry point, resume after a break, or QA corrections.
- **Options:** `--auto` (arm autopilot for this activation: implementation + review cycle), `--step` (override an always-autopilot project and stop at the manual `@qa` handoff for this activation).
- **Typical:** `/dev --auto`, `/dev` (follows the seeded scheme/flag), `/dev continue feature checkout`.
- **Produces:** the working implementation + tests and `dev-state.md` checkpoints; it does not create another specification.
- **Next:** `@qa` (hub of the post-dev review cycle).

## @deyvin

- **What:** continuity-first pair programming — recovers recent context, works in small validated slices. Alias: `/pair`.
- **When:** resuming known work, debugging together, a bounded fix on existing context.
- **Options:** none. Hard boundary: new project/feature, broad redesign, or mixed product+UX+implementation scope → hands off immediately, never codes first.
- **Typical:** `/deyvin continue yesterday's fix`, `/pair debug the failing upload test`.
- **Produces:** the validated slice + session continuity records.
- **Next:** the proper workflow agent when scope expands (`@product`/`@dev`).

## @discover

- **What:** reads key files/artifacts and builds the semantic knowledge cache in `.aioson/context/bootstrap/` (what the system is, does, how it works, current state).
- **When:** session start on broad work, after big landings, or when agents warn `bootstrap < 4/4` / stale.
- **Options:** none.
- **Typical:** `/discover` (full refresh).
- **Produces:** `bootstrap/how-it-works.md`, `bootstrap/current-state.md` (+ archive), instant context for every other agent.
- **Next:** whatever agent you originally needed — discover is a preparation step.

## @neo

- **What:** the system router — shows the full picture (project state, workflow stage, pending work) and routes you to the right agent. Never implements, never produces artifacts.
- **When:** you are lost, between features, or unsure which agent/lane fits the task.
- **Options:** none.
- **Typical:** `/neo where are we?`, `/neo what should I run next?`.
- **Produces:** orientation + a concrete routing recommendation.
- **Next:** the agent it names.

## @orache

- **What:** deep domain investigation before a squad/product push — real frameworks, anti-patterns, benchmarks, reference voices, vocabulary of the field.
- **When:** entering an unfamiliar domain, or before `@squad` assembles specialists.
- **Options:** none — give it the domain/question; it reuses the `researchs/` cache (7-day TTL).
- **Typical:** `/orache investigate the B2B onboarding-tools market`.
- **Produces:** a domain dossier + cached research under `researchs/`.
- **Next:** `@squad`, `@product`, or `@briefing` depending on the goal.

## @orchestrator

- **What:** optional coordination specialist for a user-requested parallel execution problem; it is not a specification authority.
- **When:** the approved implementation plan contains genuinely independent work that benefits from explicit coordination.
- **Options:** use only with a named coordination goal and ownership boundaries.
- **Typical:** `/orchestrator coordinate phases 2 and 3 of billing-portal`.
- **Produces:** coordination state and consolidated execution status, not a requirements/spec/design pack.
- **Next:** the current canonical owner (`@planner`, `@dev`, or `@qa`).

## @tester

- **What:** engineering-grade coverage for already-implemented behavior — adds tests and may correct one unequivocal bounded defect, but never invents product behavior or self-accepts delivery.
- **When:** `@qa` flags a coverage gap, or you want a systematic test pass on a finished surface.
- **Options:** feature-scoped via the workflow (`--feature=<slug>` when invoked through the CLI prompt); a direct bounded correction over a disabled manifest entry uses `review-cycle:advance ... --manual`.
- **Typical:** `/tester cover feature checkout`, or invoked after `@qa` only when enabled and concretely triggered.
- **Produces:** tests + `test-report-{slug}.md`; bounded corrections stay inside persisted allowed paths and a finite review cycle.
- **Next:** `@dev` once for cross-cutting gaps, or back to `@qa` for independent acceptance.

## @pentester

- **What:** structured adversarial security review — maps the threat surface, produces reproducible findings, and may apply deterministic bounded hardening under an explicit scope contract.
- **When:** sensitive surface (auth, money, uploads, secrets, external URLs) — via `@qa`'s trigger or on demand.
- **Options:** `--mode=app_target --feature=<slug> --scope=<target>` via `aioson agent:prompt pentester`; a direct bounded correction over a disabled manifest entry uses `review-cycle:advance ... --manual`.
- **Typical:** `/pentester review the auth endpoints of feature accounts`.
- **Produces:** `security-findings-{slug}.json` (owners + severities; `@qa` owns closure).
- **Next:** `@dev` once for cross-cutting findings, or back to `@qa`; Pentester never self-accepts a fix.

## @qa

- **What:** proportional delivery review — checks the relevant ACs, focused tests, and the normal production path, then returns a fast PASS or a concise reproduction to Dev.
- **When:** right after `@dev`; re-verification after corrections.
- **Options:** none at activation — verdicts and routing are evidence-driven.
- **Typical:** `/qa verify feature checkout`, or auto-invoked by `@dev` under autopilot.
- **Produces:** `qa-report-{slug}.md` with verdict (PASS/FAIL), executable checks, and production-path evidence.
- **Next:** `@dev` (FAIL), a risk-triggered specialist, or STOP recommending `aioson feature:close` (human gate).

## @sheldon

- **What:** optionally challenges and enriches the Product PRD in place without creating a parallel specification pack.
- **When:** the user asks for independent enrichment or Product/Planner identifies a concrete contradiction or material risk.
- **Options:** none at activation — it edits the existing PRD and never creates a parallel spec pack.
- **Typical:** `/sheldon continue feature quick-filters`.
- **Produces:** the same `prd-{slug}.md` with `sheldon_review: approved` and stable `CAP-*`/`AC-*` trace.
- **Next:** `@planner`.

## @planner

- **What:** converts the Product-ready PRD and prototype into executable vertical implementation stages.
- **When:** every MICRO/SMALL/MEDIUM feature after `@product`, or after an optional Sheldon enrichment.
- **Options:** none; unresolved product behavior returns to Product, while a truly specialist decision may trigger one bounded detour.
- **Typical:** `/planner plan feature quick-filters`.
- **Produces:** one `implementation-plan-{slug}.md` with exact paths, dependencies, checks, and early production-path proof.
- **Next:** `@dev`.
