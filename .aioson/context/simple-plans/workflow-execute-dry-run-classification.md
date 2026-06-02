---
slug: workflow-execute-dry-run-classification
status: done
owner: dev
created_at: 2026-06-02
updated_at: 2026-06-02
classification: MICRO
risk: low
source: direct-user-request
---

# Simple Plan - workflow:execute dry-run classification

## Scope
Fix `workflow:execute --dry-run` so explicit `--classification` is respected and dry-run preview does not mutate workflow state.

## Done criteria
- `--classification=MICRO|SMALL|MEDIUM` wins over project context during `workflow:execute`.
- `--dry-run` does not write `.aioson/context/workflow.state.json` or `.aioson/context/workflow-execute.json`.
- Existing workflow execution behavior remains unchanged for non-dry-run execution.

## Out of scope
- Refactoring the oversized `workflow-execute.js` command into smaller modules.
- Changing official workflow sequences.
- Changing `workflow:next` behavior.

## Expected files
- `src/commands/workflow-execute.js`
- `tests/workflow-execute.test.js`

## Verification
- `node --test tests/workflow-execute.test.js`
- `node --test tests/workflow-next.test.js tests/workflow-engine-e2e.test.js tests/workflow-next-pentester.test.js`

## Session state
Next step: complete.

## Notes
- `src/commands/workflow-execute.js` and `tests/workflow-execute.test.js` are already above the 500-line governance threshold. This slice intentionally keeps a minimal in-place diff.
- Implemented explicit classification precedence in `workflow:execute`.
- Added dry-run preview state so `workflow.state.json` and `workflow-execute.json` are not written during preview.
- Verification passed: `node --test tests/workflow-execute.test.js` (24/24).
- Verification passed: `node --test tests/workflow-next.test.js tests/workflow-engine-e2e.test.js tests/workflow-next-pentester.test.js` (31/31).
- Smoke passed: `workflow:execute --dry-run --classification=MICRO --json` returned `MICRO`, sequence `product,dev,qa`, and left `workflow.state.json` unchanged.
- Security correction: fixed `SF-workflow-execute-dry-run-classification-01` by quoting dynamic arguments in displayed resume/gate commands. PoC slug `poc;echo AIOSON_POC` now stays inside the quoted `--feature` argument.
