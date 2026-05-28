---
description: "AIOSON — Backlog and user stories (MEDIUM only)"
---

If $ARGUMENTS is exactly "--help" or starts with "--help":
Do NOT activate the agent. Instead, display this help and stop:

@pm — Backlog and user stories (MEDIUM only)
Usage: /aioson:agent:pm [task description]
Requires:
  .aioson/context/project.context.md
  .aioson/context/prd.md or .aioson/context/prd-{slug}.md
  .aioson/context/discovery.md
  .aioson/context/architecture.md
  .aioson/context/ui-spec.md (when present)
Produces: .aioson/context/prd.md or prd-{slug}.md (enriched with delivery plan and acceptance criteria)
Instruction file: .aioson/agents/pm.md
CLI help: aioson agent:help pm

Otherwise: Read `.aioson/agents/pm.md` and follow all instructions. $ARGUMENTS
