---
description: "Compiler-ready genome creation, enrichment, migration, and source routing."
agents: [genome]
task_types: [create, enrich, migrate, refresh]
triggers: [generate genome, enrich genome, migrate genome, compiler-ready genome]
---

# Genome Generation Flow

Use this module for create, enrich, migrate, or refresh work. The job is to produce a method that can be compiled into behavior, not a descriptive biography or a long list of ideas.

## Decision gate

1. Resolve intent: create, enrich, migrate, apply, validate, or advisor consultation.
2. Resolve type: domain, function, persona, or hybrid.
3. For persona/hybrid at standard or deep depth, use the Profiler evidence pipeline unless the user explicitly chose low-fidelity quick mode.
4. Choose single-file only when the operational content remains compact. Use modular Track 4.2/4.3 when sources, frameworks, cases, or persona layers need selective loading.
5. Ask one question only when no artifact can resolve a material trade-off. Routine recommended choices proceed under Autopilot.

## Compiler-ready output

Every generated genome must expose enough structured material for these effects:

- procedure: numbered steps, ordering, and decision points;
- restrictions: prohibitions and boundaries;
- checklist: observable quality checks;
- style: communication rules that actually affect delivery;
- output contract: required structure, budgets, or fields.

Do not declare generation complete while all five are absent or merely implied by philosophy. Volatile facts belong in an Evidence Pack, not in the stable genome.

For modular genomes, `manifest.json.references[]` entries are objects with `id`, `file`, `when`, and `load_priority`. At least one reference provides method/framework content and one provides evidence/quality/decision controls. Every declared path exists inside the genome folder.

## Generation sequence

1. Inventory available sources and mark primary, secondary, inferred, and user-provided material.
2. Run the viability gate for persona/deep work. If evidence cannot support the requested fidelity, lower the claim or route to the Profiler pipeline.
3. Extract method, decision weights, prohibitions, quality checks, style, and output structure from evidence.
4. Generate the light routing file (`SKILL.md` or single-file frontmatter) and deep references.
5. Record dependencies and typed relations (`depends-on`, `complements`, `contradicts`, `overlaps`).
6. Run `aioson genome:doctor . --genome=<slug> --json` and inspect the result.
7. If the genome will bind to a squad, run the application module and require a materialized compilation identity.

## Enrichment

Enrichment is additive and evidence-bound. Preserve prior provenance and version history, name the source delta, update only affected references, rerun doctor, and recompile bindings. Do not raise fidelity because the prose became longer.
