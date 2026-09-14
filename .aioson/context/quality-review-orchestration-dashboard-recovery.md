# Orchestration recovery and pricing review — 2026-09-13

## Scope and observed causes

Consumer: `C:/dev/playapps/creator-studio`, feature `biblioteca-criativa-e-camadas`,
run `7cb36089-9c29-4441-8794-89db7e74d5be`. Root's unrelated workflow was preserved.

Wave 5 backend-assets had completed its third DEV rework but omitted `run_id`
from the delivery report. Binding rejection was correct; report-format recovery
incorrectly shared the already exhausted code-rework budget. Frontend captions
was blocked by its declared backend producer silently stripping timing fields.

The OpenRouter snapshot used $2/$0.20/$10 per million input/cache-read/output
tokens for Codex Sol, versus official OpenAI Standard $4/$0.40/$20. Astra's
$10/$1/$50 base rates matched. Two native Codex token-count samples matched
their recorded input/cache/output totals exactly; no duplication in those samples.
Cumulative input includes repeated calls and cached input, not one context window.

## Implemented behavior

- Invalid DEV report recovery has two independent automatic report-only attempts.
  Rejected drafts are preserved; fresh identity and independent QA are required.
- Concrete downstream contract failures can requeue one unambiguous owning direct
  producer, with bounded repair and QA. Ambiguous ownership or delivered downstream
  work is not silently reopened. The captions producer was repaired this way and
  the frontend subsequently passed independent QA.
- Dashboard offers whole-run and per-unit recovery for stopped executions. POST is
  fixed-operation, loopback/origin/token protected and bound to the displayed run.
  Engine leases reject races. Duplicate requests are serialized. Logs are retained.
- A QA acceptance retry preserves reports and grants one extra DEV → QA cycle,
  without replenishing automatic budgets or changing models. Process-only QA failures
  retry QA. Error data and progress notes enter the next context. Successful review
  clears the obsolete active rework-exhausted finding; history retains the failures.
- Official bundled OpenAI Standard tariffs take precedence for exact Codex Sol/Astra.
  Historical visualization retains recorded costs separately. Unknown per-request
  context tiers produce an estimated base-to-long range, not a subscription bill.
  Per-model breakdown shows rates, source and date. OpenRouter refresh does not
  update the bundled OpenAI snapshot. Unmeasured usage and non-token fees remain outside estimates.
- Monitoring docs, reliability docs, orchestration tutorial and changelog updated.

## Two review passes and validation

The implementation review found and corrected QA retry repeating only the reviewer,
stale recovery messages hiding later failures, stale report suffix cleanup, and
missing CLI expected-run binding. The verification pass exercised their outcomes.

- Focused final suite: **66 passed, 0 failed, 0 skipped**, including two browser tests.
  Files: execution-run, execution-rework, execution-contract-repair, execution-metrics,
  execution-monitor and execution-dashboard-recovery tests.
- Targeted baseline lint: 18 files, **0 new findings**, 6 existing baseline findings.
- Headless Edge: live pricing breakdown, three actual models, official tariffs,
  explicit recalculation, context range, desktop/mobile containment and no page errors.
- Recovery browser fixture: one bound POST, duplicate prevention, later failure visible.
- Actual dashboard click on port 57510 returned HTTP 202 and then confirmed running
  engine PID 30292. All **11 previously QA-approved units** stayed identical.
  Backend-assets resumed with `openrouter/meta/muse-spark-1.3-contributor`; QA remains
  configured. Persisted `context_limit_enabled=false` was unchanged.

Evidence: `.aioson/runtime/quality/orchestration-analysis/recovery-final-tests.log`,
`recovery-lint.json`, `live-recovery-review.json`, `wave5-browser-review.json`,
and dashboard recovery screenshots. Dashboard PID 29488 replaced only its predecessor
on the same port. Existing Play sessions were not restarted.

## Remaining outcome

At 2026-09-13T20:59:29Z, backend-assets DEV was running, no decisions were pending,
and 11/22 units had QA approval. Feature delivery, integration and final acceptance
are still incomplete. This review validates AIOSON changes and an actual successful
restart; it does not certify the unfinished Creator Studio feature. No release tag
was created. Final release checks and a reviewable clean release snapshot remain required.
