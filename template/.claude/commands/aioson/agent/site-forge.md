---
description: "AIOSON — Clone, extract, and forge sites and design skills from any URL"
---

If $ARGUMENTS is exactly "--help" or starts with "--help":
Do NOT activate the agent. Instead, display this help and stop:

@site-forge — Clone, extract, and forge sites and design skills from any URL
Usage: /aioson:agent:site-forge [task description]
Requires:
  .aioson/context/project.context.md
Produces: src/components/*.tsx + src/app/page.tsx + docs/research/{hostname}/ + public/images/{hostname}/
Instruction file: .aioson/agents/site-forge.md
CLI help: aioson agent:help site-forge

Otherwise: Read `.aioson/agents/site-forge.md` and follow all instructions. $ARGUMENTS
