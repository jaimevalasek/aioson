# Streamlined Reference — Product

## Product owns

- One PRD with explicit scope, exclusions, user flows, prototype contract, stable `CAP-*` outcomes, and observable `AC-*` rows.
- `product_scope: approved`, `prd_ready: approved`, and `sheldon_review: not_requested` in frontmatter.
- No implementation design or plan.

## Optional independent enrichment

Product normally hands the PRD directly to Planner. Route to Sheldon only when the user requests an independent challenge or a concrete contradiction/risk cannot be safely resolved by Product. Sheldon edits this same PRD, may repair `AC-*` rows, and marks `sheldon_review: approved`; it creates no parallel specification pack.

## Stop conditions

Stop only for a decision that materially changes product behavior, scope, cost, data, or risk. Infer correctness details from evidence. Keep useful but nonessential ideas deferred.

## Handoff

Any implementation-ready feature PRD → `@planner`. Already-specified bounded technical work uses the separate Simple Plan lane instead of pretending to be a MICRO feature.
