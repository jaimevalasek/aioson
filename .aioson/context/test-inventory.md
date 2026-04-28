---
generated: "2026-04-28T02:57:07-03:00"
framework: "Node.js"
test_runner: "node:test"
agent: "tester"
feature: "feature-dossier"
---

# Test Inventory

## Summary
- Total source files scanned: 257
- Files with full coverage: ~88
- Files with partial coverage: ~48
- Files with no coverage: ~121

> Coverage definitions:
> - **✓ covered**: dedicated test file exists matching source path/name
> - **◑ partial**: tested indirectly or by a differently-named test file
> - **✗ missing**: no identifiable test coverage

## Coverage map — Dossier feature (active)

| Source file | Test file | Status |
|---|---|---|
| src/commands/dossier.js | tests/commands/dossier.test.js | ✓ covered |
| src/commands/feature-archive.js | tests/commands/feature-archive-dossier.test.js | ✓ covered |
| src/commands/feature-close.js | tests/feature-close.test.js | ✓ covered |
| src/dossier/store.js | tests/dossier/store.test.js | ✓ covered |
| src/dossier/schema.js | tests/dossier/schema.test.js | ✓ covered |
| src/dossier/lock.js | tests/dossier/lock.test.js | ✓ covered |
| src/cli.js (dossier registration) | — | ✗ missing |

## Coverage map — Project-wide (selected modules)

| Source file | Test file | Status |
|---|---|---|
| src/agent-loader.js | tests/agent-loader.test.js | ✓ covered |
| src/agent-manifests.js | tests/agent-manifests.test.js | ✓ covered |
| src/agents.js | tests/agents.test.js | ✓ covered |
| src/autonomy-policy.js | tests/autonomy-policy.test.js | ✓ covered |
| src/brain-query.js | tests/brain-query.test.js | ✓ covered |
| src/cli.js | — | ✗ missing |
| src/commands/artifact-validate.js | tests/artifact-validate.test.js | ✓ covered |
| src/commands/classify.js | tests/classify-command.test.js | ◑ partial |
| src/commands/cloud.js | tests/cloud-command.test.js | ◑ partial |
| src/commands/commit-prepare.js | tests/commit-prepare.test.js | ✓ covered |
| src/commands/context-cache.js | tests/context-cache.test.js | ✓ covered |
| src/commands/context-health.js | tests/context-health.test.js | ✓ covered |
| src/commands/context-pack.js | tests/context-pack.test.js | ✓ covered |
| src/commands/context-search.js | tests/context-search.test.js | ✓ covered |
| src/commands/context-trim.js | tests/context-trim.test.js | ✓ covered |
| src/commands/design-hybrid-options.js | tests/design-hybrid-options.test.js | ✓ covered |
| src/commands/detect-test-runner.js | tests/detect-test-runner.test.js | ✓ covered |
| src/commands/doctor.js | tests/doctor.test.js | ✓ covered |
| src/commands/gate-approve.js | tests/gate-approve.test.js | ✓ covered |
| src/commands/gate-check.js | tests/gate-check.test.js | ✓ covered |
| src/commands/git-guard.js | tests/git-guard.test.js | ✓ covered |
| src/commands/implementation-plan.js | tests/implementation-plan.test.js | ✓ covered |
| src/commands/learning-auto-promote.js | tests/learning-auto-promote.test.js | ✓ covered |
| src/commands/learning.js | tests/learning.test.js | ✓ covered |
| src/commands/mcp-doctor.js | tests/mcp-doctor.test.js | ✓ covered |
| src/commands/mcp-init.js | tests/mcp-init.test.js | ✓ covered |
| src/commands/parallel-assign.js | tests/parallel-assign.test.js | ✓ covered |
| src/commands/parallel-doctor.js | tests/parallel-doctor.test.js | ✓ covered |
| src/commands/parallel-guard.js | tests/parallel-guard.test.js | ✓ covered |
| src/commands/parallel-init.js | tests/parallel-init.test.js | ✓ covered |
| src/commands/parallel-merge.js | tests/parallel-merge.test.js | ✓ covered |
| src/commands/parallel-status.js | tests/parallel-status.test.js | ✓ covered |
| src/commands/pulse-update.js | tests/pulse-update.test.js | ✓ covered |
| src/commands/qa-doctor.js | tests/qa-doctor.test.js | ✓ covered |
| src/commands/qa-init.js | tests/qa-init.test.js | ✓ covered |
| src/commands/qa-report.js | tests/qa-report.test.js | ✓ covered |
| src/commands/runner-daemon.js | tests/runner-daemon.test.js | ✓ covered |
| src/commands/runner-plan.js | tests/runner-plan.test.js | ✓ covered |
| src/commands/runner-queue-from-plan.js | tests/runner-queue-from-plan.test.js | ✓ covered |
| src/commands/runner-queue.js | tests/runner-queue.test.js | ✓ covered |
| src/commands/runner-run.js | tests/runner-run.test.js | ✓ covered |
| src/commands/sandbox.js | tests/sandbox.test.js | ✓ covered |
| src/commands/scan-project.js | tests/scan-project.test.js | ✓ covered |
| src/commands/setup-context.js | tests/setup-context.test.js | ✓ covered |
| src/commands/smoke.js | tests/smoke.test.js | ✓ covered |
| src/commands/spec-tasks.js | tests/spec-tasks.test.js | ✓ covered |
| src/commands/squad-card.js | tests/squad-card.test.js | ✓ covered |
| src/commands/squad-daemon.js | tests/squad-daemon.test.js | ✓ covered |
| src/commands/squad-dashboard.js | tests/squad-dashboard.test.js | ✓ covered |
| src/commands/squad-doctor.js | tests/squad-doctor.test.js | ✓ covered |
| src/commands/squad-export.js | tests/squad-export.test.js | ✓ covered |
| src/commands/squad-investigate.js | tests/squad-investigate.test.js | ✓ covered |
| src/commands/squad-learning.js | tests/squad-learning.test.js | ✓ covered |
| src/commands/squad-mcp.js | tests/squad-mcp.test.js | ✓ covered |
| src/commands/squad-pipeline.js | tests/squad-pipeline.test.js | ✓ covered |
| src/commands/squad-plan.js | tests/squad-plan.test.js | ✓ covered |
| src/commands/squad-roi.js | tests/squad-roi.test.js | ✓ covered |
| src/commands/squad-scaffold.js | tests/squad-scaffold.test.js | ✓ covered |
| src/commands/squad-score.js | tests/squad-score.test.js | ✓ covered |
| src/commands/squad-validate.js | tests/squad-validate.test.js | ✓ covered |
| src/commands/squad-worker.js | tests/squad-worker.test.js | ✓ covered |
| src/commands/state-save.js | tests/state-save.test.js | ✓ covered |
| src/commands/update.js | tests/update.test.js | ✓ covered |
| src/commands/verify-gate.js | tests/verify-gate.test.js | ✓ covered |
| src/commands/workflow-execute.js | tests/workflow-execute.test.js | ✓ covered |
| src/commands/workflow-harden.js | tests/workflow-harden.test.js | ✓ covered |
| src/commands/workflow-heal.js | tests/workflow-heal.test.js | ✓ covered |
| src/commands/workflow-next.js | tests/workflow-next.test.js | ✓ covered |
| src/commands/workflow-plan.js | tests/workflow-plan.test.js | ✓ covered |
| src/commands/workflow-status.js | tests/workflow-status.test.js | ✓ covered |
| src/context-cache.js | tests/context-cache.test.js | ✓ covered |
| src/context-memory.js | tests/context-memory.test.js | ✓ covered |
| src/context-parse-reason.js | tests/context-parse-reason.test.js | ✓ covered |
| src/context-search.js | tests/context-search.test.js | ✓ covered |
| src/context-writer.js | tests/context-writer.test.js | ✓ covered |
| src/context.js | tests/context.test.js | ✓ covered |
| src/delivery-runner.js | tests/delivery-runner.test.js | ✓ covered |
| src/detector.js | tests/detector.test.js | ✓ covered |
| src/doctor.js | tests/doctor.test.js | ✓ covered |
| src/handoff-validator.js | tests/handoff-validator.test.js | ✓ covered |
| src/harness/circuit-breaker.js | tests/harness/circuit-breaker.test.js | ✓ covered |
| src/install-animation.js | tests/install-animation.test.js | ✓ covered |
| src/install-profile.js | tests/install-profile.test.js | ✓ covered |
| src/install-wizard.js | tests/install-wizard.test.js | ✓ covered |
| src/installer.js | tests/installer.test.js | ✓ covered |
| src/locales.js | tests/locales.test.js | ✓ covered |
| src/onboarding.js | tests/onboarding.test.js | ✓ covered |
| src/path-guard.js | tests/path-guard.test.js | ✓ covered |
| src/preflight-engine.js | tests/preflight-engine.test.js | ✓ covered |
| src/prompt-tool.js | tests/prompt-tool.test.js | ✓ covered |
| src/recovery-context-session.js | tests/recovery-context-session.test.js | ✓ covered |
| src/runtime-store.js | tests/runtime-store.test.js | ✓ covered |
| src/sandbox.js | tests/sandbox.test.js | ✓ covered |
| src/squad/agent-teams-adapter.js | tests/agent-teams-adapter.test.js | ✓ covered |
| src/squad/brief-validator.js | tests/brief-validator.test.js | ✓ covered |
| src/squad/bus-bridge.js | tests/bus-bridge.test.js | ✓ covered |
| src/squad/context-compactor.js | tests/context-compactor.test.js | ✓ covered |
| src/squad/external-session.js | tests/external-session.test.js | ✓ covered |
| src/squad/hooks-generator.js | tests/hooks-generator.test.js | ✓ covered |
| src/squad/pattern-detector.js | tests/pattern-detector.test.js | ✓ covered |
| src/squad/squad-scaffold.js | tests/squad-scaffold.test.js | ✓ covered |
| src/squad/verify-gate.js | tests/verify-gate.test.js | ✓ covered |
| src/utils.js | tests/utils.test.js | ✓ covered |
| src/version.js | tests/version.test.js | ✓ covered |
| src/workflow-gates.js | tests/workflow-gates.test.js | ✓ covered |

## Risk priorities — Dossier feature gaps

### Critical (data integrity / business rules)
1. **feature-close auto-archive on PASS** — `tests/feature-close.test.js` does not verify that `runFeatureArchive` is invoked automatically when verdict is PASS, nor does it test `--no-archive` bypass.
2. **feature-archive status enforcement** — `tests/commands/feature-archive-dossier.test.js` seeds `features.md` with `done` status in every test; there is no test that archiving a non-done feature fails without `--force`.
3. **dossier:show malformed dossier handling** — `EDOSSIERPARSE` and `EDOSSIERSCHEMA` error branches in `runDossierShow` are not exercised.
4. **feature-close gate_execution frontmatter update** — existing QA sign-off replacement path and frontmatter `gate_execution` mutation are not verified.
5. **feature-archive belongsToOtherSlug collision** — no test for the slug-prefix collision logic that prevents mis-attribution of files.

### High (invariants / edge cases)
6. **dossier/store.parseFrontmatter edge cases** — missing frontmatter, unclosed frontmatter, invalid line are exported but never unit-tested.
7. **feature-archive restore dry-run** — restore path with `--dry-run` exists in source but is not tested.
8. **feature-close idempotency** — re-running `feature:close` with existing QA Sign-off block should replace it cleanly.

### Medium (specification drift)
9. **AC-F1-07 agent prompt dossier read** — conformance requires static analysis verifying that agent `.md` files reference `features/{slug}/dossier.md`; no test exists.
10. **Phase 2/3 conformance gaps** — `conformance-feature-dossier.yaml` defines AC-F2-* (revisions) and AC-F3-* (codemap/bootstrap), but the corresponding CLI commands (`revision:*`, `dossier:add-finding`, etc.) are **not implemented**. These represent specification drift, not coverage gaps.

## Orphan tests (no direct source mapping)

The following test files cover integration, cross-cutting, or architectural concerns rather than a single source file:

- `tests/agent-contracts.test.js` — kernel size and prompt contracts
- `tests/agents-command.test.js` — CLI agent orchestration
- `tests/context-core.test.js` — context system integration
- `tests/doctor-command.test.js` — doctor CLI integration
- `tests/dossier/golden-fixture.test.js` — dossier schema fixture
- `tests/harness/pentester-scenarios.test.js` — security scenarios
- `tests/integration/*.test.js` — end-to-end integration tests
- `tests/json-output.test.js` — JSON contract across commands
- `tests/live-command.test.js` — live session integration
- `tests/preflight-command.test.js` — preflight engine integration
- `tests/runtime-command.test.js` — runtime telemetry integration
- `tests/sdlc-process-upgrade-regression.test.js` — SDD regression
