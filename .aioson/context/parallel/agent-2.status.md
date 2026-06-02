# Parallel Lane Status - agent-2

## Metadata
- lane: agent-2
- role: @dev
- owner: lane-2
- status: completed
- priority: high
- updated_at: 2026-06-02T04:52:00-03:00

## Scope
- Workflow routing integration
- Insert `@discovery-design-doc` as the SMALL/MEDIUM pre-implementation stage
- Keep `aioson workflow:next` as the single routing motor
- Ensure CLI/status output exposes active stage, blocker, next command, and artifact path without dashboard dependency

## Ownership
- lane_key: lane-2
- scope_keys: workflow-routing, discovery-design-doc-stage, cli-status-ux
- write_scope: workflow command routing and localized CLI/status output
- write_paths: src/commands/workflow-next.js, src/commands/workflow-status.js, src/commands/workflow-execute.js, src/commands/preflight.js, src/commands/artifact-validate.js, src/cli.js, src/i18n/messages/**

## Dependencies
- lane-1
- shared-decisions

## Merge
- merge_rank: 2
- merge_strategy: lane-index-asc

## Context package
- `.aioson/context/project.context.md`
- `.aioson/context/prd.md`
- `.aioson/context/discovery.md`
- `.aioson/context/ui-spec.md`
- `.aioson/skills/process/aioson-spec-driven/SKILL.md`
- `.aioson/skills/process/aioson-spec-driven/references/approval-gates.md`
- `.aioson/skills/process/aioson-spec-driven/references/classification-map.md`

## Deliverables
- [x] SMALL/MEDIUM workflow requires discovery-design-doc before significant implementation
- [x] `workflow:next`, status, preflight, and artifact validation agree on missing artifacts and next agent
- [x] CLI JSON stays machine-consumable and human output stays concise in supported locales
- [x] No alternate workflow engine, daemon, or dashboard-only state is introduced

## Blockers
- [none]

## Notes
- If implementation exposes an unresolved product fork, return to workflow instead of silently deciding.
- Verification: `node --check` passed for touched workflow/preflight/artifact modules. `node --test tests/workflow-next.test.js tests/workflow-status.test.js tests/preflight-engine.test.js tests/preflight-command.test.js` passed. `node --test tests/artifact-validate.test.js tests/sdlc-process-upgrade-regression.test.js` passed.
