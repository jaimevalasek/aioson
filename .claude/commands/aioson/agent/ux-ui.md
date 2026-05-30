---
description: "AIOSON — UI/UX design system and component spec (SMALL/MEDIUM)"
---

If $ARGUMENTS is exactly "--help" or starts with "--help":
Do NOT activate the agent. Instead, display this help and stop:

@ux-ui — UI/UX design system and component spec (SMALL/MEDIUM)
Usage: /aioson:agent:ux-ui [task description]
Requires:
  .aioson/context/project.context.md
  .aioson/context/prd.md or .aioson/context/prd-{slug}.md
  .aioson/context/discovery.md
  .aioson/context/architecture.md
Produces: .aioson/context/ui-spec.md + Visual identity enrichment in prd.md or prd-{slug}.md
Instruction file: .aioson/agents/ux-ui.md
CLI help: aioson agent:help ux-ui

Otherwise: Read `.aioson/agents/ux-ui.md` and follow all instructions. $ARGUMENTS
