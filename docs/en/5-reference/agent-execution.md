# Agent execution, development lanes, and model resolution

AIOSON uses `.aioson/context/agent-execution-{feature}.json` to run a bounded feature task through a registered CLI host and model. The manifest is runtime configuration, not another specification.

## Defaults

A new manifest enables only:

- `dev`;
- `qa`.

`tester`, `pentester`, `validator`, and all development lanes are disabled. MICRO/SMALL/MEDIUM classification never enables them.

The canonical delivery route remains Product → Sheldon → Planner → DEV → QA. Optional development lanes execute inside DEV; optional reviewers execute after QA only when explicitly enabled and triggered.

## Commands

```bash
aioson agent:execution:init . --feature=my-feature --host=codex
aioson agent:execution:validate . --feature=my-feature --json
aioson agent:execution:show . --feature=my-feature --json
aioson agent:execution:dispatch . --feature=my-feature --agent=qa
aioson agent:execution:dispatch . --feature=my-feature --lane=backend
aioson agent:execution:resume . --feature=my-feature
aioson agent:execution:status . --feature=my-feature --json
```

Initialization is create-once. Later init, resume, and workflow seed operations preserve the developer-owned manifest byte for byte.

## Schema v2 orchestration and Neural Chain

New manifests use version 2 while version 1 remains accepted unchanged. The additive fields are:

- `orchestration.mode`: `autopilot` by default, or `inherit` / `step_by_step` when the developer changes it;
- `orchestration.max_checkpoints`: the effective Autopilot runner budget (default 10);
- `orchestration.stop_conditions`: explicit terminal reasons;
- `chain_work_policy`: kind-to-owner routing, specialist fallback, QA revalidation, and the DEV actionable-work handoff gate.

Test/security items route to Tester/Pentester only when their existing manifest entries are enabled. Otherwise they fall back to DEV. This never enables an optional specialist by classification.

## Development lanes

Use lanes only when the user or approved plan explicitly asks for different execution hosts/models or separately owned scopes.

```json
{
  "development_lanes": {
    "strategy": "split",
    "integration_owner": "dev",
    "lanes": {
      "backend": {
        "enabled": true,
        "host": "codex",
        "mode": "external",
        "model": "gpt-5.6-sol",
        "reasoning_effort": "high",
        "writable_roots": [],
        "prompt": ".aioson/context/execution-prompts/my-feature/backend.md",
        "write_paths": ["src/api/**", "tests/api/**"],
        "fallbacks": [],
        "report": ".aioson/context/reports/my-feature/{run_id}/dev-backend.json"
      },
      "frontend": {
        "enabled": true,
        "host": "opencode",
        "mode": "external",
        "model": "provider/model-id",
        "writable_roots": [],
        "prompt": ".aioson/context/execution-prompts/my-feature/frontend.md",
        "write_paths": ["src/ui/**", "tests/ui/**"],
        "fallbacks": [],
        "report": ".aioson/context/reports/my-feature/{run_id}/dev-frontend.json"
      }
    }
  }
}
```

`host` names a registered CLI adapter; `model` is the model/provider identifier understood by that host. A model such as Grok may be used through a compatible host such as OpenCode; it does not require a canonical `@frontend` or `@backend` agent.

DEV creates the short runtime prompt from the approved PRD and implementation plan, dispatches enabled lanes sequentially in the shared worktree, audits their diffs against `write_paths`, integrates shared boundaries, and runs the full planned verification. Lane reports bind the lane identity and declared paths.

Hosts come from one registry (`src/lib/tool-capabilities.js`, exposed by `aioson tool:capabilities --json`): Claude Code, Codex, Grok, Kimi Code, OpenCode and Qwen Code are dispatchable (`listExecutionHosts()`); Muse and Antigravity (`agy`) are known to the interactive surface only until an adapter proves their non-interactive contract. New hosts require a registered adapter so executable resolution, capabilities, arguments, redaction, and telemetry remain fail-closed.

## Unattended by policy

Every harness the framework launches for orchestration or implementation runs **unattended**: a permission prompt inside an orchestrated run is the run not happening. The policy lives in the host registry (`src/lib/tool-capabilities.js`, exposed by `aioson tool:capabilities`): every registered CLI declares its unattended flag (`yolo_args` — `--dangerously-skip-permissions`, `--dangerously-bypass-approvals-and-sandbox`, `kimi --auto`, `qwen --yolo`, `opencode run --auto`, `grok --always-approve`, `muse --yolo`, `agy --dangerously-skip-permissions`), and every launch surface reads it: `live:start` defaults to `--permission-mode=yolo` (`--permission-mode=default` is the explicit way to get prompts; a host that registers no flag still opens, with a warning), every lane worker and direct `agent:execution:dispatch` runs `workspace-write` as that flag, the headless runner appends it. A host with no flag can be used interactively but is never dispatched (`permission_mode_unsupported`). Adding a harness is one registry entry with its flag, plus one adapter (proven by `host:signature`) when it should run lanes. The provider's own sandbox is never a lane-worker argv (measured: it answered without writing).

## Host signatures

A signature is the machine-level proof that a `(host, model, effort)` combination actually works here — CLI installed, login valid, model id accepted, effort supported — recorded before anything is dispatched instead of discovered as `executable_not_found` / `auth` / `invalid_model` mid-run.

```bash
aioson host:signature . --host=kimi --model=kimi-k3
aioson host:signature . --host=codex --model=gpt-5.6 --effort=high --ttl=24
aioson host:signature . --host=kimi --model=kimi-k3 --status --json
aioson host:signature . --list --json
aioson agent:execution:validate . --feature=my-feature --strict --json
```

The probe builds the exact argv the execution adapter would use (same non-interactive flags, provider read-only mode), runs it in an empty temporary directory with a one-word prompt, and classifies the exit through the adapter's own error normalization. It never reads project context and never writes into a project. Results live in `~/.aioson/hosts/signatures.json` (override: `AIOSON_HOST_SIGNATURES`), keyed by host, model and effort, with a TTL (default 24h).

A login and a model id say nothing about whether the host **edits without a prompt** — which is what a lane worker is; the first real orchestrated run had every signature valid and one lane sat all night asking for approval. So the probe is two calls: after the read-only one passes, an **unattended write probe** runs the exact unattended `workspace-write` argv a lane worker gets, in another empty temporary directory, and asks for one file. Written → `verified`; exited without it → `unverified` (the signature stays valid, the preflight warns); alive past the budget without exiting → `blocked`; refused → `failed` — the last two invalidate the signature (`host_not_unattended`). The result is recorded under `unattended.yolo` and read by `execution:run --preflight`; `--unattended-probe=false` skips it and keeps what an earlier probe proved. Measured on the operator's machine: Codex wrote the file in 14 s under its unattended flag; under its own `--sandbox workspace-write` it answered DONE after 96 s without writing — which is why the provider sandbox is never a lane-worker argv.

- Refusals are deterministic from the registry: `unknown_host`, `unsupported_host_execution` (interactive-only host — Muse, Antigravity), `effort_unsupported_by_host`, `invalid_reasoning_effort`, `permission_mode_unsupported` (no unattended flag registered — none today). A host without a read-only flag (OpenCode) is probed without that precaution (`probe.sandbox: none`), never refused for it; its unattended write probe runs the same.
- Probe outcomes: `valid`, or `invalid` with `executable_not_found` (carrying the install command), `auth`, `invalid_model`, `capacity`, `timeout`, `crash`, `host_not_unattended` (the write probe blocked or failed).
- `--status` and `--list` are read-only and always exit 0; their answer is the `state` field (`valid | expired | invalid | missing`).
- `agent:execution:validate --strict` requires a valid, unexpired signature for every **enabled** agent and lane (disabled entries are ignored) and reports unsigned declared fallbacks as warnings. Without `--strict` the manifest keeps its `validated_at_dispatch` contract unchanged.

## Orchestrated execution (roles, offer, compile)

The orchestrated path runs the planner's lanes as parallel external processes, each with the host/model of a **role**. It is unlocked by one project file. The planner **seeds** it disabled — `aioson execution:seed`: one `{lane}_dev` per lane plus `qa`, each on an execution host installed on the machine (the reviewer on a second host when there is one), every model the harness default `configured-default`, never over an existing file — and a person, or the supervising desktop client after validating the signatures, chooses the models, enables it and signs the hosts. The framework never enables it and never ships it in `template/`. Absent, disabled or invalid, the option does not exist and the single-DEV route is untouched; the offer then names the unlock step instead of staying silent.

```json
// .aioson/config/execution-roles.json
{
  "version": 1,
  "source": "aioson-play",
  "enabled": true,
  "roles": {
    "backend_dev":  { "host": "codex", "model": "gpt-5.6",         "reasoning_effort": "high" },
    "frontend_dev": { "host": "kimi",  "model": "kimi-k3",         "reasoning_effort": null },
    "qa":           { "host": "claude", "model": "claude-sonnet-5", "reasoning_effort": null }
  },
  "parallel": { "max_concurrent_lanes": 2 },
  "on_unavailable": "ask",
  "execution": { "spawner": { "command": "cockpitctl", "args": ["unit", "spawn"] }, "unit_timeout_ms": 1800000, "require_independent_qa": false }
}
```

Roles are snake_case: `{lane}_dev` (required per lane), `qa` (the lane-level reviewer, required), `{lane}_qa` (optional override that inherits from `qa`) and `integration_dev` (optional model for the integration pass). Hosts come from the registry (`tool:capabilities`), a reasoning effort is accepted only where the host declares it, secrets are refused. There is no per-role permission knob: a lane worker runs unattended by contract (see the run below). Under `execution`: `unit_timeout_ms` (`0` = no limit), `spawner`, and `require_independent_qa` (off by default: the compile warns `self_review_same_model` and the run proceeds with the implementer reviewing itself; on, the same condition refuses the plan).

```bash
aioson execution:seed . --feature=my-feature --lanes=backend,frontend --json   # roles file: disabled, installed hosts, default model
aioson execution:offer . --feature=my-feature --json      # available? (roles + signatures; plan tables + measured scale; unlock step)
aioson execution:offer . --confirm-defaults --json         # record "run with the default models" for the roles still at it
aioson execution:compile . --feature=my-feature --json    # tables + roles → execution plan, prompts, manifest lanes
aioson execution:compile . --feature=my-feature --dry-run --json
aioson verify:artifact . --kind=execution-plan --slug=my-feature
```

`execution:offer` answers `available` only when the roles file is present, valid and enabled, every role at the default model has been confirmed, **and** every declared role carries a valid, unexpired signature on this machine; otherwise `reason` names the first blocker (`roles_file_missing | roles_disabled | roles_invalid | defaults_unconfirmed | signature_missing | signature_expired | signature_invalid`). It always exits 0 — it is a question, not a gate.

An unavailable offer is never a dead end. The answer always carries `onboarding` — `state` (`not_unlocked | invalid | disabled | pending_confirmation | unsigned | ready`) and `next`, the one command or edit that moves the state (`execution:seed …`, `set "enabled": true …`, `execution:offer --confirm-defaults`, the first `host:signature` hint, `execution:compile …`) — and `hosts` (`registered`, and `installed` on this machine). Between *enabled* and *signed* sits one more step, evaluated first so nobody is sent to sign a model they were about to change: roles still at the default model answer `defaults_unconfirmed` with `pending_confirmation[]` (role, host, model). `aioson execution:offer . --confirm-defaults` records the owner's answer in `.aioson/config/execution-roles.confirmed.json` against a digest of the role map — beside the roles file, never inside it, because the desktop client's reader refuses unknown root keys — so the question does not come back until a role changes, and then only for the roles still at the default. A role whose model the owner chose never asks.

With `--feature`, `plan` also carries the **measured scale**: `scale.files` (distinct files across the Implementation Delta, the Capability Delivery Plan and the Execution Sequence), `create`, `modify`, `phases`, `waves`, `parallel_phases`, `bytes`, `areas[]` (files grouped by their first two path segments — raw material for lanes, never lanes) and `split_candidate` (files at or above the floor: 12, `AIOSON_EXECUTION_SPLIT_MIN_FILES` moves it) — plus `execution_choice` (`single` from the plan frontmatter, `orchestrated` from the lanes table, `null` when nothing was recorded) and `lanes[]`. This is the number the planner asks on: a split candidate earns the single-DEV/orchestrated question whether or not the path is unlocked, and a plan that answers it records the answer (`execution: single` in the frontmatter, or the lanes table). `plan` also carries `recommendation` — `{choice, reasons[]}`, the measured side of that question: `single` below the floor or when nothing can run in parallel, `orchestrated` for a split candidate with a real cut (two surfaces, or rows already sharing a wave), each reason a number. The roles file's lock state is deliberately **not** an input — an incident showed the asking model reading "locked" as "not advisable" and recommending one context for a 52-file two-surface plan — so availability only ever names the unlock step; it never flips the recommendation. The owner still decides.

The plan is also measured **per unit and as a graph**, because one process is one context: an orchestrated plan whose only lane owned every write path once ran a whole vertical phase per process — 15 of 28 files in one context, four waves in strict series, one model for everything — with every gate green. `scale.units[]` (one per Execution Sequence row: `files`, `acs`, `caps`, `shared_files`, `surfaces`, `two_sided`, `depth`, `over_budget` with `reasons`), `scale.parallelism` (`waves`, `max_concurrent_units`, `serial_chain`, `critical_path_processes`, `serial`), `scale.seams[]` (files several rows write), `scale.ceiling` (10 files / 6 acceptance criteria per unit; `AIOSON_EXECUTION_UNIT_MAX_FILES` and `AIOSON_EXECUTION_UNIT_MAX_ACS` move it) and `scale.surfaces` (every file classified `backend | frontend | shared` by extension, directory or stem — tests apart — with `two_sided` and `shared_test_root`: tests at a root no lane can own alone). Lanes are the axis models are assigned on — each `{lane}_dev` role carries its own host/model — so a two-surface plan that does not yet declare two lanes also gets `plan.split_proposal`: one lane per surface with derived write paths, every row cut into `{phase}-backend` / `{phase}-frontend` inside its wave, the files nobody can place named with the reason, the seams that want an `IF-*` row. Raw material for the planner's tables, never a table; the human output prints it, and `onboarding.next` names those lanes before any table exists.

`execution:seed` writes the roles file for the lanes given (`--lanes=a,b`, the plan's `## Development execution lanes` table with `--feature`, or — before the table exists — one lane per measured surface of a two-surface plan, `lanes_source: surfaces`) and reports `outcome`: `seeded` (the roles, the hosts found, `independent_review`), `already_present` (nothing changed; `missing_roles` names what the lanes need and the file lacks), `no_execution_host` (nothing written; the install command per registered host — exit 1), `write_failed` (the cause — exit 1), `lanes_required`, `lane_invalid`, `too_many_lanes`.

`execution:compile` reads the plan's `## Development execution lanes` and `## Execution Sequence` tables and refuses with named findings, writing nothing:

| Finding | Meaning |
|---|---|
| `lanes_table_missing`, `lanes_table_invalid`, `no_wave_column` | the planner tables are absent or unparseable |
| `lane_write_paths_overlap`, `unsafe_path`, `lane_id_invalid`, `too_many_lanes` | lanes are not disjoint, escape the project or exceed the manifest limit |
| `phase_mixed_ownership` | one phase touches files of two lanes (or a lane plus unowned files) — split it, or move shared files to a later solo wave owned by dev |
| `wave_file_overlap` | two phases of the same wave share a file |
| `integration_before_lanes`, `no_lane_units` | integration work (files outside every lane) is scheduled before the lane waves, or no phase falls in a lane at all |
| `lane_without_role`, `qa_role_missing`, `role_signature_missing|expired|invalid` | the roles file lacks a lane's `{lane}_dev`, lacks a reviewer, or the role is not signed here (each carries the `host:signature` hint) |
| `dev_kernel_missing`, `dev_profile_sections_missing` | the installed `.aioson/agents/dev.md` is absent or lost the sections the lane profile derives from |
| `dependency_unknown`, `dependency_self`, `dependency_wave_violation`, `dependency_on_integration`, `cycle_detected` | a `Depends on` cell names a phase that does not exist, the phase itself, a phase of the same or a later wave, integration work (only the session DEV runs it, after the lanes), or the edges form a cycle |

The `## Execution Sequence` table may carry an optional `Depends on` column: phase names this phase needs, each with an optional gate — `(dev)` releases the dependent as soon as that phase's implementer report passed, no suffix (or `(qa)`) once its lane review finished. A phase that declares dependencies is scheduled by them (it may start while the rest of its previous wave is still running); a phase that declares none keeps the wave barrier. Dependencies must point at earlier waves and never at integration work; a cross-lane edge is a warning (`dependency_cross_lane_without_contract`) when neither the plan nor the PRD has an `## Interface Contract` section. A cell naming a bare phase number depends on every row of that phase (`1` → `1-backend` and `1-frontend`); a label names one row. The compiled plan carries `edges[]`, `units[].depends_on` and `scheduling: waves | dependencies`.

Three more findings are **warnings measured on the compiled units**: `unit_over_budget` (a lane unit above the ceiling — files or acceptance criteria, the PRD rows of its capabilities included — with the numbers and the cut to make), `unit_spans_surfaces` (one unit writing backend and frontend files in one context — a row per lane/surface lets each side run on its own model), `orchestration_serial` (one lane owning every write path and one unit per wave: fresh contexts and lane reviews, never parallelism). `summary.parallelism` carries `max_concurrent_units`, `serial_chain`, `critical_path_processes` and `serial`; `summary.ceiling` the ceiling in force; `summary.context_bytes_max` the largest unit context. Every unit prompt embeds the plan's own `## Phase N` section (sub-headings included) and ends with a **context contract**: the plan and the PRD are embedded (open them only for a cross-reference), the prototype is named only for a unit that writes frontend files (`units[].context.reads`, with its size), the rules come through `aioson context:brief --agent=dev --paths=<unit files>` — never `.aioson/rules/` wholesale — and everything else is out of the unit's context on purpose.

On success it writes `.aioson/context/execution-plan-{slug}.json` — units (phase × lane, or integration owned by dev), waves and edges, per-unit capabilities/acceptance criteria/verification commands, the roles per lane and the digests of everything it was compiled from — plus one prompt per lane unit and per lane under `.aioson/context/execution-prompts/{slug}/`, and updates **only** `development_lanes` (strategy `split`, the compiled lanes with their `qa` block, lanes that left the plan disabled) and `orchestration.execution: orchestrated` in the manifest. Everything else in the manifest — session agents, capacity policy, declared fallbacks, custom report paths, an operator's `qa.max_fix_files` and `qa.max_rework_rounds` — is preserved.

A unit prompt is the **dev-lane profile** (the `## Implementation strategy` and `## Execution invariants` sections extracted from the installed `dev.md`, plus the lane rules: no stage-ownership commands, only the unit's files, real verification, the bound JSON report) followed by the unit contract and the PRD/plan rows of that unit's capabilities — never the whole documents. Warnings (`lane_role_mismatch`, `self_review_same_model`, `cap_without_unit`, `unit_without_cap`, `prd_missing`, `lane_without_units`, `active_run_state`) are recorded in the plan and never block.

`verify:artifact --kind=execution-plan` is the freshness gate: it fails when the plan, the roles file, the manifest lanes, a generated prompt or a host signature no longer match what was compiled (`plan_digest_stale`, `roles_changed`, `manifest_lanes_diverged`, `prompt_stale`, `signature_missing`), or when the compiled edges are inconsistent (`edges_inconsistent`: unknown unit, bad gate, an edge that does not move to a later wave, a cycle) and warns when the dev kernel changed since (`dev_profile_stale`). It auto-fires at the planner's `agent:done` and stays silent for features that never compiled a plan.

### Routing

The canonical chain does not change (`@product → @sheldon → @planner → @dev → @qa`); the orchestrated path is served by deterministic pins and gates inside `workflow:next`, so a project that never unlocked it gets byte-identical prompts:

- **Planner activation** — when `execution:offer` answers `available` (unlock file + every role signed), the activation context pins the offer (roles, the one-question choice, the compile command) and, when a compiled plan exists, whether it is fresh or stale. When it does not, MEDIUM and larger features get one line naming the locked state (`reason`, the execution hosts installed on this machine) and the unlock step; MICRO/SMALL activations stay byte-identical — the lean lane never carries it.
- **Planner completion** — `workflow:next --complete=planner` measures the plan: a split candidate (`plan.scale`) with no recorded execution choice prints the `[Execution Scale]` advisory with the numbers, the measured recommendation (never flipped by a locked roles file) and the two ways to record the answer. Advisory, never blocking: single DEV may well be the right answer; what is charged is that nobody recorded it. An orchestrated plan that is **serial by construction** (one unit per wave) or carries a unit above the ceiling prints the same advisory with the shape and the cut to make — even when the roles file and the compiled plan are both green.
- **Planner completion** — with `orchestration.execution: orchestrated` in the manifest, `workflow:next --complete=planner` is **blocked** on a missing or stale compiled plan (`[Execution Plan BLOCKED]` … `aioson execution:compile`). This is the "does not run without models per role" gate, in the engine.
- **DEV / @orchestrator activation** — with the manifest orchestrated, the activation context pins the run state (`compiled, not started` / pending decisions with their hints / `completed` with the integration units) and points to the routed doc `.aioson/docs/dev/execution-lanes.md` § Compiled orchestrated execution, which carries the protocol (`execution:run` → `execution:decide` → `--resume` → `execution:status` → integrate → complete DEV as usual). `@orchestrator` stays an explicit detour whose kernel runs the same engine and hands the ledger to `@dev`.
- **DEV completion** — advisory `execution` summary in the result when the compiled lanes never ran to completion (`run: not_started | decision_required | …`); never a block.

### Running the plan (`execution:run`, `execution:decide`, `execution:status`, `execution:graph`)

```bash
aioson execution:graph . --feature=my-feature                    # the compiled graph (ascii); --format=mermaid|json; run state laid over it
aioson execution:run . --feature=my-feature --preflight --json   # deterministic preflight only
aioson execution:run . --feature=my-feature                      # live lines on stdout; --json moves them to stderr
aioson execution:decide . --feature=my-feature --unit=phase-2 --choice=fallback:qwen/qwen-3.8-max
aioson execution:run . --feature=my-feature --resume
aioson execution:status . --feature=my-feature --json
```

The run holds the feature's dispatcher lease for its whole life (a direct `agent:execution:dispatch` cannot interleave) and schedules lane units by **readiness**: a unit starts when every passage rule into it is satisfied — its explicit `Depends on` edges (`after_dev`: the dependency's implementer passed; `after_qa`: its lane review finished, or the unit was skipped by decision) or, for a unit without edges, the wave barrier (every lane unit of every earlier wave finished). Without explicit edges this is exactly the wave-by-wave run; with them, a unit no longer waits for the slowest unit of the previous wave it does not depend on. `execution:graph` draws the nodes, the explicit edges and the implicit barrier edges, with the run state over them. Every lane unit is a pipeline `dev → qa`: the lane's dev role runs the unit as an ephemeral external process with `sandbox_mode: workspace-write`, which for a lane worker always means **unattended** — the registry's flag per host (`--dangerously-skip-permissions`, `--dangerously-bypass-approvals-and-sandbox`, `--auto`, `--yolo`), never the provider's own sandbox: measured on the operator's machine, Codex under `--sandbox workspace-write` answered DONE after 96 s without writing the file (its Windows sandbox setup fails to load), and under the unattended flag it wrote in 14 s. The translation lives in the host registry (`src/lib/tool-capabilities.js`) and every adapter consumes it (OpenCode's lane worker runs `opencode run --auto`); a host with no unattended flag would be refused at build (`permission_mode_unsupported`), and one with no read-only flag refuses a read-only request (`sandbox_mode_unsupported` — OpenCode), never run with its default permissions. The lane's real bound is its declared write paths and the run's measured scope findings, not the CLI sandbox — writes the bound JSON report and dies; the lane's qa role then reviews and tests it with the **qa-lane profile** (the `## Risk-first checklist` extracted from the installed `qa.md` plus the review rules), may fix at most `qa.max_fix_files` files among the unit's own files, and reports the rest as findings. Corrections are **measured**, not trusted: the worktree is snapshotted before and after the review (git; without git the review still runs and the measurement is reported as absent) — a changed unit file the reviewer did not list is `undeclared_correction`, more changed unit files than the cap is `corrections_cap_exceeded`; per unit window (from its start to the end of its pipeline) a changed file inside a lane's write paths that belongs to no unit active in that window is `lane_scope_drift`, and one outside every lane is `unowned_change` (each reported once per run). Up to `parallel.max_concurrent_lanes` pipelines run at once. Integration units (files outside every lane) are never spawned: the run ends `completed` with them listed for the session DEV.

Nothing decides silently. A unit whose dev role cannot start (`executable_not_found`, `auth`, `capacity`, `invalid_model` …), times out, crashes, misses its bound report or reports `FAIL`/`BLOCKED` — or whose reviewer cannot run — leaves a `decision_required` in `.aioson/context/execution-state-{slug}.json` and a `decision_required` event on that unit's execution telemetry (`agent_execution_events`, the table a supervising client already polls); the other units of the wave finish, then the run pauses with `status: decision_required`. `execution:decide` answers per unit — `retry`, `fallback:<host>/<model>[/<effort>]` (the fallback must carry a valid host signature), `skip` (dev stage: the integration owner implements it, recorded as `unit_skipped`), `skip-qa` (qa stage: recorded as `qa_skipped`), `abort` — and records the decision (`decision_applied`); `execution:run --resume` continues idempotently: passed units are never re-run, a plan or manifest that changed since the run started refuses with `run_state_stale` (`--fresh` starts over). A failed review (`FAIL` verdict) is a finding for integration, not a block.

Life is measured, not reported: every unit process streams its output into the telemetry, and a unit with no output **and** no change to its own files for `stallMs` (default 5 min) is marked `stalled` (an event, a live line, a flag in the state) — never silently. Every disk measurement looks at the unit's declared files, never at the lane's roots (a sibling unit of the same lane writing there once made a unit blocked on a prompt read "still writing") and never at `.aioson/` (the engine's own state file rewritten on every beat); a unit that declares no files falls back to the lane write paths, labelled `measured_on: lane_write_paths`, and a walk that stops at its entry cap reports `measured: false` — no verdict — instead of "never wrote". A second signal is measured on the disk alone: a unit with no change to its own files for `unproductiveMs` (default 3 × `stallMs`), however talkative the process — a worker blocked on an approval prompt keeps printing that prompt, a reasoning loop keeps streaming, a reader keeps listing files — is marked `unproductive` (`unproductive` event and telemetry, `dev.unproductive` in the state). Both are advisory: a `--print` host that streams nothing until it ends makes every long think look silent, so neither decides anything on its own. When a unit's budget elapses, the decision says what the disk saw: `still writing` (the last file change is dated; retry with a larger budget) or `never wrote` (the blocked/looping case; fallback or abort) — `pending_decision.detail` and `pending_decision.timeout` (`budget_ms`, `measured_on`, `measured`, `wrote_during_budget`, `last_write_age_ms`), on the live line and in the ledger. The live channel itself is the engine's one-line-per-event stream (`[execution] wave 1 · phase-2 · dev started kimi/kimi-k3`), independent of whether the host CLI streams anything. And the positive signal the two detectors lack: the run **beats** — every 15 s each running stage is measured from the disk (elapsed, last write and file among the unit's own files, files changed since the stage started, the flags) into the state file, with `engine.{pid, heartbeat_at, heartbeat_ms}` on every write, and once a minute the measurement is one live line (`dev: 12 min elapsed · last write 38 s ago (src/ui/Orders.tsx) · 7 file(s) · budget 1 h`). The first real run was invisible from outside its own stdout for eighty minutes: launched detached, its live lines captured by a wrapper, nothing polled — the heartbeat is what a reader in another terminal, or a supervising agent polling the ledger, sees.

**Rework loop (opt-in).** `qa.max_rework_rounds` (0–3, default 0) on a lane of the manifest turns a failed lane review into a bounded cycle: the implementer runs again with the reviewer's findings in its runtime prompt (`## Reviewer findings — rework round N of M`), then the reviewer runs again, up to N rounds; every round is a new process pair with its own reports (`{unit}.rN.json`, `{unit}-qa.rN.json`) and its own measured corrections. After the last round a FAIL is what it always was — a finding for the integration owner, plus `rework_exhausted` naming the rounds spent — never a block. With the default 0 nothing changes. A dependent released by an `after_dev` edge may have started on the pre-rework implementation; the integration owner reconciles, as with any lane finding.

**Mailbox — the lateral edges.** A lane process cannot talk to a concurrent one, and a process that finished cannot be asked anything: the only edge between units that exists on every host is asynchronous, so it is a contract, not a channel. A report may carry `messages[]` — `{to: "lane:<id>" | "unit:<id>" | "integration" | "orchestrator", kind: contract_change | note | question, text (≤ 500 chars), paths?}`, at most 10 — and the engine delivers them where a reader exists: a unit that starts later receives, in its runtime prompt (`## Messages for you`), every message addressed to it or to its lane by units that already finished; a unit's reviewer receives its implementer's messages (`## Implementer messages`) plus the same inbox; the integration owner receives everything through `execution:status` (`mailbox[]`, with `from`/`stage`/`wave`). A `question` becomes the run finding `unanswered_question` at completion — the process that asked is gone; the integration owner answers — never a block. Malformed entries are dropped and counted (`mailbox_invalid`). Compiled prompts never change: messages enter the runtime prompt the way the implementer's report enters the reviewer's. A client that owns live terminals (a spawner) may relay a message to a running session on top of this; the file is the contract, the relay is a bonus.

`execution:status` is the consolidated ledger: run summary, waves, per-unit dev/qa status with hosts, verdicts, report paths, corrections and findings (dev, qa and run-level), the mailbox, pending decisions with their hints, integration units, `resume_command` — plus the outside view: `engine` (`alive` / `missing` / `idle`, measured from the state's own heartbeat; a `missing` engine names the `--resume` that reclaims the interrupted units) and `running[]` (every running stage with its live measurement). `--watch[=<seconds>]` re-reads it until the run leaves `running` (the second-terminal view the run itself names at start), `--format=line` is one line for a status pane.

### The client seam — `execution.spawner` (a unit as a terminal of the client)

By default the engine spawns each unit's host CLI itself and the process is invisible to whoever supervises the session. A client that owns terminals — a desktop IDE, a mission cockpit — can take the **spawn** over without taking the engine over: declare a spawner (`execution.spawner` in the roles file, or `AIOSON_EXECUTION_SPAWNER` in the session's environment — the environment wins, it is the hint of the client that owns the session's PTY) and, for every unit, the engine hands that command one JSON envelope on stdin instead of spawning the host:

```json
{ "version": 1, "action": "spawn", "feature": "my-feature", "run_id": "…", "attempt_id": "…",
  "unit": "phase-1", "lane": "backend", "wave": 1, "role": "dev",
  "host": "codex", "model": "gpt-5.6", "reasoning_effort": "high",
  "cwd": "/project", "prompt_path": ".aioson/context/reports/my-feature/<run_id>/phase-1.prompt.md",
  "report_path": ".aioson/context/reports/my-feature/<run_id>/phase-1.json",
  "write_paths": ["src/api/**"], "writable_roots": [], "timeout_ms": 1800000,
  "command": "codex", "args": ["exec", "--skip-git-repo-check", "--dangerously-bypass-approvals-and-sandbox", "…"], "prompt_stdin": true, "sandbox_mode": "workspace-write" }
```

The client opens the process where it wants (a terminal in its grid, a tab), feeds it the prompt file (or runs the reference `command`/`args` non-interactively) and answers one JSON line — `{"ok": true, "session_id": "…", "pid": 123}` — then returns. The engine keeps everything else: it waits for the **bound report** at `report_path` (the only "done" it trusts), measures stall by file changes under the lane's write paths, records the `session_id` on the unit (state, `execution:status`) and, on abort or when the unit budget elapses, asks the client to close the session (`{"action": "close", "session_id": "…", "reason": "timeout"}`, best effort). A spawner that is not on PATH fails the preflight (`spawner_not_found`); one that refuses, crashes or answers without `ok: true` leaves the unit's `decision_required` (`spawner_failed`), exactly like a host that cannot run. `unit_timeout_ms` (1 min – 4 h, or `0` = no limit: the worker runs until it finishes) defaults to 30 minutes when a spawner is in force — humans watch terminals — and 60 minutes otherwise; `execution:run --unit-timeout=<ms>` sets it for one invocation. The budget and the spawner are read fresh by every run and stay out of the digest the compiled plan binds to (`source.roles_digest` covers the roles, the parallelism and the independent-review rule), so raising the budget with a run paused never invalidates the run. `execution:offer` reports `execution.spawner_supported` and the spawner in force, so a client can feature-detect the seam. Nothing about the client leaks into the engine — one command, one envelope in, one line out — and the envelope carries no secrets.

## Explicit fallback only

Missing CLI, unsupported capability, or unavailable model pauses execution. The active chat must never imitate the requested model.

A fallback runs only when both the entry and the global policy authorize it:

```json
{
  "fallbacks": [
    {
      "host": "codex",
      "model": "configured-default",
      "on": ["unavailable", "capacity"]
    }
  ],
  "capacity_policy": {
    "strategy": "fallback",
    "max_attempts": 2,
    "backoff_ms": 0,
    "allow_cross_host": true
  }
}
```

Without this explicit declaration, execution returns `paused` with a resume command.

## Model and report binding

Codex model names resolve conservatively against the local catalog: exact slug, normalized name, unique alias, then bounded typo correction. Numeric versions never drift. Other hosts accept safe literal IDs when no catalog adapter exists.

State, report, and telemetry keep:

- requested and resolved model;
- resolution strategy;
- reasoning effort when supported;
- host and fallback history;
- feature, run, attempt, agent/lane, writable roots, and declared lane paths.

Reports that do not match the registered attempt are rejected.

## Review policy

`aioson verification:plan . --feature=my-feature --trigger=per-phase` runs no reviewer by default. At `end-of-feature`, QA is the only default reviewer. Tester, Pentester, and Validator run only when their manifest entry is enabled and its trigger applies.
