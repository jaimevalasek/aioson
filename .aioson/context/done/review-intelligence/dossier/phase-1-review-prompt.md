# Review Intelligence — Phase 1 QA checkpoint

Review only the Phase 1 implementation for `review-intelligence`.

## Scope

- `src/review-intelligence/profiles.js`
- `src/review-intelligence/contracts.js`
- `src/review-intelligence/storage.js`
- `tests/review-intelligence.test.js`
- `.aioson/context/requirements-review-intelligence.md`
- `.aioson/context/design-doc-review-intelligence.md`
- `.aioson/context/implementation-plan-review-intelligence.md` — Phase 1 only

## Required checks

1. Confirm the eight-agent profile/mode/default matrix matches the approved requirements.
2. Confirm packet/report validation rejects private reasoning, aggregate scores, schema overflow and incoherent review states.
3. Confirm lexical plus realpath containment rejects traversal, NUL, external absolute paths and escaping symlink/junction paths before reads.
4. Confirm hashes use raw bytes and immutable publication cannot overwrite an existing canonical file.
5. Confirm a simulated rename failure leaves no partial canonical file or temporary artifact.
6. Run:
   - `node --test tests/review-intelligence.test.js`
   - `node scripts/check-js.js`
7. Do not edit source files. Write only the bound JSON report required by the execution contract appended to this prompt.

Return `PASS` only when the scoped checks and both commands pass. Otherwise return `FAIL` with concise file/line findings.
