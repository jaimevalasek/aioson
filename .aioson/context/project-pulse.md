---
last_updated: 2026-06-23
last_agent: dev
last_gate: simple-plan update/install docs complete
active_feature: framework-integrations-docs-update
active_work: "framework-integrations-docs-update -> @dev -> done"
blockers: none
next_recommendation: "Keep official .aioson/docs/integrations files in template and MANAGED_FILES; project-owned files in that folder remain preserved by update."
---

# Project Pulse

## Status

- **Last agent:** @dev
- **Active feature:** framework-integrations-docs-update
- **Active work:** framework-integrations-docs-update -> @dev -> done
- **Next:** Keep official `.aioson/docs/integrations/` files in `template/` and `MANAGED_FILES`; project-owned files in that folder remain preserved by update.

## Recent Activity

- 2026-06-19 @pentester → context-intelligence: Reviewed 9 security surfaces for context intelligence hook surface: 1 high finding in hooks-install command construction
- 2026-06-19 @dev → context-intelligence: Fixed SF-context-intelligence-01: hooks:install now rejects unsafe agent names and shell-quotes generated hook command arguments.
- 2026-06-19 @dev → hygiene-scan-neo-orchestration: Implemented read-only hygiene:scan diagnostic including pending_chain_noises, archive-pending features, stale dev-state, loose review artifacts, and Neo orchestration docs; focused tests, JS check, and npm test passed
- 2026-06-23 @dev -> play-app-compat-docs: Created curated AIOSON Play app compatibility docs in `.aioson/docs/play/`, sourced from canonical `aioson-play` integration docs and project Play conventions.
- 2026-06-23 @dev -> framework-integrations-docs-update: Added framework-managed `.aioson/docs/integrations/dashboard-app-form-publish-mapping.md` to the install/update template and covered update behavior that refreshes official docs while preserving project-owned integration docs.
