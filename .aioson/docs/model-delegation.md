---
name: model-delegation-contract
description: "Explicit user-requested model delegation across Claude Code, Codex, OpenCode, and external CLI fallbacks."
agents: [briefing-refiner, briefing, product, ux-ui, dev, qa]
task_types: [research, image-research, critique, verification, model-delegation]
triggers: [use model, using model, usando o modelo, another model, outro modelo, subagent, sub-agent, subagente]
---

# Explicit Model Delegation Contract

Use this contract only when the user explicitly asks for a bounded task to run with a named model. A model name is an execution requirement, not stylistic guidance: never imitate the requested model in the parent context and never report delegation unless a bound worker actually completed.

## Non-regression ownership

Delegation is additive. The active parent agent keeps responsibility for scope, completeness, accepted product intent, and final integration. Never delegate away the Operational Surface Map, feature-completeness judgment, or the decision that a result is ready. A research/critique worker supplies evidence; it does not redefine the feature.

## Deterministic plan first

Build one self-contained task and run:

```bash
aioson delegation:plan . \
  --explicit-model-request \
  --host=<current-host> \
  --provider=<requested-provider-or-current-host> \
  --model="<user-requested-model>" \
  --kind=research|image-research|critique|verification|general \
  --task-file=<project-relative-task-file> \
  --research-slug=<slug-when-applicable> \
  --json
```

The command preserves `model_requested` separately from `model_resolved`, rejects ambiguous/unsafe model names, refuses fuzzy substitutions without confirmation, and chooses `native` only when provider equals the current host.

## Dispatch

### Native, same provider

When the plan returns `mode: native`, immediately invoke exactly one native host subagent with:

- the exact `native_dispatch.model` binding — do not inherit the parent model;
- `worker_prompt` as the complete isolated task;
- the narrow researcher/reviewer role when the host exposes it;
- only the capabilities the task needs.

Claude Code can bind a model per subagent invocation. Codex can bind `model` in a custom-agent TOML;
use native Codex delegation only when a loaded custom agent already proves the exact requested model.
Because an omitted Codex custom-agent model inherits from the parent, dynamic or unmatched model requests
must use the explicit external fallback. Never run an inherited worker or simulate a subagent in prose.

### External, cross-provider or native unavailable

An explicit user request naming the model authorizes this one bounded execution. Run the same task through:

```bash
aioson delegation:run . <the same flags> --json
```

This launches the registered provider CLI without a shell. It never silently changes providers/models. Authentication, unavailable tools, invalid model IDs, timeouts, and capacity failures are real blockers and must be reported.
The Claude fallback runs in `plan` permission mode and the Codex fallback runs with the `read-only`
sandbox. OpenCode external delegation remains blocked with `external_read_only_unavailable` until its
adapter has an equally verifiable read-only boundary; a prompt-only promise is not sufficient.

## Read-only worker, parent-owned persistence

Delegated workers are read-only. They return evidence to the parent; the parent validates and writes any durable artifact. For research, honor `persistence.path` and the project research-cache format. This prevents a researcher from editing code, prompts, briefing scope, or workflow state.

For image research, require for every candidate:

- source page and direct asset URL when available;
- relevance to the requested visual direction;
- license/usage status and uncertainty;
- recommendation: use, inspiration-only, or reject.

Unknown licensing is never "ready to use". A model/tool without image-search capability must report the limitation instead of returning generic web results as image evidence.

## Provenance

Record the plan's provenance beside the consuming artifact when delegation materially influenced it:

- requested and resolved model;
- resolution strategy;
- host/provider and native/external mode;
- task kind;
- sources and returned artifact path;
- capability limitations.

Do not record secrets, credentials, private reasoning, or raw hidden prompts.
