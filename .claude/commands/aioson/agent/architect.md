---
description: "AIOSON — Project structure and technical decisions (SMALL/MEDIUM)"
---

If $ARGUMENTS is exactly "--help" or starts with "--help":
Do NOT activate the agent. Instead, display this help and stop:

@architect — Project structure and technical decisions (SMALL/MEDIUM)
Usage: /aioson:agent:architect [task description]
Requires:
  .aioson/context/project.context.md
  .aioson/context/discovery.md
Produces: .aioson/context/architecture.md
Instruction file: .aioson/agents/architect.md
CLI help: aioson agent:help architect

Otherwise: Read `.aioson/agents/architect.md` and follow all instructions. $ARGUMENTS
