# Review Intelligence — Phase 4 QA checkpoint

Review only the documentation, conformance evidence, final regression hardening, and compatibility posture for the completed Review Intelligence implementation.

## Execution discipline

- Finish and publish the bound report within 8 minutes.
- Run the exact lightweight commands below first, then inspect only the scoped evidence needed to explain their results.
- Do not rerun the full `npm test`; independently verify its persisted harness result instead.
- Do not inspect unrelated dirty-worktree changes or prior execution reports.
- Do not edit source files. The only permitted write is the bound JSON report required by the execution contract.

## Scope

- `docs/en/5-reference/cli-reference.md`
- `docs/pt/5-referencia/comandos-cli.md`
- `.aioson/context/features/review-intelligence/implementation-ledger.md`
- `.aioson/context/spec-review-intelligence.md`
- `.aioson/context/conformance-review-intelligence.yaml`
- `.aioson/plans/review-intelligence/harness-contract.json`
- `.aioson/plans/review-intelligence/last-check-output.json`
- Review Intelligence source/tests only when needed to validate a documentation or compatibility claim

## Required checks

1. Confirm the English and Portuguese references document all three signatures, exit codes 0/1/2, empty non-gating status, immutable packet/report behavior, and compatible manual fallback.
2. Confirm the docs do not claim that the engine runs a model, tests, web research, workflow transitions, or gate approval.
3. Confirm all 24 acceptance criteria have executable evidence and the strict spec/artifact/ledger checks are clean.
4. Inspect `last-check-output.json` and confirm it is schema-consistent, `strict: true`, integrity-clean, and records 10/10 passing criteria, including `AC-RI-024` with `npm test` exit 0 and `RG-build` exit 0.
5. Confirm the implementation ledger distinguishes implementation completeness from the still-pending official Gate D and accurately records the regression evidence.
6. Confirm `audit:code` has no HIGH finding. Treat the four locale uses of `placeholder` and two test strings containing `TODO list` as lexical matches, not unfinished code; assess LOW literal duplication as advisory unless it creates a concrete defect.
7. Run:
   - `node --test tests/review-intelligence.test.js tests/review-intelligence-cli.test.js tests/review-intelligence-skill.test.js tests/i18n-cli.test.js tests/agent-contracts.test.js`
   - `node scripts/check-js.js`
   - `node bin/aioson.js spec:analyze . --feature=review-intelligence --strict --json`
   - `node bin/aioson.js artifact:validate . --feature=review-intelligence --json`
   - `node bin/aioson.js ac:test-audit . --feature=review-intelligence --json`
   - `node bin/aioson.js verify:implementation . --feature=review-intelligence --check-ledger --policy=strict --json`
   - `node bin/aioson.js audit:code . --changed --json`
   - `git diff --check`

Return `PASS` only when all scoped checks pass, the persisted full-suite evidence is valid, no HIGH finding exists, and Gate D remains explicitly delegated to the official post-dev chain. Otherwise return `FAIL` with concise file/line findings.
