# Streamlined Reference — Planner

## Input

Approved PRD, strictly verified feature-owned prototype when `current`, repository, production entry point, framework/package versions, and test runner. With `prototype_status: none`, historical references are excluded and the repository is the executable baseline.

## Output

Exactly one `implementation-plan-{slug}.md` with `status: approved` and `plan_contract: 2`. Bind it to the reconciled current Sheldon-approved PRD using `aioson plan:bind . --feature={slug}`; the command records its content hash.

## Required decisions

- Map every required `CAP-*` and `AC-*` to one vertical phase.
- Verify the PRD's current-system fit and classify every exact path as `reuse`, `modify`, `create`, or `retire` in `## Implementation Delta`.
- Reuse inspected project/framework patterns before new abstractions.
- Record only evidence-triggered compatibility, data/recovery, authorization, validation, concurrency, failure, observability, performance, accessibility/localization, or dependency controls in `## Engineering Controls`.
- Name an exact automated command and a production-path smoke for runtime behavior.
- Put UI and its real state/backend boundary in the same earliest useful slice.

Each numbered `## Phase N — outcome` names CAP/AC IDs, exact paths, `Verification:` with an inspected command, and `Done when:` with an observable result. Every AC must have a phase; delivery rows must reference existing phases. Historical v1 plans receive diagnostics without retroactive contract migration.

For runtime work, set `runtime_contract: required` and put the exact harness path, RG-build/RG-migrate/RG-boot/RG-smoke and `aioson harness:check` in a phase assigned to DEV. Gate C checks the obligation; delivery checks the real contract.

## Invalid plans

- infrastructure-only phases followed by UI at the end;
- guessed paths, globs, or directory shorthand;
- an unclassified path, a missing reuse/modify/retire target, or a create target that already exists at Gate C;
- detached fixtures as the only integration proof;
- new scope, user stories, backlog, architecture document, or harness by default.
- blanket “best practice” work without a repository/PRD trigger, phase verification, and recovery where persistent state can change.

## Handoff

Approved plan → Gate C → `@dev`.
