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

## Code-quality gate (`audit_code`)

Controls the deterministic, build-free `aioson audit:code` scan wired into the **tracked** `workflow:next` `@dev`/`@qa` done-gate (the non-security categories: anti-patterns / TODOs / dead code / duplication; security stays with `security:audit`).

```jsonc
"audit_code": {
  "tracked_gate": "advisory",  // "block" | "advisory" | "off"
  "scope": "changed"           // "changed" (git diff, fast) | "full" (whole tree)
}
```

- **`advisory`** (default) — the scan runs, persists `.aioson/context/audit-code.json`, emits a guard event on a HIGH finding, and rides a summary on the workflow result, but **never blocks** the stage. `audit:code` is a heuristic opinion, not the feature's declared contract, so it does not gate by default (and existing flows keep advancing).
- **`block`** — a HIGH finding in scope is a **hard gate**: `@dev`/`@qa` cannot complete until it is fixed (or the policy relaxed). Use this when you want the tracked workflow to enforce code health like a runtime gate.
- **`off`** — skip the step entirely.

This is deterministic (no LLM judgment) and runs at every tracked `@dev`/`@qa` completion. `@qa` separately treats a HIGH as a Gate-D blocker in its review, and the same scan auto-fires as an advisory in `aioson agent:epilogue` for untracked sessions.

> **Periphery analog:** for the **non-code** artifacts the specialized agents produce (project context, genomes, profiler reports, the discovery cache, hybrid skills, generated sites, copy, commit subjects), the same build-free philosophy is applied by `aioson verify:artifact` — see **`verify-artifact-gates.md`**.

## Rule-compliance gate (`rules_check`)

Controls `aioson rules:check`, wired into the same tracked done-gate. Where `audit_code` asks whether the code is any good, this asks whether the code obeys the rules the project itself declared — the checkers bound by `enforcement:` in the frontmatter of a rule, doc, or process skill.

```jsonc
"rules_check": {
  "tracked_gate": "block",     // "block" | "advisory" | "off"
  "scope": "changed"           // "changed" (git diff, fast) | "full" (whole tree)
}
```

- **`block`** (default) — a HIGH finding refuses the stage. The default differs from `audit_code` on purpose: a heuristic quality opinion should not gate, but a declared rule is the top of the authority chain, and a PRD, plan, or dossier deviation may never resolve a conflict in its own favour.
- **`advisory`** — persist `.aioson/context/rules-check.json` and emit a guard event without blocking.
- **`off`** — skip the step entirely.

Only `.aioson/rules/` produces blocking HIGH findings. A checker declared solely by a doc or a process skill reports `MED`: those surfaces carry procedure and craft rather than law, so falling short of one is advice, not a refused handoff.

The honest way to switch this off for a project is the rule file itself — edit its scope or remove it, once and in the open. That keeps the override channel visible instead of letting each feature quietly decide the rule does not apply this time.

**Legacy codebases.** A project written against a different convention before the rule existed is not charged retroactively on every unrelated edit. When the gate is about to block and most of the tree already violates, the report carries `divergence` and the message offers the decision instead of demanding a migration mid-slice. `aioson rules:check . --baseline` records the existing violations in `.aioson/context/rules-baseline.json` as counted debt: they stay visible in every run, they never block, and every new violation still does. Commit that file — it is a recorded decision, not a generated report. Only a human runs it.

## Scope-drift gate (`spec:analyze --stage`)

Not configurable, always on in the tracked `@dev`/`@qa` done-gate, for the canonical PRD → plan artifacts as well as the legacy ones. It runs `aioson spec:analyze . --feature={slug} --stage=dev|qa` — the same command `@qa` reads for scope-drift classification — and tiers the result honestly:

- **blocks** on what the completing stage owns or what is broken beyond doubt: a planned file that does not exist, a retired file still present, an invalid `harness-contract.json`, a readiness declared blocked;
- **surfaces, never blocks** the code-vs-plan drift: `plan_path_untouched` (a planned `create`/`modify`/`retire` path with no change since the feature began) and `delivery_outside_plan` (a delivered file no plan row declares — tests, lockfiles, build output and everything the installer writes are support, not drift — `.aioson/` plus its siblings outside it: `.claude/`, `.codex/`, `.opencode/`, `.agents/`, `agents/_shared/` and the root instruction files; a harness contract's `allowed_files` sanctions more). The plan may have over-declared, and the file outside it may be the right fix: the gate demands that the difference be **seen and recorded** (a delivery row or an approved deviation), not that it not exist. Advisories ride the workflow result, a guard event, and `.aioson/context/spec-analyze-{slug}.json`;
- names upstream errors (a malformed PRD or plan table) with their owner instead of refusing the wrong stage — `feature:close` still blocks on them.

Two human checkpoints ride the same done-gates, both recorded by CLI and both advisory at close: a **decision checkpoint** (`aioson decision:add` / `decision:resolve` — a pending blocking decision refuses `workflow:next` until a human resolves it; see `autopilot-handoff.md`) and the **owner summary** (`aioson feature:summary --write` / `feature:acknowledge` — `feature:close` reports missing / stale / acknowledged).

`plan_path_untouched` is measured against the feature's start (the parent of the first commit touching its `.aioson/` artifacts, a `main`/`master` merge-base, or the loop's `baseline.json`); when none resolves the diff covers uncommitted work only, the check says so (`delivery_drift_base_fallback`) and does not guess.

## Examples

Pin qa to the cheapest Claude tier per phase:
```json
"qa": { "dispatch": { "claude": { "mode": "native", "model": "haiku-4.5" } } }
```

Add a cross-vendor second opinion on the contract for sensitive features:
```json
"validator": { "cross_check": { "enabled": true, "mode": "external", "tool": "codex", "model": "configured-default" } }
```
