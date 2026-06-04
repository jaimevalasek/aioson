---
feature: quality-governance-baseline-and-new-regression-gate
classification: SMALL
status: done
started: 2026-06-02
version: 0.3.0
gate_requirements: approved
gate_design: approved
gate_plan: approved
gate_execution: approved
last_checkpoint: "qa: Gate D PASS. 18/18 ACs covered; focused tests, syntax checks, CLI warn smoke, help smoke, forced fail-path smoke, and secret-output scan passed. Local Fallow remains absent by design, so live provider evidence is advisory warn."
---

# Spec — Quality Governance Baseline and New Regression Gate

## What was built
- `aioson quality:audit` and alias `quality-audit` are registered in `src/cli.js`.
- `src/commands/quality-audit.js` orchestrates changed-code scope, provider output, baseline consumption, normalization, and Markdown report writing.
- `src/lib/quality/result.js` defines the AIOSON-owned result normalization and baseline/new classification logic.
- `src/lib/quality/provider.js` reads changed-code scope from git, including untracked files, loads optional baseline/provider fixtures, and treats missing local Fallow as `warn` without auto-installing.
- `src/lib/quality/report.js` writes `.aioson/context/quality-report-{slug}.md` as the workflow-facing evidence artifact.
- `tests/quality-audit.test.js` covers pass/warn/fail status, baseline-only vs new finding behavior, no Fallow schema leak as primary contract, report content, CLI JSON smoke, help exposure, and untracked changed-file scope.

## Entities added
No database entities.

Command/data contracts introduced by requirements:
- Quality Audit Result
- Quality Finding
- Quality Baseline Metadata
- Quality Report Artifact

## Key decisions
- 2026-06-02 @product: Feature scope narrowed to a SMALL MVP around baseline + new-regression gate.
- 2026-06-02 @sheldon: Path A selected; no external phased plan. PRD enriched in place.
- 2026-06-02 @analyst: Gate A approved with AIOSON-owned result contract, Fallow as first provider, Markdown-first report, and advisory QA evidence integration.
- 2026-06-02 @analyst: MVP command surface limited to `aioson quality:audit`; additional `quality:*` commands are out of scope.
- 2026-06-02 @analyst: Provider raw JSON must not become an undocumented `.aioson/context/*.json` artifact.
- 2026-06-02 @architect: Gate B approved with a small Node.js CLI architecture: `src/commands/quality-audit.js` orchestrates, reusable quality logic lives in `src/lib/quality/`, and workflow evidence remains Markdown-first.
- 2026-06-02 @pm: Gate C approved with a SMALL execution plan focused on result contract, baseline/new comparison, CLI/report wiring, and quality evidence.
- 2026-06-02 @dev: Missing local Fallow provider returns `warn` with advisory text — reason: the audit command must not auto-install providers during gates, and provider absence is uncertainty rather than confirmed regression.
- 2026-06-02 @dev: Changed-code scope includes untracked files via `git ls-files --others --exclude-standard` — reason: new source/test files must be considered before they are staged or committed.
- 2026-06-02 @dev: `quality:audit --json` returns `ok: true` for successful command execution and adds `exitCode: 1` only for `result.status = fail` — reason: callers can parse the result contract while confirmed regressions can still block shell-driven gates.
- 2026-06-02 @qa: Gate D approved with 18/18 acceptance criteria covered. The local Fallow provider is absent, so live provider evidence remains an intentional `warn` advisory path; fixture and CLI fail-path evidence confirms new changed-code regressions block with exit code 1.

## Requirements
- REQ-QGBNRG-01 through REQ-QGBNRG-14 are defined in `.aioson/context/requirements-quality-governance-baseline-and-new-regression-gate.md`.

## Acceptance Criteria
- AC-QGBNRG-01 through AC-QGBNRG-18 are defined in `.aioson/context/requirements-quality-governance-baseline-and-new-regression-gate.md`.

## Edge cases handled
- Provider missing/config/runtime failure returns `warn` with advisory.
- Malformed provider JSON from local Fallow returns `warn` with advisory.
- Missing baseline is allowed; unreadable baseline returns advisory.
- No changed files returns `warn` with advisory.
- Findings without line numbers normalize with `line: null`.
- Missing governance docs produce an empty source list, not a failure.
- Multiple governance references can be attached to normalized findings.
- Active feature slug is read from `dev-state.md` when `--feature` is omitted.

## Dependencies
- Reads:
  - `.aioson/context/prd-quality-governance-baseline-and-new-regression-gate.md`
  - `.aioson/context/sheldon-enrichment-quality-governance-baseline-and-new-regression-gate.md`
  - `.aioson/context/requirements-quality-governance-baseline-and-new-regression-gate.md`
  - `.aioson/rules/*.md`
  - `.aioson/context/design-doc.md`
  - `.aioson/design-docs/*.md`
  - changed-code information from git or equivalent project state
  - optional provider/baseline data
- Writes:
  - `.aioson/context/quality-report-{slug}.md`
  - implementation files under `src/commands/`, `src/cli.js`, and optional isolated quality logic module if needed
  - tests under `tests/`

## Notes
- Project-level `project.context.md` is MEDIUM, but this feature is classified SMALL by PRD/workflow scoring.
- `artifact:validate` may currently report MEDIUM because it prioritizes project classification over PRD classification. Treat that as a CLI classification-precedence quirk, not as this feature's scope decision.
- `dev-state.md` currently points to `cost-context-optimization`; ignore it for this feature unless overwritten by a fresh handoff.
- Gate B is selective but recommended because the feature introduces a new CLI command and provider/result contract.
- @dev should not auto-install Fallow or any provider dependency during gate execution.
- @qa should cite `.aioson/context/quality-report-{slug}.md` when available.
- @dev verification: `node --test tests/quality-audit.test.js` passed with 9/9 tests.
- @dev smoke: `node bin/aioson.js quality:audit . --feature=quality-governance-baseline-and-new-regression-gate --json` returned status `warn` and wrote `.aioson/context/quality-report-quality-governance-baseline-and-new-regression-gate.md`.
- @qa verification: `node --test tests/quality-audit.test.js` passed 9/9; changed-file syntax checks passed; CLI warn smoke, help smoke, forced fail-path smoke, and secret-output scan passed. QA report: `.aioson/context/qa-report-quality-governance-baseline-and-new-regression-gate.md`.

## Phase gates
- Gate A — Requirements: approved.
- Gate B — Design: approved.
- Gate C — Plan: approved.
- Gate D — Execution: approved.
