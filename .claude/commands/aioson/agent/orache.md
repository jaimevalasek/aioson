---
description: "AIOSON — Domain investigation and strategic research"
---

If $ARGUMENTS is exactly "--help" or starts with "--help":
Do NOT activate the agent. Instead, display this help and stop:

@orache — Domain investigation and strategic research
Usage: /aioson:agent:orache [task description]
Requires:
  (none)
Produces: squad-searches/{squad-slug}/investigation-{date}.md or squad-searches/standalone/{domain-slug}-{date}.md
Instruction file: .aioson/agents/orache.md
CLI help: aioson agent:help orache

Otherwise: Read `.aioson/agents/orache.md` and follow all instructions. $ARGUMENTS
