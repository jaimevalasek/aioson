---
generated_at: "2026-06-27T00:00:00-03:00"
agent: scope-check
scope: latest-implementations-efficiency-audit
status: pass_with_warnings
---

# AIOSON Efficiency / Architecture Audit — 2026-06-27

## Scope

Reviewed recent changes after `v1.33.1` (`v1.33.1-10-g1a64099`), focusing on efficiency, workflow delivery, runtime safety gates, sync portability, live-session reconciliation, and whether promised behavior is mechanically enforced.

## Verdict

The latest implementation set is broadly functional and well covered. The core claims are backed by deterministic code paths and tests:

- Lean/full-merged lanes are opt-in config/prompt capabilities, not a risky rewrite of default routing.
- Runtime-surface safety improved materially through `RG-*` contract-integrity gates.
- `feature:close` and `workflow:next --complete=dev|qa` now block detectable runtime features with missing/weak harness contracts.
- `sync:agents` no longer depends on `rsync` and preserves managed gateway blocks.
- Windows live PID reconciliation has a specific `tasklist` fallback.

Validation run:

- `node --test tests/harness-contract-integrity.test.js tests/sync-agents-copy.test.js tests/feature-close.test.js tests/agent-operations.test.js tests/handoff-contract-sheldon.test.js tests/agent-contracts.test.js tests/harness-commands.test.js` — PASS, 98/98.
- `npm run lint` — PASS.
- `npm test` — PASS, 3417/3418 with 1 skipped.
- `aioson context:validate . --json` — PASS.
- `aioson workflow:status . --json` — workflow complete, no pending stage.
- `aioson doctor . --json` — overall `ok: true`, but 3 warning checks need hygiene.

## Findings

### Medium — Harness commands are registered but hidden from global help

`src/cli.js` registers and dispatches `harness:init`, `harness:validate`, `harness:apply-validation`, `harness:approve`, `harness:reject`, and `harness:status`; the i18n messages also define at least `help_harness_init` and `help_harness_validate`.

But the global help printer currently emits only:

- `help_harness_check`
- `help_harness_retro`
- `help_harness_preview`

Impact: the new contract gate recommends `aioson harness:init`, and the command works, but users discovering the CLI through `aioson --help` will not see the setup/validation lifecycle. This is an operability bug, not a runtime blocker.

Recommended fix: add the missing harness help lines to the global help sequence and add a regression asserting that `--help` includes the full harness lifecycle.

### Medium — HEAD has unreleased behavior while package/context remain `1.33.1`

`git describe` reports `v1.33.1-10-g1a64099`. `package.json` and `.aioson/context/project.context.md` still report `1.33.1`.

Impact: fine for local dogfood, but not publish-ready. Publishing from current HEAD without a version bump would collide with the existing `v1.33.1` package/version semantics, and downstream users would not have a clear boundary for the new lean/runtime-gate behavior.

Recommended fix: before release, bump to the next patch/minor, update changelog/release metadata, and tag HEAD.

### Low — Doctor reports memory/permissions hygiene warnings

`aioson doctor . --json` is overall healthy, but reports:

- 17 stale rules beyond the threshold.
- 27 closed features vs 4 distillations.
- missing native permission files: `.codex/permissions.json`, `.claude/settings.json`, `.opencode/permissions.yaml`.

Impact: not a functional failure, but it works against the efficiency goal: stale rules add retrieval noise, delayed distillation weakens learning, and missing permission materialization may reduce cross-tool consistency.

Recommended fix: run a deliberate memory/permission hygiene pass, not ad hoc cleanup.

## Architecture Assessment

The recent direction is strong:

- It moves correctness from prompt promises into deterministic gates.
- It reduces workflow cost with opt-in lanes instead of weakening the default chain.
- It keeps dangerous automation bounded: external auditor runners are opt-in, `feature:close` remains human-gated, and runtime smoke evidence is required where the framework can prove a runtime surface.
- It preserves inception-mode parity by updating both workspace and template prompts/docs.

The main residual risk is detection coverage. The CLI deterministically detects prototype manifests and migration/Prisma evidence, but target-app-only runtime signals such as Play `manifest.json.has_api` remain delegated to `@validator`. That is acceptable as documented, but it should be treated as a known boundary.

## Improvement Path For High-Quality Vibe Coding

1. Make the lean lane the recommended default for normal bounded work, while keeping the full lane for sensitive or multi-domain features.
2. Promote the runtime gate from "contract shape" to "golden path harness" by shipping reusable smoke templates per stack: Node CLI, web app, API, AIOSON Play app.
3. Add a release-readiness gate that checks `git describe`, `package.json`, context version, changelog entry, help coverage, and template/workspace parity.
4. Convert doctor hygiene into an explicit monthly/feature-close operation: rule archival proposals, distillation backlog, permission sync.
5. Add a tiny "vibe intake hardener": given an exploratory request, produce the lean-lane PRD skeleton, ACs, risk flags, and required runtime gates before coding.
6. Eventually enforce isolated write scopes/worktrees for parallel lanes; current state still acknowledges this as the next hard autonomy gap.

## Bottom Line

The system is functional and the latest efficiency work is directionally correct. The quality bar is now limited less by missing tests and more by release hygiene, command discoverability, and expanding runtime-signal detection/harness templates.
