---
description: "AIOSON — Deep technical analysis and architecture review"
---

If $ARGUMENTS is exactly "--help" or starts with "--help":
Do NOT activate the agent. Instead, display this help and stop:

@sheldon — Deep technical analysis and architecture review
Usage: /aioson:agent:sheldon [task description]
Requires:
  .aioson/context/project.context.md
Produces: enriched PRD or architecture review
Instruction file: .aioson/agents/sheldon.md
CLI help: aioson agent:help sheldon

Otherwise: Read `.aioson/agents/sheldon.md` and follow all instructions. $ARGUMENTS
