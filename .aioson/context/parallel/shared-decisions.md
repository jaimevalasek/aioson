# Shared Decisions

## Session
- Project: aioson
- Classification: MEDIUM
- Workers: 4
- Generated at: 2026-06-02T01:11:00-03:00

## Protocol
- Record only decisions that affect more than one parallel lane.
- When a decision changes a contract, update all impacted lane files.
- Keep entries concise and include rationale plus impact.

## Decision Log
| time | decision | rationale | impact |
|------|----------|-----------|--------|
| 2026-06-02T01:11:00-03:00 | Four-lane orchestration selected | The project PRD spans governance baseline, workflow routing, agent prompt contracts, and QA/rollout verification | `@dev` may execute lanes sequentially or with real workers if the client supports it |
| 2026-06-02T01:11:00-03:00 | Project-wide design-doc baseline is the canonical base | Existing PRD/discovery require a permanent design-doc before implementation; current project context is project-mode, not feature-mode | Lane 1 owns `.aioson/context/design-doc.md` and `template/.aioson/context/design-doc.md`; other lanes consume it |
| 2026-06-02T01:11:00-03:00 | `workflow:next` remains the only routing motor | PRD explicitly requires deterministic workflow routing and no parallel/dashboard-only state | Lane 2 must integrate `@discovery-design-doc` without creating a second executor or daemon |
| 2026-06-02T01:11:00-03:00 | Template-first applies to agent prompt edits | `agent-structural-contract` says template agents are canonical and workspace agents are synced copies | Lane 3 edits template prompts first and verifies parity with `.aioson/agents/*` |
| 2026-06-02T01:11:00-03:00 | Documentation follows implemented behavior | `canonical-path-contract` keeps `docs/pt/` out of operational planning | Lane 4 may update docs only after behavior is present and verified |
| 2026-06-02T01:11:00-03:00 | No native worker spawning was performed | Current Codex session is disk/CLI-backed; AIOSON status files are the durable coordination artifact | The next `@dev` agent should read `.aioson/context/parallel/*.status.md` and can choose sequential execution |

## Open Coordination Notes
- Product questions about setup vs architect ownership are resolved operationally only where inferable: the baseline file is project-wide and mirrored to template; workflow ownership remains enforced by downstream stages.
- Any new unresolved product fork discovered during implementation should route back through the workflow, not be decided ad hoc in `@dev`.
