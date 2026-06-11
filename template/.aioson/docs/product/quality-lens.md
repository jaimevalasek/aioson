---
description: "Product quality lens — strong patterns, anti-pattern replacements, and a compact scorecard for higher-quality PRDs."
agents: [product]
modes: [executing]
task_types: [prd-writing, prd-finalization, prd-review, quality-review]
load_tier: trigger
triggers: [writing PRD, updating PRD, finalize PRD, PRD quality, review scorecard]
---

# Product Quality Lens

Load this module before writing or updating any PRD.

## Positive patterns

High-quality product output usually does all of this:

- names a specific user and a specific pain instead of a generic audience
- shows the tension behind the first release: what matters now and what is deliberately deferred
- captures edge cases, empty states, permissions, and failure behavior early
- explains why this product should be chosen instead of a generic alternative
- leaves downstream agents with decisions they can execute, not vague aspirations
- preserves visual ambition when visual quality changes the product outcome

## Anti-patterns and replacements

| Anti-pattern | Replace with |
|---|---|
| Generic SaaS PRD that could fit any startup | A PRD with domain nouns, real user moments, and explicit constraints |
| Feature list without decision tension | A scoped first release with clear deferrals |
| User story with no operator or owner | Named roles, ownership, and state transitions |
| Competitive claim with no evidence | Research-backed differentiation or explicit uncertainty |
| Beautiful-product language with no design bar | A concrete `## Visual identity` direction or `pending-selection` |

## Elevation moves

Before finalizing, force at least one improvement from each category:

- sharpen the user/problem statement
- sharpen the scope boundary
- sharpen one risk or edge case
- sharpen one differentiator or positioning detail

## Review scorecard

Score the PRD from `1-5` on:

- specificity
- differentiation
- scope discipline
- downstream usefulness
- operational realism

If any score is `3` or lower, revise before finalizing.

## Final pass

Ask silently:

- Would this still read as strong if the product name were removed?
- Does at least one section prove the product is not a template clone?
- Can `@analyst`, `@ux-ui`, and `@dev` act on this without guessing core intent?
