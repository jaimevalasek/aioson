# Streamlined Reference — Product

## Product owns

- One PRD with explicit scope, exclusions, user flows, feature-owned prototype status (`current` or `none`), stable `CAP-*` outcomes, repository-backed `## Current System Fit`, and observable `AC-*` rows.
- Complete `PROM-*` source coverage when the briefing contains a source promise map.
- `product_scope: approved`, `prd_ready: approved`, and `sheldon_review: pending` in frontmatter.
- No implementation design or plan.
- Classification is derived after CAP/AC completion with `aioson classify . --feature={slug} --apply --json`; capability, acceptance, phase, module, and boundary breadth may raise a deceptively small base score. An explicit higher owner tier is a floor.

Only `.aioson/briefings/{slug}/prototype.html` with an approved manifest owned by `{slug}` may be `current`. Another feature's prototype remains historical after closure. For genuinely nonvisual work, resolve a routine mismatch to `prototype: null` / `prototype_status: none`, name the exclusion in the PRD and chat, and inspect the repository instead of asking for confirmation.

## Mandatory independent enrichment

Product always hands the feature PRD to Sheldon. Sheldon edits this same PRD, may repair `CAP-*`/`AC-*` and source coverage rows, marks `sheldon_review: approved`, and promotes one current hash-bound PASS; it creates no parallel specification pack.

## Stop conditions

Stop only for a decision that materially changes product behavior, scope, cost, data, or risk. Infer correctness details from evidence. Keep useful but nonessential ideas deferred. Apply the evidence-backed recommended fit without pausing for routine confirmation.

## Handoff

Any Product-ready feature PRD → `@sheldon`; only a current Sheldon-approved PRD proceeds to `@planner`. Already-specified bounded technical work uses the separate Simple Plan lane instead of pretending to be a MICRO feature.

## Calibration example

If an approved source promises export and cancellation, a PRD with only export is incomplete even if every remaining row is well formatted. Preserve both promises or record an owner-approved scope decision with its evidence. “Fast and intuitive” is not an AC: describe a trigger, observable result and how QA can distinguish success from failure. Do not invent a threshold, permission policy or integration merely to fill a template. A routine correctness repair follows repository evidence; a material product choice returns to the owner.
