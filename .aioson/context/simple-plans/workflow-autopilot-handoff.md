---
slug: workflow-autopilot-handoff
status: done
owner: dev
created_at: 2026-06-09
updated_at: 2026-06-09
classification: MICRO
risk: medium
source: direct-user-request
---

# Simple Plan - Autopilot handoff (analyst → dev)

## Scope
Opt-in autopilot for the deterministic segment of the feature workflow: when `auto_handoff: true` is set in `project.context.md` frontmatter, the agents `@analyst`, `@scope-check`, `@architect` and `@discovery-design-doc` auto-invoke the next agent's skill (`Skill(aioson:agent:<next>)`) instead of stopping for manual activation — until the next agent is `@dev`, where the chain stops with the normal handoff + `/clear` recommendation. Briefing, product and sheldon stay manual by design (genuine human decision points).

Research basis: `researchs/auto-handoff-pipeline-2026/summary.md` — routing must come from the workflow state machine (never LLM choice), every hop needs explicit stop conditions, context threshold check per hop is the load-bearing mitigation.

## Done criteria
- New shared protocol doc `template/.aioson/docs/autopilot-handoff.md` (+ synced workspace copy) defining: flag, routing source of truth, auto-invoke pattern, and the 5 stop conditions (next=@dev; verdict ≠ approved/patched; Gate B blocked / readiness blocked; context ≥ `context_warning_threshold` → checkpoint + /clear; Ctrl+C).
- `template/.aioson/agents/{analyst,scope-check,architect,discovery-design-doc}.md` each gain a compact "Autopilot handoff" section (≤ 10 lines) referencing the shared doc, using the same wording pattern as the existing qa-dev-cycle auto-invoke ("No user prompt — Ctrl+C interrupts").
- Hard constraint carve-out ("Between agent handoffs, your ONLY valid output...") updated in `template/CLAUDE.md`, `template/AGENTS.md`, root `CLAUDE.md`, root `AGENTS.md`.
- Optional frontmatter field `auto_handoff` documented in the context contract of `template/.aioson/config.md` and workspace `.aioson/config.md` (config.md is rsync-excluded — edit both).
- `src/agents.js` `buildAgentPrompt` accepts `autoHandoff` option that appends the autopilot exception to the scope-boundary line; `workflow-next.js` passes it from project context frontmatter. Covered by a test.
- Workspace copies in `.aioson/agents/` and `.aioson/docs/` synced from template.
- `npm test` and `npm run lint` pass (watch: agent-structural-contract / agent-locale-sync / agent-contracts tests).

## Out of scope
- Project-mode MEDIUM chain agents (`ux-ui`, `pm`, `orchestrator`) — feature-creation path only.
- Locale regeneration (`.aioson/locales/`) — canonical English only; `aioson locale:apply` handles localization later.
- CLI auto-advance changes (`maybeAutoAdvanceWorkflow`) — already works; autopilot is prompt-layer.
- Auto-handoff for briefing/product/sheldon — intentionally manual.
- Headless multi-session runner (`workflow:run --until=dev`) — rejected alternative, larger scope.

## Expected files
- template/.aioson/docs/autopilot-handoff.md (new)
- template/.aioson/agents/analyst.md
- template/.aioson/agents/scope-check.md
- template/.aioson/agents/architect.md
- template/.aioson/agents/discovery-design-doc.md
- template/CLAUDE.md, template/AGENTS.md, CLAUDE.md, AGENTS.md
- template/.aioson/config.md, .aioson/config.md
- src/agents.js, src/commands/workflow-next.js
- tests/agents.test.js
- workspace mirrors: .aioson/docs/autopilot-handoff.md, .aioson/agents/{4 files}

## Verification
- npm test
- npm run lint
- diff template/.aioson/agents/<file> .aioson/agents/<file> → identical for the 4 agents

## Session state
Next step: none — implemented and verified.

## Notes
- Routing source of truth: `aioson workflow:next .` / `workflow.state.json`; fallback (CLI absent) = classification sequence from config.md. The LLM never picks the next agent (deterministic-routing finding).
- Reuses the qa-dev-cycle auto-invoke precedent (`dev.md` "Auto-cycle return to @qa") for wording consistency.
- Verification evidence (2026-06-09): `npm run lint` clean; `node --test` → only 2 failures, both pre-existing on clean HEAD (AC-CTPK-06 in `tests/inception-parity-cross-tool-project-knowledge.test.js`, Windows CRLF environment issue — test does `includes()` with LF-only string against CRLF worktree files; reproduced via `git stash && node --test <file>`). New test `buildAgentPrompt appends autopilot exception only when autoHandoff is true` passes. Template↔workspace diff: 4 agents + doc identical.
- Workspace sync done via direct copy of the 5 changed files (full `npm run sync:agents` rsync not needed and riskier).
- `auto_handoff` is read from frontmatter generically (`parseScalar` already converts `true`/`false` to booleans) — no parser change needed.
