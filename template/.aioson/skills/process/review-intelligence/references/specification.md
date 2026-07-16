# Specification review

Use for `analyst` and `sheldon` after a concrete feature slug and artifact exist.

## Review stance

- `analyst`: self-review requirements before Gate A or handoff.
- `sheldon`: independently review/enrich the PRD or specification; verify coverage rather than echoing intent.
- Treat approved product scope as authority. Do not silently enlarge it while closing specification gaps.

## Pass 1 — executable meaning

Challenge every prepared lens:

- **coverage:** Does each promised outcome map to requirements and acceptance evidence?
- **ambiguity:** Could two capable implementers produce incompatible behavior from the same statement?
- **edge-cases:** Are empty, boundary, duplicate, ordering, concurrency, retry, cancellation, and partial-state cases relevant and explicit?
- **failure-modes:** Are validation, dependency failure, timeout, stale state, recovery, rollback, and observability defined?
- **ownership:** Is every decision, exception, deferred item, and residual risk owned?
- **verifiability:** Can each requirement be tested or inspected without guessing internal reasoning?

Trace contradictions across PRD, requirements, spec, expansion artifact, dossier, and rules. Prefer a concrete acceptance example over another adjective.

## Pass 2 — consume the completed specification

Imagine implementation, QA, operations, support, migration, and future extension using only this specification. Look for missing state transitions, incompatible defaults, unsafe permissions, irreversible operations, versioning behavior, performance bounds, integration contracts, and evidence needed to declare success.

## Escalation

Resolve technical facts from the repository and targeted research. Route architecture choices to `architect` and test strategy to `qa` unless they change product behavior. Ask the user only for a user-owned scope or trade-off decision; include the recommended resolution and the consequence of deferral.
