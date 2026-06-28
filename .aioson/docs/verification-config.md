---
description: "Verification sub-agent config (verification.json) — which verifiers run, when, and on which host/model; native vs external dispatch."
agents: [dev, qa, validator]
task_types: [verification, configuration]
triggers: [verification config, verification.json, sub-agent verification, native vs external, cross-vendor auditor]
---

# Verification sub-agent config — `.aioson/config/verification.json`

Controls **which** verification sub-agents run, **when**, and on **which model** — resolved per host harness. Consumed by the `@dev` phase-loop (per-phase checks) and the post-dev review cycle (end-of-feature gate). Auto-generated on `aioson init`/`update` and hand-editable: your values survive updates (additive merge), only `version` is framework-owned.

## The one rule that trips people up: `native` vs `external`

Dispatch is **keyed by the host harness** (`claude` / `codex` / `opencode`), and each host has two modes:

- **`native`** — an in-harness sub-agent. On **Claude Code** it runs a **Claude model tier** (e.g. `sonnet-4.6`, `opus-4.8`). On codex/opencode it runs that CLI's own configured model. You **cannot** run a codex/GPT model as a *native Claude Code sub-agent* — different vendor, different process.
- **`external`** — spawn a **different vendor CLI** as a read-only auditor (`aioson verify:implementation --tool=...`). This is the *only* way to bring a cross-vendor model in while hosted elsewhere. Heavier; reserve for a second opinion on sensitive surfaces — see `cross_check`.

So the config never asks "run codex inside claude". Each host row just names the right **native** model for whoever is hosting; `cross_check` is the explicit, opt-in cross-vendor escape hatch.

## Per-agent fields

```jsonc
"qa": {
  "enabled": true,                 // true | false | "auto" (framework decides)
  "triggers": ["per-phase", "end-of-feature"],
  "dispatch": {
    "claude":   { "mode": "native", "model": "sonnet-4.6" },
    "codex":    { "mode": "native", "model": "configured-default" },
    "opencode": { "mode": "native", "model": "configured-default" }
  },
  "report": "qa-report-{slug}.md"  // {slug} is substituted at run time
}
```

- **`enabled`** — `true` / `false` / `"auto"`. `"auto"` resolves from context: `pentester` only on a sensitive surface, `tester` on anything above MICRO, others on.
- **`triggers`** — `per-phase` (light, cheap, runs between phases), `end-of-feature` (full gate), `sensitive-surface` (security pass). Per-phase is the cheap loop check; the full smoke runs once at `end-of-feature`.
- **`model: "configured-default"`** — delegate to the host CLI's own configured model (don't pin one).
- **`validator.cross_check`** — `{ "enabled": false, "mode": "external", "tool": "codex", "model": "..." }`. Flip `enabled: true` to add an independent cross-vendor verdict on the contract.

## Budget (token economy)

```jsonc
"budget": {
  "max_subagents_per_phase": 1,        // cap concurrent verifiers per phase
  "skip_on_micro": true,               // suppress per-phase checks on MICRO
  "full_smoke": "end-of-feature-only"  // never re-run the full runtime smoke per phase
}
```

The whole point is **leve por fase / completo no fim**: a per-phase check confirms the slice cheaply; the expensive build+migrate+boot+happy-path smoke runs once, at the end.

## Examples

Pin qa to the cheapest Claude tier per phase:
```json
"qa": { "dispatch": { "claude": { "mode": "native", "model": "haiku-4.5" } } }
```

Add a cross-vendor second opinion on the contract for sensitive features:
```json
"validator": { "cross_check": { "enabled": true, "mode": "external", "tool": "codex", "model": "configured-default" } }
```
