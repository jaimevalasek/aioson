# Creator Studio context recovery — 2026-09-13

## Request and diagnosis

Feature: `biblioteca-criativa-e-camadas`, consumer `C:/dev/playapps/creator-studio`.
Run: `7cb36089-9c29-4441-8794-89db7e74d5be`.

The backends for captions (wave 1) and text (wave 2) exhausted the 80k runtime
context budget and two continuations. Native OpenCode exports confirmed growing
per-call context, not a cumulative-token accounting error. Metadata-only checkpoints
lost discovery work and encouraged repeated broad reads. The catalog also produced
a report without `run_id`, correctly rejected by binding validation.

The user explicitly changed the priority: “Então deixa sem este limite de contexto
o importante é finalizar a tarefa do que dar falha”. This authorizes disabling the
AIOSON cutoff for this run, while keeping configured models and QA.

## Delivered

- Per-run/unit/DEV-or-QA progress notes, bounded to 12 KB, embedded in fresh runtime
  prompts and snapshotted in context checkpoints. Explicit bookkeeping permission
  does not expand source ownership. Notes are unverified data, never QA evidence.
- `execution:run --no-context-limit` disables the AIOSON runtime token cutoff and
  its injected Codex compaction threshold. The native harness window/compaction
  remains in effect. The ledger persists this choice across resumes without changing
  the approved plan digest; `--context-limit` enables it again. Fresh runs default
  to the normal policy unless opted out. Timeouts and planning estimates are separate.
- Bounded Autopilot DEV recovery for missing/malformed/unbound reports, with actual
  validation errors, a fresh attempt/report and independent QA. No fabricated PASS.
- Dashboard distinguishes context exhaustion from a process crash and displays the
  disabled cutoff. Tutorial and CLI help document the options.

## Validation and second review

- Final focused suite: 72 tests, 71 passed, 0 failed, 1 optional browser test skipped.
  Covers actual child usage above 80k with cutoff absent, persisted resume override,
  retained accepted units, independent QA, report repair, CLI argument parsing,
  dispatch binding, context continuations, scheduling and dashboard isolation.
- Targeted baseline lint: 9 files, no new findings (6 existing baseline findings).
- Separate headless Edge review of the actual port 57510 dashboard passed: live
  page loaded, distinct context/crash labels, no page errors. It initially exposed
  cached old assets in the long-lived dashboard server; only that dashboard was
  restarted on the same port. Execution workers and Play were preserved then.
- When applying the cutoff change, the previously owned engine 30556 and its child
  workers were stopped; files and ledger were preserved. The replacement waited
  for lease expiry and resumed the same run. No locks were manually deleted.

Evidence: `.aioson/runtime/quality/orchestration-analysis/context-recovery-tests.log`,
`dashboard-context-review.json`, `dashboard-context-recovery.png`; consumer backups
under `.aioson/runtime/execution-backups/biblioteca-criativa-e-camadas/2026-09-13-context-notes/`.

## Last observed execution state

At 2026-09-13 17:15 UTC: engine PID 7980 running, `context_limit_enabled=false`, no
pending decisions. Catalog DEV passed with a valid report and independent QA was
running; captions DEV was running concurrently. All new attempts had
`context_budget=null`. Layer-contract and layer-store retained DEV+QA PASS.
Text rework and remaining units are scheduled by the existing dependency graph.

Dashboard remains `http://127.0.0.1:57510/?feature=biblioteca-criativa-e-camadas`
(replacement dashboard PID 37968). These observations confirm recovery and the
disabled guard, not completion or final QA approval of the feature. No promise of
future monitoring or immunity from other failures is implied.
