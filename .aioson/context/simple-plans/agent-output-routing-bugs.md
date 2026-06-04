---
slug: agent-output-routing-bugs
status: done
owner: dev
created_at: 2026-06-04
updated_at: 2026-06-04
classification: SMALL
risk: medium
source: direct-user-request
---

# Simple Plan - Agent Output Routing Bugs

## Scope
Fix the command, state, handoff, and agent-prompt regressions found during the dogfood analysis of recent AIOSON changes.

## Done criteria
- Broken commands identified in analysis either pass or have tests updated to the intended current contract.
- Runtime/workflow state drift has a recoverable path and current session state points at this simple plan.
- Agent prompt references use implemented commands and consistent handoff targets.
- Windows-sensitive verification paths are portable where the suite currently fails.

## Out of scope
- Full agent compression for every over-budget agent.
- New product workflow, PRD, or architecture redesign.
- Dashboard UI changes.

## Expected files
- `src/commands/workflow-next.js`
- `src/commands/workflow-heal.js`
- `src/commands/feature-archive.js`
- `src/commands/squad-export.js`
- `src/installer.js`
- `src/constants.js`
- `src/squad/preflight-context.js`
- `src/cli.js`
- `src/i18n/messages/*.js`
- `template/.aioson/agents/*.md`
- `.aioson/agents/*.md`
- `tests/**/*.test.js`
- `package.json`

## Verification
- `node --check` on touched source files.
- Focused `node --test` command for changed commands/prompts.
- `npm test`.
- `npm run lint`.

## Session state
Next step: completed; no active dev work remains for this Simple Plan.

## Notes
- Project `design-doc.md` and `readiness.md` were loaded before implementation.
- Existing worktree changes are preserved; edits are scoped to this correction pass.
- Fixed command/export/runtime regressions, prompt/handoff inconsistencies, Windows-sensitive tests, and stale runtime state.
- Archived completed feature context with `feature:sweep`; `runtime:status` and `agent:recover --dry-run` returned clean after recovery.
