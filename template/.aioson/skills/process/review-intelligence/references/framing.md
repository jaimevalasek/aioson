# Framing review

Use for `briefing`, `briefing-refiner`, and `product` after a concrete feature slug and artifact exist.

## Review stance

- `briefing` and `product`: self-review the artifact before their existing approval or handoff.
- `briefing-refiner`: independently review the briefing; do not assume the author's framing is correct.
- Preserve the smallest coherent outcome. Surface extensions as alternatives unless they close a material gap.

## Pass 1 — current framing

Challenge every prepared lens and record conclusions with artifact evidence:

- **problem:** Is the observed problem separated from a proposed solution? What evidence would falsify the framing?
- **user-value:** Who benefits, in which moment, and what observable outcome changes?
- **scope:** Are in-scope, out-of-scope, dependencies, and the smallest coherent slice explicit?
- **assumptions:** Which statement is fact, inference, constraint, or untested belief?
- **future-state:** What will users expect immediately after the stated happy path succeeds?
- **ownership:** Who decides, builds, operates, supports, and accepts residual risk?

## Pass 2 — experience the finished feature

Imagine a first-time user, returning user, operator, and maintainer encountering the finished feature. Test empty data, invalid input, partial completion, unavailable dependency, retry, cancellation, rollback, migration, and later evolution. Identify only gaps that could change value, scope, feasibility, safety, or acceptance.

## Escalation

Resolve product and project facts locally first. Ask the user only when choosing among materially different outcomes or accepting a trade-off belongs to them. Present a recommended option with evidence and consequences. Route implementation, architecture, and verification details to their downstream owners instead of forcing premature decisions into the framing artifact.
