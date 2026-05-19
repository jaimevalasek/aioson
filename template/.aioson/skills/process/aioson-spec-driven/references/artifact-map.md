# Artifact Map — AIOSON Spec-Driven

> Source of truth: which artifact lives where, who writes it, who reads it.

## Artifact chain

```
prd*.md
  → sheldon-enrichment-{slug}.md   (optional enrichment layer)
  → requirements-{slug}.md         (entities, rules, ACs — @analyst)
  → spec-{slug}.md                 (feature memory — @analyst seeds, @dev fills)
  → architecture.md                (tech decisions — @architect)
  → design-doc*.md                 (scope-specific decisions — @architect)
  → implementation-plan-{slug}.md  (execution sequence — @pm for MEDIUM, AC-SDLC-15)
  → spec-{slug}.md (updated)       (living state during execution — @dev)
```

## Artifact ownership

| Artifact | Written by | Enriched by | Read by |
|----------|-----------|-------------|---------|
| `prd.md` / `prd-{slug}.md` | @product | @sheldon (via sheldon-enrichment) | all downstream |
| `sheldon-enrichment-{slug}.md` | @sheldon | @sheldon | @sheldon (re-entry), @analyst |
| `sheldon-validation.md` | @sheldon | — | all agents before starting MEDIUM |
| `discovery.md` | @analyst | — | @architect, @dev |
| `requirements-{slug}.md` | @analyst | — | @architect, @dev, @qa |
| `spec-{slug}.md` | @analyst (skeleton) | @dev (execution state) | @dev, @deyvin, @qa |
| `spec.md` | @dev | @dev | @dev, @deyvin |
| `architecture.md` | @architect | — | @dev, @ux-ui |
| `design-doc*.md` | @architect | — | @dev, @ux-ui |
| `implementation-plan-{slug}.md` | @pm (MEDIUM, AC-SDLC-15) | — | @dev, @deyvin, @orchestrator |

## Naming conventions

- Project-level artifacts: `prd.md`, `discovery.md`, `spec.md`, `architecture.md`
- Feature-level artifacts: always use `{slug}` suffix — `prd-{slug}.md`, `requirements-{slug}.md`, `spec-{slug}.md`
- Enrichment: `sheldon-enrichment.md` (project) or `sheldon-enrichment-{slug}.md` (feature)
- Plans: `.aioson/plans/{slug}/manifest.md` + `plan-{slug-fase}.md` files

## What NOT to create

- Do not create `.specs/` folders — use the artifact names above
- Do not rename existing artifacts to match TLC conventions
- Do not create a new artifact if an existing one covers the same purpose
