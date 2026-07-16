# Delivery assurance review

Use for `scope-check` and `qa` after a concrete feature slug and review artifact exist. Both perform independent review; do not rely on the implementing agent's self-assessment as proof.

## Pass 1 — independent evidence

Evaluate all five axes separately. Never combine them into a score, percentage, rank, or average.

- **specification_fidelity:** Does delivered behavior match approved scope, requirements, design, exclusions, and user-visible contracts?
- **acceptance_coverage:** Does evidence exercise every applicable acceptance criterion, including failure and boundary behavior?
- **code_health:** Are changes maintainable, bounded, secure, compatible, and free of unexplained duplication or dead paths?
- **runtime_truth:** Do executable tests, commands, logs, and generated artifacts support the claims made by documents?
- **residual_risk:** What remains uncertain, deferred, operationally fragile, or dependent on an owner?

For each axis, cite commands and project-contained evidence. Mark `unverified` when evidence is absent; do not infer a pass from silence.

## Pass 2 — challenge the delivered future state

Exercise or reason from evidence about first use, empty state, invalid input, unavailable integration, retry, repeated execution, partial failure, rollback, upgrade, security abuse, observability, and later maintenance. Check that additive changes preserve existing commands, flags, outputs, exit codes, routing, gates, and user-owned files.

## Findings and escalation

Every unresolved finding needs impact, evidence, recommendation, confidence, owner, and residual risk. Use `decision_required` only for a genuine owner choice and `blocked` only for an open blocking finding. A valid actionable report remains valuable evidence and must not be discarded.

Run the existing QA/scope-check gates exactly as already defined. Review intelligence supplements those gates; it neither approves Gate D nor changes workflow state automatically. Ask the user only when their authorization or product decision is indispensable, and include the recommended course with alternatives.
