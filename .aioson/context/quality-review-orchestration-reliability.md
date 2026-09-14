---
status: engineering-review-complete
feature: orchestration-reliability
reviewed_at: 2026-09-13
reviewer: dev-self-review
---
# Implementation and second review

Scope authorized by the owner's implementation request: bounded orchestration,
per-attempt usage and wave metrics, equivalent API prices, archive discovery and
automatic dashboard ports. This is engineering self-review, not an independent
QA verdict or a workflow gate approval. The unrelated active workflow was preserved.

## Delivered behavior

- New plans snapshot min(50% of a known model window, 80k tokens), configurable
  per exact host/model. Oversized file/AC units and excessive initial source reads
  are refused. Initial byte estimates reserve half the operational cap for growth.
- Planner groups independent phases by prerequisites. Cross-wave exact-file reuse
  waits for the previous writer/reviewer. Local DEV/QA checks do not demand sibling
  integration artifacts. Complete CAP checks remain in integration.verification.
- Failed QA gets bounded rework and then pauses dependents unless explicitly waived.
  Context continuations preserve files and checkpoints with unique report paths.
- Structured usage records failed/retried/continued attempts; wave timing separates
  elapsed time, occupied time, waiting and summed agent time. JSONL text is bounded
  and discarded; usage is persisted separately from truncated textual logs.
- A dated OpenRouter USD-per-token catalog supports exact-model equivalent API
  estimates, with separate cache buckets and explicit unknown/partial results.
- The dashboard discovers archived plan/state artifacts, remains project-specific,
  uses a free port if the default is busy, and keeps an explicitly requested port
  strict. Read-only HTTP, project path boundaries and origin restrictions remain.

## Bugs found and corrected during review

1. OpenCode reasoning was initially excluded from billable output. Its source
   separates visible output and reasoning; the collector now sums them once.
2. Claude provisional output and zeroed execution-error totals could undercount
   spend. Only authoritative terminal/model totals complete output; partial inputs
   survive failure, with output unknown when unavailable.
3. Duplicate events and ordinary text could cause redundant state writes. Stable
   usage snapshots suppress repeated persistence; repeated step IDs replace totals.
4. Child exit could precede final stdout drainage. Resolution now waits for close;
   a real child test covers final JSON without a newline.
5. Interrupted attempt timing initially closed at the wrong lifecycle location.
   Recovery now freezes it at the previous heartbeat, before reclaiming units;
   a finishing QA cannot close another concurrent attempt. Both cases are tested.
6. Continuations reused report filenames. They now have distinct .cN paths, also
   used by retry cleanup, with existing attempt binding retained.
7. Archived unfinished timestamps kept growing. Archive observation uses the last
   persisted timestamp and never revives the engine.
8. Price validation accepted coercible nonnumeric values and unchecked units.
   Boolean prices and million-token catalogs are now rejected.
9. The usage note rendered an attempt array as objects; it now uses the count.
   Browser assertions cover actual token/cost text and absence of object artifacts.
10. Generic table widths stretched the new usage table. Scoped columns and an
    earlier position keep the metrics readable; desktop/mobile screenshots confirm.

## Verification evidence

Artifacts are under `.aioson/runtime/quality/orchestration-analysis/`.

- `acceptance-final.log`: 192 boundary scenarios, 191 passed on the broad run;
  its sole failure was the graph test's old exact integration shape. The expected
  graph now includes all three deferred CAP checks, and `review-graph.log` records
  all 3 graph tests passing after that correction. No test remains failing.
- `review-concurrency.log`: 3 targeted real scheduler tests passed: parallel
  pipelines, cross-wave shared-file serialization and interrupted-run recovery.
- `final-browser-tests.log`: 12 tests passed, including real-browser filters,
  feature changes, hostile report text, themes, mobile, offline recovery, metrics,
  HTTP origin/path protection, archive escape rejection and automatic ports.
- `execution-usage-process.test.js` exercises real owned child processes for stdout
  drainage and context-triggered termination; no paid model was invoked.
- `lint-final.json`: 54 files, no new findings, 19 existing baseline findings.
- `syntax-final.log`: 625 JavaScript files checked. `context-final.json`: valid.
- Real `execution:prices --refresh --json` fetched 445 official model tariffs;
  subsequent CLI read preserved the source timestamp. Help exposes the command.
- `dashboard-browser-smoke.json`: actual Creator Studio ledger through the shipped
  CLI/HTTP/browser path, no page errors or mobile viewport overflow. Screenshots:
  `dashboard-desktop.png`, `dashboard-mobile.png`.

The improved read-only dashboard is available at
http://127.0.0.1:57510/?feature=biblioteca-criativa-e-camadas (PID 32644 at review).
The original dashboard on 4181 and the consumer's active worker processes were
preserved. The existing run still uses its original compiled policy and has no
historical usage counters; the panel explicitly reports this incomplete history.

## Limits and remaining distinctions

- Context protection is reactive where per-call events exist; it cannot guarantee
  a pre-inference ceiling for every harness. Codex uses native compaction; its
  turn totals are not active context. Antigravity cache/context semantics remain
  unknown. External-client spawners that return only reports do not supply usage.
- 80k is a configurable operational heuristic, not a universal measured optimum.
- Prices are official OpenRouter equivalent token estimates, not native provider
  or subscription bills. No fuzzy matching, retroactive pricing or invented tokens.
- New behavior applies to subsequent compiled plans; no live plan was rewritten.
  Final integration and feature QA remain owned by the existing workflow.
- `visual-final.json` is advisory, not a visual pass: it reports the existing
  intentionally hidden accessibility label and undelivered font-family names in
  the inherited system-font stack, plus baseline craft/tap-target warnings. The
  approved Tinta & Ouro identity was preserved. Functional browser checks and
  actual-content overflow checks passed; no claim of a perfect visual audit.

Prompt Sharpener diagnosis: phase-number barriers and inherited vertical wording
could overrule local unit scope. Rewrite: real dependency evidence, bounded reads,
local checks and explicit integration responsibility. Preserved contracts: SDD,
language boundaries, exact paths, runtime/report ownership and final QA. Risk:
after_dev still allows consumers before review; reconciliation findings remain
mandatory when their producer is reworked.

Configuration, protocol sources and adoption commands are documented in
`docs/execution-reliability.md` and `docs/execution-monitor.md`.
