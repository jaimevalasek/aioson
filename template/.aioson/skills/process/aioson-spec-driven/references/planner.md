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
- Name an exact automated command and a production-path smoke for runtime behavior. A dev server (`next dev`, `vite`, `npm run dev`) is not the production path: streaming, status codes, caching and error handling differ on it, so point the smoke at the served build (`next start`, `vite preview`, the stack's equivalent). A plan that keeps a dev server for fast iteration names the production run on the same line. Gate C warns `runtime_on_dev_server` otherwise.
- Give a phase whose behavior shows in a browser a `- Runtime:` line that names a walkthrough: `aioson browser:run . --script=.aioson/qa/walkthroughs/{slug}/<flow>.json --url=<served build> --slug={slug}`. A login is one walkthrough with `--save-state`, reused with `--state`. A project script is only for what the instrument cannot express: say so on the line (`no walkthrough: <reason>`). Gate C warns `runtime_without_walkthrough` otherwise; a phase with no browser says so (`no browser`).
- Put UI and its real state/backend boundary in the same earliest useful slice.

Each numbered `## Phase N — outcome` names CAP/AC IDs, exact paths, `Verification:` with an inspected command, and `Done when:` with an observable result. Every AC must have a phase; delivery rows must reference existing phases. Historical v1 plans receive diagnostics without retroactive contract migration.

For runtime work, set `runtime_contract: required` and put the exact harness path, RG-build/RG-migrate/RG-boot/RG-smoke and `aioson harness:check` in a phase assigned to DEV. Gate C checks the obligation; delivery checks the real contract.

## Large plans

`execution:offer` sets `plan.large_plan` and `workflow:next --complete=planner` prints `[Execution Scale]` at 8 phases or 80 files, whatever the execution choice. One measured run set those numbers: 37 minutes of Dev per phase and about 10 files per phase put 8 phases near 5 hours before QA. `AIOSON_EXECUTION_LARGE_MIN_PHASES` and `AIOSON_EXECUTION_LARGE_MIN_FILES` move them. Tell the owner the phase and file counts, offer to cut the plan into deliveries that each ship on their own, and go on with what they choose. Never turn the numbers into hours: `aioson dev:progress . --feature={slug}` projects the rest from the run itself once two phases are finished.

## Invalid plans

- infrastructure-only phases followed by UI at the end;
- guessed paths, globs, or directory shorthand;
- an unclassified path, a missing reuse/modify/retire target, or a create target that already exists at Gate C;
- detached fixtures as the only integration proof;
- new scope, user stories, backlog, architecture document, or harness by default.
- blanket “best practice” work without a repository/PRD trigger, phase verification, and recovery where persistent state can change.

## Handoff

Approved plan → Gate C → `@dev`.
