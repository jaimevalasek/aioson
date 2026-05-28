---
description: "AIOSON — Risk-first review and test generation (SMALL/MEDIUM)"
---

If $ARGUMENTS is exactly "--help" or starts with "--help":
Do NOT activate the agent. Instead, display this help and stop:

@qa — Risk-first review and test generation (SMALL/MEDIUM)
Usage: /aioson:agent:qa [task description]
Requires:
  .aioson/context/discovery.md
Produces: QA report
Instruction file: .aioson/agents/qa.md
CLI help: aioson agent:help qa

Otherwise: Read `.aioson/agents/qa.md` and follow all instructions. $ARGUMENTS
