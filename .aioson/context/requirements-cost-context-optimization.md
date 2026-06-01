---
feature: cost-context-optimization
classification: SMALL
status: in_progress
gate: A
analyst_date: 2026-06-01
source_prd: prd-cost-context-optimization.md
source_analysis: .aioson/docs/aioson-cost-optimization-analysis.md
---

# Requirements — AIOSON Cost/Context Optimization

## 1. Feature summary

Measurement-first cost/context optimization for AIOSON. This slice fixes feature state hygiene and separates audit reports so future prompt slimming, sharding, model tiering, and memory trimming decisions are based on trustworthy numbers.

## 2. Classification

Feature classification: **SMALL**.

Score:
- User types: 2 operator roles (maintainer + agent/operator) -> +1
- External integrations: 0 new integrations -> +0
- Business rule complexity: context/workflow/audit state rules are complex -> +2
- Total: 3 -> SMALL

Gate behavior: Gate A is required before @dev starts; Gate B is optional unless @dev introduces a new shared audit architecture beyond the existing command pattern.

## 3. New entities and fields

No database entities are introduced in this feature.

New structured output concepts:

| Concept | Field | Type | Nullable | Constraints |
|---|---|---:|---:|---|
| Audit scope | mode | enum | no | `runtime`, `template`, `inception` |
| Audit scope | roots | string[] | no | Repository-relative roots included in the scan |
| Audit file result | file | string | no | Repository-relative path |
| Audit file result | category | enum | no | For agents: `workspace_agent`, `template_agent`, `auto_loaded`; for skills: `builtin_skill`, `installed_skill`, `template_skill` |
| Audit file result | chars | number | no | Character count from UTF-8 content |
| Audit file result | tokens | number | no | `Math.ceil(chars / 4)` unless existing estimator changes globally |
| Audit file result | status | enum | no | `ok`, `over_target`, `over_hard` |
| Drift warning | id | string | no | Stable machine-readable id |
| Drift warning | severity | enum | no | `warning` for this slice |
| Drift warning | message | string | no | Human-readable explanation |
| Drift warning | suggested_command | string | yes | Present when the fix is deterministic |

## 4. Changes to existing artifacts and modules

| Area | Files | Required change |
|---|---|---|
| Feature registry lifecycle | `.aioson/context/features.md`, `.aioson/agents/product.md`, `template/.aioson/agents/product.md`, `.aioson/rules/spec-level-ownership.md`, template counterpart | Support `paused` as a non-blocking feature status. |
| Dossier lifecycle | `.aioson/context/features/{slug}/dossier.md`, `src/context-memory.js` behavior | Dossiers with `status: paused` must not be auto-included as active dossiers. Existing behavior already includes only `status: active`; tests should preserve it. |
| Workflow mode reset | `src/commands/workflow-next.js` | Rebuild stale workflow state when `workflow.state.json` mode/slug no longer matches `features.md`. |
| Agent audit scopes | `src/commands/agent-audit.js`, `src/cli.js`, tests | Add `--runtime-only`, `--template-only`, `--inception`; default remains backward-compatible inception-style scan unless explicitly changed. |
| Skill audit command | new `src/commands/skill-audit.js`, `src/cli.js`, tests | Add `aioson skill:audit` / `skill-audit` command with JSON and console output. |
| Context health drift | `src/commands/context-health.js`, tests | Add warnings for classification drift and active-state drift. |

## 5. Relationships

- `features.md` is the source of truth for the active feature slug: only `status: in_progress` is active.
- Feature dossiers use their own frontmatter status: only `status: active` is eligible for active dossier injection.
- `workflow.state.json` must match the current mode derived from `features.md`; otherwise it is stale and must be rebuilt.
- `project.context.md` owns project classification; `workflow.state.json` may own active feature classification. Reports must label both instead of collapsing them into one ambiguous value.
- `project-pulse.md` is a human recovery signal; it must not override `features.md`, but drift between both should be reported.

## 6. Migration additions

No database migrations.

Filesystem/data migration behavior:
- Existing `in_progress` rows remain unchanged unless explicitly paused/done/abandoned by an agent or user.
- `paused` rows remain in `features.md` and must not be archived automatically.
- Existing projects without `paused` continue to work.

## 7. Business rules

- **REQ-CCO-01 — Paused status lifecycle.** `features.md` accepts `paused`; `paused` means intentionally parked work that stays visible but does not block new feature creation.
- **REQ-CCO-02 — Active feature definition.** Only `status: in_progress` in `features.md` counts as active work for workflow routing and product blocking checks.
- **REQ-CCO-03 — Paused dossier exclusion.** A dossier with `status: paused` must not be auto-included by `context:pack` as an active feature dossier.
- **REQ-CCO-04 — Stale workflow reset.** `loadOrCreateState` must discard persisted workflow state when current mode or feature slug no longer matches `features.md`.
- **REQ-CCO-05 — Agent audit mode separation.** `agent:audit` must support `--runtime-only`, `--template-only`, and `--inception`, and JSON output must identify the selected mode and scan roots.
- **REQ-CCO-06 — Agent audit backward compatibility.** Running `agent:audit .` without a mode flag must preserve current behavior unless a deliberate CLI default change is documented.
- **REQ-CCO-07 — Skill audit parity.** `skill:audit` must report file count, chars, estimated tokens, target/hard status, and totals for skills.
- **REQ-CCO-08 — Skill audit scope separation.** `skill:audit` must distinguish `.aioson/skills`, `.aioson/installed-skills`, and `template/.aioson/skills`.
- **REQ-CCO-09 — Skill references accounting.** `skill:audit` must count `SKILL.md` separately from reference files so maintainers can see router cost vs lazy-loaded reference cost.
- **REQ-CCO-10 — Context classification drift warning.** `context:health` must warn when project classification and active workflow/feature classification differ, labeling both values.
- **REQ-CCO-11 — Feature/pulse active-state drift warning.** `context:health` must warn when `features.md` has an `in_progress` feature that does not match `project-pulse.md active_feature`, or when pulse names an active feature not marked `in_progress`.
- **REQ-CCO-12 — Drift warnings are advisory.** Drift warnings in this slice must not make `context:health` return `ok=false`.
- **REQ-CCO-13 — Test coverage.** All changed command behavior must have focused `node:test` coverage.

## 8. Acceptance criteria

- **AC-CCO-01:** Given a `features.md` row `| gemini-phaseout | paused | ... |`, when `@product` starts a new feature conversation, the integrity check does not block on that row.
- **AC-CCO-02:** Given a paused feature dossier with frontmatter `status: paused`, when `context:pack` runs for an unrelated goal, that dossier is not included as an active dossier.
- **AC-CCO-03:** Given `workflow.state.json` points to a feature and `features.md` has no `in_progress` feature, when `loadOrCreateState` runs, it rebuilds project-mode state.
- **AC-CCO-04:** Given `workflow.state.json` is project-mode and `features.md` has a new `in_progress` feature, when `loadOrCreateState` runs, it rebuilds feature-mode state for that slug.
- **AC-CCO-05:** Given `agent:audit . --runtime-only --json`, output includes workspace/runtime agent and root entrypoint surfaces only, not template duplicates.
- **AC-CCO-06:** Given `agent:audit . --template-only --json`, output includes template agent and template entrypoint surfaces only, not workspace duplicates.
- **AC-CCO-07:** Given `agent:audit . --inception --json`, output includes both template and workspace surfaces and reports `mode: "inception"`.
- **AC-CCO-08:** Given no mode flag, `agent:audit . --json` remains compatible with the current output shape or adds fields without removing existing `ok` and `files`.
- **AC-CCO-09:** Given `skill:audit . --json`, output includes totals for file count, chars, tokens, over-target, and over-hard.
- **AC-CCO-10:** Given a skill with `SKILL.md` and `references/*.md`, `skill:audit` reports router and reference costs separately.
- **AC-CCO-11:** Given project classification `MEDIUM` and active workflow classification `SMALL`, `context:health . --json` returns a drift warning with both values.
- **AC-CCO-12:** Given `features.md active = cost-context-optimization` and `project-pulse.md active_feature = project`, `context:health . --json` returns an active-state drift warning.
- **AC-CCO-13:** Given only advisory drift warnings, `context:health . --json` still returns `ok: true`.
- **AC-CCO-14:** Focused tests pass with `node --test` for workflow reset, agent audit scopes, skill audit, and context health drift.

## 9. Edge cases

- Multiple `in_progress` features in `features.md`: report drift/invalid state, but use first existing behavior unless a later command owns deterministic repair.
- Missing `project-pulse.md`: skip pulse drift warning; do not fail.
- Missing `workflow.state.json`: skip classification drift warning; do not fail.
- Missing `.aioson/installed-skills`: `skill:audit` should still succeed with other existing skill roots.
- No skill files found: `skill:audit` returns `ok=false`, `reason: no_files`, matching `agent:audit` style.
- Windows path separators: all JSON file paths should normalize to `/` for stable tests.
- Dirty inception workspace: audit modes must avoid double-counting unless `--inception` is selected.

## 10. Out of scope

- Prompt slimming for root `AGENTS.md` / `CLAUDE.md`.
- `agent:prompt --sharded` or automatic sharded agent activation.
- Provider/model cost controls.
- `memory:trim --target-bytes`.
- Gemini hard removal.
- A dedicated `aioson feature:pause` command; this may be a follow-up once lifecycle behavior is stable.

## 11. Implementation notes for @dev

Recommended order:
1. Keep the already landed paused lifecycle + workflow reset behavior as the first verified slice.
2. Implement `agent:audit` mode filtering with minimal changes to existing scanner functions.
3. Add `skill:audit` by reusing the audit helper shape where practical; avoid coupling it to install/list commands.
4. Extend `context:health` JSON with `driftWarnings: []` and console output with a short advisory block.
5. Add tests before widening command output.

Recommended focused suites:
- `node --test tests/workflow-next.test.js tests/workflow-next-pentester.test.js`
- `node --test tests/agent-audit.test.js tests/skill-audit.test.js tests/context-health.test.js`

