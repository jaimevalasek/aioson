# A pending review blocked the repair it needed

Date: 2026-10-03. Consumer: `C:/dev/freela/hzsoft2`, feature
`migracao-supabase-mysql-prisma`, run
`cb5a4163-a643-499f-80e9-762f0cd92c2f`.

## Symptom and cause

The engine heartbeat remained current for hours with 32/38 units accepted,
zero running DEV/QA workers, zero pending decisions, and a failed outbound-gate
review. Its cross-unit repair was deferred behind three descendants whose DEV
had passed and whose QA was pending. Those reviews awaited the outbound gate.

`execution-contract-repair.unitInFlight` counted queued reviews as active work.
`awaitReviewOrder` kept their pipeline promises alive while waiting for the gate,
which could not settle until the deferred upstream repair ran. A process
heartbeat is evidence of a living engine, not evidence of scheduler progress.

## Correction and recovery recipe

- A queued QA stage is not an active writer. Only running DEV/QA blocks the
  affected-unit repair.
- A review waiting for predecessors is parked on the ledger and releases its
  pipeline slot. The scheduler admits it again when its holders settle.
- Review generation is checked before starting QA, so invalidation cannot
  silently review an old implementation.
- Resume leaves deferred QA evidence to the reconciliation path; replaying it
  through a hard-coded DEV repair would rebuild a review-only consumer.
- The dashboard exposes a live-engine recovery action for a proven circular
  deferred-repair/review-order wait older than 30 seconds with no active workers.
  Manual recovery rechecks the run and PID before stopping that exact idle
  process. New work or a changed run/PID cancels the action. Observation does
  not automatically terminate a living engine.
- The installed global package is a Junction to `C:/dev/aioson`. Restart the
  engine and dashboard to load source changes. Preserve the ledger and lease;
  resume with `--resume --expect-run=<run-id>` and the existing recovery policy.
  Restarting never approves failed QA or skips a required reviewer.

## Verification

The focused source suites passed 156 unique tests, zero failures, zero skips:

1. `node --test tests/execution-run.test.js tests/execution-monitor.test.js tests/execution-dashboard-routing.test.js`
   initially passed 103 with two existing browser tests awaiting a browser harness.
2. `node --test tests/execution-dashboard-recovery.test.js tests/execution-contract-repair.test.js tests/execution-rework.test.js`
   initially passed 50 with one existing browser test awaiting that harness.
3. With `AIOSON_TEST_BROWSER_PROJECT=C:/dev/freela/hzsoft2`,
   `node --test --test-name-pattern=browser tests/execution-dashboard-recovery.test.js tests/execution-dashboard-routing.test.js tests/execution-monitor.test.js`
   passed all four selected cases, including the three previously unexecuted
   browser cases and one already-counted watchdog case. All fixtures were
   isolated temporary projects. No browser test operated the actual migration.

New regressions cover the persisted circular state, deferred repair released by
a queued review, preservation of the consumer's approved DEV with fresh QA,
live-engine recovery visibility, serialized recovery bound to the same run/PID,
and cancellation when a worker or changed engine appears.

Syntax checks passed. Focused ESLint found four pre-existing findings outside
the correction: `readJsonSafe` unused, two control-character regular expressions
in `execution-run.js`, and a two-space regular expression in its tests.

The parent supervisor separately restarted the actual consumer's engine on the
same run and verified the real dashboard on port 4181 in headless Edge: the sync
unit's QA worker was visible, recovery was hidden while work was active, and no
page errors occurred. Screenshot in the consumer project:
`.aioson/runtime/supervision-dashboard/current.png`.

These checks validate scheduler/recovery behavior. The consumer migration still
requires its remaining independent QA and integration acceptance.
