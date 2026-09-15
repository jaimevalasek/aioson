---
description: "Optional development execution lanes — dispatching enabled host/model lanes from agent-execution-{slug}.json while DEV keeps integration ownership."
agents: [dev]
task_types: [execution-lanes, multi-model-dispatch]
triggers: [development_lanes, split execution, agent:execution:dispatch, lane]
---

# Optional Development Execution Lanes

Development lanes are an execution mechanism, not new canonical agents or specification stages. Use them only when `development_lanes.strategy: split` and the individual lane is explicitly enabled in `agent-execution-{slug}.json`; classification never enables them.

## Compiled orchestrated execution

When `.aioson/context/execution-plan-{slug}.json` exists (the planner compiled orchestrated lanes with `aioson execution:compile` from the roles the supervising client unlocked), the lanes run as one engine-driven run — never by hand, never one dispatch at a time:

1. `aioson execution:profiles:validate . --json`, then `aioson execution:run . --feature={slug} --preflight --json` — the first command deduplicates and proves every enabled primary/fallback host-model-effort route with the real unattended harness (`--status` is read-only, `--refresh` re-probes valid cache). Preflight refuses on a stale plan, an invalid manifest, a role host missing from PATH or with no unattended flag in the registry, or a host signature whose unattended write probe blocked (`host_not_unattended`); a signature signed without the probe is a `preflight.warnings` line with the re-sign command. Fix the cause (recompile, sign, install); never bypass. Orchestrated workers have no AIOSON token or wall-clock cutoff. Context window, peak use, duration and activity are report-only telemetry; legacy `unit_timeout_ms` and `--unit-timeout` inputs are ignored. A lease left by a killed run is waited out on `--resume` — never delete the lock by hand.
2. `aioson execution:run . --feature={slug}` — `dev → qa` pipelines scheduled by readiness (a unit starts when its `Depends on` edges are satisfied, or when the previous wave finished if it declares none; `aioson execution:graph . --feature={slug}` draws the graph, `--format=mermaid|json` for a client). The pool accepts up to 10 disjoint unit pipelines, including several units of the same logical lane; real dependencies and file overlap still hold work back. The roles file is the live source of truth: every new stage reloads its active profile/model/effort, transitive signed fallbacks and independent-QA policy, while the scheduler reloads pool capacity; edits never stale the compiled plan. An already running process retains its launch identity. Every backend/frontend implementation receives the DEV lane profile derived from the installed DEV kernel, with its configured host/model and unit ownership; the engine owns the run and a separate QA process reviews each delivery. When the active profile declares `integration_dev` before the final boundary, one final DEV supervisor implements integration-owned work, runs the complete verification and corrects cross-unit failures, then the shared QA independently reviews that combined result. Without `integration_dev`, files outside all configured lanes remain session-owned integration.

   Autopilot defaults to continuous recovery when no choice was persisted. `--resume --until-complete` enables it for an existing run, preserving approved units. DEV FAIL/BLOCKED and failed QA acceptance return to the configured DEV with findings and regression history; process/report errors retry the affected stage with fresh report identity. Continuous recovery never means an identical spin: four identical structured actions or 24 read-only actions stop the current model for an authorized fallback, the second equivalent failure without a measured source change opens `recovery_no_progress`, and one unit may return from QA to DEV at most five times before `dev_qa_cycle_limit`. It never waives QA or changes to an unsigned model. `--bounded-recovery` restores finite retries and persists that choice; `--step` disables continuous recovery for that activation. External capacity, authentication/configuration or unresolved product decisions still require their actual cause addressed. Read `decision_required` evidence, use `aioson execution:decide . --feature={slug} --unit=<id> --choice=retry|fallback:<host>/<model>|skip|skip-qa|abort` only within existing authorization (a fallback host must be signed), then resume.

   The run is a long process (ten to forty minutes per unit): launch it detached — a background task of your client, never shell command substitution, output truncation pipes or a foreground call under a shell timeout (the timeout kills the engine with its workers). Hand the user `aioson execution:status . --feature={slug} --watch` for a second terminal, and poll status with `--json` every 2–5 minutes, relaying changes and the live line of running stages (elapsed, last write and file, files changed). The state beats every 15 s; `engine.state: missing` means the engine died. `--resume` reclaims interrupted units after the lease expires. Keep monitoring through completion when the user asks; starting an engine alone does not complete the delivery.
3. `aioson execution:status . --feature={slug} --json` — the ledger: active/ready/dependency-blocked worker counts, integration supervisor status, lane reviewers' findings and corrections, run findings (`lane_scope_drift`, `unowned_change`, `corrections_cap_exceeded`, `unit_skipped`, `qa_skipped`, `unanswered_question`, `mailbox_suspicious`), the `mailbox` and report paths. With `integration_dev`, a completed run already contains the supervisor DEV report and its independent QA report; without it, DEV implements the listed integration units and runs the complete planned verification. Never re-run a passed unit by hand; never edit the compiled prompts.

## Dashboard for this project

Run `aioson execution:dashboard .` in a separate terminal, or add `--feature={slug}` for the initial selection. It shows only this project and its preserved archived execution records. The local recovery button can retry a supported paused failure and resume the bound run; it refuses duplicate active engines and records the action. Without an explicit `--port`, it tries 4181 and chooses a free port on collision. Use the printed URL. Closing the dashboard leaves the executor running. Expand a wave's usage row for DEV/QA and model breakdowns. For the beginner walkthrough, see `tutorials/orquestration/index.html` in the AIOSON source repository.

## Sequential dispatch (no compiled plan)

For each enabled lane:

1. Confirm its `host`, `model`, exact `write_paths`, and configured prompt path.
2. Create the short runtime prompt at that path from the approved PRD/plan and repository evidence. It must name the assigned phase/CAPs, allowed paths, focused verification, and what the lane must leave for DEV integration. It is not another spec. When `.aioson/context/execution-plan-{slug}.json` exists, the lanes and their prompts were compiled by `aioson execution:compile` from the plan tables and the roles file — never hand-edit them; `aioson verify:artifact . --kind=execution-plan --slug={slug}` must pass before any dispatch, and a stale plan is recompiled, not patched.
3. Dispatch enabled lanes sequentially in the shared worktree:

   ```bash
   aioson agent:execution:dispatch . --feature={slug} --lane={lane} --json
   ```

4. If dispatch returns unavailable host/model/capability, stop. Fallback is allowed only when the lane declares it, including the reason:

   ```json
   {
     "fallbacks": [
       { "host": "codex", "model": "configured-default", "on": ["unavailable", "capacity"] }
     ]
   }
   ```

5. Inspect and integrate the lane changes, resolve cross-lane boundaries, run the complete planned verification, and retain ownership of the production result.

`host` selects a registered CLI adapter; `model` selects that host's model/provider identifier. A provider model such as Grok may therefore be used through a compatible registered host. Absence of a dedicated agent file is irrelevant because the lane runtime prompt is the bounded execution contract.

If no development lane is enabled, implement directly in the current DEV session. Do not create frontend/backend lanes merely because both surfaces exist.
