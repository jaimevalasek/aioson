---
target_prd: .aioson/context/prd-quality-governance-baseline-and-new-regression-gate.md
feature: quality-governance-baseline-and-new-regression-gate
classification: SMALL
round_count: 1
last_enrichment_date: 2026-06-02
readiness: ready_for_downstream
plan_path: null
sizing_score: 3
sizing_decision: in-place
sources_used:
  - .aioson/briefings/fallow-quality-governance/briefings.md
  - researchs/fallow-rs-ai-agent-code-quality-2026/summary.md
  - researchs/fallow-rs-ai-agent-code-quality-2026/files/fallow-docs-agent-integration.md
  - researchs/fallow-rs-ai-agent-code-quality-2026/files/fallow-docs-hooks.md
  - .aioson/rules/agent-structural-contract.md
  - .aioson/rules/aioson-context-boundary.md
  - .aioson/rules/canonical-path-contract.md
  - .aioson/rules/data-format-convention.md
  - .aioson/rules/disk-first-artifacts.md
  - .aioson/rules/prd-section-ownership.md
  - .aioson/context/design-doc.md
  - .aioson/design-docs/agent-loading-contract.md
  - .aioson/design-docs/folder-structure.md
  - .aioson/design-docs/componentization.md
  - .aioson/design-docs/code-reuse.md
  - .aioson/design-docs/naming.md
  - .aioson/design-docs/file-size.md
improvements_applied:
  - Enrichment report written; PRD not modified yet because @sheldon requires explicit selection before applying changes.
  - Applied P0/P1 recommendations to PRD in place after user confirmation.
improvements_discarded: []
---

# Sheldon Enrichment — Quality Governance Baseline and New Regression Gate

## Verdict
The PRD deserves enrichment, but it does not need an external phased Sheldon plan. The current scope is correctly SMALL: one experimental command family, one quality result contract, baseline-aware behavior, and first QA evidence integration.

The strongest enrichment is not "add more Fallow." The strongest enrichment is to connect Fallow-style deterministic analysis to AIOSON's existing governance layers:

- `.aioson/rules/` defines agent and project policy.
- `.aioson/docs/` defines persistent technical/process references.
- `.aioson/design-docs/` defines structural code governance.
- `.aioson/context/` remains the Markdown-first artifact surface.
- Gate D consumes evidence instead of relying on agent judgment.

## Sizing
- Main entities above 3: +0
- Distinct delivery phases above 1: +0
- External integrations: +1 for Fallow as first provider
- User flows above 3: +0
- Acceptance criteria complexity above 10: +2 expected after @analyst
- Total: 3

Decision: Path A — enrich PRD in place. No external `.aioson/plans/{slug}/` package is justified.

## Critical Gaps

### P0 — Quality result contract must be AIOSON-owned
Current PRD says "AIOSON-native quality result contract," but the contract needs a clearer boundary: AIOSON owns the normalized result shape; Fallow is only the first provider.

Recommended PRD enrichment:
- Add that provider output is normalized into an AIOSON result with `status`, `mode`, `provider`, `scope`, `baseline_ref`, `findings`, `summary`, and `advisory`.
- Require `pass`, `warn`, and `fail` semantics:
  - `pass`: no confirmed new regression.
  - `warn`: analyzer/config/runtime uncertainty or baseline-only debt.
  - `fail`: confirmed new regression in changed code.
- Require provider raw output to be preserved outside the human PRD/spec flow when needed, while the context artifact remains Markdown-first.

Why this matters: without this contract, implementation will leak Fallow's schema directly into AIOSON and make future providers harder.

### P0 — Artifact path must respect Markdown-first context rules
The PRD currently leaves the report path open. This matters because `.aioson/context/` prohibits arbitrary `.json` except listed exceptions.

Recommended PRD enrichment:
- Human/agent report: `.aioson/context/quality-report-{slug}.md`
- Optional machine result, if required by implementation: either add a narrowly listed exception later or keep provider JSON under a runtime/cache location, not as a new undocumented `.aioson/context/*.json`.
- @analyst should decide whether this feature needs a new allowed machine-readable exception. Default should be Markdown report first.

Why this matters: this feature is about governance; it should not violate the context boundary while adding a quality boundary.

### P0 — Rules and design-docs should be inputs, not generated config in MVP
The briefing correctly says broad design-doc-to-config generation is out of scope. The PRD should preserve that. However, the MVP should still read the governance files as policy inputs.

Recommended PRD enrichment:
- `quality:audit` should report which governance sources were considered, at minimum:
  - universal `.aioson/rules/*.md`
  - agent-relevant quality/governance rules
  - `.aioson/context/design-doc.md`
  - structural `.aioson/design-docs/*.md`
- MVP should not auto-generate `.fallowrc` or broad ignores from those docs.
- MVP may provide advisory mapping such as "this finding relates to file-size/componentization/code-reuse governance."

Why this matters: this makes the feature additive to AIOSON's existing rule/doc/design-doc model instead of creating a parallel governance system.

### P0 — Gate D integration must be evidence-first and initially advisory
The PRD asks whether @qa integration should be advisory or blocking. For the first implementation, the safer answer is advisory evidence with fail-capable command semantics.

Recommended PRD enrichment:
- `quality:audit` itself can return fail for confirmed new regressions.
- @qa Gate D should cite the result and mark quality evidence as PASS/WARN/FAIL.
- The first PRD should not require Gate D to hard-block every feature globally until the command has proved low false-positive rates.
- For this feature's own QA, confirmed new regressions in changed code should fail.

Why this matters: AIOSON has existing debt. A global hard gate too early would create friction and false confidence.

## Important Improvements

### P1 — Dependency strategy should be explicit
The PRD asks whether to install Fallow, use `npx`, or discover a local/global binary. The implementation should not rely on repeated `npx` during gates because previous research already observed contention/risk.

Recommended PRD enrichment:
- Prefer an explicit provider resolution order:
  1. configured local project binary
  2. installed dependency
  3. documented fallback command
- Treat provider missing/config error as `warn`, not `fail`, unless the feature itself is testing the provider path.
- Avoid auto-installing provider dependencies during `quality:audit`.

### P1 — Baseline must be versioned and explainable
The PRD says baseline existing debt, but not how baseline drift is recognized.

Recommended PRD enrichment:
- Baseline should include provider name/version, generated date, repo scope, command used, and summary counts.
- New-regression comparison should be deterministic enough for tests.
- Baseline should not normalize debt as acceptable; it is a migration aid.

### P1 — Dev/QA prompts should receive clear reporting language
The PRD says document @dev/@qa handoff behavior. This should become acceptance criteria later:
- @dev reports `quality:audit`: pass/warn/fail plus report path.
- @qa checks report existence and status when the feature touched code.
- Neither agent should infer dead code/duplication manually when a quality report exists.

## Refinements

### P2 — Name the command surface conservatively
Keep MVP to `aioson quality:audit`. Defer `quality:health`, `quality:dead-code`, `quality:baseline`, and `quality:gate` unless @analyst finds they are required to satisfy the MVP.

Rationale: adding five commands at once will make the slice bigger than SMALL and increase docs/tests surface.

### P2 — Align implementation with existing command patterns
Recommended likely locations for downstream agents to evaluate:
- `src/commands/quality-audit.js` for command handler
- `src/lib/quality/` or similar only if the analyzer/result logic needs isolated tests
- `tests/quality-audit.test.js` for baseline/new-regression command behavior
- `src/cli.js` parser/help/JSON command registration

This follows the existing `src/commands/*.js` pattern and design-doc naming rules.

## Research and Freshness
No new web search was needed. The cached research was created on 2026-06-02 and is fresh under the 7-day research-cache rule.

Actionable research finding already incorporated:
- Fallow is a strong first Node.js/JS provider, but the AIOSON integration should own the normalized contract and use baseline/new-only adoption first.

## Gate A Notes for @analyst
@analyst should convert the PRD plus this enrichment into requirements with stable IDs. Suggested requirement clusters:

- Quality result contract
- Provider resolution and execution
- Baseline storage/consumption
- New-regression comparison
- Report artifact policy
- @dev/@qa evidence integration
- Failure semantics and tests

Gate A should not pass until acceptance criteria are independently verifiable for pass/warn/fail and baseline-vs-new behavior.

## Recommended PRD Updates Applied
Applied to the PRD after user confirmation:

1. Add a Sheldon section under `## MVP scope` clarifying the AIOSON-owned result contract and pass/warn/fail semantics.
2. Add a Sheldon section under `## Out of scope` explicitly excluding auto-generated `.fallowrc`, broad ignores, and additional `quality:*` commands beyond `quality:audit`.
3. Add a Sheldon section under `## User flows` for governance-source-aware audit.
4. Add a Sheldon section under `## Success metrics` for baseline/new-regression fixture coverage and QA evidence citation.
5. Add a `## Reference sources (sheldon)` section linking the briefing, research cache, Fallow docs, and applicable AIOSON governance docs.

## Downstream Path
Recommended next path:

`@analyst` -> `@architect` -> `@dev` -> `@qa`

Reason: the feature is SMALL and needs Gate A requirements plus selective architecture before implementation.
