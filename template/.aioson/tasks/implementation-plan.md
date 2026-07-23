# Task: Generate the Implementation Plan

> Canonical Planner task. Convert one reviewed PRD and its prototype into executable vertical stages without creating another specification layer.

## Required input

- `.aioson/context/project.context.md`
- `.aioson/context/prd-{slug}.md` (or project-level `prd.md`)
- `product_scope: approved` and `prd_ready: approved`; `sheldon_review` is optional
- the approved prototype/reference when one exists
- nearest implementation patterns in the codebase

If observable behavior is missing or contradictory, return to Product; request an optional Sheldon challenge only when independent review is concretely warranted. Do not invent `requirements`, `spec`, `architecture`, `design-doc`, `readiness`, `conformance`, or harness documents as substitutes.

## Output

Write exactly one `.aioson/context/implementation-plan-{slug}.md` with:

1. frontmatter containing `status: approved`, feature, classification, and PRD path;
2. a short delivery strategy tied to existing boundaries;
3. vertical phases, each producing visible/usable behavior;
4. a `Capability Delivery Plan` mapping every `CAP-*`/`AC-*` to a phase;
5. exact behavior and support paths expected per phase;
6. stack-native executable checks and production-path smoke evidence;
7. dependencies, migrations, rollback/risk notes only when applicable;
8. explicit optional-specialist triggers, normally none.

The first implementation phase must prove a real end-to-end slice early. Detached fixtures, a second mock application, or screenshots of an unconnected prototype do not count as production-path evidence.

## Depth

- MICRO feature: terse one/few-phase plan; Simple Plan is a separate non-feature lane and may go directly to `@dev`.
- SMALL: concise phases and representative negative paths.
- MEDIUM: same artifact shape, with deeper failure modes, integration checks, migration/rollback detail, and ownership boundaries.

## Done gate

Run the plan/completeness checks, confirm every required capability has an exact phase/path/check, update the dossier/pulse best-effort, then hand off only to `@dev`.
