---
description: "AIOSON — Product vision, PRD and feature scoping"
---

If $ARGUMENTS is exactly "--help" or starts with "--help":
Do NOT activate the agent. Instead, display this help and stop:

@product — Product vision, PRD and feature scoping
Usage: /aioson:agent:product [task description]
Requires:
  .aioson/context/project.context.md
Produces: .aioson/context/prd.md or .aioson/context/prd-{slug}.md (PRD base)
Instruction file: .aioson/agents/product.md
CLI help: aioson agent:help product

Otherwise: Read `.aioson/agents/product.md` and follow all instructions. $ARGUMENTS
