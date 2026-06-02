# Quality Audit Report — quality-governance-baseline-and-new-regression-gate

Generated: 2026-06-02T04:48:13.164Z
Status: warn
Mode: changed-code

## Provider
- Name: fallow
- Version: unknown
- Command: fallow

## Scope
- Changed paths considered: .aioson/agents/dev.md, .aioson/agents/deyvin.md, .aioson/agents/discovery-design-doc.md, .aioson/briefings/config.md, .aioson/context/architecture.md, .aioson/context/bootstrap/current-state.md, .aioson/context/bootstrap/what-it-does.md, .aioson/context/dev-state.md, .aioson/context/features.md, .aioson/context/handoff-protocol.json, .aioson/context/last-handoff.json, .aioson/context/parallel/agent-1.status.md, .aioson/context/parallel/agent-2.status.md, .aioson/context/parallel/agent-3.status.md, .aioson/context/parallel/agent-4.status.md, .aioson/context/parallel/merge-plan.json, .aioson/context/parallel/ownership-map.json, .aioson/context/parallel/shared-decisions.md, .aioson/context/parallel/workspace.manifest.json, .aioson/context/prd.md, .aioson/context/project-pulse.md, .aioson/context/sheldon-enrichment.md, .aioson/context/workflow.events.jsonl, .aioson/context/workflow.state.json, src/agents.js, src/cli.js, src/commands/artifact-validate.js, src/commands/preflight.js, src/commands/workflow-execute.js, src/commands/workflow-next.js, src/commands/workflow-status.js, src/handoff-contract.js, src/i18n/messages/en.js, src/i18n/messages/es.js, src/i18n/messages/fr.js, src/i18n/messages/pt-BR.js, src/preflight-engine.js, template/.aioson/agents/dev.md, template/.aioson/agents/deyvin.md, template/.aioson/agents/discovery-design-doc.md, template/.aioson/skills/process/aioson-spec-driven/references/dev.md, tests/artifact-validate.test.js, tests/preflight-command.test.js, tests/preflight-engine.test.js, tests/workflow-engine-e2e.test.js, tests/workflow-engine-hardening.test.js, tests/workflow-execute.test.js, tests/workflow-next-pentester.test.js, tests/workflow-next.test.js, tests/workflow-status.test.js, .aioson/briefings/fallow-quality-governance/briefings.md, .aioson/context/features/quality-governance-baseline-and-new-regression-gate/dossier.md, .aioson/context/implementation-plan-quality-governance-baseline-and-new-regression-gate.md, .aioson/context/prd-quality-governance-baseline-and-new-regression-gate.md, .aioson/context/qa-report-project-design-governance.md, .aioson/context/qa-report-quality-governance-baseline-and-new-regression-gate.md, .aioson/context/quality-report-quality-governance-baseline-and-new-regression-gate.md, .aioson/context/readiness.md, .aioson/context/requirements-quality-governance-baseline-and-new-regression-gate.md, .aioson/context/sheldon-enrichment-quality-governance-baseline-and-new-regression-gate.md, .aioson/context/spec-quality-governance-baseline-and-new-regression-gate.md, .aioson/context/ui-spec.md, src/commands/quality-audit.js, src/lib/quality/provider.js, src/lib/quality/report.js, src/lib/quality/result.js, tests/quality-audit.test.js
- Baseline reference: none

## Summary
- Total findings: 0
- By classification: baseline: 0, new: 0, unknown: 0
- By severity: advisory: 0, medium: 0, high: 0, critical: 0
- By category: none

## Governance Sources Considered
- .aioson/context/design-doc.md
- .aioson/design-docs/agent-loading-contract.md
- .aioson/design-docs/code-reuse.md
- .aioson/design-docs/componentization.md
- .aioson/design-docs/file-size.md
- .aioson/design-docs/folder-structure.md
- .aioson/design-docs/naming.md
- .aioson/design-docs/squad-self-improving-roadmap.md
- .aioson/rules/README.md
- .aioson/rules/agent-language-policy.md
- .aioson/rules/agent-structural-contract.md
- .aioson/rules/aioson-context-boundary.md
- .aioson/rules/aioson-play-conventions.md
- .aioson/rules/canonical-path-contract.md
- .aioson/rules/data-format-convention.md
- .aioson/rules/disk-first-artifacts.md
- .aioson/rules/example-monetary-values.md
- .aioson/rules/output-brevity.md
- .aioson/rules/prd-section-ownership.md
- .aioson/rules/security-baseline.md
- .aioson/rules/simple-plan-lane.md
- .aioson/rules/spec-level-ownership.md
- .aioson/rules/squad-driver-pattern.md

## Findings
- No provider findings were normalized.

## Advisory
- Provider `fallow` was not found locally. quality:audit does not auto-install providers.

## Limitations
- This MVP gates confirmed new regressions in changed code only.
- Baseline findings remain visible but are not accepted as resolved debt.
- Provider raw JSON is not written to `.aioson/context/` by this command.