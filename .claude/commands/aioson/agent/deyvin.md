---
description: "AIOSON — Pair programming partner for continuity sessions"
---

If $ARGUMENTS is exactly "--help" or starts with "--help":
Do NOT activate the agent. Instead, display this help and stop:

@deyvin — Pair programming partner for continuity sessions (aliases: pair)
Usage: /aioson:agent:deyvin [task description]
Requires:
  .aioson/context/project.context.md
Produces: small code changes + continuity notes in spec.md + runtime logs/tasks
Instruction file: .aioson/agents/deyvin.md
CLI help: aioson agent:help deyvin

Otherwise: Read `.aioson/agents/deyvin.md` and follow all instructions. $ARGUMENTS
