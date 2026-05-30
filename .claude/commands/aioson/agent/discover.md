---
description: "AIOSON — Semantic knowledge discovery and bootstrap cache generation"
---

If $ARGUMENTS is exactly "--help" or starts with "--help":
Do NOT activate the agent. Instead, display this help and stop:

@discover — Semantic knowledge discovery and bootstrap cache generation
Usage: /aioson:agent:discover [task description]
Requires:
  .aioson/context/project.context.md
Produces: .aioson/context/bootstrap/what-is.md + .aioson/context/bootstrap/how-it-works.md + .aioson/context/bootstrap/what-it-does.md + .aioson/context/bootstrap/current-state.md
Instruction file: .aioson/agents/discover.md
CLI help: aioson agent:help discover

Otherwise: Read `.aioson/agents/discover.md` and follow all instructions. $ARGUMENTS
