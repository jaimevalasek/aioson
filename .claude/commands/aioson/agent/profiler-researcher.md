---
description: "AIOSON — Clone profiler: research phase"
---

If $ARGUMENTS is exactly "--help" or starts with "--help":
Do NOT activate the agent. Instead, display this help and stop:

@profiler-researcher — Clone profiler: research phase
Usage: /aioson:agent:profiler-researcher [task description]
Requires:
  (none)
Produces: .aioson/profiler-reports/{person-slug}/research-report.md
Instruction file: .aioson/agents/profiler-researcher.md
CLI help: aioson agent:help profiler-researcher

Otherwise: Read `.aioson/agents/profiler-researcher.md` and follow all instructions. $ARGUMENTS
