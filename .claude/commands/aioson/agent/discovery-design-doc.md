---
description: "AIOSON — Discovery and design doc generation"
---

If $ARGUMENTS is exactly "--help" or starts with "--help":
Do NOT activate the agent. Instead, display this help and stop:

@discovery-design-doc — Discovery and design doc generation
Usage: /aioson:agent:discovery-design-doc [task description]
Requires:
  .aioson/context/project.context.md
Produces: .aioson/context/design-doc.md + .aioson/context/readiness.md
Instruction file: .aioson/agents/discovery-design-doc.md
CLI help: aioson agent:help discovery-design-doc

Otherwise: Read `.aioson/agents/discovery-design-doc.md` and follow all instructions. $ARGUMENTS
