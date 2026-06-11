---
description: "Autopilot handoff protocol: automatic agent chaining across the feature workflow — the analyst→dev pre-dev chain and the post-dev review cycle (dev→qa→tester/pentester→validator) — with deterministic routing and explicit stop conditions. The chain never auto-runs feature:close/publish."
---

# Autopilot handoff (analyst → dev → review cycle)

Opt-in protocol that removes manual handoff confirmations in the deterministic segments of the feature workflow. Two segments:

1. **Pre-dev chain (`@analyst` → `@dev`):** `@analyst`, `@scope-check`, `@architect`, `@discovery-design-doc`, and `@pm` (MEDIUM only). Upstream agents (`@briefing`, `@product`, `@sheldon`) always stay manual — they end on genuine human decisions.
2. **Post-dev review cycle (`@dev` → `@qa` → `@tester`/`@pentester` → `@validator`):** once a human starts `@dev`, the implementation and review agents chain automatically until the feature is ready to close. `@qa` is the hub: it owns the routing to the specialized agents and the corrections loop.

## Activation

Autopilot is active only when ALL are true:

1. `project.context.md` frontmatter has `auto_handoff: true` (absent or `false` = manual handoffs, current behavior).
2. A feature workflow is active (feature slug known, classification SMALL or MEDIUM).
3. The current agent's own gate/verdict passed (see stop conditions).

Preferred runtime entrypoint:

```bash
aioson workflow:execute . --feature={slug} --tool=<tool> --agentic
```

`workflow:execute --agentic` is the central orchestration contract. It writes `.aioson/context/workflow-execute.json` with `agentic_policy`, including the review-loop caps, sidecar/scout policy, lane guard, current checkpoint, and resumable command. Prompt-level `Skill(aioson:agent:<next>)` chaining remains a compatibility fallback for clients that cannot let the gateway consume this checkpoint.

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

## Segment 1 — pre-dev chain (`@analyst` → `@dev`)

SMALL feature: `@analyst` → `@scope-check` → `@architect` → `@discovery-design-doc` → `@dev`.

MEDIUM feature: `@analyst` → `@architect` → `@discovery-design-doc` → `@pm` → `@scope-check` → `@dev`.

The prompt-only fallback still stops before the FIRST `@dev` activation because `@dev` is a heavy phase and benefits from a fresh context window. Runtime agentic mode may cross this boundary only by starting a fresh `@dev` activation from the checkpoint/context package, not by carrying the upstream chat context forward. If the gateway cannot start that fresh activation, stop with the normal `/clear` + `/dev` recommendation.

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

## Stop conditions — break the chain and emit the normal manual handoff

1. **`feature:close` / publish** — ALWAYS the human gate. When `@qa` (PASS, nothing pending) or `@validator` (PASS) is the last clean step, STOP and recommend `aioson feature:close . --feature={slug}`. Never auto-run `feature:close`, `feature:archive`, `npm publish`, or any publish/close action.
2. **First `@dev` entry without runtime gateway** — prompt-only clients stop here (Segment 1). Runtime agentic mode may continue only through a fresh checkpointed `@dev` activation.
3. **Corrections cap reached** — review cycles are bounded by `agentic_policy.review_cycle` (default 3); when `review-cycle:advance` returns `stop_cycle_limit`, stop and escalate to the human.
4. **Critical security finding** — the `@qa` corrections security gate (auth/secret/credential/session/password/token/PII/encryption keywords) blocks the auto-loop; stop and require human intervention.
5. **Verdict not clean / gate or readiness blocked** — `@scope-check` not `approved`/`patched`, `@architect` Gate B blocked, `@discovery-design-doc` readiness `blocked`, `@pm` Gate C blocked, `@validator` FAIL with no safe corrections path: stop and route to the owner manually.
6. **Context budget** — estimated usage ≥ `context_warning_threshold` (`.aioson/config.md`): write the compaction checkpoint to `.aioson/context/last-handoff.json`, stop, and recommend `/clear`. The workflow resumes from `workflow.state.json` — the next session re-enters autopilot automatically.
7. **Ambiguity** — workflow state unavailable AND routing ambiguous, or any real decision requires user input: stop and ask, manually.

The user can interrupt at any time (Ctrl+C); autopilot never retries an interrupted invocation.

## Rationale

Industry-validated design (see `researchs/auto-handoff-pipeline-2026/summary.md`): deterministic routing beats LLM routing; human gates belong where they catch mistakes — at the start of implementation (`@dev` entry: fresh context) and at the irreversible boundary (`feature:close`/publish). Every autonomous loop needs explicit exit conditions and bounds (the corrections cap, the re-entry guard); per-hop context checkpointing is the load-bearing cost mitigation.
