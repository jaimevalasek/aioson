---
description: "AIOSON — System router: see the full picture, get guided to the right agent"
---

If $ARGUMENTS is exactly "--help" or starts with "--help":
Do NOT activate the agent. Instead, display this help and stop:

@neo — System router: see the full picture, get guided to the right agent
Usage: /aioson:agent:neo [task description]
Requires:
  .aioson/context/project.context.md
Produces: routing decision + agent handoff
Instruction file: .aioson/agents/neo.md
CLI help: aioson agent:help neo

Otherwise: Read `.aioson/agents/neo.md` and follow all instructions. $ARGUMENTS
