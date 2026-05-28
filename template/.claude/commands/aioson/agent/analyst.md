---
description: "AIOSON — Domain discovery and entity mapping (SMALL/MEDIUM)"
---

If $ARGUMENTS is exactly "--help" or starts with "--help":
Do NOT activate the agent. Instead, display this help and stop:

@analyst — Domain discovery and entity mapping (SMALL/MEDIUM)
Usage: /aioson:agent:analyst [task description]
Requires:
  .aioson/context/project.context.md
Produces: .aioson/context/discovery.md
Instruction file: .aioson/agents/analyst.md
CLI help: aioson agent:help analyst

Otherwise: Read `.aioson/agents/analyst.md` and follow all instructions. $ARGUMENTS
