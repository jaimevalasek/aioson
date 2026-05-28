---
phase: cli-security-scan-audit
created: 2026-04-28
status: resolved
dev_resolved_at: 2026-04-29
qa_verified_at: 2026-04-29
---

# Corrections Plan — Phase 2 — 2026-04-28

## Context
QA ran on 2026-04-28 against the Phase 2 deliverables (`security:scan`, `security:audit`, lib + tests). Found **1 High** and **1 Medium**. 0 Critical, 0 Low.

The dev-internal test suite (20/20) is correct in its assertions but tests the runners directly — it does not exercise the CLI dispatcher in `src/cli.js`. End-to-end verification through `bin/aioson.js` revealed that deterministic exit codes (the central guarantee of AC-SBD-2.4) are silently lost in `--json` mode.

## Mandatory corrections

### C-01 — Preserve deterministic exit codes through CLI in --json mode (HIGH)

File: `src/cli.js:1335-1336`

Problem: When a command returns `{ ok: false, exitCode: <N> }` and the user passes `--json`, the dispatcher unconditionally overrides with `process.exitCode = 1`. This collapses every blocking/inconclusive/bad-input/contract-violation outcome (10/11/12/13) into a generic 1.

Reproduction:
```bash
TMP=$(mktemp -d) && mkdir -p "$TMP/.aioson/context" \
  && echo "const k='sk_live_' + 'abcdefghijklmnopqrstuvwxyz1234567890';" > "$TMP/cfg.js"
node bin/aioson.js security:scan "$TMP" --stage=analyst --classification=MEDIUM ; echo "without --json exit=$?"      # → 10 (correct)
node bin/aioson.js security:scan "$TMP" --stage=analyst --classification=MEDIUM --json > /dev/null ; echo "with --json exit=$?"  # → 1 (WRONG)
```

Impact:
- AC-SBD-2.4 fails end-to-end through the CLI binary.
- Phase 5 plans to wire `workflow:next --complete=qa` to block on exit 10. With this bug, `--json` consumers cannot distinguish blocking from bad input from contract violation.
- Any tooling parsing exit codes after `aioson security:* --json` will treat all failures identically.

Why dev tests passed: tests call `runSecurityScan/runSecurityAudit` directly and assert on the *returned* object (`result.exitCode`), not on `process.exitCode` after CLI dispatch.

Expected fix (one location, ~3 lines):

```js
// src/cli.js around lines 1333-1338
if (jsonMode && commandSupportsJson(command)) {
  writeJson(result || { ok: true });
  if (result && typeof result.exitCode === 'number') {
    process.exitCode = result.exitCode;
  } else if (result && Object.prototype.hasOwnProperty.call(result, 'ok') && !result.ok) {
    process.exitCode = 1;
  }
}
```

Affected AC: AC-SBD-2.4 (`Findings High/Critical geram exit code bloqueante para MEDIUM`).

Required regression test (add to `tests/commands/security-scan.test.js` or a new `tests/cli-exit-codes.test.js`):
- Spawn `bin/aioson.js security:scan <fixture-with-secret> --json` via `child_process.spawnSync`; assert `status === 10` (not 1).
- Spawn the same scan without `--json`; assert `status === 10`.
- Spawn `security:scan <missing-path> --json`; assert `status === 12`.

### C-02 — Audit heuristic produces false positives on meta-features (MEDIUM)

File: `src/lib/security/artifact-reader.js:32-51` (`extractAttackSurfaceFlags`)
File: `src/commands/security-audit.js:81-119` (`buildAuditFindings`)

Problem: `extractAttackSurfaceFlags` flags a surface as "present" whenever any of its keywords appears anywhere in `requirements-{slug}.md`. The `secure-by-default` requirements doc explicitly states "Authenticated endpoints | None introduced by this feature." for every surface, but the regex still matches the keyword `auth` and treats the surface as present.

Reproduction:
```bash
node bin/aioson.js security:audit . --slug=secure-by-default --json
# → 7 high findings, all false positives:
#   secure-by-default:auth:SEC-SBD-03
#   secure-by-default:ownership:SEC-SBD-03
#   secure-by-default:money:SEC-SBD-04
#   secure-by-default:uploads:SEC-SBD-02
#   secure-by-default:external_urls:SEC-SBD-06
#   secure-by-default:secrets:SEC-SBD-05
#   secure-by-default:storage:SEC-SBD-07
```

Impact:
- Meta-features (the security baseline itself, governance work, docs-only features that *describe* surfaces without *introducing* them) get blocked at audit even when they are inherently safe.
- Phase 5, when wiring Gate D blocking, would block such features unless this is fixed.

Expected fix:
- When the requirements doc has an Attack Surface Map table, parse the actual cells. Treat phrases like "None introduced", "No new", "Future generated apps" as evidence that the surface does NOT apply to *this* feature.
- Alternatively, accept an explicit `pentester_trigger: skip` value in the AttackSurfaceMap as a signal that surfaces are out of scope for the current feature.

Affected AC: AC-SBD-2.3 (audit produces *correct* structured output, not just structured output).

Required regression test: add a fixture where requirements has an Attack Surface Map with all surfaces marked "None introduced" → audit should return PASS, not 7 highs.

## Optional corrections

### O-01 — Tests should also cover end-to-end via `bin/aioson.js`

The current test suite calls runners directly. Missing coverage is exactly what allowed C-01 to slip through. After fixing C-01, add at least 2-3 spawn-based tests so this class of regression is caught at PR time.

### O-02 — Document the exit-code preservation contract

After C-01 fixes the dispatcher, document in `architecture.md` §Phase 2 that any command participating in deterministic exit codes must return `{ ok, exitCode: <number> }` and the CLI dispatcher will honor it. This makes future commands inherit the contract automatically.

## Re-verification checklist for @qa (after fix)

- [ ] `node bin/aioson.js security:scan <fixture> --json` returns process exit 10 when there are High/Critical findings in MEDIUM.
- [ ] `node bin/aioson.js security:scan <fixture> --json` returns 11 when only inconclusive findings exist.
- [ ] `node bin/aioson.js security:scan --stage=invalid --json` returns 12.
- [ ] `node bin/aioson.js security:audit . --slug=secure-by-default --json` returns 0 (false positives gone after C-02).
- [ ] All 20 existing security tests still pass.
- [ ] At least 2 new spawn-based regression tests pass.
