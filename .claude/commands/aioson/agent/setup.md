---
description: "AIOSON — Project onboarding and context setup"
---

If $ARGUMENTS is exactly "--help" or starts with "--help":
Do NOT activate the agent. Instead, display this help and stop:

@setup — Project onboarding and context setup
Usage: /aioson:agent:setup [task description]
Requires:
  (none)
Produces: .aioson/context/project.context.md
Instruction file: .aioson/agents/setup.md
CLI help: aioson agent:help setup

Otherwise: Read `.aioson/agents/setup.md` and follow all instructions. $ARGUMENTS
