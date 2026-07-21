# Autopilot handoff — AIOSON (EN)

> **What this is:** the reference for AIOSON's full-feature autopilot — the opt-in protocol that removes the **mechanical** handoff confirmations across the whole feature workflow, from `@product` to the `feature:close` recommendation.
> **Reading time:** 8 min.
> **What you will learn:**
> - How the run mode (autopilot vs. step-by-step) is decided, and the precedence between the inline tokens, per-feature scheme, and project flag
> - How the chain crosses from the spec authority into `@dev`, and how the post-dev review cycle routes through `@qa`
> - The stop conditions that always hand back to a human, and the reliability fixes that keep the chain from stalling

Genuine human decisions (product scope, sizing/enrichment) still happen interactively inside their agents; autopilot only removes the mechanical "run the next thing" step once an agent's own work is settled. `feature:close`/publish is **always** a human gate — it is never auto-run.

---

## Two segments

```
Segment 1: @product → @sheldon (SMALL) / @orchestrator (MEDIUM) → @dev
Segment 2: @dev → @qa (hub) → @tester / @pentester (only when their trigger fires) → @validator → STOP
```

1. **Spec → dev chain** — each spec agent, once its own decisions are resolved (no open `AskUserQuestion`, the gates it owns approved), seeds the agentic scheme and auto-invokes the next stage instead of stopping. It crosses the pre-dev boundary via the `dev-state.md` cold-start packet, not by carrying raw upstream chat forward.
2. **Post-dev review cycle** — the implementation and review agents chain automatically until the feature is ready to close. `@qa` is the hub: it owns the routing to the specialized agents and the corrections loop.

Historically segment 1 always stopped at the human (upstream agents ended on human decisions); autopilot now crosses it too, but only mechanically — a real product/sizing decision still pauses for the human before any auto-invoke.

---

## Activation

Autopilot is active when the first two hold, gated by the third:

1. **Armed signal** — `auto_handoff: true` in `project.context.md` (the project default), OR `.aioson/context/workflow-execute.json` exists with `agentic_policy.enabled: true` **and `feature` matching the current slug** (the seeded scheme — a scheme left by a different/closed feature does NOT count, for any agent in the chain). **Per-feature disarm wins over the flag:** a scheme for the current slug with `agentic_policy.enabled: false` (written by `aioson workflow:execute . --feature={slug} --seed --step`) turns autopilot OFF for that feature even when `auto_handoff: true` is set project-wide.
2. A feature workflow is active (feature slug known).
3. The current agent's own gate/verdict passed AND no genuine human decision is open (see stop conditions).

### Inline run-mode tokens (highest precedence)

A standalone `--auto` or `--step` in the activation arguments of `@product` (kickoff) or `@dev` (late entry/override) **is** the run-mode decision — the agent strips it from the task text and never asks:

| Token | Where | Effect |
|---|---|---|
| `/product --auto <task>` | Feature kickoff | Skips the on-screen question; seeds the scheme and arms the whole chain from that point |
| `/product --step <task>` | Feature kickoff | Skips the question; writes the disarmed scheme (`agentic_policy.enabled: false`) — manual handoffs |
| `/dev --auto` | Entering `@dev` | Arms autopilot from here even with no prior flag/scheme — implementation + the post-dev review cycle run autonomously |
| `/dev --step` | Entering `@dev` | Disarms autopilot for **this feature only** — stops at the `@dev → @qa` handoff even in an always-autopilot project (a per-feature disarm always wins over the project-wide flag) |

Downstream agents (`@qa`/`@tester`/`@pentester`/`@validator`) do not parse tokens — they only read the flag/scheme that is already decided. Only `@product` asks; the rest never re-prompt.

### No token: the question happens once, at `@product`'s handoff

Absent an inline token and a standing choice, `@product` asks on screen at the PRD handoff (`AskUserQuestion`, localized, with a recommendation marker):

- **Autopilot — run everything to `feature:close`** → runs the autopilot actions for this feature only (does not persist a default).
- **Step by step — I'll drive each stage** → presents the manual handoff block and stops.
- **Always autopilot in this project** → writes `auto_handoff: true` to `project.context.md` (adds the line if absent) and runs the autopilot actions.

Full precedence, strongest to weakest:

```
1. Inline token (--auto / --step)
2. Per-feature scheme (.aioson/context/workflow-execute.json with feature={slug}) — armed or disarmed
3. Project-wide flag (auto_handoff: true/false in project.context.md)
4. @product's on-screen question (only when none of the above is set)
```

---

## Seeding the agentic scheme

The first spec agent to finish under autopilot seeds the run's contract — the "scheme" the whole chain follows, and what makes a feature built the normal way (`@product → @sheldon`/`@orchestrator` → …) run to `feature:close` without the user launching anything:

```bash
aioson workflow:execute . --feature={slug} --seed --tool=<tool>
```

`--seed` writes `.aioson/context/workflow-execute.json` (with `agentic_policy.enabled: true` — review-loop caps, `feature_close: human_gate`, and the stop conditions) plus `.aioson/context/workflow.state.json`. It is **seed-only**: it records the policy the interactive agents follow but does NOT drive stage transitions itself — the agents do, via `Skill(aioson:agent:<next>)` + `aioson workflow:next . --complete=<agent>`. Re-seeding the same slug is idempotent.

The seed also creates `.aioson/context/agent-execution-{slug}.json` once. After creation this file is developer-owned: init, resume, re-seed, and later `--max-*-cycles` flags preserve it byte for byte. It controls enabled agents, models, `reasoning_effort`, and cycle limits. New limits default to one; Codex manifests initialize every agent with `"reasoning_effort": "medium"`, while Claude/OpenCode omit the unsupported field. Change an existing feature by editing this manifest directly.

**Seed failure is a stop condition.** The seeding agent checks the command result: a `different_active_feature` failure means another feature is genuinely active in `workflow.state.json` — surface it to the user (close/pause it, or `aioson feature:sweep .`) and stop with the manual handoff. The chain is never treated as armed when the seed failed.

---

## Routing — deterministic, never LLM-chosen

The next agent comes from the workflow state machine and on-disk evidence, not from model judgment:

- CLI available: run `aioson workflow:next .` (inspect mode) and use the stage it reports, or the `next` field of `.aioson/context/workflow.state.json`.
- CLI absent: follow the classification sequence in `.aioson/config.md` and the routing tables below, exactly.

Never skip a stage, reorder, or pick an agent the state machine/routing table did not name.

---

## Segment 1 — spec → dev chain

**SMALL (lean lane, default):** `@product` → `@sheldon` → `@dev`. Under autopilot: `@product`, once the PRD is settled, seeds the scheme and invokes `@sheldon`; `@sheldon`, once sizing/enrichment is confirmed and its lean-lane artifacts + `dev-state.md` are written, completes its own stage (`aioson workflow:next . --complete=sheldon`) and invokes `@dev`. The opt-in full-merged SMALL detour auto-chains `@analyst` → `@architect` → `@dev` when opted in (with `@scope-check`/`@discovery-design-doc` only if the sequence adds them).

**MEDIUM (maestro lane, default):** `@product` → `@orchestrator` → `@dev`. Under autopilot: `@product` seeds and invokes `@orchestrator`; `@orchestrator`, once its gated spec package (Gates A/B/C approved, readiness ready) + `dev-state.md` are written, invokes `@dev`. The maestro fans out to `@analyst`/`@architect`/`@pm` as sub-agents, not as workflow stages — those chain as stages only under an opt-in full-chain detour.

Crossing into `@dev` goes through the `dev-state.md` cold-start packet the spec agent writes — `@dev`'s session-start protocol loads only that minimal package, so it does not inherit the heavy upstream chat; transparent auto-compact trims the rest. That is why the crossing is safe without a manual `/compact`. The spec agent still stops with the normal manual `/dev` recommendation if it has an open product/scope/sizing decision, or a gate it owns is not approved. Recommend `/clear` only for a hard reset, feature switch, polluted context, or security-sensitive reset.

---

## Segment 2 — post-dev review cycle (hub = `@qa`)

Once a human starts `@dev` and it finishes, the chain resumes automatically. `@qa` is the hub; every specialized agent returns to it.

| Current | Condition | Auto-invoke |
|---|---|---|
| `@dev` (first pass) | tests green, gates clear, no open corrections cycle | `@qa` |
| `@dev` (corrections) | corrections applied, tests green | `@qa` (re-verify) |
| `@qa` | verdict **FAIL** (Critical/High) | `@dev` via the corrections auto-cycle (cap 3, security gate) |
| `@qa` | verdict **PASS** + `@tester` trigger fires and not yet run clean | `@tester` |
| `@qa` | verdict **PASS** + `@pentester` trigger fires and not yet run clean | `@pentester` |
| `@qa` | verdict **PASS** + harness contract present and `@validator` not yet PASS | `@validator` |
| `@qa` | verdict **PASS** + no pending trigger/contract | **STOP** — recommend `aioson feature:close . --feature={slug}` |
| `@tester` | surfaced dev-owned blocking gaps | `@dev` |
| `@tester` | no dev-owned blocking gaps | `@qa` (re-evaluate/sign-off) |
| `@pentester` | open `recommended_owner = dev` findings | `@dev` |
| `@pentester` | no open dev-owned findings | `@qa` (re-evaluate/sign-off) |
| `@validator` | PASS | **STOP** — recommend `aioson feature:close` |
| `@validator` | FAIL | `@dev` |

**Trigger source for `@tester`/`@pentester`:** the existing `@qa` trigger logic (coverage gaps → `@tester`; sensitive surface auth/secrets/data/upload/external-URL/supply-chain → `@pentester`). All four agents are ALWAYS wired into the chain, but `@tester`/`@pentester` only EXECUTE when their trigger fires — otherwise `@qa` skips straight to the next routing row.

**Re-entry guard (no infinite loops):** before auto-invoking a specialized agent, `@qa` checks on-disk evidence that it already ran clean this cycle (`security-findings-{slug}.json` clean → `@pentester` done; a tester coverage artifact present with no new gap → `@tester` done; validator PASS recorded → `@validator` done). An agent that already returned clean is not re-invoked.

**`@validator` runs fresh-context:** when routing to `@validator` with a harness contract present, it never runs inline in the current session — the implementation history biases the verdict. Sequence: `aioson harness:check` (deterministic checks) → `aioson harness:validate` (generates the self-contained `validator-prompt.txt`: criteria + check results + diff vs. base) → execution in an **isolated subagent** (Task tool, no conversation context) that writes its verdict to `last-validator-output.json` → `aioson harness:validate` again, to consume the verdict through the circuit breaker. Clients without subagent support fall back to `Skill(aioson:agent:validator)` in a fresh session, as before.

---

## Stop conditions — break the chain and emit the normal manual handoff

1. **`feature:close`/publish** — ALWAYS the human gate. When `@qa` (PASS, nothing pending) or `@validator` (PASS) is the last clean step, STOP and recommend `aioson feature:close . --feature={slug}`. Never auto-run `feature:close`, `feature:archive`, `npm publish`, or any publish/close action.
2. **Genuine human decision open** — a spec agent with an unresolved product/scope/sizing question (an open `AskUserQuestion`, or a gate it owns not yet approved) resolves that decision with the human before any auto-invoke, and stops with the normal manual handoff. Autopilot removes mechanical stops, never real decisions.
3. **Corrections cap reached** — review cycles are bounded by `agentic_policy.review_cycle` (default **3**); when `review-cycle:advance` returns `stop_cycle_limit`, stop and escalate to the human.
4. **Critical security finding** — the `@qa` corrections security gate (auth/secret/credential/session/password/token/PII/encryption keywords) blocks the auto-loop; stop and require human intervention.
5. **Verdict not clean / gate or readiness blocked** — the `@orchestrator` maestro spec package not gate-approved (Gates A/B/C) or its readiness `blocked`, `@validator` FAIL with no safe corrections path (and, when present as detours, `@architect` Gate B/merged-mode readiness `blocked`, `@pm` Gate C blocked, `@scope-check` not `approved`/`patched`, or `@discovery-design-doc` readiness `blocked`): stop and route to the owner manually.
6. **Context budget** — estimated usage ≥ `context_warning_threshold` (`.aioson/config.md`): write the compaction checkpoint to `.aioson/context/last-handoff.json`, stop, and recommend `/compact` for same-feature continuation. The workflow resumes from `.aioson/context/workflow.state.json` — the next session re-enters autopilot automatically. Recommend `/clear` only for a hard reset, feature switch, polluted context, or security-sensitive reset.
7. **Ambiguity** — workflow state unavailable and routing ambiguous, or any real decision requires user input: stop and ask, manually.

The user can interrupt at any time (Ctrl+C); autopilot never retries an interrupted invocation.

---

## `--help` on the 13 most-used agents

A standalone `--help` in the activation arguments (`/<agent> --help`) makes the agent print a localized quick-help block — what it does / when to use / options / typical calls / artifacts produced / next agents — and stop, doing no work. This applies to the 13 most-used agents, sourced from a single file, `.aioson/docs/agent-help.md`:

```
@product · @briefing · @briefing-refiner · @dev · @deyvin · @discover ·
@neo · @orache · @orchestrator · @tester · @pentester · @qa · @sheldon
```

Each agent prints only its own section, never the whole file. Individual agent cards (PT: [`docs/pt/4-agentes/`](../../pt/4-agentes/README.md)) link here when relevant.

---

## Reliability

Three reliability fixes that directly affect anyone running autopilot:

- **A stale workflow state no longer blocks the next feature's autopilot.** A `workflow.state.json` left by a closed/abandoned feature is discarded and reseeded automatically — only a genuinely active *different* feature (still `in_progress` in `features.md`) triggers the `different_active_feature` refusal. When that happens, close/pause the active feature or run:

  ```bash
  aioson feature:sweep .
  ```

- **`aioson update` now prints exactly which template landed**, including the exact build for an `npm link`ed (dogfooding) install:

  ```
  Template version applied: 1.36.0 (a1b2c3d, 2026-07-01)
  ```

  (the `(sha, date)` suffix only appears for a git-checkout install; a normal npm install prints just the semantic version.)

- **The lean lane's state machine no longer regresses to `@sheldon` after implementation.** Previously, nothing resolved the `sheldon` stage, so `aioson workflow:next --complete=dev` re-activated `@sheldon` (a backwards activation). The `sheldon` stage is now recognized as completed along with the rest of the chain — completing a later stage can never leave `next` pointing at an earlier, already-resolved stage.

---

## How agents chain

When autopilot is active and no stop condition applies:

1. The agent finishes its own closing duties first (artifacts on disk, gate registration, dossier/spec updates, `agent:epilogue`/`agent:done`).
2. If the runtime checkpoint contains `agentic_policy.enabled=true`, it lets the gateway continue from `.aioson/context/workflow-execute.json` — it does not ask the user to confirm the next deterministic stage.
3. If no runtime gateway is available, it emits a one-line transition notice: `Autopilot: @<current> done → invoking @<next> (Ctrl+C to interrupt)`.
4. It invokes `Skill(aioson:agent:<next>)` with the task `"continue feature {slug} — autopilot handoff from @<current>"`. No user prompt — Ctrl+C interrupts.

---

## CLI tracking

```bash
# See the current workflow state (which agent is active)
aioson workflow:status .

# Seed the agentic scheme without advancing (spec agents do this when they finish)
aioson workflow:execute . --feature=checkout --seed --tool=claude

# Seed already disarmed (equivalent to the --step token)
aioson workflow:execute . --feature=checkout --seed --step --tool=claude

# Advance manually (when autopilot is off)
aioson workflow:next .

# Discard a stale workflow.state.json left by a closed/abandoned feature
aioson feature:sweep .

# See the handoff prepared by the previous agent
cat .aioson/context/last-handoff.json
```

---

## Example: SMALL feature, autopilot armed end-to-end

```
You > /product --auto build email notifications

@product > PRD closed. Autopilot mode (inline token) — no question asked.
           Seeding the scheme... invoking @sheldon.

@sheldon > Gates A/B/C approved. dev-state.md written.
           Autopilot: @sheldon done → invoking @dev.

@dev     > Phase loop: 3 phases implemented back to back, no stopping.
           Tests green. Autopilot: @dev done → invoking @qa.

@qa      > PASS. Neither @tester nor @pentester trigger fired. No pending harness contract.
           STOP — "Recommend: aioson feature:close . --feature=email-notifications"

You > aioson feature:close . --feature=email-notifications
```

## Example: MEDIUM feature, run mode chosen on screen at `@product`'s handoff

```
You > /product

@product > [drives the PRD...] PRD closed. Classification: MEDIUM.
           How do you want to run this feature?
           1. Autopilot — run everything to feature:close (recommended)
           2. Step by step — I'll drive each stage
           3. Always autopilot in this project

You > 3

@product > Wrote auto_handoff: true to project.context.md.
           Seeding the scheme... invoking @orchestrator.

@orchestrator > Fan-out @analyst + @architect + @pm (+ @ux-ui). Gates A/B/C approved.
                Autopilot: @orchestrator done → invoking @dev.

@dev          > Implemented. Autopilot: @dev done → invoking @pentester (inline in MEDIUM).

@pentester    > No HIGH/CRITICAL findings. Autopilot: @pentester done → invoking @qa.

@qa           > PASS. Harness contract present, @validator not yet PASS → invoking @validator.

@validator    > Fresh, isolated context. harness:check + LLM judgment of criteria with no verification.
                PASS. STOP — "Recommend: aioson feature:close . --feature=..."
```

---

## Lane B — compiled execution (opt-in alternative)

For **MEDIUM** features, there is an execution lane alternative to real-time autopilot: **Lane B**, triggered by the `@forge-run` agent (`/forge-run`). Instead of chaining live agents, `@forge-run` **compiles** the feature's artifacts into a `.aioson/plans/{slug}/forge-run.workflow.js` (via `aioson forge:compile`) and runs it through the workflow runtime.

The compiled workflow embeds the same review cycle: a `parallel()` per Wave → convergence at `harness:check` → 3-lens adversarial review for binary criteria without `verification` → the fresh-context validator closing via `harness:validate` → `apply-validation`. Like the normal lane, it **never** runs `feature:close`/publish: PASS recommends the human run `feature:close`; FAIL routes back to `@dev` through the normal lane. One feature per run.

When to prefer each:
- **Autopilot (normal lane)** — deterministic handoffs between live agents; default for SMALL and MEDIUM.
- **Lane B (`@forge-run`)** — compiled, reproducible, versionable execution of one MEDIUM feature; opt-in, with a cost warning before running.

See [Executable verification](./executable-verification.md#phase-5-v1280--lane-b-forgecompile--forge-run) for the Lane B mechanics.

---

## Next steps

- [Executable verification](./executable-verification.md) — the five-phase theme Lane B belongs to
- [CLI reference — workflow:next](./cli-reference.md#workflownext) and the classification-based sequences
- PT: [SDD Framework](../../pt/5-referencia/sdd-framework.md) — full MICRO/SMALL/MEDIUM sequence and the lean/maestro lanes
- PT: [`@product` card](../../pt/4-agentes/product.md) — where the run mode is decided
- PT: [`@dev` card](../../pt/4-agentes/dev.md) — `--auto`/`--step` at implementation entry
