# Review Intelligence — Phase 2 QA checkpoint

Review only the Phase 2 engine and additive CLI integration for `review-intelligence`.

## Execution discipline

- Finish and publish the bound report within 8 minutes.
- Run the three exact commands below first, then inspect only the scoped files needed to explain their result.
- Do not scan the whole repository, inspect unrelated dirty-worktree changes, revisit Phase 1 internals, or inspect prior execution reports.
- The Phase 1 profile/contracts/storage checkpoint already has an independent PASS; treat those imports as established dependencies.
- Do not edit source files. The only permitted write is the bound JSON report appended by the execution contract.

## Scope

- `src/review-intelligence/engine.js`
- `src/commands/review-intelligence.js`
- Phase 2 additions only in `src/cli.js`
- Phase 2 additions only in `src/i18n/messages/{en,pt-BR,es,fr}.js`
- `tests/review-intelligence-cli.test.js`
- Phase 2 addition in `tests/i18n-cli.test.js`
- Approved requirements/design/implementation plan for `review-intelligence`

## Required checks

1. Confirm `prepare → check → status` implements bindings, staleness, immutable promotion and exit codes 0/1/2.
2. Confirm invalid/stale reports are never promoted and action-required reports are promoted.
3. Confirm status is non-gating when empty, uses current reports, and exposes assurance axes without aggregate scoring.
4. Confirm `src/cli.js` changes are strictly additive: one import, JSON entries, help lines and three dispatch branches; no legacy command behavior changed.
5. Confirm all four locales expose canonical signatures and `--json` remains one parseable document.
6. Run:
   - `node --test tests/review-intelligence.test.js tests/review-intelligence-cli.test.js tests/i18n-cli.test.js`
   - `node --test tests/briefing-cli.test.js tests/briefing-refiner.test.js tests/verify-implementation.test.js tests/artifact-validate.test.js`
   - `node scripts/check-js.js`
7. Write only the bound JSON report required by the execution contract appended to this prompt.

Return `PASS` only when all scoped checks and commands pass. Otherwise return `FAIL` with concise file/line findings.
