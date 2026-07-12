# Implementation Ledger - agent-execution-model-resolution

## Source Of Truth

PRD, requirements with 18 ACs, spec, design/readiness, implementation plan, dossier and executable harness listed in the machine ledger below.

## Intended Behavior Claims

- `CLAIM-001`: Codex model names resolve conservatively through exact, normalized, unique alias and safe fuzzy tiers while preserving numeric versions.
- `CLAIM-002`: `reasoning_effort` is separate, capability-checked and transported as an argv config value without shell interpolation or downgrade.
- `CLAIM-003`: dispatch, fallback, resume, reports, CLI and telemetry preserve requested/resolved/strategy/effort with fail-closed ambiguity.
- `CLAIM-004`: workspace/template schemas and docs remain additive and byte-identical for distributed surfaces.

## Implementation Evidence

Evidence is mapped per claim in the machine ledger. Focused tests, AC audit, lint and the complete repository suite are green.

## Verification Commands

- `npm run lint` — passed.
- focused Agent Execution suite — 137/137 passed.
- `aioson ac:test-audit` — 18/18 covered.
- `npm test` — 3735 passed, 1 skipped, 0 failed.

## Known Gaps

No implementation gaps. A live Codex entitlement smoke remains optional/manual by specification; offline fixtures verify behavior without depending on network or private rollout.

## Handoff Notes

Review ambiguity handling, numeric-token invariance, additive SQLite migration and the distinction between requested and resolved model. Gate D remains owned by QA.

## Machine Ledger

```json
{
  "schema_version": "implementation-ledger/v1",
  "feature_slug": "agent-execution-model-resolution",
  "source_artifacts": [
    {
      "type": "prd",
      "path": ".aioson/context/prd-agent-execution-model-resolution.md",
      "role": "product_authority"
    },
    {
      "type": "requirements",
      "path": ".aioson/context/requirements-agent-execution-model-resolution.md",
      "role": "acceptance_criteria"
    },
    {
      "type": "spec",
      "path": ".aioson/context/spec-agent-execution-model-resolution.md",
      "role": "living_memory"
    },
    {
      "type": "sheldon_enrichment",
      "path": ".aioson/context/sheldon-enrichment-agent-execution-model-resolution.md",
      "role": "product_review"
    },
    {
      "type": "design_doc",
      "path": ".aioson/context/design-doc-agent-execution-model-resolution.md",
      "role": "design_authority"
    },
    {
      "type": "readiness",
      "path": ".aioson/context/readiness-agent-execution-model-resolution.md",
      "role": "implementation_readiness"
    },
    {
      "type": "implementation_plan",
      "path": ".aioson/context/implementation-plan-agent-execution-model-resolution.md",
      "role": "execution_plan"
    },
    {
      "type": "dossier",
      "path": ".aioson/context/features/agent-execution-model-resolution/dossier.md",
      "role": "feature_dossier"
    },
    {
      "type": "harness",
      "path": ".aioson/plans/agent-execution-model-resolution/harness-contract.json",
      "role": "binary_criteria"
    },
    {
      "type": "harness_progress",
      "path": ".aioson/plans/agent-execution-model-resolution/progress.json",
      "role": "binary_criteria_state"
    },
    {
      "type": "harness_output",
      "path": ".aioson/plans/agent-execution-model-resolution/last-check-output.json",
      "role": "binary_criteria_output"
    }
  ],
  "claims": [
    {
      "id": "CLAIM-001",
      "summary": "Catalog-backed model resolution is deterministic, conservative and version-safe.",
      "kind": "required_behavior",
      "owner": "dev",
      "status": "implemented",
      "evidence": [
        { "path": "src/agent-execution/model-resolver.js", "type": "implementation" },
        { "path": "src/agent-execution/model-catalog.js", "type": "implementation" },
        { "path": "tests/agent-execution-model-resolver.test.js", "type": "test" },
        { "path": "tests/agent-execution-model-catalog.test.js", "type": "test" }
      ]
    },
    {
      "id": "CLAIM-002",
      "summary": "Reasoning effort is validated separately and passed to Codex without shell interpolation or downgrade.",
      "kind": "security_constraint",
      "owner": "dev",
      "status": "implemented",
      "evidence": [
        { "path": "src/agent-execution/adapters/codex.js", "type": "implementation" },
        { "path": "src/agent-execution/schema.js", "type": "implementation" },
        { "path": "tests/agent-execution-adapters.test.js", "type": "test" }
      ]
    },
    {
      "id": "CLAIM-003",
      "summary": "Execution and observability preserve requested and resolved model metadata across attempts and fallbacks.",
      "kind": "migration_or_data",
      "owner": "dev",
      "status": "implemented",
      "evidence": [
        { "path": "src/agent-execution/dispatcher.js", "type": "implementation" },
        { "path": "src/runtime-store.js", "type": "implementation" },
        { "path": "tests/agent-execution-telemetry-store.test.js", "type": "test" },
        { "path": "tests/agent-execution-resume.test.js", "type": "test" }
      ]
    },
    {
      "id": "CLAIM-004",
      "summary": "Distributed schemas and documentation remain additive and in workspace parity.",
      "kind": "scope_constraint",
      "owner": "dev",
      "status": "implemented",
      "evidence": [
        { "path": "template/.aioson/schemas/agent-execution.schema.json", "type": "implementation" },
        { "path": "template/.aioson/docs/autopilot-handoff.md", "type": "documentation" },
        { "path": "tests/agent-execution-cli.test.js", "type": "test" }
      ]
    }
  ],
  "known_gaps": [
    {
      "id": "GAP-001",
      "status": "not_applicable",
      "owner": "qa",
      "summary": "Live provider entitlement smoke is optional/manual; offline catalog fixtures are the release gate."
    }
  ],
  "verification_commands": [
    { "command": "npm run lint", "status": "passed" },
    { "command": "node --test tests/agent-execution-*.test.js", "status": "passed", "evidence": "137 passed" },
    { "command": "aioson ac:test-audit . --feature=agent-execution-model-resolution --json", "status": "passed", "evidence": "18/18 covered" },
    { "command": "npm test", "status": "passed", "evidence": "3735 passed, 1 skipped, 0 failed" }
  ]
}
```
