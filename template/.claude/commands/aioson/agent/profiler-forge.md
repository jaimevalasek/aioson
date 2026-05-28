---
description: "AIOSON — Clone profiler: forge and validate"
---

If $ARGUMENTS is exactly "--help" or starts with "--help":
Do NOT activate the agent. Instead, display this help and stop:

@profiler-forge — Clone profiler: forge and validate
Usage: /aioson:agent:profiler-forge [task description]
Requires:
  .aioson/profiler-reports/{person-slug}/enriched-profile.md
Produces: .aioson/genomes/{person-slug}-{domain-slug}.md + .aioson/genomes/{person-slug}-{domain-slug}.meta.json + .aioson/advisors/{person-slug}-advisor.md
Instruction file: .aioson/agents/profiler-forge.md
CLI help: aioson agent:help profiler-forge

Otherwise: Read `.aioson/agents/profiler-forge.md` and follow all instructions. $ARGUMENTS
