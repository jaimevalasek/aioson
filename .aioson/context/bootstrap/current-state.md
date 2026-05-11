---
updated_at: "2026-04-17T00:50:39-03:00"
source: "Autonomy/orchestration analysis and planning session"
---

# Current State

## What the system already has

These capabilities were confirmed during this analysis:

- `@dev`, `@qa`, and `@committer` prompts already contain CLI-aware behavior
- `workflow:next --complete` is the real stage transition primitive
- `workflow:next --auto-heal` already exists
- `workflow:heal` already exists as manual fallback
- handoff generation already happens in workflow completion flow
- technical gates already block broken handoffs
- handoff contracts already block incomplete stage exits
- `commit:prepare` already exists and is the expected pre-commit path
- `workflow:harden` already exists
- test briefing and path guard are already injected by the motor
- machine-readable autonomy policy layer now exists via `.aioson/config/autonomy-protocol.json`
- official workflow agents now have capability manifests in `.aioson/agents/*.manifest.json`
- `agent:prompt`, `workflow:next`, and `workflow:execute` now resolve an effective autonomy mode
- workflow completion now dual-writes `last-handoff.json` and `handoff-protocol.json`
- handoff protocol validation now exists in warning-first mode
- `workflow:next --status` now exposes active stage, queued next stage, contract readiness, pending gate, autonomy mode, artifacts, and last handoff data
- `workflow:next --suggest` now returns a deterministic next command based on workflow state and handoff contract readiness
- `commit:prepare` now supports an explicit agent-safe/headless path and blocks non-interactive staging ambiguity with a structured error
- `workflow:execute` now seeds/resumes feature workflow state, predicts blockers in dry-run, and advances one or more valid checkpoints through `workflow:next`
- project-mode handoff gates now use `.aioson/context/spec.md` when present and no longer fail just because a workflow stage has no feature slug
- `@ux-ui`, `@pm`, and `@orchestrator` prompts/manifests are now aligned with the current runtime contracts instead of outdated harness assumptions
- `parallel:init` now creates a machine-readable parallel workspace baseline with `workspace.manifest.json`, `ownership-map.json`, and `merge-plan.json`
- `parallel:assign` now writes explicit lane ownership and merge metadata into both lane status files and machine-readable artifacts
- `parallel:assign` now preserves manual lane dependencies declared in the lane status files when rebuilding machine-readable artifacts
- `parallel:status` now reports machine-file health, ownership conflicts, dependency blockers, dependency order violations, and stale machine-readable artifacts
- `parallel:doctor` now validates stale machine-readable artifacts, ownership conflicts, invalid lane dependencies, blocked dependencies, and merge-order violations
- `parallel:doctor --fix` now reconstructs stale machine-readable parallel artifacts in addition to restoring missing shared and lane status files
- `parallel:merge` now consumes `merge-plan.json` and executes a deterministic merge only when every lane is structurally ready
- merged lanes now persist as `status: merged`, and `parallel:status` reports merged lanes explicitly
- lane status files, `workspace.manifest.json`, and `ownership-map.json` now carry explicit `write_paths` declarations per lane
- `parallel:status` and `parallel:doctor` now report write-scope coverage gaps, invalid `write_paths` patterns, and overlapping file ownership across lanes
- `parallel:guard` now validates whether a given lane is allowed to write specific project paths before execution starts
- `parallel:merge` now also blocks when declared `write_paths` overlap or contain invalid patterns
- `@sheldon` now generates `harness-contract.json` for MEDIUM features as part of RF-05, populating binary criteria from PRD ACs (full procedure in `.aioson/docs/sheldon/harness-contract.md`)
- `@qa` now recommends `@validator` in the QA report when `.aioson/plans/{slug}/harness-contract.json` exists for the active feature, gating `feature:close` via `progress.json.ready_for_done_gate`
- `aioson agent:prompt --headless --output=<file>` now generates an agent prompt without launching an editor and without registering a live session, suitable for CI runners and external LLM execution
- `aioson harness:validate` is now a router: when `.aioson/plans/{slug}/last-validator-output.json` exists it consumes it via `harness:apply-validation`; otherwise it generates the @validator prompt headless for external LLM execution
- `aioson harness:apply-validation . --slug=<slug> [--input=<path>]` consumes @validator JSON output and translates `results[].reason` of the first failure into `progress.json.last_error` (format `"<id>: <reason>"`), records via the circuit breaker, archives the input under `validator-runs/<timestamp>.json` after PASS or FAIL
- `harness:validate` now sets `progress.json.status = 'waiting_validation'` after generating the validator prompt, and `harness:apply-validation` resets it to `'in_progress'` after consuming output (preserving `circuit_open` when error_streak limit fires)
- `aioson workflow:next` now auto-routes to `@validator` (as a detour, returning to the original `state.next` after validator completes) when the active feature has `harness-contract.json` and `progress.status === 'waiting_validation'`. Explicit `--agent=…` overrides preserve user intent; without contract or in MICRO/SMALL the routing is a no-op
- `aioson feature:close --verdict=PASS` now enforces the harness done gate: if `harness-contract.json` exists and `progress.json.ready_for_done_gate !== true`, closure is blocked with the pending criterion ID/reason. `--force` bypasses with an explicit BYPASS audit trail entry. `--verdict=FAIL` skips the gate (QA already rejected). Without contract, behavior is unchanged.
- `@copywriter` now supports Mode 6 (Campaign Package), G0 genome resolution rule (folder vs single-file), G2.5 master copywriter selection (8 schools), R0.5 avatar gate, alternative structures (Tríade, KSTK, CPGC ads), LightCopy 4-style voice selection, plus new marketing references (headline-matrix, cta-matrix, platform-constraints); `@product` routes `project_type=site` to `@copywriter` and `@ux-ui` Step 0.5 copy gate halts visual layout when no `copy-{slug}.md` exists.
- `aioson memory:reflect-prepare/commit` now provide deterministic in-harness reflection of `bootstrap/*.md`: a pure engine (`src/memory-reflect-engine.js`) classifies git diff against routes/models/contracts/volume signals, builds a manifest with snapshot hash and allowed paths at `.aioson/runtime/reflect-prompt.json`, and validates the agent's output (frontmatter intact, `generated_at` bumped, snapshot hash matches) before writing to `.aioson/context/bootstrap/`. Prompts for each target file are in `template/.aioson/templates/reflect-prompts/`.
- `autonomy-protocol.json` is now v1.1 with `tiers` (tier1_silent / tier2_notified / tier3_blocking) and `derived_from_tiers` per harness; `src/permissions-generator.js` materializes `.claude/settings.json`, `.codex/permissions.json`, `.gemini/permissions.toml`, and `.opencode/permissions.yaml` at install/update time. Tier3 (`git push`, `npm publish`, `cloud:publish:*`, etc.) is hard-rejected even if a tool lists it. Generator is idempotent and backs up the previous version under `.aioson/backups/{ts}/permissions/`. v1.0 protocols continue to work via legacy `shell_whitelist`/`aioson_whitelist` fallback.
- `aioson notify --level=info|warn|block --topic=<t> --message=<m>` is now a CLI command — visual wrapper over `runtime:emit` with prefixes ℹ/⚠/⛔ and exit code 2 on `level=block` so callers can halt for human input.
- Agents `@dev`, `@qa`, and `@deyvin` now declare capability `reflect_memory` (tier2_notified, trigger=post_agent_done) in their manifests, carry a "Memory reflection" section in their `.md` files that consumes `.aioson/runtime/reflect-prompt.json`, and surface a bootstrap-coverage advisory (`⚠ [bootstrap] coverage <N>/4`) at session start when `aioson memory:status` reports gaps. `deyvin.manifest.json` is new.
- `aioson workflow:next --complete=<agent>` and `aioson agent:done` now call `memory:reflect-prepare` as a best-effort hook; when the diff is relevant a manifest lands at `.aioson/runtime/reflect-prompt.json` and `workflow:next` prepends a `ℹ [memory] reflect-prompt.json pending` line to the next agent's activation prompt. Both hooks fail silently if anything errors — reflection never blocks the workflow.
- `.aioson/docs/autonomy-protocol.md` is now an on-demand doc describing the 3-tier permission model, the 4 native harness formats, the notify levels, backward-compat rules, and the procedure to add a new command to a tier.
- `aioson doctor` now runs 5 additional Living Memory checks at `severity: 'warning'` (`bootstrap_coverage`, `features_dir_present`, `claude_commands_present`, `version_drift`, `permissions_in_sync`); the `--fix` flag auto-creates `.aioson/context/features/`, restores missing `.claude/commands/aioson/agent/*` slashes from the template, and regenerates native harness permission files via `permissions-generator`. Bootstrap coverage and version drift are advisory (no auto-fix). Warnings surface in the diagnosis line but do not break `report.ok`, so existing tooling that gates on doctor's overall verdict keeps working. Hints are localised in en, pt-BR, es, and fr.
- Living Memory user documentation now lives at `docs/pt/living-memory/` (7 files: README index + memoria-viva concept + reflexao-in-harness pipeline + autonomy-contract 3-tiers + notificacoes-info + troubleshooting 11 receitas + diagramas ASCII), linked from the main `docs/pt/README.md`. ~1440 lines in pt-BR covering the entire feature for non-developer readers.

## What the system does not have yet

These are real gaps, not already-delivered work:

- hard enforcement of isolated write scopes inside the edit/execution harness itself
- real filesystem/worktree isolation per lane during implementation

## Correct reading of the backlog

The outdated assumption was:

- "next step is updating prompts so agents can call CLI"

The corrected reading is:

- prompt awareness is already delivered
- the next work is operational hardening of autonomy

## Priority order discovered in this session

1. clean old planning docs so they stop describing completed work as pending
2. close the sequential autonomous flow
3. revisit runner depth and then parallelism

## Canonical planning files for this topic

- `products-features/upgrade-agents/agentes-autonomos-cli.md`
- `products-features/upgrade-agents/roadmap-consolidado-autonomia-orquestracao.md`
- `products-features/upgrade-agents/checklist-executavel-autonomia-orquestracao.md`
- `plans/Upgrade-Agents/Plano-Definitivo-Implementacao-Protocol-Contracts.md`

## Practical resume point

If a future agent resumes this topic, the safest next implementation slice is:

- move from preflight `parallel:guard` validation to enforced write blocking inside execution/edit flows

After that:

- evaluate whether parallel lanes need worktree-backed isolation instead of shared-workspace coordination
