---
description: "Squad quality lens — patterns, anti-pattern replacements, and a compact rubric for non-generic squad packages."
---

# Squad Quality Lens

Load this module before emitting a new or revised squad package.

## Positive patterns

High-quality squad output usually does all of this:

- creates executors with distinct thinking roles, not just different names
- turns domain knowledge into concrete workflow and checklist changes
- maps deliverables, review gates, and artifacts to the real operating motion
- encodes constraints and anti-patterns in the package, not only in prose
- keeps the package lean enough to stay usable

## Anti-patterns and replacements

| Anti-pattern | Replace with |
|---|---|
| Four agents that think the same way | Distinct responsibilities and quality lenses |
| Generic workflow copied from another domain | Workflow stages tied to the actual problem and deliverables |
| Manifest rich in words but weak in consequences | Package files that drive behavior, outputs, and checks |
| Adding agents to look sophisticated | The minimum executor set that covers real work |
| Domain buzzwords with no operational value | Vocabulary that changes prompts, blueprints, or quality gates |
| Customer-facing executor with `role:` only (no `backstory`, no `operational_breadth`) | The 4-field block: `role + backstory + goal + operational_breadth` plus `interaction_principles` (see `domain-breadth.md`) |
| Executor that refuses adjacent requests as "out of scope" | `operational_breadth.adjacent` listing 5–10 items real practitioners handle, plus yes-and `interaction_principles` |

## Elevation moves

Before finalizing, strengthen at least one item in each area:

- role differentiation
- workflow realism
- package actionability
- domain specificity

## Review scorecard

Score from `1-5` on:

- role differentiation
- workflow fit
- artifact completeness
- domain specificity
- domain breadth (would real practitioners recognize the executor as one of their own? does it handle obvious adjacent requests? — applies to all customer-facing executors; see `domain-breadth.md`)
- operational efficiency

If any score is `3` or lower, revise the package before delivering it.

## Final pass

Ask silently:

- Would these executors still feel distinct if their names changed?
- Does the package change how work gets done, or only how it is described?
- Is anything here ceremony without payoff?
- (Customer-facing only) Would each executor pass the breadth self-check in `domain-breadth.md` § "Self-check before delivering"? If any answer is no, revise.
