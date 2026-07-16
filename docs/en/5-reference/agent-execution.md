# Agent execution and model resolution

The agent-execution subsystem validates and dispatches feature-scoped sub-agents from a manifest. It keeps the requested model separate from the model that actually runs, resolves human-readable names or small typos against the local Codex catalog, and carries that decision into reports and telemetry.

## When to use it

Use this flow when a feature needs `@qa`, `@tester`, `@pentester`, `@validator`, or another agent in a separate process with a verifiable contract and resumable state.

The flow is opt-in per feature. Without a manifest, the legacy `configured-default` behavior remains active.

## Basic cycle

```bash
aioson agent:execution:init . --feature=my-feature --host=codex
aioson agent:execution:validate . --feature=my-feature --json
aioson agent:execution:show . --feature=my-feature --json
aioson agent:execution:dispatch . --feature=my-feature --agent=qa
aioson agent:execution:status . --feature=my-feature --json
aioson agent:execution:events . --feature=my-feature --run=<telemetry_run_id>
```

Resume a paused execution with:

```bash
aioson agent:execution:resume . --feature=my-feature
```

Commands intended for automation accept `--json`.

## Manifest

The manifest is created in the feature artifacts. A minimal example:

```json
{
  "version": 1,
  "feature": "my-feature",
  "host": "codex",
  "agents": {
    "qa": {
      "mode": "native",
      "model": "GPT 5.6 Terra",
      "reasoning_effort": "high",
      "report": ".aioson/context/done/my-feature/qa-report-{run_id}.md"
    }
  }
}
```

The manifest keeps the exact requested value. Dispatch never rewrites it; the canonical value is stored on the attempt and in the bound report.

## Model resolution

For `codex`, AIOSON reads the local catalog at `~/.codex/models_cache.json` (or `$CODEX_HOME`). Matching is deterministic and conservative:

1. exact slug;
2. normalized name (`gpt-5.6-terra`, `GPT 5.6 Terra`, accents and separators are equivalent);
3. a unique suffix alias;
4. a bounded short typo correction;
5. an explicit failure when no candidate or more than one candidate remains.

Numbers are invariants: `gpt-5.6` can never resolve to `gpt-5.5`. A generic alias such as `gpt` is not enough to select a model.

The result exposes `model_requested`, `model_resolved`, `model_resolution_strategy`, and catalog provenance. Ambiguity, invalid/oversized catalogs, and out-of-bounds input are blocked before spawn. Without a catalog, a safe literal ID may continue as `unverified_literal`; AIOSON never pretends availability was verified.

## Reasoning effort

`reasoning_effort` is independent from the model name. Manifest values are `low`, `medium`, `high`, `xhigh`, `max`, and `ultra`. When the catalog advertises supported levels, an incompatible request is rejected; there is no silent downgrade.

```json
{
  "model": "gpt-5.6-terra",
  "reasoning_effort": "high"
}
```

The selected level follows the attempt, fallback, report, verification plan, and telemetry events. If a fallback cannot support the requested level, execution pauses for correction.

## Fallback, reports, and observability

Before spawning, the dispatcher validates the host, mode, executable, writable roots, and capabilities. Each fallback candidate is resolved and validated again. Reports are accepted only when they match the registered attempt: feature, agent, path, resolved model, strategy, reasoning effort, and verdict.

`status` lists attempts. `events` reads bounded, sanitized events by cursor and preserves correlation among `run_id`, feature, agent, host, requested/resolved model, and transitions such as `retry`, `fallback`, `paused`, `passed`, and `failed`.

```bash
aioson agent:execution:status . --feature=my-feature --agent=qa --json
aioson agent:execution:events . --feature=my-feature --run=<run_id> --limit=100 --json
```

## Security limits

- model names are capped at 200 characters;
- the local catalog is capped at 5 MiB and 1,000 models;
- model IDs use a safe literal character set;
- prompt and report paths stay inside approved roots;
- child stdout/stderr is untrusted and is redacted and bounded;
- unavailable adapters fail closed instead of simulating success.

## Verification plan integration

When a feature has a manifest, `aioson verification:plan` uses the same resolver and exposes the requested model, resolved slug, strategy, and reasoning effort for each verifier:

```bash
aioson verification:plan . --feature=my-feature --trigger=per-phase --json
```

The plan, spawn, and audit therefore cannot disagree about which model will run.
