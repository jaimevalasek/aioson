---
description: "Autopilot handoff protocol: automatic agent chaining across the feature workflow — the opt-in pre-dev detour chain and the post-dev review cycle (dev→qa→tester/pentester→validator) — with deterministic routing and explicit stop conditions. The chain never auto-runs feature:close/publish."
task_types: [handoff, autopilot]
triggers: [auto handoff, autopilot, next agent]
---

# Autopilot handoff (feature start → dev → review cycle)

Opt-in protocol that removes the **mechanical** handoff confirmations across the whole feature workflow — the "type /sheldon", "type /dev", "run phase 2", "run qa" stops. Genuine human decisions (product scope, sizing/enrichment) still happen interactively inside their agents; autopilot only removes the mechanical "run the next thing" step once an agent's own work is settled. Two segments:

1. **Spec → dev chain (`@product → @sheldon`/`@orchestrator` → `@dev`):** when autopilot is on, each spec agent — once its own decisions are resolved (no open `AskUserQuestion`, the gates it owns approved) — seeds the agentic scheme and auto-invokes the next stage instead of stopping. It crosses the pre-dev boundary via the `dev-state.md` cold-start packet, not by carrying raw upstream chat forward. `@analyst`, `@architect`, `@pm`, `@scope-check`, and `@discovery-design-doc` chain automatically only when an opt-in detour adds them to the active sequence.
2. **Post-dev review cycle (`@dev` → `@qa` → `@tester`/`@pentester` → `@validator`):** the implementation and review agents chain automatically until the feature is ready to close. `@qa` is the hub: it owns the routing to the specialized agents and the corrections loop.

Both segments stop only at the human close/publish gate (`feature:close`) and at the hard stop conditions below. Historically Segment 1 stayed manual (upstream agents end on human decisions); autopilot now crosses it too, but only mechanically — a real product/sizing decision still pauses for the human before any auto-invoke.

## Activation

Autopilot is active when BOTH of the first two hold, gated by the third:

1. Either `project.context.md` frontmatter has `auto_handoff: true`, OR `.aioson/context/workflow-execute.json` exists with `agentic_policy.enabled: true` **and `feature` matching the current slug** (the seeded scheme — a scheme left by a different/closed feature does NOT count, for any agent in the chain). **Per-feature disarm wins over the flag:** a scheme for the current slug with `agentic_policy.enabled: false` (written by `aioson workflow:execute . --feature={slug} --seed --step`) turns autopilot OFF for that feature even when `auto_handoff: true` — an explicit per-feature choice always beats the project default.

**Inline run-mode tokens (highest precedence, human entry points only):** a standalone `--auto` or `--step` in the activation arguments of `@product` (kickoff) or `@dev` (late entry/override) IS the run-mode decision — the agent strips it from the task text and never asks. `--auto` seeds the scheme (arming the whole chain from that point); `--step` writes the disarmed scheme. Downstream agents (`@qa`/`@tester`/`@pentester`/`@validator`) do not parse tokens — they read the flag/scheme. Absent both, the run mode is not yet chosen: **`@product` asks it on screen at feature kickoff** (Autopilot / Step by step / Always autopilot — see product.md "Run mode"). Picking Autopilot seeds the scheme (activating this segment); "Always autopilot" also writes `auto_handoff: true`; Step by step leaves both unset = manual handoffs. Only `@product` asks — downstream agents read the flag/scheme and never re-prompt.
2. A feature workflow is active (feature slug known).
3. The current agent's own gate/verdict passed AND no genuine human decision is open (see stop conditions).

## Seeding the agentic scheme

The first spec agent to finish under autopilot seeds the run's contract — this is the "scheme" the whole chain follows, and it is what makes a feature built the normal way (`@product → @sheldon`/`@orchestrator` → …) run to `feature:close` without the user launching anything:

```bash
aioson workflow:execute . --feature={slug} --seed --tool=<tool>
```

`--seed` writes `.aioson/context/workflow-execute.json` (with `agentic_policy.enabled: true` — review-loop caps, `feature_close: human_gate`, and the stop conditions) plus `.aioson/context/workflow.state.json`. It is **seed-only**: it records the policy the interactive agents follow but does NOT drive stage transitions itself (the agents do, via `Skill(aioson:agent:<next>)` + `aioson workflow:next . --complete=<agent>`). Re-seeding the same slug is idempotent, and a stale `workflow.state.json` left by a feature that is no longer active in `features.md` is discarded and reseeded. Once the scheme exists with `agentic_policy.enabled`, autopilot is on for the whole feature even if `auto_handoff` was never written to frontmatter.

**Seed failure is a stop condition.** The seeding agent must check the command result: a `different_active_feature` failure means another feature is genuinely active in `workflow.state.json` — surface it to the user (close/pause it, or `aioson feature:sweep .`) and stop with the manual handoff. Never continue the chain as if autopilot were armed when the seed failed.

The headless/tracked runner `aioson workflow:execute . --feature={slug} --tool=<tool> --agentic` (without `--seed`) is the same contract but also advances checkpoints from the CLI — use it for non-interactive runs. Prompt-level `Skill(...)` chaining is how interactive Claude Code / codex sessions consume the scheme.

Execution selection lives in `.aioson/context/agent-execution-{slug}.json`. Validate it before code with `aioson agent:execution:validate`; use `agent:execution:dispatch|resume` for execution. Generated manifests default to `external`: the installed Claude/Codex/OpenCode CLI runs headlessly in a fresh process and writes a bound report. Native subagent/fresh-session modes require an explicit bridge capability; prompt-level chaining is not evidence. The core cannot force a client to open a visible interactive chat window.

Codex entries may use a canonical slug or a human form such as `"model": "GPT 5.6 Terra"`, plus an optional `"reasoning_effort": "high"`. Validation resolves the current local Codex model catalog in conservative tiers: exact slug, normalized display name, unique alias, then a uniquely safe fuzzy match. Version numbers must remain identical, and ambiguous matches pause before process spawn. The manifest remains unchanged; state, reports, CLI output, and telemetry keep `model_requested`, `model_resolved`, and `model_resolution_strategy` separately. When the catalog is unavailable, only `configured-default` and literal model IDs are accepted as unverified fallbacks. Explicit reasoning effort is never silently downgraded or moved to another provider.

Cross-repository writes are opt-in per agent through `writable_roots`. Every path must exist, be a directory, contain no traversal, and is canonicalized before dispatch and recorded in state/report. Codex maps roots to repeated `exec --add-dir <absolute>` argv; Claude maps to `--add-dir`. OpenCode currently has no verified additional-writable-root flag, so a non-empty list returns `host_capability_missing` rather than widening access silently.

## Routing — deterministic, never LLM-chosen

The next agent comes from the workflow state machine and on-disk evidence, not from model judgment:

- CLI available: run `aioson workflow:next .` (inspect mode) and use the stage it reports, or the `next` field of `.aioson/context/workflow.state.json`.
- CLI absent: follow the classification sequence in `.aioson/config.md` and the routing table below exactly.

Never skip a stage, reorder, or pick an agent the state machine / routing table did not name.

## Auto-invoke pattern

When autopilot is active and no stop condition applies:

1. Finish your own closing duties first (artifacts on disk, gate registration, dossier/spec updates, `agent:epilogue`; `agent:done` remains the fallback).
2. If the runtime checkpoint contains `agentic_policy.enabled=true`, let the gateway continue from `.aioson/context/workflow-execute.json`; do not ask the user to confirm the next deterministic stage.
3. If no runtime gateway is available, emit a one-line transition notice: `Autopilot: @<current> done → invoking @<next> (Ctrl+C to interrupt)`.
4. Invoke `Skill(aioson:agent:<next>)` with the task `"continue feature {slug} — autopilot handoff from @<current>"`. No user prompt — Ctrl+C interrupts.

## Segment 1 — spec → dev chain

SMALL feature (lean default): `@product` → `@sheldon` → `@dev`. Under autopilot: `@product`, once the PRD is settled, seeds the scheme and invokes `@sheldon`; `@sheldon`, once sizing/enrichment is confirmed and its lean-lane artifacts + `dev-state.md` are written, completes its own stage (`aioson workflow:next . --complete=sheldon`) and invokes `@dev`. The full-merged SMALL detour auto-chains `@analyst` → `@architect` → `@dev` when opted in (with `@scope-check`/`@discovery-design-doc` only if the sequence adds them).

MEDIUM feature (maestro default): `@product` → `@orchestrator` → `@dev`. Under autopilot: `@product` seeds + invokes `@orchestrator`; `@orchestrator`, once its gated spec package (Gates A/B/C approved, readiness ready) + `dev-state.md` are written, invokes `@dev`. The maestro fans out to `@analyst`/`@architect`/`@pm` as sub-agents, not as workflow stages; those chain as stages only under an opt-in full-chain detour.

Crossing into `@dev` goes through the `dev-state.md` cold-start packet the spec agent writes — `@dev`'s session-start protocol loads only that minimal package, so `@dev` does not inherit the heavy upstream chat; transparent auto-compact trims the rest. That is why the crossing is safe without a manual `/compact`. The spec agent still stops with the normal manual `/dev` recommendation if it has an open product/scope/sizing decision or a gate it owns is not approved. Recommend `/clear` only when the user needs a hard reset, a feature switch, polluted context, or a security-sensitive reset.

## Segment 2 — post-dev review cycle (hub = `@qa`)

Once a human starts `@dev` and it finishes, the chain resumes automatically. `@qa` is the hub; every specialized agent returns to it.

Routing table (each row is followed only when autopilot is active and no stop condition applies):

| Current | Condition | Auto-invoke |
|---|---|---|
| `@dev` (first pass) | tests green, gates clear, no open corrections cycle | `@qa` |
| `@dev` (corrections) | corrections applied, tests green (`review-cycle:status` active; `qa-dev-cycle.json` is legacy QA compatibility) | `@qa` (re-verify) |
| `@qa` | verdict **FAIL** (Critical/High) | `@dev` via the corrections auto-cycle (cap 3, security gate) |
| `@qa` | verdict **PASS** + `@tester` trigger fires AND `@tester` not yet run clean | `@tester` |
| `@qa` | verdict **PASS** + `@pentester` trigger fires AND `@pentester` not yet run clean | `@pentester` |
| `@qa` | verdict **PASS** + harness contract present AND `@validator` not yet PASS | `@validator` |
| `@qa` | verdict **PASS** + no pending trigger/contract | **STOP** — recommend the human run `aioson feature:close . --feature={slug}` |
| `@tester` | surfaced dev-owned blocking gaps | `@dev` |
| `@tester` | no dev-owned blocking gaps | `@qa` (re-evaluate / sign-off) |
| `@pentester` | open `recommended_owner = dev` findings | `@dev` |
| `@pentester` | no open dev-owned findings | `@qa` (re-evaluate / sign-off) |
| `@validator` | PASS | **STOP** — recommend the human run `aioson feature:close` |
| `@validator` | FAIL | `@dev` |

**Trigger source for `@tester`/`@pentester`:** the existing `@qa` trigger logic (coverage gaps → `@tester`; sensitive surface auth/secrets/data/upload/external-URL/supply-chain → `@pentester`). The four agents are ALWAYS wired into the chain, but `@tester`/`@pentester` only EXECUTE when their trigger fires — otherwise `@qa` skips straight to the next routing row.

**Re-entry guard (no infinite loops):** before auto-invoking a specialized agent, `@qa` checks on-disk evidence that it already ran clean this cycle (e.g. `security-findings-{slug}.json` clean → `@pentester` done; a tester coverage artifact present with no new gap → `@tester` done; `progress.json.ready_for_done_gate` / validator PASS recorded → `@validator` done). An agent that already returned clean is not re-invoked.

**`@validator` runs fresh-context:** when routing to `@validator` with a harness contract present, do not run it inline in the current session — the implementation history biases the verdict. Instead: (1) `aioson harness:check . --slug={slug}` (deterministic checks), (2) `aioson harness:validate . --slug={slug}` — the generated `validator-prompt.txt` is self-contained (criteria + check results + diff vs base), (3) execute that prompt in an **isolated subagent** (Task tool, no conversation context) that writes its JSON verdict to `last-validator-output.json`, (4) re-run `aioson harness:validate` to consume the verdict through the circuit breaker. Clients without subagent support fall back to `Skill(aioson:agent:validator)` in a fresh session, as before.

## Stop conditions — break the chain and emit the normal manual handoff

1. **`feature:close` / publish** — ALWAYS the human gate. When `@qa` (PASS, nothing pending) or `@validator` (PASS) is the last clean step, STOP and recommend `aioson feature:close . --feature={slug}`. Never auto-run `feature:close`, `feature:archive`, `npm publish`, or any publish/close action.
2. **Genuine human decision open** — the spec authority persists causal decisions in `.aioson/context/features/{slug}/decision-checkpoint.json`. Any pending `blocking-decision` stops auto-invoke even without a plan manifest; after the answer, update its disposition and affected CAP/REQ/AC before continuing. Optional items default to deferred and do not block. Autopilot removes mechanical stops, never real decisions.
3. **Corrections cap reached** — review cycles are bounded by `agentic_policy.review_cycle` (default 3); when `review-cycle:advance` returns `stop_cycle_limit`, stop and escalate to the human.
4. **Critical security finding** — the `@qa` corrections security gate (auth/secret/credential/session/password/token/PII/encryption keywords) blocks the auto-loop; stop and require human intervention.
5. **Verdict not clean / gate or readiness blocked** — the `@orchestrator` maestro spec package not gate-approved (Gates A/B/C) or its readiness `blocked`, `@validator` FAIL with no safe corrections path (and, when present as detours, `@architect` Gate B / merged-mode readiness `blocked`, `@pm` Gate C blocked, `@scope-check` not `approved`/`patched`, or `@discovery-design-doc` readiness `blocked`): stop and route to the owner manually.
6. **Context budget** — estimated usage ≥ `context_warning_threshold` (`.aioson/config.md`): write the compaction checkpoint to `.aioson/context/last-handoff.json`, stop, and recommend `/compact` for same-feature continuation. The workflow resumes from `.aioson/context/workflow.state.json` — the next session re-enters autopilot automatically. Recommend `/clear` only for a hard reset, feature switch, polluted context, or security-sensitive reset.
7. **Ambiguity** — workflow state unavailable AND routing ambiguous, or any real decision requires user input: stop and ask, manually.

The user can interrupt at any time (Ctrl+C); autopilot never retries an interrupted invocation.

## Rationale

Industry-validated design (see `researchs/auto-handoff-pipeline-2026/summary.md`): deterministic routing beats LLM routing; human gates belong where they catch mistakes — at the start of implementation (`@dev` entry: compact operational handoff) and at the irreversible boundary (`feature:close`/publish). Every autonomous loop needs explicit exit conditions and bounds (the corrections cap, the re-entry guard); per-hop context checkpointing is the load-bearing cost mitigation.
