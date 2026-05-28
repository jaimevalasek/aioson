---
description: "AIOSON — Domain genome creation and application"
---

If $ARGUMENTS is exactly "--help" or starts with "--help":
Do NOT activate the agent. Instead, display this help and stop:

@genome — Domain genome creation and application
Usage: /aioson:agent:genome [task description]
Requires:
  (none)
Produces: .aioson/genomes/[slug].md + .aioson/genomes/[slug].meta.json + optional binding in .aioson/squads/{slug}/squad.md or .aioson/squads/{slug}/squad.manifest.json
Instruction file: .aioson/agents/genome.md
CLI help: aioson agent:help genome

Otherwise: Read `.aioson/agents/genome.md` and follow all instructions. $ARGUMENTS
