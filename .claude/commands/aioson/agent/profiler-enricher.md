---
description: "AIOSON — Clone profiler: enrichment phase"
---

If $ARGUMENTS is exactly "--help" or starts with "--help":
Do NOT activate the agent. Instead, display this help and stop:

@profiler-enricher — Clone profiler: enrichment phase
Usage: /aioson:agent:profiler-enricher [task description]
Requires:
  .aioson/profiler-reports/{person-slug}/research-report.md
Produces: .aioson/profiler-reports/{person-slug}/enriched-profile.md
Instruction file: .aioson/agents/profiler-enricher.md
CLI help: aioson agent:help profiler-enricher

Otherwise: Read `.aioson/agents/profiler-enricher.md` and follow all instructions. $ARGUMENTS
