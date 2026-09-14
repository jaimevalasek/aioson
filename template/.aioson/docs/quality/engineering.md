---
description: Engineering quality profiles, native checks, static baselines, reproducible evaluations and evidence limits
task_types: [quality, analysis, agent-authoring]
triggers: [quality pipeline, quality profile, eval corpus, static analysis, mutation testing]
agents: [quality, tester, qa, dev]
---

# Engineering quality

`@quality` is an optional evidence specialist for products and AIOSON itself. It centralizes measurement and triage; implementing agents still verify their work and QA still owns acceptance. Classification never creates another gate.

## Profiles and commands

`quality:run` and `quality:evals` require the requested project directory. They reject a path that the shared CLI resolver would redirect from `.aioson/` storage to its owning project: executing another project's checks would invalidate the assessment. Use a separate temporary project or a dedicated Git checkout for a pilot. Runtime storage holds evidence, not independent application targets.

`aioson quality:run . --profile=product --dry-run --json` discovers `lint` and `test` package scripts without running them. `--profile=framework` discovers `lint`, `test:quality`, `quality:coverage`, and `quality:static`. Remove `--dry-run` to execute sequentially. Missing checks remain `not_run` and make a complete run unsuccessful (exit 2). Execution failure is exit 1; process/configuration error is exit 2. Reports and per-check logs are saved beneath `.aioson/runtime/quality/checks/<UUID>/`.

For another stack or explicit scope, create `.aioson/quality.json` (project owned, never automatically overwritten):

```json
{
  "schema_version": 1,
  "checks": [
    { "id": "unit", "argv": ["python", "-m", "pytest", "tests/unit"], "timeout_ms": 120000 }
  ]
}
```

Commands are argv arrays, run without a shell in the target root. They execute repository code with local permissions. Use disposable CI environments for untrusted candidates. `node` and Windows `npm` resolve to actual executable entrypoints; other shell shims require an explicit executable. Set up dependencies through the project's normal install process. Never silently download tools. Build, migration, deployment and network checks require explicit configuration and existing authorization.

## Static analysis

`quality:audit . --feature=project --all --strict --baseline=<reviewed.json>` uses the locally installed Fallow. A feature assessment can use its own slug. CI can supply `--base=<commit> --head=<commit>` to include committed changes and renames; absent revisions are errors. Without explicit scope, local tracked and untracked paths define the changed set. A project audit is preferable when a dependency/configuration change affects otherwise untouched paths.

Fallow 3.23 combined/v11 and dead-code/v9 are verified against a captured fixture. An unknown/truncated schema is an error. A missing provider is `not_run`; `--strict` makes it exit 2. JSON and Markdown reports must remain inside the project, including symlink resolution. Native JSON replay through `--provider-output=<file>` is useful for adapter regressions; it is not a fresh static analysis.

Baselines record existing debt, preserve occurrence counts, and ignore line-only movement. File renames are mapped in explicit Git ranges. Worsened severity/metrics or additional occurrences are regressions. Provider/configuration upgrades require review and a fresh comparison, never an automatic baseline reset. Findings are candidates for inspection, especially dynamic exports and duplication; they are not vulnerabilities by default.

For AIOSON, ESLint blocks newly introduced semantic findings and always blocks undefined names/parser errors. The versioned baseline documents historical debt. Fallow keeps cyclomatic/cognitive/function-size checks; estimated-coverage CRAP enforcement is disabled until whole-project measured coverage is available. Measured coverage of the quality modules is a separate gate, not an estimate of total repository coverage.

## Evaluations

The shipped development corpus contains 20 isolated repair microtasks: eight framework contract failures and twelve synthetic product regressions. Each has a broken seed and independent input/output checks. It is transparent and intentionally small; it is neither hidden holdout data nor evidence of end-to-end product success. Add actual, sanitized incidents with provenance as they occur. Keep a separately maintained holdout before making model-selection claims.

`aioson quality:evals . --validate-seeds --json` proves that the shipped seeds fail their checks. It executes no model. To measure an actual agent, provide `--executor='["node","/absolute/path/to/adapter.cjs"]' --label=<model-harness-config> --trials=3`. Shell quoting varies by client; the option value must parse as a JSON argv array. The adapter receives one JSON request on stdin (`task_id`, `trial`, `workspace`, `prompt`), edits only `workspace/solution.cjs`, and exits. Use absolute adapter paths because its working directory is the candidate workspace. Pin model, prompt, tool versions and sampling settings in the label and adapter configuration. The runner never installs an SDK or chooses a paid provider.

The trusted grader lives outside candidate workspaces and checks final behavior plus input preservation, not executor claims. Every run gets a unique directory, source/corpus/grader hashes, environment, raw logs and trial outcomes; an existing result file cannot be overwritten. Hash checks detect accidental corpus/grader changes but are not isolation against a malicious executor. Use a disposable container or VM without secrets for such executions. Keep execution configuration and logs private if they include credentials. Token/cost usage is `null` until separately instrumented; wall time is measured directly.

Compare with `quality:evals . --baseline=<before/run.json> --compare=<after/run.json> --output=<comparison.json> --json`. Both runs must have identical task/trial sets and corpus/grader hashes, and no infrastructure errors. It reports paired changes and a seeded bootstrap interval clustered by task, so repeated trials are not counted as independent tasks. Small, transparent corpora support regression triage; they do not establish model superiority. Differences in environment are reported. Never compare seed validation with executor runs.

## Evidence and ownership

For each check retain command, revision/dirty state, tool/config versions, outcome, logs and limitations. Prioritize confirmed correctness/security/data-integrity defects, then recurring regressions and test gaps, then measured performance/maintenance cost. Coverage alone cannot prove assertion quality; targeted mutation probes should kill a known defect. Benchmark with fixed workload, warmup, repeated samples and environment; preserve raw samples and avoid treating noisy timing deltas as a product gate.

An assessment may inspect the framework's agents/skills, but editing remains subject to the implementation owner's scope and canonical template parity. A static/contextual Markdown resource is not automatically an executable skill: audit the declared resource type before requiring a skill contract.
