---
phase: 2
created: 2026-06-09
status: resolved   # open | in_progress | resolved — C-01..C-03 aplicadas por @dev em 2026-06-09; O-01..O-04 pendentes de decisão @qa
---

# Corrections Plan — loop-guardrails — 2026-06-09

## Context
QA ran on 2026-06-09 and found 1 High and 2 Medium. Full suite: 3093/3096 pass
(2 failures are the pre-existing AC-CTPK-06 CRLF artifacts, unrelated). The new
failing test `QA-H-01` in `tests/self-loop-guardrails.test.js` encodes the
acceptance criterion for C-01 and must pass after the fix.

## Mandatory corrections

### C-01 — Guards silently inactive when `self:loop` runs without `--spec`/`--contract` (High)
File: src/commands/self-implement-loop.js:349-354
Problem: Contract discovery only happens via `--contract` or `--spec` (slug
derived from `spec-{slug}.md` basename). The PRD happy-path invocation
(`aioson self:loop . --agent=dev --task=... --max-iterations=3`) and the resume
instructions printed by `harness:approve` (src/commands/harness-gate.js:101) and
`budget-guard` ("re-run self:loop") re-enter the loop with `cb = null`: no schema
validation, no scope guard, no budget, no gates — silently. This defeats PRD
success metric #1 and the REQ-1 rationale (a guard must never be silently off).
Expected fix: when neither flag is given, auto-discover the active contract from
`.aioson/plans/*/progress.json` (`status` in_progress|human_gate, most recent
`last_updated` — same heuristic as `findActiveContract` in
src/commands/git-guard.js; consider extracting it to a shared helper). If no
active contract is found, log an explicit "guardrails inactive — no harness
contract loaded" line instead of staying silent.
Affected AC: PRD success metric "Contenção de escopo" (100% detection before feature:close)
Test written: tests/self-loop-guardrails.test.js — `QA-H-01` (currently failing on purpose)

### C-02 — `contract_mode` presets never reach the circuit-breaker or maxIterations (Medium, REQ-19)
Files: src/commands/self-implement-loop.js:364-368, src/harness/circuit-breaker.js:48,100
Problem: `maxIterations` and `CircuitBreaker.check()/recordError()` read the RAW
`contract.governor`, not `resolveContract(...)`'s effective governor. A contract
relying on preset values (e.g. `contract_mode: "builder"` with `max_steps`
omitted) gets `maxIterations` from the CLI flag (capped at 5, not 30) and NO
`error_streak_limit` enforcement at all. Direction is conservative (no runaway),
but the advertised preset semantics are broken. Budget/runtime/diff limits are
unaffected (they already read `resolved.governor`).
Expected fix: after schema validation, feed the resolved governor to the breaker
(e.g. overwrite `cb.contract.governor` with `resolved.governor`, or have the
breaker accept a resolved governor) and derive `maxIterations` from it.
Affected AC: REQ-loop-guardrails-19

### C-03 — git:guard layer-2 blocks legitimate human commits of lockfiles (Medium, REQ-20)
File: src/commands/git-guard.js (`applyActiveContractPolicy`)
Problem: the merge uses `resolveContract(...).forbidden_files`, which includes
the non-removable defaults (`package-lock.json`, `node_modules/**`, `.env*`,
...). While ANY feature has `progress.status=in_progress`, a human running
`npm install <pkg>` cannot commit the lockfile with the pre-commit hook
installed (`severity: error` → `result.ok=false`). The defaults exist to stop
the agent loop; at the commit layer they catch legitimate human changes.
Expected fix: at the git:guard layer apply only the contract-DECLARED
`forbidden_files` (still glob-validated), or downgrade default-glob matches to
`warning` severity at this layer only. Keep `.env*`/`*.pem`/`*.key`/`secrets/**`
as errors — those are also covered by git-guard's own baseline policy.
Affected AC: REQ-loop-guardrails-20

## Optional corrections

### O-01 — Gate id collision after manual gate-file deletion (Low)
File: src/harness/human-gate.js:83-84
`{theme}-{existing.length + 1}` collides with (and overwrites) a surviving
decided gate when an earlier gate file of the same theme was deleted — audit
loss. Derive the next id from `max(numeric suffixes) + 1`.

### O-02 — Baseline-failure warning understates what is disabled (Low)
File: src/commands/self-implement-loop.js:428
When git baseline capture fails the warning says "scope guard inactive", but
human-gate detection and diff limits are also inactive for the run. Say so.

### O-03 — `diff.patch` omits untracked files (Low)
File: src/harness/git-baseline.js:186-196
`git diff HEAD` excludes untracked files, so the rollback artifact is incomplete
for newly created files (changed-files.json still lists them). Consider
`git add -N`-style intent or appending untracked file contents.

### O-04 — i18n of new commands (Low, dev residual, QA ruling: non-blocking)
harness:approve/reject/status use direct English strings; loop guard messages
mix pt-BR/English. Pre-existing pattern in self:loop output — not a Gate D
blocker. Track as follow-up; CLI keys need the `cli.` namespace prefix.
