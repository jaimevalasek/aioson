---
description: "Sheldon quality lens — high-signal enrichment patterns, anti-pattern replacements, and a compact review rubric."
agents: [sheldon]
task_types: [quality, review]
triggers: [quality lens, improvements, scorecard]
---

# Sheldon Quality Lens

Load this module before presenting improvements, sizing, or phased planning.

## Positive patterns

High-quality Sheldon output usually does all of this:

- isolates the few gaps that would actually break downstream work
- distinguishes product gaps, technical gaps, and execution gaps
- ranks recommendations by severity and evidence, not by verbosity
- preserves `@product` ownership of vision, users, and problem framing
- uses fresh validation when technology or domain assumptions may have aged
- recommends a phased plan only when complexity or risk justifies it

## Anti-patterns and replacements

| Anti-pattern | Replace with |
|---|---|
| Rewriting the PRD with different words | Referencing sections and proposing targeted deltas |
| Long lists of equal-priority suggestions | A short, ordered set of critical improvements |
| Technical speculation without evidence | Evidence-backed validation or explicit uncertainty |
| Cosmetic refinements presented as blockers | Clear separation between critical and optional changes |
| Phase plan created by reflex | A justified decision tied to scope, dependencies, or risk |

## Elevation moves

Before finalizing, strengthen at least one item in each area:

- evidence quality
- severity ordering
- downstream actionability
- freshness validation

## Review scorecard

Score from `1-5` on:

- criticality
- evidence strength
- prioritization clarity
- downstream usefulness
- execution realism

If any score is `3` or lower, tighten the output before presenting it.

## Final pass

Ask silently:

- Would `@dev` or `@qa` materially avoid rework because of this enrichment?
- Did I separate confirmed issues from optional upgrades?
- If I proposed a phased plan, is the reason strong enough to defend?
