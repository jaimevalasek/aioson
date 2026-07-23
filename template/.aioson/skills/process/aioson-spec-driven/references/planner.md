# Streamlined Reference — Planner

## Input

Approved PRD, referenced prototype, repository, production entry point, framework/package versions, and test runner.

## Output

Exactly one `implementation-plan-{slug}.md` with `status: approved`.

## Required decisions

- Map every required `CAP-*` and `AC-*` to one vertical phase.
- Name exact create/modify/reuse paths.
- Reuse inspected project/framework patterns before new abstractions.
- Name an exact automated command and a production-path smoke for runtime behavior.
- Put UI and its real state/backend boundary in the same earliest useful slice.

## Invalid plans

- infrastructure-only phases followed by UI at the end;
- guessed paths, globs, or directory shorthand;
- detached fixtures as the only integration proof;
- new scope, user stories, backlog, architecture document, or harness by default.

## Handoff

Approved plan → Gate C → `@dev`.
