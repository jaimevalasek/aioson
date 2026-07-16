# Review Intelligence — Phase 3 QA checkpoint

Review only the distributed skill, schema, managed-file registration, root guidance, eight agent hooks, and their focused tests.

## Execution discipline

- Finish and publish the bound report within 8 minutes.
- Run the exact commands below first, then inspect only the scoped files needed to explain their results.
- Do not scan unrelated dirty-worktree changes, revisit Phase 1/2 internals, or inspect prior execution reports.
- Do not edit source files. The only permitted write is the bound JSON report appended by the execution contract.

## Scope

- `template/.aioson/skills/process/review-intelligence/` and mirrored `.aioson/` files
- `template/.aioson/schemas/review-intelligence.schema.json` and mirrored `.aioson/` file
- Phase 3 additions only in `src/constants.js`, `template/AGENTS.md`, and `AGENTS.md`
- Phase 3 additions only in the eight template/workspace agents: briefing, briefing-refiner, product, sheldon, analyst, architect, scope-check, qa
- Phase 3 budget update only in `tests/agent-contracts.test.js`
- `tests/review-intelligence-skill.test.js`
- Approved requirements/design/implementation plan for Phase 3

## Required checks

1. Confirm SKILL metadata/triggering, four-reference progressive disclosure, evidence-first two-pass stop condition, future-state challenge, user-owner routing, proportionate research, and explicit prohibition on private reasoning/aggregate scoring.
2. Confirm schema Draft 2020-12 shape and parity with runtime versions, agents, profiles, bounds, finding/evidence fields, delivery assurance axes, and closed objects.
3. Confirm all six skill files plus schema are in `MANAGED_FILES`, setup/update copying stays additive, and template/workspace copies are byte-identical.
4. Confirm each hook uses the approved agent/profile, appears after activation/mission and before the existing gate/handoff, handles exits 0/1/2, never suppresses exit 2, and has a bounded non-gating fallback for older installations.
5. Confirm existing activation guards, language, output, observability, approval, gate, and handoff contracts remain present; `CHAIN_AGENTS`, workflow routing, and existing CLI semantics are untouched.
6. Confirm the compact @product/@sheldon hook remains under the explicitly documented 33 KB budget and detailed procedure stays in the on-demand skill.
7. Run:
   - `python C:\Users\jaime\.codex\skills\.system\skill-creator\scripts\quick_validate.py template/.aioson/skills/process/review-intelligence`
   - `node --test tests/review-intelligence-skill.test.js tests/agent-contracts.test.js tests/sync-agents-copy.test.js tests/sync-agents-preflight.test.js tests/sync-agents-preflight-semantic.test.js tests/update.test.js tests/skill-audit.test.js`
   - `node scripts/check-js.js`
   - `node bin/aioson.js skill:audit . --json`

Return `PASS` only when all scoped checks and commands pass and the new skill files are `ok` in the audit. Otherwise return `FAIL` with concise file/line findings.
