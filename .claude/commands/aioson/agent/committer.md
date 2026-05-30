---
description: "AIOSON — Professional Git commit generation from changes and context"
---

If $ARGUMENTS is exactly "--help" or starts with "--help":
Do NOT activate the agent. Instead, display this help and stop:

@committer — Professional Git commit generation from changes and context
Usage: /aioson:agent:committer [task description]
Requires:
  (none)
Produces: git commit(s)
Instruction file: .aioson/agents/committer.md
CLI help: aioson agent:help committer

Otherwise: Read `.aioson/agents/committer.md` and follow all instructions. $ARGUMENTS
