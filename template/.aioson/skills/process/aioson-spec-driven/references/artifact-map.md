# Artifact Map — AIOSON Spec-Driven

> Source of truth: which artifact lives where, who writes it, who reads it.

## Artifact chain

```
prd*.md
  → sheldon-enrichment-{slug}.md   (optional enrichment layer)
  → requirements-{slug}.md         (entities, rules, ACs — @analyst)
  → spec-{slug}.md                 (feature memory — @analyst seeds, @dev fills)
  → architecture.md                (tech decisions — @architect)
  → ui-spec-{slug}.md              (UI/UX contract — @ux-ui when UI is in scope)
  → design-doc*.md                 (scope-specific decisions — @architect)
  → implementation-plan-{slug}.md  (execution sequence — @pm for MEDIUM, AC-SDLC-15)
  → spec-{slug}.md (updated)       (living state during execution — @dev)
```

## Artifact ownership

| Artifact | Written by | Enriched by | Read by |
|----------|-----------|-------------|---------|
| `prd.md` / `prd-{slug}.md` | @product | @sheldon (via sheldon-enrichment) | all downstream |
| `sheldon-enrichment-{slug}.md` | @sheldon | @sheldon | @sheldon (re-entry), @analyst |
| `sheldon-validation-{slug}.md` (project: `sheldon-validation.md`) | @sheldon (MEDIUM only) | — | all agents before starting the MEDIUM chain |
| `discovery.md` | @analyst | — | @architect, @dev |
| `requirements-{slug}.md` | @analyst | — | @architect, @dev, @qa |
| `spec-{slug}.md` | @analyst (skeleton) | @dev (execution state) | @dev, @deyvin, @qa |
| `spec.md` | @dev | @dev | @dev, @deyvin |
| `architecture.md` | @architect | — | @dev, @ux-ui |
| `design-doc*.md` | @architect | — | @dev, @ux-ui |
| `ui-spec-{slug}.md` (project: `ui-spec.md`) | @ux-ui | — | @dev only for UI/frontend implementation, @pm/@orchestrator when UI phases exist |
| `implementation-plan-{slug}.md` | @pm (MEDIUM, AC-SDLC-15) | — | @dev, @deyvin, @orchestrator |

## Dev context contract

`@dev` should not activate with the entire artifact chain loaded. The final pre-dev agent writes `dev-state.md` with a short primary package, and `implementation-plan-{slug}.md` carries phase-triggered loads:

- `requirements-{slug}.md` — data, rules, ACs, migrations, edge cases
- `architecture.md` — module boundaries, integrations, security, cross-cutting concerns
- `design-doc*.md` / `readiness*.md` — implementation paths, reuse decisions, readiness blockers
- `ui-spec-{slug}.md` (project: `ui-spec.md`) — UI components, frontend routes, interaction states, visual QA
- PRD / Sheldon enrichment — only for product ambiguity

## Naming conventions

- Project-level artifacts: `prd.md`, `discovery.md`, `spec.md`, `architecture.md`
- Feature-level artifacts: always use `{slug}` suffix — `prd-{slug}.md`, `requirements-{slug}.md`, `spec-{slug}.md`, `design-doc-{slug}.md`, `readiness-{slug}.md`, `scope-check-{slug}.md`, `ui-spec-{slug}.md`, `sheldon-enrichment-{slug}.md`, `sheldon-validation-{slug}.md`
- Enrichment: `sheldon-enrichment.md` (project) or `sheldon-enrichment-{slug}.md` (feature)
- Plans: `.aioson/plans/{slug}/manifest.md` + `plan-{slug-fase}.md` files
- **Resolving `{slug}`:** agents must run `aioson feature:current .` (single source of truth — pulse `active_feature`, else the unique `in_progress` feature in `features.md`) before choosing an output path. A bare feature artifact path is a bug: it collides across features. Reserve bare names for genuine project-level work only.

## What NOT to create

- Do not create `.specs/` folders — use the artifact names above
- Do not rename existing artifacts to match TLC conventions
- Do not create a new artifact if an existing one covers the same purpose
