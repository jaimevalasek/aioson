---
feature: quality-governance-baseline-and-new-regression-gate
agent: qa
date: 2026-06-02
verdict: PASS
gate: Gate D
status: approved
---

# QA Report - Quality Governance Baseline and New Regression Gate

## Verdict
PASS. Gate D approved for the SMALL MVP.

No Critical, High, Medium, or Low defects were found in the implemented `quality:audit` scope.

## Scope Reviewed
- `src/commands/quality-audit.js`
- `src/lib/quality/result.js`
- `src/lib/quality/provider.js`
- `src/lib/quality/report.js`
- `src/cli.js`
- `src/i18n/messages/*.js`
- `tests/quality-audit.test.js`
- `.aioson/context/quality-report-quality-governance-baseline-and-new-regression-gate.md`

## Acceptance Criteria Coverage

| AC | Status | Evidence |
|----|--------|----------|
| AC-QGBNRG-01 | Covered | CLI command is registered and callable as `quality:audit`; smoke run returned JSON result and report path. |
| AC-QGBNRG-02 | Covered | Result contract includes `status`, `mode`, `provider`, `scope`, `baseline_ref`, `findings`, `summary`, and `advisory`. |
| AC-QGBNRG-03 | Covered | Local missing Fallow provider returns `warn` with advisory and no auto-install. |
| AC-QGBNRG-04 | Covered | Baseline matching classifies known finding as `baseline` and status `warn`, not `fail`. |
| AC-QGBNRG-05 | Covered | Forced changed-code medium finding produced `status: fail`, `exitCode: 1`, and shell exit code `1`. |
| AC-QGBNRG-06 | Covered | Missing provider/config uncertainty returns `warn`, not `pass`. |
| AC-QGBNRG-07 | Covered | Provider-native schema is normalized; tests assert AIOSON-owned fields and no primary `issues` contract. |
| AC-QGBNRG-08 | Covered | Markdown report writes to `.aioson/context/quality-report-{slug}.md`. |
| AC-QGBNRG-09 | Covered | Report contains provider, scope, baseline, summary, findings, governance sources, advisory, and limitations. |
| AC-QGBNRG-10 | Covered | Command does not write provider raw JSON into `.aioson/context/`; report states this limitation. |
| AC-QGBNRG-11 | Covered | Governance source collection includes `.aioson/rules`, `.aioson/design-docs`, and `.aioson/context/design-doc.md`. |
| AC-QGBNRG-12 | Covered | Normalization can infer governance references for governance/structural finding text. |
| AC-QGBNRG-13 | Covered | Focused node:test suite covers pass/warn/fail, baseline/new, report, CLI JSON, help, and untracked scope. |
| AC-QGBNRG-14 | Covered | CLI help exposes `aioson quality:audit ...`. |
| AC-QGBNRG-15 | Covered | `--json` returns parseable JSON with `ok: true` and nested result status. |
| AC-QGBNRG-16 | Covered | Changed-code scope includes `git diff --name-only HEAD` and untracked files. |
| AC-QGBNRG-17 | Covered | Report limitations say the MVP gates confirmed new regressions in changed code only. |
| AC-QGBNRG-18 | Covered | Report/source check found no `process.env`, `SECRET`, `TOKEN=`, `PASSWORD=`, or private config output. |

Coverage: 18/18 ACs covered.

## Verification
- PASS: `node --test tests/quality-audit.test.js` - 9/9 tests passed.
- PASS: direct syntax checks for changed files with `node --check`.
- PASS: `node bin/aioson.js quality:audit . --feature=quality-governance-baseline-and-new-regression-gate --json` returned `status: warn` and wrote `.aioson/context/quality-report-quality-governance-baseline-and-new-regression-gate.md`.
- PASS: temporary provider-output smoke with a changed-code medium duplication finding returned `status: fail`, `exitCode: 1`, and process exit code `1`.
- PASS: `node bin/aioson.js help` includes `quality:audit`.
- PASS: secret/config-output scan over the quality report and quality modules found no matches.

## Non-Blocking Residuals
- Local Fallow is not installed in this workspace, so live provider analysis is represented by the intentional `warn` advisory path. This matches requirements because the command must not auto-install providers.
- `npm run lint` fails on Windows because the script passes literal globs to `node --check`; direct `node --check` on changed files passed.
- A broad `npm test` run did not finish within 120 seconds in this QA pass. @dev previously observed unrelated repository failures in the global suite; focused feature coverage passed.

## Specialized Review Recommendation
No mandatory follow-up agent is required for this SMALL MVP. If `quality:audit` becomes a release-blocking CI gate or starts installing/running third-party providers beyond the local binary boundary, route to @pentester for the provider execution and supply-chain boundary.
