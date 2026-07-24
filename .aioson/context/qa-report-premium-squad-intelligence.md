---
feature: premium-squad-intelligence
verdict: pass
verified_at: 2026-07-24T01:26:00-03:00
production_entry: node bin/aioson.js
---

# QA Report — Premium Squad Intelligence

## Verdict

**PASS.** All eight findings from the first independent review were corrected and
reproduced through focused tests. The full project CI passes with the new
contracts active: 3,877 tests, 3,876 passed, 0 failed, and 1 expected skip.

## Corrected findings

| Finding | Severity | Resolution evidence | Status |
|---|---|---|---|
| QA-PSI-01 | Critical | Held-out PASS now requires worker execution or deterministic artifact assertions. Static manifest scores are metadata only. Genome A/B requires the same task, worker, and input hash, with only the controlled `_aioson_eval.genome_enabled` binding state changed. Regression, uncontrolled-input, and static-self-certification tests pass. | RESOLVED |
| QA-PSI-02 | High | Unmapped claims default to `unverified`; supported claims require explicit valid `source_ids` and matching citations. Live packs with zero mapped claims cannot pass. Strict readiness validates pack schema, policy, squad, provider, sources, and every claim state. | RESOLVED |
| QA-PSI-03 | High | Retry exhaustion preserves the complete `attempt_history`, records `finished_at`, and keeps `completed_at: null` on escalation. Two-attempt regression evidence passes. | RESOLVED |
| QA-PSI-04 | High | Removed, stale, conflicted, pending, or no-effect genome states clear the managed prompt block and deactivate the generated checklist. Lifecycle cleanup regression passes. | RESOLVED |
| QA-PSI-05 | High | `squad:eval`, `squad:validate`, and `squad:score` reject non-canonical slugs before path resolution; the Evidence Pack search also enforces squads-root containment. Traversal tests pass. | RESOLVED |
| QA-PSI-06 | Medium | `live-required` readiness is capped at 6 hours and `live-check` at 24 hours. Manifests may tighten but cannot loosen these ceilings; policy- and squad-mismatched packs are rejected. | RESOLVED |
| QA-PSI-07 | High | Legacy autorun executes the task-bound specialist worker when present and fails visibly with `specialist_executor_unavailable` when unavailable. It never substitutes the integration owner. Both paths are covered. | RESOLVED |
| QA-PSI-08 | Medium | Playbook writes are atomic, original `from` provenance is immutable, later origins become observations, and promotion validates both eval schema and requested squad identity. | RESOLVED |

## CAP/AC evidence table

| CAP | ACs | Independent evidence | QA status |
|---|---|---|---|
| CAP-premium-evidence | AC-premium-01..04 | Live/closed-world policy, SSRF defenses, explicit claim-source mapping, zero-claim refusal, 6h/24h strict freshness, and mismatch rejection | PASS |
| CAP-premium-composition | AC-premium-05..07 | Multilingual decomposition, ownership/review rights, Agent Teams routing, and truthful legacy specialist execution/refusal | PASS |
| CAP-premium-genome | AC-premium-08..11 | Binding lifecycle, real prompt/checklist materialization, inactive cleanup, and controlled same-worker/same-input A/B | PASS |
| CAP-premium-runtime-truth | AC-premium-12..13 | Missing/empty/timed-out workers never complete; all retry attempts survive and escalation is never timestamped as completion | PASS |
| CAP-premium-assurance | AC-premium-14..18 | Canonical schema, strict validator, executable eval, static-score refusal, score caps, and schema-gated atomic playbook learning | PASS |
| CAP-premium-compatibility | AC-premium-19..20 | Legacy/v2 genome reads, template parity, install/i18n coverage, canonical slug containment, lint, and full regression CI | PASS |

## Commands executed and results

- `node bin/aioson.js preflight . --agent=qa --feature=premium-squad-intelligence --json` — READY.
- `node bin/aioson.js prototype:check . --feature=premium-squad-intelligence --strict --json` — `not_applicable`, explicit `none`.
- `node bin/aioson.js ac:test-audit . --feature=premium-squad-intelligence --strict --json` — 20/20 covered, 0 missing, 0 weak.
- Focused correction suites for eval, research, autorun, genome compiler, playbook, strict validation, score, i18n, Agent Teams, compatibility, and security — PASS.
- `npm run sync:agents` — template/workspace synchronization PASS.
- Template/workspace SHA-256 parity for changed docs and the squad manifest schema — PASS.
- `npm run lint` — PASS.
- `npm run ci` — 3,877 total; 3,876 pass; 0 fail; 1 skip.
- `git diff --check` — no whitespace errors; Windows line-ending warnings only.

## Production-path smoke

- Entry point: `node bin/aioson.js`.
- `squad:eval`: registered CLI command, canonical slug checked before I/O, strict
  precheck executed, source references resolved and hashed, real held-out workers
  executed, reports schema-validated and atomically persisted.
- `squad:autorun`: execution truth is retained for missing workers, retries,
  escalations, and task-bound specialists.
- Research worker: live confirmation requires provider-backed pages and at least
  one explicitly mapped supported claim; unverifiable work remains visible.
- Genome apply/compiler: compiled effects reach squad prompts/checklists and are
  removed when the binding is no longer operational.
- `squad:playbook`: candidate promotion requires a later schema-valid held-out
  PASS for the expected squad.

## Prototype fidelity and binding resolution

- Prototype status: explicit `none`.
- No visual prototype is binding.
- Historical prototype references excluded: none.
- Verification authority: approved PRD, implementation plan, current repository,
  CLI production entry points, and executable tests.
- Approved deviations: none.

## Engineering-control evidence

- Deterministic schema/eval integrity: PASS.
- Source provenance and freshness: PASS.
- SSRF/private-target/redirect defenses: PASS.
- Runtime completion truth and retry recovery: PASS.
- Genome lifecycle cleanup and containment: PASS.
- Specialist routing truth across supported engines: PASS.
- Atomic persistent learning and provenance preservation: PASS.
- Localization, distribution, template parity, and backward compatibility: PASS.

## Regression, resource, and advisory notes

- No native compiler or build tool was used during the correction or final QA.
- Full CI ran once in a monitored process tree; observed memory peaked near
  1.13 GB and returned normally. No duplicate test trees remained.
- The existing prompt-size budget advisory remains non-blocking technical debt;
  it is not a regression introduced by this feature and does not affect the
  functional PASS.
