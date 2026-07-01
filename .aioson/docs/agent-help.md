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
- **Options:** `--auto` (run this feature on autopilot to `feature:close`), `--step` (drive each stage manually). Without a token and no standing choice, asks the run mode once at the PRD handoff.
- **Typical:** `/product --auto build email notifications`, `/product redesign checkout`.
- **Produces:** `prd-{slug}.md`, `features.md` row; seeds the autopilot scheme when armed.
- **Next:** `@sheldon` (SMALL), `@orchestrator` (MEDIUM), `@dev` (MICRO), `@copywriter` (site).

## @briefing

- **What:** turns raw sketches from `plans/` into a structured, approved pre-production briefing.
- **When:** an early idea needs framing and evaluation BEFORE committing to a PRD.
- **Options:** none — point it at a `plans/` sketch or describe the idea.
- **Typical:** `/briefing evaluate plans/loyalty-program.md`, `/briefing frame this idea: ...`.
- **Produces:** `.aioson/briefings/{slug}/briefings.md` (+ prototype when the flow calls for it).
- **Next:** `@briefing-refiner` (refine) or `@product` (PRD).

## @briefing-refiner

- **What:** interactive review/annotation of an existing briefing before PRD generation.
- **When:** a briefing exists but needs corrections, scope trims, or confirmations.
- **Options:** none — it locates the briefing by slug or asks which one.
- **Typical:** `/briefing-refiner refine loyalty-program`.
- **Produces:** the updated briefing (contract preserved) from your structured feedback.
- **Next:** `@product`.

## @dev

- **What:** implements features per the spec/plan — code, migrations, interfaces, tests; drives all phases in one continuous run.
- **When:** implementation entry point, resume after a break, or QA corrections.
- **Options:** `--auto` (arm autopilot from here: implementation + review cycle run autonomously), `--step` (disarm autopilot for this feature — stop at the `@qa` handoff even in an always-autopilot project).
- **Typical:** `/dev --auto`, `/dev` (follows the seeded scheme/flag), `/dev continue feature checkout`.
- **Produces:** the implementation + tests, `spec-{slug}.md` updates, `dev-state.md` checkpoints.
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

- **What:** the MEDIUM spec maestro — fans out to analyst/architect/pm (+ux-ui) as sub-agents and consolidates one gated spec package (requirements, spec with Gates A/B/C, design-doc, readiness, plan, harness contract). MEDIUM only.
- **When:** feature classified MEDIUM, right after `@product`.
- **Options:** none at activation — under autopilot it seeds the scheme, completes its stage, and crosses into `@dev` automatically.
- **Typical:** `/orchestrator continue feature billing-portal`.
- **Produces:** the gated spec package + `dev-state.md` cold-start packet.
- **Next:** `@dev`.

## @tester

- **What:** engineering-grade test suite for already-implemented apps — coverage gaps, edge cases, mutation-style checks. Tests what exists; never implements features.
- **When:** `@qa` flags a coverage gap, or you want a systematic test pass on a finished surface.
- **Options:** feature-scoped via the workflow (`--feature=<slug>` when invoked through the CLI prompt).
- **Typical:** `/tester cover feature checkout`, or auto-invoked by `@qa` under autopilot.
- **Produces:** the test suite + a coverage report; surfaces dev-owned blocking gaps.
- **Next:** `@dev` (blocking gaps) or back to `@qa` (sign-off).

## @pentester

- **What:** structured adversarial security review — maps the threat surface and produces reproducible findings under an explicit scope contract (not a free-form hacker).
- **When:** sensitive surface (auth, money, uploads, secrets, external URLs) — via `@qa`'s trigger or on demand.
- **Options:** `--mode=app_target --feature=<slug> --scope=<target>` via `aioson agent:prompt pentester`.
- **Typical:** `/pentester review the auth endpoints of feature accounts`.
- **Produces:** `security-findings-{slug}.json` (owners + severities; `@qa` owns closure).
- **Next:** `@dev` (open dev-owned findings) or back to `@qa`.

## @qa

- **What:** risk-first review — objective findings, the runtime smoke gate (build + migrate + boot + Core happy-path on the real stack), and the post-dev routing hub.
- **When:** right after `@dev`; re-verification after corrections.
- **Options:** none at activation — verdicts and routing are evidence-driven.
- **Typical:** `/qa verify feature checkout`, or auto-invoked by `@dev` under autopilot.
- **Produces:** QA report + verdict (PASS/FAIL), Gate D, corrections plans on FAIL.
- **Next:** `@dev` (FAIL), `@tester`/`@pentester` (triggers), `@validator` (harness contract), or STOP recommending `aioson feature:close` (human gate).

## @sheldon

- **What:** the SMALL single spec authority (lean lane) — PRD gap analysis, sizing, enrichment, and the full collapsed spec package in one pass.
- **When:** feature classified SMALL, right after `@product`; or PRD quality review on demand.
- **Options:** none at activation — under autopilot it seeds the scheme, completes its stage (`--complete=sheldon`), and crosses into `@dev` automatically.
- **Typical:** `/sheldon continue feature quick-filters`.
- **Produces:** `sheldon-enrichment-{slug}.md`, `spec-{slug}.md` (Gates A/B/C), design-doc, readiness, plan, harness contract, `dev-state.md`.
- **Next:** `@dev`.
