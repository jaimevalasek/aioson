---
feature: quality-governance-baseline-and-new-regression-gate
status: approved
created_by: pm
created_at: 2026-06-02T00:00:00-03:00
classification: SMALL
gate: C
gate_status: approved
---

# Implementation Plan — Quality Governance Baseline and New Regression Gate

## Gate C Summary
Gate C is approved for a SMALL feature with an explicit execution plan because the active workflow is blocking @dev on a plan artifact. Gate A is approved in `requirements-quality-governance-baseline-and-new-regression-gate.md`; the PRD and Sheldon enrichment fix the product boundary; selective design guidance comes from the existing CLI command architecture and governance docs.

## Required Context Package
@dev must load only:

1. `.aioson/context/project.context.md`
2. `.aioson/context/spec-quality-governance-baseline-and-new-regression-gate.md`
3. `.aioson/context/requirements-quality-governance-baseline-and-new-regression-gate.md`
4. `.aioson/context/sheldon-enrichment-quality-governance-baseline-and-new-regression-gate.md`
5. `.aioson/context/dev-state.md`

Optional only when needed for structural choices: `.aioson/design-docs/folder-structure.md`, `.aioson/design-docs/code-reuse.md`, `.aioson/design-docs/naming.md`.

## Pre-Taken Decisions
- The MVP command surface is only `aioson quality:audit` plus alias `quality-audit`.
- AIOSON owns the normalized result contract; Fallow is only the first provider.
- Missing provider, malformed provider output, config/runtime uncertainty, missing baseline, or docs-only/no-code scope returns `warn`, not `fail`.
- Confirmed new regression in changed code returns `fail`; baseline-only debt remains visible and non-blocking.
- Workflow-facing evidence is Markdown at `.aioson/context/quality-report-{slug}.md`.
- Provider raw JSON must not be written as an undocumented `.aioson/context/*.json` artifact.
- The command must not auto-install Fallow or any provider dependency.

## Execution Sequence
| Phase | Scope | Primary files | Done criteria |
|---|---|---|---|
| 1 | Result contract and normalization | `src/lib/quality/*.js`, `tests/quality-audit.test.js` or focused equivalent | Unit tests prove normalized result has `status`, `mode`, `provider`, `scope`, `baseline_ref`, `findings`, `summary`, and `advisory`; Fallow-like fixture does not leak as primary schema. |
| 2 | Baseline/new comparison and changed-file scope | `src/lib/quality/*.js`, test fixtures under `tests/fixtures/quality/` | Tests cover pass, warn, fail, baseline-only, and newly introduced finding behavior. |
| 3 | CLI command and report writer | `src/commands/quality-audit.js`, `src/cli.js`, report writer module if needed | `node bin/aioson.js quality:audit . --json` returns parseable JSON with `ok` and result status; help/registry exposes `quality:audit` or `quality-audit`; report path is Markdown-first. |
| 4 | Governance evidence and handoff proof | report writer/tests, `.aioson/context/quality-report-quality-governance-baseline-and-new-regression-gate.md` when command runs | Report lists status, provider summary, baseline summary, new-regression summary, governance sources considered, limitations, and avoids secrets/raw env values. |

## Checkpoints
- After Phase 1: update `spec-quality-governance-baseline-and-new-regression-gate.md` with the final normalized contract module path and focused test command.
- After Phase 2: record baseline comparison decisions and covered edge cases in the spec.
- After Phase 3: record CLI registration details and the report artifact path in the spec.
- After Phase 4: run the focused tests plus the command smoke check, then update Gate D checkpoint evidence for @qa.

