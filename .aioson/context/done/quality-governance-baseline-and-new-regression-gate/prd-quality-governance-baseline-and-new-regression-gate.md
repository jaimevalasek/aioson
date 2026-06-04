---
briefing_source: fallow-quality-governance
classification: SMALL
status: draft
created_at: 2026-06-02
---

# PRD — Quality Governance Baseline and New Regression Gate

## Vision
Give AIOSON agents deterministic quality evidence after code changes, starting with a narrow baseline plus new-regression gate that improves maintainability without blocking progress on existing debt.

## Problem
AIOSON already tells agents how code should be structured, but it does not consistently require proof that an implementation avoided dead code, duplicated logic, dependency drift, or structural regressions. This leaves @dev and @qa dependent on focused tests and manual review, while repo-wide maintainability can quietly degrade.

## Users
- AIOSON framework maintainer: needs objective evidence that a change did not add new quality regressions.
- @dev / @deyvin agent: needs machine-readable findings that can guide fixes after editing code.
- @qa agent: needs structured quality evidence as part of Gate D without turning legacy debt into a false blocker.

## MVP scope
### Must-have 🔴
- Define an AIOSON-native quality result contract for analyzer output, including status, severity, changed-file scope, finding path/line when available, action guidance, and whether the issue is baseline or new.
- _(sheldon)_ The quality result contract is owned by AIOSON. Fallow is the first Node.js/JavaScript provider, but provider output must be normalized into an AIOSON shape with `status`, `mode`, `provider`, `scope`, `baseline_ref`, `findings`, `summary`, and `advisory`.
- _(sheldon)_ Status semantics must be explicit: `pass` means no confirmed new regression, `warn` means analyzer/config/runtime uncertainty or baseline-only debt, and `fail` means confirmed new regression in changed code.
- Add an experimental `aioson quality:audit` command focused on changed-code/new-regression checks.
- Use Fallow as the first Node.js/JavaScript provider for the AIOSON repository, while keeping the product framing provider-aware rather than Fallow-only.
- Record or consume a baseline of existing repo debt so legacy findings are visible but do not fail the first gate.
- _(sheldon)_ Baseline metadata must include provider name/version, generated date, repo scope, command used, and summary counts. Baselines are migration aids, not acceptance of debt.
- Gate only new regressions in changed code for the MVP.
- Produce a structured Markdown/JSON-adjacent report path that @qa can cite in Gate D evidence without inventing findings from context-window reading.
- _(sheldon)_ Human/agent-facing evidence should default to `.aioson/context/quality-report-{slug}.md`. Any provider raw JSON must stay outside `.aioson/context/` unless a future phase explicitly adds a machine-readable exception.
- _(sheldon)_ `quality:audit` should report which governance sources were considered: universal/relevant `.aioson/rules/*.md`, `.aioson/context/design-doc.md`, and relevant `.aioson/design-docs/*.md`.

### Should-have 🟡
- Add clear pass/warn/fail semantics: pass for no new regression, warn for analyzer runtime/config uncertainty, fail for confirmed new quality regression.
- Include guidance for intentional exceptions, but only as a narrow documented path; no broad ignore generation in the MVP.
- Add tests around command behavior, baseline handling, and fail-open/fail-closed semantics.
- Document how @dev and @qa should report quality audit evidence in their handoffs.
- _(sheldon)_ Provider execution should avoid auto-installing dependencies during gates. Prefer configured/local binary or installed dependency, with missing/config errors represented as `warn` unless the provider path itself is under test.

## Out of scope
- Repo-wide hard blocking on all current dead code or health findings.
- Full multi-language analyzer abstraction for Python, Rust, PHP, or frontend frameworks.
- Automatic deletion, refactor, or suppression of analyzer findings.
- Broad generation of analyzer config from `.aioson/design-docs/`.
- _(sheldon)_ Auto-generating `.fallowrc`, broad ignore lists, or analyzer suppressions from rules/design-docs.
- _(sheldon)_ Additional `quality:*` commands beyond `quality:audit`, unless @analyst proves they are required for this MVP.
- Pre-commit/pre-push hooks as a required default.
- Replacing existing SDD gates, `preflight`, or `qa` flows.

## User flows
### Changed-code audit
Maintainer or agent runs `aioson quality:audit` after a code change -> AIOSON invokes the configured Node.js analyzer provider -> AIOSON maps findings into its quality result contract -> the command reports pass/warn/fail based only on new regressions in changed code.

### Baseline-aware review
Agent runs the audit in a repo with existing debt -> AIOSON separates baseline findings from new findings -> existing debt remains visible for future cleanup -> the current feature is blocked only if it introduced confirmed new regression.

### QA evidence capture
@qa reviews a completed feature -> @qa consumes the quality audit result as Gate D supporting evidence -> @qa reports whether the feature added new structural quality risk.

### Governance-source-aware audit _(sheldon)_
Agent runs `aioson quality:audit` -> AIOSON loads applicable governance sources -> audit output maps findings back to relevant governance categories such as file size, componentization, naming, reuse, context boundary, and agent structural contract -> @dev/@qa can cite the specific governance source instead of relying on generic quality language.

## Success metrics
- New-regression signal quality: at least one intentional test fixture can distinguish baseline debt from newly introduced findings.
- Workflow usability: @dev/@qa can cite a quality audit result without manual parsing of raw analyzer output.
- Adoption safety: existing repo-wide debt does not block the first feature run.
- Regression prevention: confirmed new dead-code/duplication/dependency findings in changed code produce a failing or actionable result.
- _(sheldon)_ Baseline fixture coverage: tests demonstrate that the same finding is treated differently when it is baseline debt vs newly introduced in changed code.
- _(sheldon)_ QA evidence citation: a QA report can cite `.aioson/context/quality-report-{slug}.md` and its pass/warn/fail status.

## Open questions
- What exact file path should store the quality audit report while respecting `.aioson/context/` Markdown-first rules?
- Should `fallow` be added as a project dependency, invoked through `npx`, or discovered as an optional local/global tool?
- What minimum Fallow config is accurate for AIOSON's dynamic CLI surfaces, tests, templates, and generated files without broad ignores?
- Should the first @qa integration be advisory evidence only, or should Gate D fail on confirmed new regressions immediately?
- What is the narrowest acceptable format for intentional exceptions in the MVP?

## Reference sources (sheldon)
- `.aioson/briefings/fallow-quality-governance/briefings.md`
- `researchs/fallow-rs-ai-agent-code-quality-2026/summary.md`
- `researchs/fallow-rs-ai-agent-code-quality-2026/files/fallow-docs-agent-integration.md`
- `researchs/fallow-rs-ai-agent-code-quality-2026/files/fallow-docs-hooks.md`
- `.aioson/rules/agent-structural-contract.md`
- `.aioson/rules/aioson-context-boundary.md`
- `.aioson/rules/canonical-path-contract.md`
- `.aioson/rules/data-format-convention.md`
- `.aioson/rules/disk-first-artifacts.md`
- `.aioson/context/design-doc.md`
- `.aioson/design-docs/agent-loading-contract.md`
- `.aioson/design-docs/folder-structure.md`
- `.aioson/design-docs/componentization.md`
- `.aioson/design-docs/code-reuse.md`
- `.aioson/design-docs/naming.md`
- `.aioson/design-docs/file-size.md`
