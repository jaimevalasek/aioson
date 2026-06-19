---
slug: context-intelligence
mode: project
agent: qa
verdict: PASS
checked_at: 2026-06-19T01:01:41-03:00
gate: "Gate D: approved"
---

# QA Report - Context Intelligence - 2026-06-19

## Scope

Revalidation of the @dev corrections for context intelligence after the post-dev scope check:

- `src/context-search.js`: global search cache isolation by `project_dir + rel_path`, schema v3 rebuild, stale invalidation, purge/delete paths, result dedupe, and glob path routing.
- `tests/context-search.test.js`: regressions for cross-project rel_path collisions and nested glob routing.
- `src/commands/rules-lint.js`: selector-invisible warning text aligned with accepted routing metadata.
- `context:guard` and hook installation regressions kept in the focused test set because the reviewed series includes the PreToolUse guard path.

## AC Coverage

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC-CI-01 | Context search cache does not overwrite or leak results between projects with the same relative path | Covered | `IndexManager - isolates identical relative paths across projects` |
| AC-CI-02 | Search metadata schema migrates from the old rel_path-only shape to schema v3 with composite project/path identity | Covered | Manual v2 smoke: `{"ok":true,"version":3,"pk":"project_dir,rel_path"}` |
| AC-CI-03 | `paths` routing in `context-search` uses the same glob semantics as `context-selector` | Covered | `IndexManager - searchPackage path routing honors glob patterns` |
| AC-CI-04 | Context guard and hook behavior remain non-blocking and regression-tested | Covered | `context-guard` + `hooks-install-guard` focused tests |
| AC-CI-05 | Rules lint messaging reflects all supported routing frontmatter | Covered | `rules:lint --strict --json` returned `ok: true`, 16 rules, 0 warnings |

## Findings

No Critical, High, Medium, or Low blocking findings.

## Optional Improvements

- Add a permanent automated test for v2 schema migration/rebuild. The migration was manually verified in this QA pass; codifying it would protect future schema edits.
- Consider a future extraction from `src/context-search.js` if more behavior is added. The current patch is acceptable because it is narrowly scoped, but the file is already large.

## Verification

| Command | Result |
|---------|--------|
| `node --test tests/context-search.test.js tests/context-brief.test.js tests/context-guard.test.js tests/hooks-install-guard.test.js` | PASS: 38/38 |
| Manual old-schema smoke via `IndexManager` | PASS: v2 cache rebuilt to schema v3 with `project_dir,rel_path` PK |
| `node scripts/check-js.js` | PASS |
| `node bin/aioson.js rules:lint . --strict --json` | PASS: 16 rules, 0 warnings |
| `npm test` | PASS: 3265 tests, 3264 pass, 1 skipped, 0 fail |

## Recommended Next Agents

- `@pentester` is recommended only if the user wants adversarial review of the broader `context:guard` / PreToolUse hook surface. QA found no functional blocker in this pass.

## Summary

Gate D approved for the context intelligence corrections. The original cross-project cache collision is fixed, glob path routing is aligned, context guard regressions remain green, and no blocking QA findings remain.
