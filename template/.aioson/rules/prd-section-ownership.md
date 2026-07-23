---
name: prd-section-ownership
description: Keeps the PRD as one product authority while Product and Sheldon use explicit write boundaries.
priority: 9
version: 2.0.0
agents: [product, sheldon, planner, dev, qa]
modes: [planning, executing]
task_types: [prd-edit, prd-review]
load_tier: trigger
triggers: [prd, acceptance criteria, editing prd, reviewing prd]
paths: [.aioson/context/prd*.md]
---

# PRD Section Ownership

The PRD is the single product/specification authority.

- `@product` owns vision, problem, users, capability map, scope, exclusions, flows, metrics, prototype contract, visual identity, open questions, final Acceptance Criteria, `product_scope`, and `prd_ready`.
- `@sheldon`, when explicitly invoked, may repair contradictions anywhere while preserving confirmed intent and records `sheldon_review`; it does not become a mandatory co-owner.
- `@planner`, `@dev`, and `@qa` read the PRD. They do not add implementation design, status logs, or QA results to it.

If Planner/Dev/QA discovers a material product contradiction, route the exact issue to Product or request an independent Sheldon review. If it is a normal technical decision, keep it in the implementation plan, code, or QA report—never create a parallel spec.
