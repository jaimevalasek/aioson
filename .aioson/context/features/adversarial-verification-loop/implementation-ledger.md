# Implementation Ledger - adversarial-verification-loop

## Source Of Truth

- `plans/adversarial-verification-loop/PILOT-SPEC.md` is the pilot contract for Slice 2.
- `plans/adversarial-verification-loop/IMPLEMENTATION-SLICES.md` defines Slice 7 as retro learning from verification reports and QA outcomes without auto-editing prompts.
- `plans/adversarial-verification-loop/SLICE-8-RUNTIME-TELEMETRY-AND-RETRO-PROMOTION.md` defines the follow-up for verification runtime telemetry plus human-approved retro promotion.
- `plans/adversarial-verification-loop/ACCEPTANCE-CRITERIA.md` defines the broader enterprise criteria; this slice covers the deterministic subset only.

Root `plans/` is intentionally pre-production source material. The operational dogfood artifacts for this slice live under `.aioson/context/features/adversarial-verification-loop/`.

## Intended Behavior Claims

- `CLAIM-001`: `aioson verify:implementation` is registered in the CLI and supports JSON mode.
- `CLAIM-002`: feature slugs and report/prompt paths are path-safe and cannot traverse outside the project root.
- `CLAIM-003`: `--prepare-ledger` and `--check-ledger` create and validate the implementation ledger without overwriting existing work.
- `CLAIM-004`: `--build-prompt` builds a bounded clean-auditor prompt package from source artifacts, git state, ledger claims, gaps, and verification commands.
- `CLAIM-005`: `--check-report=<path>` parses the `Machine Report` JSON block and rejects malformed or conflicting reports.
- `CLAIM-006`: strict policy routing maps implementation misses to `dev`, scope drift to `product`/`sheldon`, stale tests to `qa`, and security review to `pentester`.
- `CLAIM-007`: the Slice 2 pilot does not run external auditor models or claim self-certification.
- `CLAIM-008`: the behavior is covered by focused and full-suite tests.
- `CLAIM-009`: schema constants and validators are centralized in reusable helper APIs with fixture coverage for valid and invalid ledgers/reports.
- `CLAIM-010`: `@dev`, `@deyvin`, `@scope-check`, and `@qa` prompts now include trigger rules for preparing/validating implementation ledgers and consuming verification reports.
- `CLAIM-011`: agent contract tests lock the prompt trigger behavior and Deyvin remains under its kernel size budget.
- `CLAIM-012`: prompt package redaction masks secret-like values while avoiding known false positives such as `.aioson/skills/...` paths.
- `CLAIM-013`: prompt package generation enforces a character budget with compact/minimal fallback modes and reports the budget decision in JSON.
- `CLAIM-014`: evidence bundles include dirty worktree status, artifact summaries, preview budget metadata, and an ordered verification command plan.
- `CLAIM-015`: Slice 4 hardening is covered by focused tests and dogfood prompt generation.
- `CLAIM-016`: `--tool` mode is opt-in, allowlists Codex, Claude, and opencode, and rejects Gemini or unsafe model strings before ledger/prompt work.
- `CLAIM-017`: runner adapters perform tool detection and invoke tools with explicit timeout, max-output, model, and non-destructive permission contracts.
- `CLAIM-018`: runner output is stored under `verification-runs/`, valid reports are promoted to latest `verification-report.md`, and invalid runner output produces a durable system `INCONCLUSIVE` report.
- `CLAIM-019`: timeout, output limit, failed runner, malformed report, unsupported tool, and invalid model paths return `INCONCLUSIVE` with actionable reasons.
- `CLAIM-020`: Slice 5 runner behavior is covered by focused tests and documentation.
- `CLAIM-021`: `workflow:next` includes feature implementation ledgers and latest verification reports in `@scope-check` activation dependencies when they exist.
- `CLAIM-022`: `workflow:next --agent=scope-check --scope-mode=post-dev|post-fix|final` validates the latest local report with the existing parser/policy engine and injects a structured implementation verification briefing.
- `CLAIM-023`: workflow report consumption never runs `--tool`, keeps external auditors opt-in, preserves normal QA/pentester ownership on `PASS`, and surfaces blocking routes such as `@dev` without prose scraping.
- `CLAIM-024`: MICRO missing-report cases stay non-blocking by default, while explicit strict MEDIUM post-dev/final checks warn that final clean approval needs a valid report or N/A rationale.
- `CLAIM-025`: `@dev` and `@scope-check` prompts now encode the Slice 6 workflow consumption boundary and focused tests cover PASS, blocking, MICRO missing-report, and MEDIUM strict missing-report paths.
- `CLAIM-026`: `harness:retro` now mines schema-valid implementation verification reports as a first-class retrospective source, limited to non-confirming findings.
- `CLAIM-027`: non-confirming verification report findings are converted into bounded retro findings without exposing raw auditor output, stderr, prompt packages, or finding evidence text.
- `CLAIM-028`: retro dossiers now count and render `verification_reports`, so repeated implementation-infidelity patterns can be queried later by `@sheldon` without auto-editing prompts.
- `CLAIM-029`: Slice 7 behavior is covered by focused regression tests and documentation.
- `CLAIM-030`: promoted latest reports are deduplicated against their historical run copy so retro recurrence cannot be inflated by the same Machine Report appearing at two paths.
- `CLAIM-031`: `verify:implementation` now emits best-effort runtime telemetry for completed verification modes through `execution_events`.
- `CLAIM-032`: verification telemetry payloads contain safe metadata and artifact paths, but exclude raw auditor output, stderr, stdout, prompt text, report content, and finding evidence.
- `CLAIM-033`: `harness:retro-promote` provides a dry-run-first, human-approved path from retro candidates to `.aioson/learnings/` or `.aioson/rules/`.
- `CLAIM-034`: retro promotion requires explicit `--apply --select=<candidate-key|all>` before writing files and records/reinforces project learnings in runtime storage.

## Implementation Evidence

- CLI entrypoint and dispatch: `src/cli.js`.
- Thin command orchestration: `src/commands/verify-implementation.js`.
- Path safety: `src/verification/path-policy.js`.
- Ledger preparation/validation: `src/verification/ledger-store.js`.
- Source discovery and evidence bundle: `src/verification/source-discovery.js`, `src/verification/evidence-bundle.js`.
- Prompt package: `src/verification/prompt-package.js`.
- Prompt redaction: `src/verification/redaction.js`.
- Report parser: `src/verification/report-parser.js`.
- Report storage/promotion: `src/verification/report-store.js`.
- Runner contracts/adapters: `src/verification/runners/index.js`.
- Workflow report consumption: `src/commands/workflow-next.js`.
- Retro verification report source: `src/lib/retro/verification-reports.js`, `src/lib/retro/retro-sources.js`, `src/lib/retro/retro-render.js`.
- Verification telemetry: `src/verification/runtime-telemetry.js`, `src/runtime-store.js`.
- Retro promotion command: `src/commands/harness-retro-promote.js`.
- Policy routing: `src/verification/policy-engine.js`.
- Shared schema/constants/results: `src/verification/schema.js`, `src/verification/result.js`.
- Agent trigger prompts: `.aioson/agents/dev.md`, `.aioson/agents/deyvin.md`, `.aioson/agents/scope-check.md`, `.aioson/agents/qa.md` and template copies.
- Regression coverage: `tests/verify-implementation.test.js`, `tests/agent-contracts.test.js`, `tests/deyvin-density.test.js`, `tests/deyvin-scout-wiring.test.js`.
- Workflow integration coverage: `tests/workflow-next.test.js`, `tests/json-output.test.js`.
- Retro learning coverage: `tests/harness-retro.test.js`, `tests/harness-retro-verification-reports.test.js`, `tests/harness-retro-promote.test.js`.
- Schema fixtures: `tests/fixtures/verification/`.
- Command reference: `README.md`.

## Verification Commands

- `node --test tests/verify-implementation.test.js` - passed.
- `node --test tests/agent-contracts.test.js` - passed.
- `node --test tests/deyvin-density.test.js tests/deyvin-scout-wiring.test.js` - passed.
- `node --test tests/json-output.test.js tests/agent-command-references.test.js tests/verify-implementation.test.js tests/agent-contracts.test.js tests/deyvin-density.test.js tests/deyvin-scout-wiring.test.js` - passed.
- `node bin/aioson.js verify:implementation . --feature=adversarial-verification-loop --check-ledger --json` - passed.
- `node bin/aioson.js verify:implementation . --feature=adversarial-verification-loop --build-prompt --policy=strict --json` - passed.
- `node bin/aioson.js verify:implementation . --feature=adversarial-verification-loop --check-report=.aioson/context/features/adversarial-verification-loop/verification-runs/20260624T201050Z-manual-report.md --policy=strict --json` - passed.
- `node --test tests/verify-implementation.test.js tests/prototype-check.test.js` - passed.
- `node --test tests/json-output.test.js` - passed.
- `node scripts/check-js.js` - passed.
- `npm test` - passed on final Slice 5 run: 3365 pass, 0 fail, 1 skipped.
- `node --test tests/operator-memory-capture.test.js` - passed 26/26 after the transient full-suite failure.
- `node --check src/verification/redaction.js; node --check src/verification/evidence-bundle.js; node --check src/verification/source-discovery.js; node --check src/verification/prompt-package.js` - passed.
- `node bin/aioson.js verify:implementation . --feature=adversarial-verification-loop --build-prompt --policy=strict --json` - passed on Slice 5: prompt `20260624T211301Z-prompt.md`, 23238/24000 chars, compact mode true, redactions 0 for the current repo.
- `rg -n "REDACTED|skills/process/prototype-forge|CLAIM-016|CLAIM-017|CLAIM-018|CLAIM-019|CLAIM-020" .aioson/context/features/adversarial-verification-loop/verification-runs/20260624T211301Z-prompt.md` - confirmed Slice 5 claims are present, the former `skills/process/prototype-forge` false positive remains unredacted, and no secret placeholder appears in the generated prompt.
- `node --test tests/verify-implementation.test.js` - passed after Slice 5: 19/19.
- `node --check src/commands/verify-implementation.js; node --check src/verification/runners/index.js; node --check src/verification/report-store.js` - passed.
- `node --test tests/agent-command-references.test.js tests/json-output.test.js` - passed 42/42 after README command update.
- `node bin/aioson.js verify:implementation . --feature=adversarial-verification-loop --tool=gemini --policy=strict --json` - expected rejection: `unsupported_tool`, `INCONCLUSIVE`, supported tools exclude Gemini.
- `node bin/aioson.js verify:implementation . --feature=adversarial-verification-loop --tool=opencode --model='bad model;rm' --policy=strict --json` - expected rejection: `invalid_model`, `INCONCLUSIVE`, no runner execution.
- `node --check src/commands/workflow-next.js` - passed after Slice 6.
- `node --test tests/workflow-next.test.js` - passed after Slice 6: 37/37.
- `node --test tests/agent-contracts.test.js` - passed after Slice 6: 38/38.
- `node --test tests/json-output.test.js` - passed after Slice 6: 40/40.
- `node --check src/verification/prompt-package.js` - passed after Slice 6 budget hardening.
- `node --test tests/verify-implementation.test.js` - passed after Slice 6 budget hardening: 20/20.
- `node bin/aioson.js verify:implementation . --feature=adversarial-verification-loop --build-prompt --policy=strict --json` - passed after Slice 6 budget hardening: prompt `20260624T213151Z-prompt.md`, 22666/24000 chars, minimal_tight mode, over_budget false, redactions 0.
- `node --test tests/verify-implementation.test.js tests/workflow-next.test.js tests/agent-contracts.test.js tests/json-output.test.js tests/agent-command-references.test.js` - passed after Slice 6 budget hardening: 137/137.
- `npm test` - first Slice 6 full run had one transient timing failure in `tests/telemetry-foundation.test.js` (`context:load too slow: 7657ms`); isolated rerun of `node --test tests/telemetry-foundation.test.js` passed 10/10; second full `npm test` passed 3370/3371 with 1 skipped.
- `node --check src/lib/retro/verification-reports.js; node --check src/lib/retro/retro-sources.js; node --check src/lib/retro/retro-render.js; node --check tests/harness-retro.test.js` - passed after Slice 7.
- `node --test tests/harness-retro.test.js` - passed after Slice 7: 23/23.
- `node --test tests/harness-retro.test.js tests/harness-retro-verification-reports.test.js` - passed after Slice 7 dedupe fix: 25/25.
- `node bin/aioson.js harness:retro . --feature=adversarial-verification-loop --json` - passed after Slice 7: `verification_reports: 2`, `candidates: 0`, `observations: 1`.
- `rg -n "raw|stderr|prompt|SECRET=|sk-|OPENAI|No auditor|No re-render|Click handler|evidence" .aioson/context/retro/adversarial-verification-loop.md` - expected no raw/evidence leak; only the fixed next-step command line matched `prompt`.
- `node --test tests/harness-retro.test.js tests/harness-retro-verification-reports.test.js tests/verify-implementation.test.js tests/json-output.test.js tests/agent-command-references.test.js` - passed after Slice 7 dedupe fix: 87/87.
- `node scripts/check-js.js` - passed after Slice 7.
- `node bin/aioson.js verify:implementation . --feature=adversarial-verification-loop --check-ledger --json` - passed after Slice 7: ready_for_prompt true, 30 claims, 5 known gaps, 39 verification commands.
- `node bin/aioson.js verify:implementation . --feature=adversarial-verification-loop --build-prompt --policy=strict --json` - passed after Slice 7: prompt `20260624T221330Z-prompt.md`, 22011/24000 chars, over_budget false, minimal_floor.
- `npm test` - post-refinement parallel runs hit unrelated Windows temp cleanup flakes: one `context-trim` ENOTEMPTY and one FTS sqlite-shm EBUSY; both runs had 3374 passing tests, 1 skipped, 1 failed teardown case.
- `node --test tests/context-trim.test.js` - passed after `npm test` flake: 6/6.
- `node --test tests/integration-context-optimizations.test.js` - passed after `npm test` flake: 7/7.
- `node --test tests/context-trim.test.js tests/integration-context-optimizations.test.js` - passed after `npm test` flakes: 13/13.
- `node --test --test-concurrency=1` - passed after Slice 7 final refinement: 3375/3376 with 1 skipped.
- `git diff --check` - no whitespace errors after Slice 7; only repository LF->CRLF normalization warnings.
- `node --check src/lib/retro/verification-reports.js; node --check tests/harness-retro-verification-reports.test.js` - passed after Slice 7 dedupe fix.
- `node --test tests/verify-implementation.test.js` - passed after Slice 8 telemetry: 22/22.
- `node --test tests/harness-retro-promote.test.js` - passed after Slice 8: 5/5.
- `node --test tests/harness-retro-verification-reports.test.js` - passed after Slice 8: 2/2.
- `node --test tests/json-output.test.js --test-name-pattern="unknown command with --json returns structured error"` - passed; current Node runner executed 40/40 in this file.
- `npm run lint` - passed after Slice 8.
- `node bin/aioson.js harness:retro-promote . --feature=adversarial-verification-loop --json` - passed dry-run with 0 candidates and no writes.

## Known Gaps

- Global automatic verification detours are still not forced. Slice 6 consumes existing reports during explicit `@scope-check` post-dev/post-fix/final activation, but it does not impose the loop on every feature.
- Cross-tool runners remain explicit `--tool` mode. Workflow report consumption never auto-runs Codex, Claude, or opencode and was not dogfooded against a paid/remote model in this slice.
- Manual `--check-report --promote` is still deferred; runner mode promotes valid or system-generated `INCONCLUSIVE` reports.
- Retro promotion is explicit and local. It does not auto-edit agent prompts, skills, PRDs, plans, or source code; a future prompt/rule hardening loop still needs separate human-approved design.
- Window-level retro promotion remains out of scope for Slice 8; `harness:retro-promote` promotes a single `--feature=<slug>` dossier.

## Handoff Notes

This ledger is evidence, not proof. Slice 8 adds runtime telemetry for verification runs and an explicit human-approved promotion path from feature retro dossiers to `.aioson/learnings/` or `.aioson/rules/`. The loop still avoids automatic prompt edits and does not force verification detours globally.

## Machine Ledger

```json
{
  "schema_version": "implementation-ledger/v1",
  "feature_slug": "adversarial-verification-loop",
  "source_artifacts": [
    {
      "type": "source_plan",
      "path": "plans/adversarial-verification-loop/PILOT-SPEC.md",
      "role": "pilot_contract"
    },
    {
      "type": "source_plan",
      "path": "plans/adversarial-verification-loop/IMPLEMENTATION-SLICES.md",
      "role": "slice_plan"
    },
    {
      "type": "source_plan",
      "path": "plans/adversarial-verification-loop/SLICE-8-RUNTIME-TELEMETRY-AND-RETRO-PROMOTION.md",
      "role": "slice_8_plan"
    },
    {
      "type": "source_plan",
      "path": "plans/adversarial-verification-loop/ACCEPTANCE-CRITERIA.md",
      "role": "acceptance_reference"
    },
    {
      "type": "source_plan",
      "path": "plans/adversarial-verification-loop/DATA-SCHEMAS.md",
      "role": "schema_reference"
    },
    {
      "type": "source_plan",
      "path": "plans/adversarial-verification-loop/ENTERPRISE-ARCHITECTURE.md",
      "role": "architecture_reference"
    }
  ],
  "claims": [
    {
      "id": "CLAIM-001",
      "kind": "required_behavior",
      "summary": "verify:implementation is registered in the CLI and supports JSON mode.",
      "owner": "dev",
      "status": "implemented",
      "evidence": [
        {
          "type": "file",
          "path": "src/cli.js",
          "lines": "189,657-658,1599-1600"
        },
        {
          "type": "file",
          "path": "src/commands/verify-implementation.js",
          "lines": "1-188"
        },
        {
          "type": "file",
          "path": "README.md",
          "lines": "735-746"
        },
        {
          "type": "test",
          "command": "node --test tests/verify-implementation.test.js",
          "status": "passed"
        }
      ]
    },
    {
      "id": "CLAIM-002",
      "kind": "security_constraint",
      "summary": "Feature slugs and report/prompt paths are validated so traversal and outside-root paths are rejected.",
      "owner": "dev",
      "status": "implemented",
      "evidence": [
        {
          "type": "file",
          "path": "src/verification/path-policy.js",
          "lines": "1-74"
        },
        {
          "type": "file",
          "path": "src/verification/report-parser.js",
          "lines": "52-53"
        },
        {
          "type": "file",
          "path": "src/verification/prompt-package.js",
          "lines": "92-96"
        },
        {
          "type": "test",
          "command": "node --test tests/verify-implementation.test.js",
          "status": "passed"
        }
      ]
    },
    {
      "id": "CLAIM-003",
      "kind": "required_behavior",
      "summary": "prepare/check ledger create the feature-local ledger and validate required sections plus Machine Ledger JSON.",
      "owner": "dev",
      "status": "implemented",
      "evidence": [
        {
          "type": "file",
          "path": "src/verification/ledger-store.js",
          "lines": "1-186"
        },
        {
          "type": "file",
          "path": ".aioson/context/features/adversarial-verification-loop/implementation-ledger.md",
          "lines": "1-330"
        },
        {
          "type": "test",
          "command": "node --test tests/verify-implementation.test.js",
          "status": "passed"
        }
      ]
    },
    {
      "id": "CLAIM-004",
      "kind": "required_behavior",
      "summary": "build-prompt creates a bounded clean-auditor prompt package from discovered artifacts, git state, ledger claims, known gaps, and verification commands.",
      "owner": "dev",
      "status": "implemented",
      "evidence": [
        {
          "type": "file",
          "path": "src/verification/source-discovery.js",
          "lines": "1-134"
        },
        {
          "type": "file",
          "path": "src/verification/evidence-bundle.js",
          "lines": "1-129"
        },
        {
          "type": "file",
          "path": "src/verification/prompt-package.js",
          "lines": "1-98"
        },
        {
          "type": "test",
          "command": "node --test tests/verify-implementation.test.js",
          "status": "passed"
        }
      ]
    },
    {
      "id": "CLAIM-005",
      "kind": "required_behavior",
      "summary": "check-report parses Machine Report JSON and rejects invalid JSON, missing sections, and prose/machine verdict conflicts.",
      "owner": "dev",
      "status": "implemented",
      "evidence": [
        {
          "type": "file",
          "path": "src/verification/report-parser.js",
          "lines": "1-107"
        },
        {
          "type": "test",
          "command": "node --test tests/verify-implementation.test.js",
          "status": "passed"
        }
      ]
    },
    {
      "id": "CLAIM-006",
      "kind": "required_behavior",
      "summary": "Strict policy routing maps blocking findings to the correct owner route.",
      "owner": "dev",
      "status": "implemented",
      "evidence": [
        {
          "type": "file",
          "path": "src/verification/policy-engine.js",
          "lines": "1-94"
        },
        {
          "type": "test",
          "command": "node --test tests/verify-implementation.test.js",
          "status": "passed"
        }
      ]
    },
    {
      "id": "CLAIM-007",
      "kind": "scope_constraint",
      "summary": "Slice 2 remains local and deterministic; it does not invoke external auditor models or implement runners.",
      "owner": "dev",
      "status": "implemented",
      "evidence": [
        {
          "type": "file",
          "path": "src/commands/verify-implementation.js",
          "lines": "1-15"
        },
        {
          "type": "file",
          "path": "plans/adversarial-verification-loop/PILOT-SPEC.md",
          "lines": "40-47"
        },
        {
          "type": "test",
          "command": "node --test tests/verify-implementation.test.js",
          "status": "passed"
        }
      ]
    },
    {
      "id": "CLAIM-008",
      "kind": "test_coverage",
      "summary": "Focused and full-suite tests passed after implementation.",
      "owner": "qa",
      "status": "implemented",
      "evidence": [
        {
          "type": "test",
          "command": "node --test tests/verify-implementation.test.js",
          "status": "passed"
        },
        {
          "type": "test",
          "command": "node --test tests/verify-implementation.test.js tests/prototype-check.test.js",
          "status": "passed"
        },
        {
          "type": "test",
          "command": "node --test tests/json-output.test.js",
          "status": "passed"
        },
        {
          "type": "test",
          "command": "node scripts/check-js.js",
          "status": "passed"
        },
        {
          "type": "test",
          "command": "npm test",
          "status": "passed"
        }
      ]
    },
    {
      "id": "CLAIM-009",
      "kind": "required_behavior",
      "summary": "Schema constants and validators are centralized in reusable helper APIs with JSON fixture coverage.",
      "owner": "dev",
      "status": "implemented",
      "evidence": [
        {
          "type": "file",
          "path": "src/verification/schema.js",
          "lines": "1-254"
        },
        {
          "type": "file",
          "path": "src/verification/result.js",
          "lines": "1-15"
        },
        {
          "type": "file",
          "path": "tests/fixtures/verification/valid-ledger.json"
        },
        {
          "type": "file",
          "path": "tests/fixtures/verification/invalid-ledger-owner.json"
        },
        {
          "type": "file",
          "path": "tests/fixtures/verification/valid-report.json"
        },
        {
          "type": "file",
          "path": "tests/fixtures/verification/invalid-report-verdict.json"
        },
        {
          "type": "test",
          "command": "node --test tests/verify-implementation.test.js",
          "status": "passed"
        }
      ]
    },
    {
      "id": "CLAIM-010",
      "kind": "required_behavior",
      "summary": "Dev, Deyvin, scope-check, and QA prompts now include implementation verification trigger and routing rules.",
      "owner": "dev",
      "status": "implemented",
      "evidence": [
        {
          "type": "file",
          "path": ".aioson/agents/dev.md",
          "lines": "222-231"
        },
        {
          "type": "file",
          "path": ".aioson/agents/deyvin.md",
          "lines": "195"
        },
        {
          "type": "file",
          "path": ".aioson/agents/scope-check.md",
          "lines": "76-88"
        },
        {
          "type": "file",
          "path": ".aioson/agents/qa.md",
          "lines": "188-196"
        },
        {
          "type": "test",
          "command": "node --test tests/agent-contracts.test.js",
          "status": "passed"
        }
      ]
    },
    {
      "id": "CLAIM-011",
      "kind": "test_coverage",
      "summary": "Prompt trigger contracts and Deyvin prompt size/parity are covered by focused tests.",
      "owner": "qa",
      "status": "implemented",
      "evidence": [
        {
          "type": "file",
          "path": "tests/agent-contracts.test.js",
          "lines": "796-827"
        },
        {
          "type": "test",
          "command": "node --test tests/agent-contracts.test.js",
          "status": "passed"
        },
        {
          "type": "test",
          "command": "node --test tests/deyvin-density.test.js tests/deyvin-scout-wiring.test.js",
          "status": "passed"
        }
      ]
    },
    {
      "id": "CLAIM-012",
      "kind": "security_constraint",
      "summary": "Prompt redaction masks secret-like values while avoiding false positives for legitimate skill paths.",
      "owner": "dev",
      "status": "implemented",
      "evidence": [
        {
          "type": "file",
          "path": "src/verification/redaction.js",
          "lines": "1-76"
        },
        {
          "type": "file",
          "path": "tests/verify-implementation.test.js",
          "lines": "274-295"
        },
        {
          "type": "test",
          "command": "node --test tests/verify-implementation.test.js",
          "status": "passed"
        }
      ]
    },
    {
      "id": "CLAIM-013",
      "kind": "required_behavior",
      "summary": "Prompt package generation enforces a character budget with compact/minimal fallback modes and reports budget metadata.",
      "owner": "dev",
      "status": "implemented",
      "evidence": [
        {
          "type": "file",
          "path": "src/verification/prompt-package.js",
          "lines": "9-62,101-145,171-233"
        },
        {
          "type": "test",
          "command": "node --test tests/verify-implementation.test.js",
          "status": "passed"
        },
        {
          "type": "test",
          "command": "node bin/aioson.js verify:implementation . --feature=adversarial-verification-loop --build-prompt --policy=strict --json",
          "status": "passed"
        }
      ]
    },
    {
      "id": "CLAIM-014",
      "kind": "required_behavior",
      "summary": "Evidence bundles include dirty worktree state, artifact summaries, preview budget metadata, and an ordered verification command plan.",
      "owner": "dev",
      "status": "implemented",
      "evidence": [
        {
          "type": "file",
          "path": "src/verification/source-discovery.js",
          "lines": "112-122,137"
        },
        {
          "type": "file",
          "path": "src/verification/evidence-bundle.js",
          "lines": "126-238"
        },
        {
          "type": "file",
          "path": "tests/verify-implementation.test.js",
          "lines": "316-356"
        },
        {
          "type": "test",
          "command": "node --test tests/verify-implementation.test.js",
          "status": "passed"
        }
      ]
    },
    {
      "id": "CLAIM-015",
      "kind": "test_coverage",
      "summary": "Slice 4 prompt hardening is covered by focused tests, syntax checks, and dogfood prompt generation.",
      "owner": "qa",
      "status": "implemented",
      "evidence": [
        {
          "type": "test",
          "command": "node --test tests/verify-implementation.test.js",
          "status": "passed"
        },
        {
          "type": "test",
          "command": "node --check src/verification/redaction.js; node --check src/verification/evidence-bundle.js; node --check src/verification/source-discovery.js; node --check src/verification/prompt-package.js",
          "status": "passed"
        },
        {
          "type": "test",
          "command": "node bin/aioson.js verify:implementation . --feature=adversarial-verification-loop --build-prompt --policy=strict --json",
          "status": "passed"
        }
      ]
    },
    {
      "id": "CLAIM-016",
      "kind": "security_constraint",
      "summary": "Tool runner mode is opt-in, allowlists Codex, Claude, and opencode, and rejects unsupported tools or unsafe model strings before ledger/prompt work.",
      "owner": "dev",
      "status": "implemented",
      "evidence": [
        {
          "type": "file",
          "path": "src/commands/verify-implementation.js",
          "lines": "53-59,194-216"
        },
        {
          "type": "file",
          "path": "src/verification/runners/index.js",
          "lines": "5-43"
        },
        {
          "type": "file",
          "path": "tests/verify-implementation.test.js",
          "lines": "391-405"
        },
        {
          "type": "test",
          "command": "node --test tests/verify-implementation.test.js",
          "status": "passed"
        }
      ]
    },
    {
      "id": "CLAIM-017",
      "kind": "security_constraint",
      "summary": "Runner adapters perform tool detection and invoke tools with explicit timeout, max-output, model, and non-destructive permission contracts.",
      "owner": "dev",
      "status": "implemented",
      "evidence": [
        {
          "type": "file",
          "path": "src/verification/runners/index.js",
          "lines": "46-119,121-224,227-306"
        },
        {
          "type": "file",
          "path": "tests/verify-implementation.test.js",
          "lines": "407-444,473-522"
        },
        {
          "type": "test",
          "command": "node --test tests/verify-implementation.test.js",
          "status": "passed"
        }
      ]
    },
    {
      "id": "CLAIM-018",
      "kind": "required_behavior",
      "summary": "Runner output is stored under verification-runs, valid reports are promoted to latest verification-report.md, and invalid runner output produces a durable system INCONCLUSIVE report.",
      "owner": "dev",
      "status": "implemented",
      "evidence": [
        {
          "type": "file",
          "path": "src/verification/report-store.js",
          "lines": "10-90"
        },
        {
          "type": "file",
          "path": "src/commands/verify-implementation.js",
          "lines": "166-192,246-331"
        },
        {
          "type": "file",
          "path": "tests/verify-implementation.test.js",
          "lines": "407-470"
        },
        {
          "type": "test",
          "command": "node --test tests/verify-implementation.test.js",
          "status": "passed"
        }
      ]
    },
    {
      "id": "CLAIM-019",
      "kind": "required_behavior",
      "summary": "Timeout, output limit, failed runner, malformed report, unsupported tool, and invalid model paths return INCONCLUSIVE with actionable reasons.",
      "owner": "dev",
      "status": "implemented",
      "evidence": [
        {
          "type": "file",
          "path": "src/commands/verify-implementation.js",
          "lines": "145-192,279-307"
        },
        {
          "type": "file",
          "path": "tests/verify-implementation.test.js",
          "lines": "391-405,446-522"
        },
        {
          "type": "test",
          "command": "node --test tests/verify-implementation.test.js",
          "status": "passed"
        }
      ]
    },
    {
      "id": "CLAIM-020",
      "kind": "test_coverage",
      "summary": "Slice 5 runner behavior is covered by focused tests, syntax checks, JSON/command-reference tests, README documentation, and safe dogfood preflight failures.",
      "owner": "qa",
      "status": "implemented",
      "evidence": [
        {
          "type": "file",
          "path": "README.md",
          "lines": "735-747"
        },
        {
          "type": "test",
          "command": "node --test tests/verify-implementation.test.js",
          "status": "passed"
        },
        {
          "type": "test",
          "command": "node --test tests/agent-command-references.test.js tests/json-output.test.js",
          "status": "passed"
        },
        {
          "type": "test",
          "command": "node bin/aioson.js verify:implementation . --feature=adversarial-verification-loop --tool=gemini --policy=strict --json",
          "status": "expected_failure_unsupported_tool"
        }
      ]
    },
    {
      "id": "CLAIM-021",
      "kind": "required_behavior",
      "summary": "workflow:next includes implementation ledger and latest verification report artifacts in scope-check activation dependencies when they exist.",
      "owner": "dev",
      "status": "implemented",
      "evidence": [
        {
          "type": "file",
          "path": "src/commands/workflow-next.js",
          "lines": "1036-1073"
        },
        {
          "type": "test",
          "command": "node --test tests/workflow-next.test.js",
          "status": "passed"
        }
      ]
    },
    {
      "id": "CLAIM-022",
      "kind": "required_behavior",
      "summary": "workflow:next validates the latest local verification report for post-dev/post-fix/final scope-check activation and injects a structured briefing.",
      "owner": "dev",
      "status": "implemented",
      "evidence": [
        {
          "type": "file",
          "path": "src/commands/workflow-next.js",
          "lines": "1220-1317,1442-1509"
        },
        {
          "type": "test",
          "command": "node --test tests/workflow-next.test.js",
          "status": "passed"
        }
      ]
    },
    {
      "id": "CLAIM-023",
      "kind": "scope_constraint",
      "summary": "Workflow consumption never auto-runs external auditor tools, preserves normal QA/pentester ownership on PASS, and surfaces blocking routes from schema/policy data.",
      "owner": "dev",
      "status": "implemented",
      "evidence": [
        {
          "type": "file",
          "path": "src/commands/workflow-next.js",
          "lines": "1228-1317,1754-1803"
        },
        {
          "type": "file",
          "path": "tests/workflow-next.test.js",
          "lines": "810-893"
        },
        {
          "type": "test",
          "command": "node --test tests/workflow-next.test.js",
          "status": "passed"
        }
      ]
    },
    {
      "id": "CLAIM-024",
      "kind": "scope_constraint",
      "summary": "Missing reports remain non-blocking by default for MICRO, while explicit strict MEDIUM checks warn before final clean approval.",
      "owner": "dev",
      "status": "implemented",
      "evidence": [
        {
          "type": "file",
          "path": "src/commands/workflow-next.js",
          "lines": "1244-1265"
        },
        {
          "type": "file",
          "path": "tests/workflow-next.test.js",
          "lines": "895-950"
        },
        {
          "type": "test",
          "command": "node --test tests/workflow-next.test.js",
          "status": "passed"
        }
      ]
    },
    {
      "id": "CLAIM-025",
      "kind": "test_coverage",
      "summary": "Slice 6 workflow consumption boundary is documented in prompts/README and covered by workflow, agent-contract, JSON output, and syntax tests.",
      "owner": "qa",
      "status": "implemented",
      "evidence": [
        {
          "type": "file",
          "path": "template/.aioson/agents/dev.md",
          "lines": "232"
        },
        {
          "type": "file",
          "path": "template/.aioson/agents/scope-check.md",
          "lines": "80"
        },
        {
          "type": "file",
          "path": "README.md",
          "lines": "719,749"
        },
        {
          "type": "test",
          "command": "node --test tests/agent-contracts.test.js",
          "status": "passed"
        },
        {
          "type": "test",
          "command": "node --test tests/json-output.test.js",
          "status": "passed"
        }
      ]
    },
    {
      "id": "CLAIM-026",
      "kind": "required_behavior",
      "summary": "harness:retro mines schema-valid implementation verification reports as a first-class retrospective source, limited to non-confirming findings.",
      "owner": "dev",
      "status": "implemented",
      "evidence": [
        {
          "type": "file",
          "path": "src/lib/retro/verification-reports.js",
          "lines": "1-185"
        },
        {
          "type": "file",
          "path": "src/lib/retro/retro-sources.js",
          "lines": "13,506,540"
        },
        {
          "type": "test",
          "command": "node --test tests/harness-retro.test.js",
          "status": "passed"
        }
      ]
    },
    {
      "id": "CLAIM-027",
      "kind": "security_constraint",
      "summary": "Non-confirming verification report findings are converted into bounded retro findings without exposing raw auditor output, stderr, prompt packages, or finding evidence text.",
      "owner": "dev",
      "status": "implemented",
      "evidence": [
        {
          "type": "file",
          "path": "src/lib/retro/verification-reports.js",
          "lines": "32-44,111-130,132-181"
        },
        {
          "type": "test",
          "command": "node --test tests/harness-retro.test.js",
          "status": "passed"
        }
      ]
    },
    {
      "id": "CLAIM-028",
      "kind": "required_behavior",
      "summary": "Retro dossiers count and render verification_reports so repeated implementation-infidelity patterns can be queried later without auto-editing prompts.",
      "owner": "dev",
      "status": "implemented",
      "evidence": [
        {
          "type": "file",
          "path": "src/lib/retro/retro-render.js",
          "lines": "12-21,92,158"
        },
        {
          "type": "file",
          "path": "README.md",
          "lines": "751"
        },
        {
          "type": "test",
          "command": "node --test tests/harness-retro.test.js",
          "status": "passed"
        }
      ]
    },
    {
      "id": "CLAIM-029",
      "kind": "test_coverage",
      "summary": "Slice 7 retro learning behavior is covered by focused regression tests and reference documentation.",
      "owner": "qa",
      "status": "implemented",
      "evidence": [
        {
          "type": "file",
          "path": "tests/harness-retro.test.js",
          "lines": "198-260"
        },
        {
          "type": "file",
          "path": "docs/en/5-reference/cli-reference.md",
          "lines": "823"
        },
        {
          "type": "file",
          "path": "docs/pt/5-referencia/harness-retro.md",
          "lines": "58-70"
        }
      ]
    },
    {
      "id": "CLAIM-030",
      "kind": "required_behavior",
      "summary": "Promoted latest verification reports are deduplicated against their historical run copy so the same Machine Report cannot inflate retro recurrence.",
      "owner": "dev",
      "status": "implemented",
      "evidence": [
        {
          "type": "file",
          "path": "src/lib/retro/verification-reports.js",
          "lines": "73-84,151-193"
        },
        {
          "type": "file",
          "path": "tests/harness-retro-verification-reports.test.js",
          "lines": "52-66"
        },
        {
          "type": "test",
          "command": "node --test tests/harness-retro.test.js tests/harness-retro-verification-reports.test.js",
          "status": "passed"
        }
      ]
    },
    {
      "id": "CLAIM-031",
      "kind": "required_behavior",
      "summary": "verify:implementation emits best-effort runtime telemetry to execution_events for completed verification modes.",
      "owner": "dev",
      "status": "implemented",
      "evidence": [
        {
          "type": "file",
          "path": "src/commands/verify-implementation.js",
          "lines": "46,415"
        },
        {
          "type": "file",
          "path": "src/verification/runtime-telemetry.js",
          "lines": "14-142"
        },
        {
          "type": "file",
          "path": "src/runtime-store.js",
          "lines": "1575"
        },
        {
          "type": "test",
          "command": "node --test tests/verify-implementation.test.js",
          "status": "passed"
        }
      ]
    },
    {
      "id": "CLAIM-032",
      "kind": "security_constraint",
      "summary": "Verification telemetry payloads include safe metadata and artifact paths but exclude raw auditor output, stderr, stdout, prompt text, report content, and finding evidence.",
      "owner": "dev",
      "status": "implemented",
      "evidence": [
        {
          "type": "file",
          "path": "src/verification/runtime-telemetry.js",
          "lines": "28-86"
        },
        {
          "type": "file",
          "path": "tests/verify-implementation.test.js",
          "lines": "661-728"
        },
        {
          "type": "test",
          "command": "node --test tests/verify-implementation.test.js",
          "status": "passed"
        }
      ]
    },
    {
      "id": "CLAIM-033",
      "kind": "required_behavior",
      "summary": "harness:retro-promote provides a dry-run-first path from feature retro candidates to project learnings or rules.",
      "owner": "dev",
      "status": "implemented",
      "evidence": [
        {
          "type": "file",
          "path": "src/cli.js",
          "lines": "297,442,1362-1364"
        },
        {
          "type": "file",
          "path": "src/commands/harness-retro-promote.js",
          "lines": "1-387"
        },
        {
          "type": "file",
          "path": "README.md",
          "lines": "738,755"
        },
        {
          "type": "test",
          "command": "node --test tests/harness-retro-promote.test.js",
          "status": "passed"
        }
      ]
    },
    {
      "id": "CLAIM-034",
      "kind": "scope_constraint",
      "summary": "Retro promotion requires explicit --apply --select before writing and records or reinforces a bounded project learning in runtime storage.",
      "owner": "dev",
      "status": "implemented",
      "evidence": [
        {
          "type": "file",
          "path": "src/commands/harness-retro-promote.js",
          "lines": "233-283,319-336"
        },
        {
          "type": "file",
          "path": "tests/harness-retro-promote.test.js",
          "lines": "136-207"
        },
        {
          "type": "test",
          "command": "node --test tests/harness-retro-promote.test.js",
          "status": "passed"
        }
      ]
    }
  ],
  "known_gaps": [
    {
      "id": "GAP-001",
      "gap": "Global automatic verification detours are still not forced; workflow:next consumes existing reports during explicit post-dev/post-fix/final scope-check activation.",
      "owner": "dev",
      "blocks": false
    },
    {
      "id": "GAP-002",
      "gap": "Runner mode is explicit only; workflow report consumption never auto-runs Codex, Claude, or opencode and was not dogfooded against a paid/remote model in this slice.",
      "owner": "dev",
      "blocks": false
    },
    {
      "id": "GAP-003",
      "gap": "Manual --check-report --promote is deferred; runner mode promotes valid or system-generated INCONCLUSIVE reports.",
      "owner": "dev",
      "blocks": false
    },
    {
      "id": "GAP-004",
      "gap": "Retro promotion is explicit and local; it does not auto-edit agent prompts, skills, PRDs, plans, or source code.",
      "owner": "dev",
      "blocks": false
    },
    {
      "id": "GAP-005",
      "gap": "Window-level retro promotion remains out of scope; harness:retro-promote promotes a single feature dossier only.",
      "owner": "sheldon",
      "blocks": false
    }
  ],
  "verification_commands": [
    {
      "command": "node --test tests/verify-implementation.test.js",
      "required": true,
      "last_status": "passed"
    },
    {
      "command": "node --test tests/harness-retro-promote.test.js",
      "required": true,
      "last_status": "passed"
    },
    {
      "command": "node --test tests/harness-retro-verification-reports.test.js",
      "required": true,
      "last_status": "passed"
    },
    {
      "command": "npm run lint",
      "required": true,
      "last_status": "passed"
    },
    {
      "command": "node bin/aioson.js harness:retro-promote . --feature=adversarial-verification-loop --json",
      "required": true,
      "last_status": "passed"
    },
    {
      "command": "node --test tests/verify-implementation.test.js",
      "required": true,
      "last_status": "passed"
    },
    {
      "command": "node --test tests/agent-contracts.test.js",
      "required": true,
      "last_status": "passed"
    },
    {
      "command": "node --test tests/deyvin-density.test.js tests/deyvin-scout-wiring.test.js",
      "required": true,
      "last_status": "passed"
    },
    {
      "command": "node --test tests/json-output.test.js tests/agent-command-references.test.js tests/verify-implementation.test.js tests/agent-contracts.test.js tests/deyvin-density.test.js tests/deyvin-scout-wiring.test.js",
      "required": true,
      "last_status": "passed"
    },
    {
      "command": "node bin/aioson.js verify:implementation . --feature=adversarial-verification-loop --check-ledger --json",
      "required": true,
      "last_status": "passed"
    },
    {
      "command": "node bin/aioson.js verify:implementation . --feature=adversarial-verification-loop --build-prompt --policy=strict --json",
      "required": true,
      "last_status": "passed"
    },
    {
      "command": "node bin/aioson.js verify:implementation . --feature=adversarial-verification-loop --check-report=.aioson/context/features/adversarial-verification-loop/verification-runs/20260624T201050Z-manual-report.md --policy=strict --json",
      "required": true,
      "last_status": "passed"
    },
    {
      "command": "node --test tests/verify-implementation.test.js tests/prototype-check.test.js",
      "required": true,
      "last_status": "passed"
    },
    {
      "command": "node --test tests/json-output.test.js",
      "required": true,
      "last_status": "passed"
    },
    {
      "command": "node scripts/check-js.js",
      "required": true,
      "last_status": "passed"
    },
    {
      "command": "npm test",
      "required": true,
      "last_status": "failed_unrelated_windows_temp_cleanup_flake"
    },
    {
      "command": "node --test tests/context-trim.test.js",
      "required": false,
      "last_status": "passed"
    },
    {
      "command": "node --test tests/integration-context-optimizations.test.js",
      "required": false,
      "last_status": "passed"
    },
    {
      "command": "node --test tests/context-trim.test.js tests/integration-context-optimizations.test.js",
      "required": false,
      "last_status": "passed"
    },
    {
      "command": "node --test --test-concurrency=1",
      "required": true,
      "last_status": "passed"
    },
    {
      "command": "node --test tests/operator-memory-capture.test.js",
      "required": false,
      "last_status": "passed"
    },
    {
      "command": "node --check src/verification/redaction.js; node --check src/verification/evidence-bundle.js; node --check src/verification/source-discovery.js; node --check src/verification/prompt-package.js",
      "required": true,
      "last_status": "passed"
    },
    {
      "command": "node bin/aioson.js verify:implementation . --feature=adversarial-verification-loop --build-prompt --policy=strict --json",
      "required": true,
      "last_status": "passed"
    },
    {
      "command": "node --check src/commands/verify-implementation.js; node --check src/verification/runners/index.js; node --check src/verification/report-store.js",
      "required": true,
      "last_status": "passed"
    },
    {
      "command": "node --test tests/agent-command-references.test.js tests/json-output.test.js",
      "required": true,
      "last_status": "passed"
    },
    {
      "command": "node bin/aioson.js verify:implementation . --feature=adversarial-verification-loop --tool=gemini --policy=strict --json",
      "required": false,
      "last_status": "expected_failure_unsupported_tool"
    },
    {
      "command": "node bin/aioson.js verify:implementation . --feature=adversarial-verification-loop --tool=opencode --model='bad model;rm' --policy=strict --json",
      "required": false,
      "last_status": "expected_failure_invalid_model"
    },
    {
      "command": "node --check src/commands/workflow-next.js",
      "required": true,
      "last_status": "passed"
    },
    {
      "command": "node --check src/verification/prompt-package.js",
      "required": true,
      "last_status": "passed"
    },
    {
      "command": "node --test tests/workflow-next.test.js",
      "required": true,
      "last_status": "passed"
    },
    {
      "command": "node --test tests/agent-contracts.test.js",
      "required": true,
      "last_status": "passed"
    },
    {
      "command": "node --test tests/json-output.test.js",
      "required": true,
      "last_status": "passed"
    },
    {
      "command": "node --check src/lib/retro/verification-reports.js; node --check src/lib/retro/retro-sources.js; node --check src/lib/retro/retro-render.js; node --check tests/harness-retro.test.js",
      "required": true,
      "last_status": "passed"
    },
    {
      "command": "node --test tests/harness-retro.test.js",
      "required": true,
      "last_status": "passed"
    },
    {
      "command": "node --test tests/harness-retro.test.js tests/harness-retro-verification-reports.test.js",
      "required": true,
      "last_status": "passed"
    },
    {
      "command": "node bin/aioson.js harness:retro . --feature=adversarial-verification-loop --json",
      "required": true,
      "last_status": "passed"
    },
    {
      "command": "rg -n \"raw|stderr|prompt|SECRET=|sk-|OPENAI|No auditor|No re-render|Click handler|evidence\" .aioson/context/retro/adversarial-verification-loop.md",
      "required": false,
      "last_status": "expected_single_safe_prompt_reference"
    },
    {
      "command": "node --test tests/harness-retro.test.js tests/harness-retro-verification-reports.test.js tests/verify-implementation.test.js tests/json-output.test.js tests/agent-command-references.test.js",
      "required": true,
      "last_status": "passed"
    },
    {
      "command": "node scripts/check-js.js",
      "required": true,
      "last_status": "passed"
    },
    {
      "command": "node bin/aioson.js verify:implementation . --feature=adversarial-verification-loop --check-ledger --json",
      "required": true,
      "last_status": "passed"
    },
    {
      "command": "node bin/aioson.js verify:implementation . --feature=adversarial-verification-loop --build-prompt --policy=strict --json",
      "required": true,
      "last_status": "passed"
    },
    {
      "command": "npm test",
      "required": true,
      "last_status": "passed"
    },
    {
      "command": "git diff --check",
      "required": false,
      "last_status": "passed_with_line_ending_warnings"
    },
    {
      "command": "node --check src/lib/retro/verification-reports.js; node --check tests/harness-retro-verification-reports.test.js",
      "required": true,
      "last_status": "passed"
    }
  ]
}
```
