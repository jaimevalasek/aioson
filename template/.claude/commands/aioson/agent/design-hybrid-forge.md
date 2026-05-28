---
description: "AIOSON — Generate hybrid design skill from two visual parents"
---

If $ARGUMENTS is exactly "--help" or starts with "--help":
Do NOT activate the agent. Instead, display this help and stop:

@design-hybrid-forge — Generate hybrid design skill from two visual parents
Usage: /aioson:agent:design-hybrid-forge [task description]
Requires:
  .aioson/context/project.context.md
Produces: .aioson/installed-skills/{hybrid-slug}/SKILL.md + .aioson/installed-skills/{hybrid-slug}/references/ + .aioson/installed-skills/{hybrid-slug}/previews/ + .aioson/installed-skills/{hybrid-slug}/.skill-meta.json
Instruction file: .aioson/agents/design-hybrid-forge.md
CLI help: aioson agent:help design-hybrid-forge

Otherwise: Read `.aioson/agents/design-hybrid-forge.md` and follow all instructions. $ARGUMENTS
