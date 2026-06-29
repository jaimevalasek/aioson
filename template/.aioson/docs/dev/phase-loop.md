---
description: "Dev phase loop — auto-continue across phases, per-phase verification sub-agents, and compaction between phases."
agents: [dev, deyvin]
task_types: [implementation, verification]
triggers: [phase loop, auto-continue phases, per-phase verification, compact between phases]
---

# Dev phase loop — auto-continue, per-phase verification, compaction

On-demand detail for @dev's `## Phase loop` kernel section. Applies when a phased plan drives the work (`implementation-plan-{slug}.md` or a Sheldon `.aioson/plans/{slug}/manifest.md`).

## The loop

**Auto-continue is the default — do NOT stop to ask "continue?" between phases** (`phase_loop.auto_continue` in `.aioson/config/verification.json`). The per-phase verification report replaces that human checkpoint: a clean report means proceed; a failing one stops the loop. Set `auto_continue: false` to pause for confirmation between phases.

After finishing each phase:

1. **Close the phase.** Mark it `done` in the manifest (`pending → in_progress → done`, never skip ahead) and update `spec-{slug}.md` checkpoints.
2. **Per-phase gate.** If `.aioson/plans/{slug}/harness-contract.json` exists, run `aioson harness:check . --slug={slug}` (add `--strict` for MEDIUM / harness-driven work) — this also evaluates the build-free `SG-*` static criteria, so a stubbed/placeholder slice fails here before the build even runs. Then run `aioson audit:code . --changed --json` for a fast, build-free code-quality scan of this phase's diff (anti-patterns / TODOs / dead code / duplication): a HIGH finding is fix-before-advancing, MED/LOW advisory.
3. **Per-phase verification.** Run:
   ```bash
   aioson verification:plan . --feature={slug} --trigger=per-phase --json
   ```
   For every agent with `run: true`, dispatch it as a sub-agent on the returned `host` / `mode` / `model`, scoped to this phase's changed files:
   - `mode: native` → an in-harness sub-agent. On Claude Code use the Task tool with that `model` tier (e.g. `sonnet-4.6`); on codex/opencode use their own configured model. The sub-agent writes its `report` file (e.g. `qa-report-{slug}.md`) and returns it to @dev.
   - `mode: external` → only the explicitly configured cross-vendor auditor (`cross_check`); never spawn one otherwise.
   Read the report: **PASS** → continue. **Bugs** → fix them within this phase, re-run `harness:check`, and re-dispatch — up to `phase_loop.max_fix_retries_per_phase` times, then stop and surface the failure instead of advancing.
4. **Compact between phases** (when `phase_loop.compact_between_phases` is true and phases remain). Write the cold-start packet:
   ```bash
   aioson dev:state:write   # slug, completed phase, next phase, manifest path, required context, decisions
   ```
   then shed context — `/compact` on Claude Code, or open a fresh context and reload via `aioson dev:resume-data .` on codex/opencode — and resume on the next phase. Each phase gets a clean context with no manual chat hand-off.
5. **End-of-feature gate (after the last phase only).** Hand off to `@qa`, which runs the full runtime smoke (build + migrate + boot + Core happy-path) plus `@tester`/`@pentester`/`@validator` per:
   ```bash
   aioson verification:plan . --feature={slug} --trigger=end-of-feature
   ```

## Token economy

- The per-phase check is **light**: one cheap-tier sub-agent, changed-files scope, capped by `budget.max_subagents_per_phase`.
- It is **suppressed on MICRO** (`budget.skip_on_micro`) — MICRO phases just auto-continue with no sub-agent.
- The **expensive full runtime smoke runs once**, at end-of-feature only (`budget.full_smoke = end-of-feature-only`) — never per phase.
- Compaction between phases keeps each phase's context small, which is cheaper than carrying one accumulating context across a long feature.

## Configuration

All knobs live in `.aioson/config/verification.json` (see `.aioson/docs/verification-config.md`): per-agent `enabled` / `triggers` / `dispatch` (per host), `cross_check`, `budget`, and `phase_loop` (`auto_continue`, `compact_between_phases`, `max_fix_retries_per_phase`).
