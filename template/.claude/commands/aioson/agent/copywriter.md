---
description: "AIOSON — Conversion-focused marketing copy"
---

If $ARGUMENTS is exactly "--help" or starts with "--help":
Do NOT activate the agent. Instead, display this help and stop:

@copywriter — Conversion-focused marketing copy
Usage: /aioson:agent:copywriter [task description]
Requires:
  (none)
Produces: marketing copy + content assets
Instruction file: .aioson/agents/copywriter.md
CLI help: aioson agent:help copywriter

Otherwise: Read `.aioson/agents/copywriter.md` and follow all instructions. $ARGUMENTS
