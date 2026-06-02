# Parallel Lane Status - agent-1

## Metadata
- lane: agent-1
- role: @dev
- owner: lane-1
- status: completed
- priority: high
- updated_at: 2026-06-02T04:35:00-03:00

## Scope
- Design governance baseline
- Permanent project design-doc contract for SMALL/MEDIUM execution
- Template/workspace parity for design-doc and governance rules
- Resolve the objective design-doc base location from existing project artifacts: project-wide baseline at `.aioson/context/design-doc.md`, mirrored in `template/.aioson/context/design-doc.md`

## Ownership
- lane_key: lane-1
- scope_keys: design-doc-baseline, template-workspace-parity, governance-rules
- write_scope: design-doc baseline, template context, governance rules
- write_paths: .aioson/context/design-doc.md, template/.aioson/context/design-doc.md, .aioson/rules/**, template/.aioson/rules/**, .aioson/context/project-map.md

## Dependencies
- shared-decisions

## Merge
- merge_rank: 1
- merge_strategy: lane-index-asc

## Context package
- `.aioson/context/project.context.md`
- `.aioson/context/prd.md`
- `.aioson/context/discovery.md`
- `.aioson/context/ui-spec.md`
- `.aioson/rules/canonical-path-contract.md`
- `.aioson/rules/disk-first-artifacts.md`
- `.aioson/rules/data-format-convention.md`

## Deliverables
- [x] `.aioson/context/design-doc.md` exists and defines folder, naming, componentization, reuse, and file-size guidance
- [x] `template/.aioson/context/design-doc.md` mirrors the distributable baseline
- [x] Governance rule/template parity is preserved where rules are touched
- [x] Any stale or inconsistent context value is repaired only when objectively inferable

## Blockers
- [none]

## Notes
- Do not create operational plans in root `plans/` or `docs/pt/`.
- Use Markdown for governance artifacts; JSON only for machine-consumed contracts.
- Verification: `Compare-Object` returned no differences between workspace and template design-doc baselines; `aioson parallel:guard . --lane=1 --paths='.aioson/context/design-doc.md,template/.aioson/context/design-doc.md,.aioson/context/project-map.md'` passed.
