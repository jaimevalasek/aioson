---
feature: quality-governance-baseline-and-new-regression-gate
classification: SMALL
source_prd: .aioson/context/prd-quality-governance-baseline-and-new-regression-gate.md
source_enrichment: .aioson/context/sheldon-enrichment-quality-governance-baseline-and-new-regression-gate.md
gate: A
gate_status: approved
created_at: 2026-06-02
---

# Requirements — Quality Governance Baseline and New Regression Gate

## Feature Summary
Add a narrow quality-governance MVP for AIOSON: one experimental `aioson quality:audit` command that normalizes Fallow-style analyzer output into an AIOSON-owned quality result, separates baseline debt from new regressions, and produces evidence that @dev/@qa can cite without turning existing repository debt into a global blocker.

## Classification

| Dimension | Score | Rationale |
|---|---:|---|
| User types | 0 | One operator type: AIOSON framework maintainer / agent workflow user. |
| External integrations | 1 | One external analyzer provider: Fallow as the first Node.js/JavaScript provider. |
| Business rules | 2 | Baseline vs new regression semantics, pass/warn/fail behavior, Markdown-first artifact boundary, provider resolution, QA evidence integration. |
| **Total** | **3** | **SMALL** |

Gate behavior: Gate A is required and approved by this artifact; Gate B is selective because the feature introduces a new command surface and provider boundary; Gate C is recommended but not MEDIUM-blocking.

## New Entities and Fields
This feature does not introduce database tables. It introduces command-facing data contracts and file artifacts.

### Quality Audit Result

| Field | Type | Nullable | Constraints |
|---|---|---|---|
| status | enum | no | `pass`, `warn`, `fail` |
| mode | enum | no | MVP: `changed-code`; future modes out of scope |
| provider | object | no | Includes provider `name`, `version` when available, and `command` used |
| scope | object | no | Includes changed paths considered and project root-relative scope |
| baseline_ref | string | yes | Identifier/path/hash of baseline used; null when no baseline was available |
| findings | array | no | Normalized findings; empty when status is `pass` |
| summary | object | no | Counts by status/severity/category and baseline/new classification |
| advisory | array | no | Non-blocking warnings, including provider missing/config/runtime uncertainty |

### Quality Finding

| Field | Type | Nullable | Constraints |
|---|---|---|---|
| id | string | no | Stable within the report; can be provider-derived or generated |
| source | enum | no | `provider`, `governance`, `adapter` |
| category | enum | no | MVP categories: `dead-code`, `duplication`, `dependency`, `complexity`, `architecture`, `governance`, `unknown` |
| severity | enum | no | `advisory`, `medium`, `high`, `critical` |
| classification | enum | no | `baseline`, `new`, `unknown` |
| path | string | yes | Project-root-relative path when available |
| line | number | yes | Positive integer when available |
| message | string | no | Human-readable short description |
| action | string | yes | Suggested next action when available |
| governance_refs | array | no | Relevant rules/design-docs such as file-size, componentization, context boundary |

### Quality Baseline Metadata

| Field | Type | Nullable | Constraints |
|---|---|---|---|
| provider_name | string | no | First provider: `fallow` |
| provider_version | string | yes | Captured when provider reports it |
| generated_at | ISO datetime | no | Creation time of the baseline |
| scope | string | no | Repo or module scope covered |
| command | string | no | Analyzer command used to generate the baseline |
| summary_counts | object | no | Counts by category/severity |
| baseline_id | string | no | Stable identifier used by audit comparison |

### Quality Report Artifact

| Field | Type | Nullable | Constraints |
|---|---|---|---|
| path | string | no | Default: `.aioson/context/quality-report-{slug}.md` |
| format | enum | no | `markdown` for MVP |
| raw_provider_output_path | string | yes | Must not be an undocumented `.aioson/context/*.json` file |
| status | enum | no | Mirrors Quality Audit Result status |

## Changes to Existing Entities

### CLI Command Registry
- Add a new JSON-capable command: `quality:audit` and alias `quality-audit`.
- Register the command in `src/cli.js` following existing command patterns.
- Command must support `--json`.

### Context Artifacts
- Add `.aioson/context/quality-report-{slug}.md` as a human/agent-facing Markdown report.
- Do not create new `.aioson/context/*.json` output unless a future architecture decision adds an explicit machine-readable exception.

### Agent Workflow Evidence
- @dev should report the quality audit status and report path after implementation slices that touch code.
- @qa should consume the report as Gate D supporting evidence and cite pass/warn/fail.

### Design Governance Consumption
- `quality:audit` should identify governance sources considered:
  - applicable `.aioson/rules/*.md`
  - `.aioson/context/design-doc.md`
  - relevant `.aioson/design-docs/*.md`
- The MVP maps findings to governance references; it does not auto-generate analyzer config, `.fallowrc`, suppressions, or broad ignore lists.

## Relationships
- `quality:audit` reads project context, applicable governance docs, optional baseline data, changed-code scope, and provider output.
- `quality:audit` writes or updates `.aioson/context/quality-report-{slug}.md`.
- `quality-report-{slug}.md` is read by @dev and @qa.
- Baseline metadata is consumed by `quality:audit` to distinguish legacy debt from new regressions.
- Provider raw output may be retained outside `.aioson/context/` for machine use, but the canonical workflow evidence is Markdown.

## Migration Additions
No database migration is required.

Recommended implementation order:
1. Add quality result normalization module and unit tests.
2. Add baseline/new-regression comparison logic and fixtures.
3. Add `quality:audit` command handler and CLI registration.
4. Add Markdown report writer.
5. Add @dev/@qa reporting guidance or docs references.

## Business Rules

- **REQ-QGBNRG-01 — AIOSON-owned result contract.** Analyzer output must be normalized into AIOSON's quality result contract before being exposed to agents.
- **REQ-QGBNRG-02 — First provider boundary.** Fallow is the first Node.js/JavaScript provider, but downstream code must not require PRD/spec consumers to understand Fallow's native schema.
- **REQ-QGBNRG-03 — Status semantics.** `pass`, `warn`, and `fail` must have deterministic meanings across CLI, report, @dev, and @qa.
- **REQ-QGBNRG-04 — Baseline separation.** Existing repo debt must be visible but must not fail the MVP gate unless it is newly introduced in changed code.
- **REQ-QGBNRG-05 — New regression gate.** Confirmed new regressions in changed code must produce `fail`.
- **REQ-QGBNRG-06 — Provider uncertainty behavior.** Missing provider, provider config errors, or provider runtime uncertainty must produce `warn`, not `fail`, unless the provider path itself is under test.
- **REQ-QGBNRG-07 — No auto-install during audit.** `quality:audit` must not auto-install Fallow or any provider dependency during gate execution.
- **REQ-QGBNRG-08 — Markdown-first report.** The workflow-facing report must be `.aioson/context/quality-report-{slug}.md`.
- **REQ-QGBNRG-09 — Context boundary protection.** Provider raw JSON must not be written to arbitrary `.aioson/context/*.json` files in the MVP.
- **REQ-QGBNRG-10 — Governance source mapping.** The audit report must list which rules/design-docs were considered and map relevant findings back to governance categories when possible.
- **REQ-QGBNRG-11 — No broad config generation.** The MVP must not auto-generate `.fallowrc`, broad ignore lists, analyzer suppressions, or quality policy files from rules/design-docs.
- **REQ-QGBNRG-12 — Single command MVP.** The MVP command surface is limited to `aioson quality:audit`; `quality:health`, `quality:dead-code`, `quality:baseline`, and `quality:gate` are out of scope.
- **REQ-QGBNRG-13 — QA evidence integration.** @qa must be able to cite the quality report path and status as Gate D supporting evidence.
- **REQ-QGBNRG-14 — Security baseline compatibility.** The feature must not process secrets into reports; command output must avoid leaking environment values or raw private config.

## Acceptance Criteria

- **AC-QGBNRG-01:** Given provider output in a fixture, the normalizer returns a Quality Audit Result with `status`, `mode`, `provider`, `scope`, `baseline_ref`, `findings`, `summary`, and `advisory`.
- **AC-QGBNRG-02:** Given native Fallow-like output, command-facing JSON does not expose Fallow-only schema as the primary contract.
- **AC-QGBNRG-03:** Given no confirmed new regressions, `quality:audit --json` returns status `pass`.
- **AC-QGBNRG-04:** Given provider missing or provider runtime/config uncertainty, `quality:audit --json` returns status `warn` and includes an advisory entry.
- **AC-QGBNRG-05:** Given a confirmed new regression in changed code, `quality:audit --json` returns status `fail`.
- **AC-QGBNRG-06:** Given the same finding exists only in baseline data, the audit report marks it as `baseline` and does not fail because of it.
- **AC-QGBNRG-07:** Given a finding newly appears in changed code compared with the baseline, the audit report marks it as `new`.
- **AC-QGBNRG-08:** Given `quality:audit` runs for feature `quality-governance-baseline-and-new-regression-gate`, it can write `.aioson/context/quality-report-quality-governance-baseline-and-new-regression-gate.md`.
- **AC-QGBNRG-09:** Given the report is written, it contains status, provider summary, baseline summary, new-regression summary, governance sources considered, and report limitations.
- **AC-QGBNRG-10:** Given provider raw JSON is produced, the MVP does not write it as an undocumented `.aioson/context/*.json` artifact.
- **AC-QGBNRG-11:** Given applicable rules/design-docs exist, the report lists the governance sources considered.
- **AC-QGBNRG-12:** Given a finding relates to file size, componentization, naming, reuse, context boundary, or agent structural contract, the report can include a governance reference for it.
- **AC-QGBNRG-13:** Given no local/configured provider is available, the command does not auto-install dependencies.
- **AC-QGBNRG-14:** Given `node bin/aioson.js quality:audit . --json`, output is parseable JSON and includes `ok` plus the quality result status.
- **AC-QGBNRG-15:** Given the CLI help is printed, `quality:audit` or `quality-audit` appears in the command list.
- **AC-QGBNRG-16:** Given @qa reviews the feature, the QA report can cite the quality report path and status.
- **AC-QGBNRG-17:** Given implementation touches code, tests cover pass, warn, fail, baseline-only, and new-regression behavior.
- **AC-QGBNRG-18:** Given command output includes environment/config context, it redacts secrets and does not print raw environment variable values.

## Edge Cases
- Provider binary is missing.
- Provider version cannot be determined.
- Provider exits non-zero due to config/runtime failure.
- Provider returns malformed JSON.
- Baseline file/reference is missing.
- Baseline exists but provider version differs.
- No changed files are detected.
- Changed files include only docs or non-code files.
- Findings have path but no line number.
- Findings refer to generated/template files that should not be auto-deleted.
- Governance docs are absent or empty.
- Multiple applicable governance docs point to the same finding.
- Existing `dev-state.md` belongs to another feature and must be ignored.

## Out of Scope for This Feature
- Creating a full multi-language provider abstraction.
- Adding `quality:health`, `quality:dead-code`, `quality:baseline`, or `quality:gate`.
- Making pre-commit/pre-push hooks mandatory.
- Adding a new machine-readable `.aioson/context/*.json` exception.
- Auto-generating `.fallowrc`, suppressions, broad ignores, or policy files.
- Automatically deleting, refactoring, or suppressing analyzer findings.
- Blocking all existing repo-wide debt.
- Changing SDD workflow routing beyond producing quality evidence for @dev/@qa.

## Gate A Evaluation
- Objectives are clear and unambiguous: approved.
- Expected behaviors are described: approved.
- Constraints and out of scope are explicit: approved.
- Open ambiguities are documented as implementation decisions: approved.
- Requirement IDs exist for business rules: approved.
- Acceptance criteria exist for behavioral requirements: approved.

Gate A: approved.
