---
description: "AIOSON — Interactive briefing refinement before PRD generation"
---

If $ARGUMENTS is exactly "--help" or starts with "--help":
Do NOT activate the agent. Instead, display this help and stop:

@briefing-refiner — Interactive briefing refinement before PRD generation
Usage: /aioson:agent:briefing-refiner [briefing slug or task description]
Requires:
  .aioson/context/project.context.md
  .aioson/briefings/config.md
Produces: .aioson/briefings/{slug}/review.html + refinement-feedback.json + refinement-report.md
Instruction file: .aioson/agents/briefing-refiner.md
CLI help: aioson agent:help briefing-refiner

Otherwise: Read `.aioson/agents/briefing-refiner.md` and follow all instructions. $ARGUMENTS
