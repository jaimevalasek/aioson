---
description: "Dev phase loop — auto-continue across phases, per-phase verification sub-agents, and compaction between phases."
agents: [dev, deyvin]
task_types: [implementation, verification]
triggers: [phase loop, auto-continue phases, per-phase verification, compact between phases]
---

# Dev phase loop — auto-continue, per-phase verification, compaction

On-demand detail for @dev's `## Phase loop` kernel section. Applies when a phased plan drives the work (`implementation-plan-{slug}.md` or a Sheldon `.aioson/plans/{slug}/manifest.md`).

## The loop

**Auto-continue is the default and it is imperative — a phased plan runs to the END OF THE FEATURE in one continuous drive, not one phase per turn** (`phase_loop.auto_continue` in `.aioson/config/verification.json`). After a phase's gate is clean you will feel the pull to stop and report "Phase N done — continue?"; that pull is the exact bug this loop exists to defeat. Do NOT stop, do NOT ask, do NOT summarize-and-end between phases — proceed straight into the next phase. The per-phase verification report is the checkpoint that replaces the human "continue?": a clean report advances automatically; a failing one (after in-phase fix retries) is the only thing that halts the loop mid-feature. The run otherwise halts only at the end-of-feature gate or at a genuine hard stop (real ambiguity, a blocked gate, or a context ceiling on a host without transparent auto-compact). Set `auto_continue: false` only if you deliberately want to pause for confirmation between phases.

After finishing each phase:

1. **Close the phase.** Mark it `done` in the manifest (`pending → in_progress → done`, never skip ahead) and update `spec-{slug}.md` checkpoints.
2. **Per-phase gate.** If `.aioson/plans/{slug}/harness-contract.json` exists, run `aioson harness:check . --slug={slug}` (add `--strict` for MEDIUM / harness-driven work) — this also evaluates the build-free `SG-*` static criteria, so a stubbed/placeholder slice fails here before the build even runs. Then run `aioson audit:code . --changed --json` for a fast, build-free code-quality scan of this phase's diff (anti-patterns / TODOs / dead code / duplication): a HIGH finding is fix-before-advancing, MED/LOW advisory.
3. **Per-phase verification.** Run:
   ```bash
   aioson verification:plan . --feature={slug} --trigger=per-phase --json
   ```
   For every agent with `run: true`, use `aioson agent:execution:dispatch . --feature={slug} --agent={agent} --json`. The resolved manifest is authoritative for host/model/mode. Validate model aliases before dispatch and preserve the distinct requested/resolved model, resolution strategy, and optional reasoning effort in state and reports; ambiguity or an unsupported effort is a real pause before spawn. A `unsupported_capability` or `manifest_invalid` result is also a real pause: never imitate a sub-agent or fresh session in prose. Only `external` execution backed by an installed CLI, or a native capability explicitly exposed by the current harness, may run.
   - `mode: external` → the portable default: an installed host CLI runs headlessly in a fresh process, waits for exit, and must write the bound JSON report. This creates an isolated headless context, not a new interactive chat window.
   Read the report: **PASS** → continue. **Bugs** → fix them within this phase, re-run `harness:check`, and re-dispatch — up to `phase_loop.max_fix_retries_per_phase` times, then stop and surface the failure instead of advancing.
4. **Checkpoint, then keep going — do NOT end the turn.** Write the cold-start packet as a crash/interrupt safety net:
   ```bash
   aioson dev:state:write   # slug, completed phase, next phase, manifest path, required context, decisions
   ```
   Then continue **immediately** into the next phase in the SAME turn. Context management is the host's job, never a reason to stop:
   - **Claude Code (and any host with transparent auto-compact):** never self-issue `/compact` and never end your turn between phases. Auto-compact shrinks context in place when it fills — you just keep implementing. With `compact_between_phases: true`, "compact" means *write the checkpoint above*, NOT *stop for a manual compaction*.
   - **codex / opencode (no transparent auto-compact):** the host wrapper re-enters on a fresh context and reloads via `aioson dev:resume-data .`. Only these hosts break the turn, and only their wrapper — never a bare prompt — restarts the loop.
   The checkpoint exists so an interrupted run resumes cheaply, not so you pause. A phase boundary with a clean gate is a checkpoint, never a stopping point.
5. **End-of-feature gate (after the last phase only).** Hand off to `@qa`, which runs the full runtime smoke (build + migrate + boot + Core happy-path) plus `@tester`/`@pentester`/`@validator` per:
   ```bash
   aioson verification:plan . --feature={slug} --trigger=end-of-feature
   ```

## Token economy

- The per-phase check is **light**: one cheap-tier sub-agent, changed-files scope, capped by `budget.max_subagents_per_phase`.
- It is **suppressed on MICRO** (`budget.skip_on_micro`) — MICRO phases just auto-continue with no sub-agent.
- The **expensive full runtime smoke runs once**, at end-of-feature only (`budget.full_smoke = end-of-feature-only`) — never per phase.
- Context stays small without stopping: on Claude Code transparent auto-compact shrinks it in place as it fills, and the between-phase `dev:state:write` checkpoint lets any compaction (auto or a host-driven fresh context) resume the next phase cheaply. You get the small-context savings without ever ending the turn.

## Configuration

All knobs live in `.aioson/config/verification.json` (see `.aioson/docs/verification-config.md`): per-agent `enabled` / `triggers` / `dispatch` (per host), `cross_check`, `budget`, and `phase_loop` (`auto_continue`, `compact_between_phases`, `max_fix_retries_per_phase`).
