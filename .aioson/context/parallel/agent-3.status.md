# Parallel Lane Status - agent-3

## Metadata
- lane: agent-3
- role: @dev
- owner: lane-3
- status: completed
- priority: high
- updated_at: 2026-06-02T05:02:00-03:00

## Scope
- Agent prompt guardrails
- `@discovery-design-doc` technical plan contract with concrete paths/modules/reuse decisions
- `@dev` and `@deyvin` must load design-doc before writing files
- File-size alert over 500 lines, including pair/continuity mode
- Template-first prompt edits with workspace parity verification

## Ownership
- lane_key: lane-3
- scope_keys: agent-prompts, technical-plan-contract, dev-deyvin-guardrails
- write_scope: official workflow agent prompts and SDD implementation references
- write_paths: template/.aioson/agents/discovery-design-doc.md, template/.aioson/agents/dev.md, template/.aioson/agents/deyvin.md, template/.aioson/agents/pm.md, template/.aioson/agents/orchestrator.md, template/.aioson/agents/qa.md, .aioson/agents/discovery-design-doc.md, .aioson/agents/dev.md, .aioson/agents/deyvin.md, .aioson/agents/pm.md, .aioson/agents/orchestrator.md, .aioson/agents/qa.md, .aioson/skills/process/aioson-spec-driven/references/**, template/.aioson/skills/process/aioson-spec-driven/references/**

## Dependencies
- lane-1
- lane-2
- shared-decisions

## Merge
- merge_rank: 3
- merge_strategy: lane-index-asc

## Context package
- `.aioson/context/project.context.md`
- `.aioson/context/prd.md`
- `.aioson/context/discovery.md`
- `.aioson/context/ui-spec.md`
- `.aioson/rules/agent-structural-contract.md`
- `.aioson/rules/canonical-path-contract.md`
- `.aioson/skills/process/aioson-spec-driven/SKILL.md`

## Deliverables
- [x] `@discovery-design-doc` reads PRD, architecture, design-doc, project map, and produces an exact technical plan
- [x] `@dev` prompt/template records design-doc loaded before edits
- [x] `@deyvin` continuity mode enforces the same design-doc and file-size alert for touched files
- [x] Agent prompt edits are made in template first, then synced/verified against workspace

## Blockers
- [none]

## Notes
- Do not bypass workflow routing with `@deyvin` for new features or broad changes.
- Verification: template/workspace parity checks returned no differences for touched agent and SDD reference files; `aioson parallel:guard` passed for lane 3 write paths. `node --test tests/agent-contracts.test.js` still fails on pre-existing `product.md` size target outside lane 3 write scope.
