---
slug: simple-plan-lane
status: done
owner: dev
created_at: 2026-06-01
updated_at: 2026-06-01
classification: MICRO
risk: low
source: direct-user-request
---

# Simple Plan - Simple Plan Lane

## Scope
Add a lightweight implementation lane so `@dev` and `@deyvin` can persist and execute bounded technical work without forcing PRD or full workflow overhead.

## Done criteria
- `@dev` and `@deyvin` know when to use or escalate from the simple-plan lane.
- Rules and path contracts define `.aioson/context/simple-plans/{slug}.md`.
- `dev:state:write --context=simple-plan` resolves to the simple plan artifact.
- Workspace and template prompts/rules stay aligned.
- Focused tests cover the new `simple-plan` context token.

## Out of scope
- No dedicated `aioson simple-plan:*` CLI commands in this slice.
- No changes to `features.md` workflow-mode detection.
- No replacement of PRD, requirements, architecture, or QA gates.

## Expected files
- `.aioson/agents/dev.md`
- `.aioson/agents/deyvin.md`
- `.aioson/rules/simple-plan-lane.md`
- `.aioson/docs/dev/simple-plan-lane.md`
- `src/commands/state-save.js`
- `tests/dev-state-producer.test.js`
- `template/.aioson/**`

## Verification
- `node --test tests/dev-state-producer.test.js`
- `node --test tests/agent-manifests.test.js`
- `node --test tests/agent-runtime-alignment.test.js`
- `node src/commands/sync-agents-preflight.js`
- PowerShell-expanded `node --check` across `src/`, `src/commands/`, `src/i18n/`, `src/i18n/messages/`, and `bin/`

## Session state
Next step: optional follow-up to add dedicated `aioson simple-plan:*` commands.

## Notes
- `simple-plans/{slug}.md` is intentionally separate from `features.md` so paused or active simple plans do not force feature-mode workflow routing.
- `dev-state.md` remains the active resumption pointer; the simple plan is the persisted implementation contract.
