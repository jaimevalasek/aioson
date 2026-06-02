---
owner: qa
scope: project
status: pass_with_warnings
gate: D
updated_at: "2026-06-02T05:48:00-03:00"
---

# QA Gate D — Project Design Governance

## Verdict

PASS_WITH_WARNINGS

The design-governance project lane is verifiable from disk artifacts and local commands. No Critical or High findings were found against the delivered behavior.

## Acceptance Coverage

| AC | Result | Evidence |
|---|---|---|
| AC-01 | PASS | `.aioson/context/design-doc.md` exists; `workflow:next` routes SMALL/MEDIUM through `discovery-design-doc`; `handoff-contract` requires `design-doc.md` and `readiness.md` for that stage. |
| AC-02 | PASS | `.aioson/agents/dev.md`, `.aioson/agents/deyvin.md`, and SDD dev reference require loading `design-doc.md`/`readiness.md` before SMALL/MEDIUM implementation edits. |
| AC-03 | PASS | `src/commands/workflow-next.js` default SMALL/MEDIUM feature/project sequences include `discovery-design-doc` before implementation. |
| AC-04 | PASS | `.aioson/agents/discovery-design-doc.md` requires exact files/modules, reuse decisions, split risks, blockers/assumptions, and forbids generic handoff to `@dev`. |
| AC-05 | PASS | `@dev` and `@deyvin` prompts require explicit >500-line alert with concrete split/extraction options before continuing. |
| AC-06 | PASS | Workspace/template parity checks for `design-doc.md`, touched agent prompts, and SDD dev reference returned no differences. |
| AC-07 | PASS | `workflow:status`, `preflight`, and `artifact:validate` expose `design-doc.md`/`readiness.md`; `workflow:status` reports active stage, handoff readiness, artifacts, and next command. |
| AC-08 | PASS | QA reproduced local evidence: `parallel:status`, focused `node --test`, syntax checks, and workflow status all ran from disk artifacts. |

## Findings

### Medium — Project-lane Gate D remains split across workflow status and preflight

`aioson workflow:status . --tool=codex` reports `@qa` handoff contract ready, while `aioson preflight . --agent=qa` still reports blocked in project mode because there is no project-level `spec.md`/Gate C artifact for this lane. The delivered readiness and parallel lane artifacts are sufficient for this QA pass, but future project-level QA sessions can see contradictory readiness signals.

Suggested follow-up: teach `preflight`/Gate D to recognize project-lane readiness artifacts (`readiness.md` + completed parallel lanes) or define a formal project-level gate artifact for MEDIUM project workflows.

### Low — Full-suite and lint commands are not clean on this Windows workspace

Focused design-governance regressions pass, and changed-source syntax checks pass. Full `npm test` and `npm run lint` still have unrelated or Windows-sensitive failures documented by `@dev`: agent-doc drift, tar flag support, sandbox/process behavior, telemetry fixture history, and unexpanded `node --check src/*.js` globs.

Suggested follow-up: separate Windows-safe lint/test smoke commands from broad cross-platform/full-suite gates so Gate D evidence can stay deterministic.

## Verification Commands

- `aioson parallel:status .` — PASS: 4 lanes completed, 16/16 deliverables, 0 blockers, 0 ownership conflicts, 0 machine-file drift.
- `node --test tests/workflow-next.test.js tests/workflow-status.test.js tests/preflight-engine.test.js tests/preflight-command.test.js tests/artifact-validate.test.js tests/sdlc-process-upgrade-regression.test.js tests/workflow-next-pentester.test.js tests/workflow-execute.test.js tests/workflow-engine-e2e.test.js tests/workflow-engine-hardening.test.js` — PASS: 201/201.
- `node --check` on touched source modules — PASS.
- `aioson workflow:status . --tool=codex` — PASS: active `@qa`, pending gate none, handoff contract ready, suggested completion command present.
- `aioson artifact:validate .` — NOT APPLICABLE without `--feature`; this is a project lane, not a feature slug.

## Residual Risk

The implementation satisfies the design-governance ACs through focused tests and prompt/template parity. The main residual risk is process consistency for MEDIUM project lanes: project-mode QA currently relies on `readiness.md` plus lane status artifacts instead of a single formal `spec-{slug}`/Gate D chain.

## Next Recommendation

Complete `@qa` and route to the next workflow stage if the CLI accepts the handoff.
