# Streamlined Reference — Planner

## Input

Approved PRD, strictly verified feature-owned prototype when `current`, repository, production entry point, framework/package versions, and test runner. With `prototype_status: none`, historical references are excluded and the repository is the executable baseline.

## Output

Exactly one `implementation-plan-{slug}.md` with `status: approved`.

## Required decisions

- Map every required `CAP-*` and `AC-*` to one vertical phase.
- Verify the PRD's current-system fit and classify every exact path as `reuse`, `modify`, `create`, or `retire` in `## Implementation Delta`.
- Reuse inspected project/framework patterns before new abstractions.
- Record only evidence-triggered compatibility, data/recovery, authorization, validation, concurrency, failure, observability, performance, accessibility/localization, or dependency controls in `## Engineering Controls`.
- Name an exact automated command and a production-path smoke for runtime behavior.
- Put UI and its real state/backend boundary in the same earliest useful slice.

## Invalid plans

- infrastructure-only phases followed by UI at the end;
- guessed paths, globs, or directory shorthand;
- an unclassified path, a missing reuse/modify/retire target, or a create target that already exists at Gate C;
- detached fixtures as the only integration proof;
- new scope, user stories, backlog, architecture document, or harness by default.
- blanket “best practice” work without a repository/PRD trigger, phase verification, and recovery where persistent state can change.

## Handoff

Approved plan → Gate C → `@dev`.
