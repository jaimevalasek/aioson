# QA Report — Contextual commit guard — 2026-07-16

## Verdict

**FAIL — Gate D blocked.** The implementation fixes the original i18n and broad-path false positives, but the resulting policy still blocks legitimate synthetic fixtures when `tests/**` is no longer globally bypassed.

## Evidence

- Focused implementation suite before adversarial probes: 112/112 passed.
- Lint: passed.
- Full regression suite before adversarial probes: 3,779 passed, 0 failed, 1 skipped.
- Workflow technical gate: passed.
- `git:guard` against the pre-existing 103-file stage: 0 errors, 0 warnings.
- New adversarial fixture probes: 0/3 passed (all three reproduce the remaining false-positive classes).
- `audit:code --changed`: 0 High findings; one pre-existing Medium unused import.

## Coverage

| Behavior | Status |
|---|---|
| Natural-language localization values do not trigger generic credential warnings | Covered |
| Explicit `FAKE_*` / synthetic fixture values are auditable suppressions | Covered |
| Realistic provider tokens in test paths remain blocking | Covered |
| Runtime passphrases remain blocking | Covered |
| `contentAllowRules` suppresses only path + named detector rule | Covered |
| `trusted` accepts warnings but never high-confidence errors | Covered |
| Ordinary project `media/` and `output/` paths remain commit-safe | Covered |
| Obviously synthetic provider literals under test paths do not self-block | Missing |
| Template interpolation used to construct detector fixtures does not self-block | Missing |
| Explicit custom test credentials such as `sk-custom` do not self-block | Missing |

## Findings

### High

**[H-01] Contextual detector still blocks its own legitimate fixture corpus**
File: `src/lib/security/staged-secret-detector.js:113`, `src/lib/security/staged-secret-detector.js:165`
Risk: after removing the unsafe `tests/**` content bypass, staging the guard regression tests can fail on clearly synthetic OpenAI-style literals, template interpolation (`${realisticToken}`), and explicit custom fixture keys. This recreates the user's original deadlock in `commit:prepare` and makes the repair difficult to commit without restoring a broad unsafe exception.
Fix: in fixture paths, suppress high-confidence provider values that are independently and obviously synthetic while keeping realistic random values blocking; ignore generic template interpolation because it is not a literal credential; recognize explicit fixture-only values such as `custom`; retain or add source-only fixture sentinels for tests intentionally exercising passphrases. Re-scan the changed test files with the detector after the fix.
Tests written: `tests/git-guard.test.js` — “obviously synthetic provider literals”, “template interpolation”, and “explicit custom keys”; currently 3/3 fail and must pass after correction.

### Medium

**[M-01] Unused guard-config import remains in touched command**
File: `src/commands/commit-prepare.js:20`
Risk: no runtime impact; adds dead surface and was reported by the deterministic code audit.
Fix: remove `resolveGuardConfigPath` from the import list if it remains unused.

## Residual security boundary

- A realistic provider token remains blocking even inside `tests/` unless a deliberate fixture sentinel or scoped project-policy exception is present.
- `contentAllowPaths` remains a legacy whole-file bypass for backward compatibility; new exceptions must use `contentAllowRules` with path, detector rule, and reason.
- `trusted` mode is not a secret bypass: errors remain blocking and accepted warnings remain recorded in `commit-prep.json`.

## Required handoff

Next agent: `@dev` — apply H-01 and M-01, run the three new probes, the complete focused guard suite, lint, and the full regression suite; then return to `@qa`.

## Dev correction response — 2026-07-16

**Status: READY FOR QA RECHECK.**

- H-01 resolved: obvious synthetic provider values are suppressible only inside test/fixture paths; realistic provider values remain blocking. Generic assignments now require synthetic value evidence, template interpolation, or an explicit fixture sentinel — a `FAKE_*` identifier alone is insufficient.
- The detector and its modified test corpus are stageable without broad `tests/**` or `src/i18n/**` content bypasses.
- M-01 resolved: removed the unused `resolveGuardConfigPath` import from `src/commands/commit-prepare.js`.

Verification evidence:

- QA probes plus the additional realistic-value boundary: 5/5 passed.
- Focused guard/committer/installer/agent-contract suite: 124/124 passed.
- Self-scan of `staged-secret-detector.js`, `git-guard.test.js`, `commit-prepare.test.js`, and `installer.test.js`: zero unsuppressed findings.
- Temporary Git index with the 17 correction files: 0 errors, 0 warnings, 21 auditable suppressions; real stage remained unchanged at 103 files.
- Real 103-file stage: 0 errors, 0 warnings, 40 legacy-policy notices.
- `npm run lint`: passed.
- `npm test`: 3,812 passed, 0 failed, 1 skipped. An initial parallel-only `squad-daemon` failure passed both isolated and as its complete 20-test file, then the official full-suite rerun passed.
- `audit:code . --changed --json`: 0 High; M-01 no longer present. Remaining Medium findings are unrelated existing surface or keyword matches on detector placeholder patterns.

## QA recheck — 2026-07-16

### Verdict

**PASS — Gate D approved for the contextual commit guard correction slice.** H-01 and M-01 are resolved; no Critical, High, or in-scope Medium finding remains open.

### Independent evidence

- Adversarial boundary probes: 5/5 passed — synthetic provider literal, template interpolation, explicit custom fixture key, realistic provider secret rejection, and rejection of `FAKE_*` without synthetic value evidence.
- Detector self-scan across `staged-secret-detector.js`, `git-guard.test.js`, `commit-prepare.test.js`, and `installer.test.js`: 0 unsuppressed findings; 17 deliberate fixture suppressions.
- Focused guard/committer/installer/agent-contract suite: 124/124 passed.
- `npm run lint`: passed.
- Full regression: 3,812 passed, 0 failed, 1 skipped (3,813 total).
- Temporary Git index containing the complete 17-file correction set: 0 errors, 0 warnings, 21 auditable suppressions.
- User's real Git index: remained unchanged at 103 files with diff hash `83d9b409ee247d7320babf851817f16b2794cf02`; its guard result is 0 errors, 0 warnings, 40 legacy-policy suppressions.
- `audit:code . --changed --json`: 0 High. The M-01 unused import is absent; remaining Medium output is unrelated (`getStorageRoot` in `op-capture.js`) or lexical matches on the detector's `placeholder` vocabulary.
- Scoped `git diff --cached --check` over the 17-file correction set: clean. The global staged diff still contains pre-existing trailing whitespace in archived `review-intelligence` artifacts, outside this correction slice.

### Resolution status

- **H-01 — resolved:** fixture suppression now requires a test/fixture path plus independent synthetic evidence, template interpolation, or an explicit sentinel. Realistic provider tokens and random generic values remain blocking.
- **M-01 — resolved:** `resolveGuardConfigPath` was removed from the `commit-prepare.js` import list.

### Residual security boundary

- Realistic provider tokens remain blocking under `tests/` unless an explicit fixture sentinel or scoped project-policy exception is present.
- `contentAllowPaths` remains a legacy whole-file bypass for backward compatibility; new exceptions use `contentAllowRules` with path, detector rule, and reason.
- `trusted` accepts warnings only; high-confidence errors remain blocking and accepted warnings remain recorded in `commit-prep.json`.

### Recommended next agent

- `@pentester` is optional but recommended because this slice handles secrets, credentials, and token-classification boundaries. No coverage trigger for `@tester` remains.

## QA revalidation — security hotfix — 2026-07-16

### Verdict

**PASS — Gate D approved.** `SF-aioson-01` and `SF-aioson-02` are verified fixed; no in-scope Critical, High, or blocking Medium finding remains.

### Independent evidence

- Local isolated probe for SF-aioson-01: a staged provider token with an unstaged `contentAllowRules` policy was blocked as `github_token`; the reported policy source was `index`.
- Local isolated probe for SF-aioson-02: `commit:prepare --agent-safe --staged-only --mode=trusted` returned `agent_safe_requires_headless`, required `headless`, and did not write `commit-prep.json`.
- Focused guard/commit-prepare suite: 33/33 passed.
- `npm run lint`: passed.
- Full regression: 3,814 passed, 0 failed, 1 skipped (3,815 total).
- `audit:code . --changed --json`: 0 High findings. Its 234 non-High results span the existing dirty worktree and are advisory/out of this hotfix scope.
- Real Git index remained unchanged: 103 staged files, diff hash `83d9b409ee247d7320babf851817f16b2794cf02`; `git:guard` returned 0 errors, 0 warnings, 51 suppressions, with policy source `index`.

### Security findings

- **SF-aioson-01 (High, fixed):** the guarded scan now reads project policy from the Git index, preventing unstaged or untracked allow rules from authorizing staged secret content.
- **SF-aioson-02 (Medium, fixed):** agent-safe execution now accepts only headless mode; trusted and guarded overrides are rejected deterministically.

### Residual risk

`contentAllowPaths` remains a deliberate legacy whole-file bypass for backward compatibility. New scoped exceptions are covered by `contentAllowRules`; no change to that legacy contract was required for this hotfix.
