---
description: "AIOSON — Pre-production briefings and planning"
---

If $ARGUMENTS is exactly "--help" or starts with "--help":
Do NOT activate the agent. Instead, display this help and stop:

@briefing — Pre-production briefings and planning
Usage: /aioson:agent:briefing [task description]
Requires:
  .aioson/context/project.context.md
Produces: .aioson/briefings/{slug}/
Instruction file: .aioson/agents/briefing.md
CLI help: aioson agent:help briefing

Otherwise: Read `.aioson/agents/briefing.md` and follow all instructions. $ARGUMENTS
