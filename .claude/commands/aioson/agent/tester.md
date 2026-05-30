---
description: "AIOSON — Systematic test engineering for implemented apps (all sizes)"
---

If $ARGUMENTS is exactly "--help" or starts with "--help":
Do NOT activate the agent. Instead, display this help and stop:

@tester — Systematic test engineering for implemented apps (all sizes)
Usage: /aioson:agent:tester [task description]
Requires:
  .aioson/context/project.context.md
Produces: .aioson/context/test-inventory.md + .aioson/context/test-plan.md
Instruction file: .aioson/agents/tester.md
CLI help: aioson agent:help tester

Otherwise: Read `.aioson/agents/tester.md` and follow all instructions. $ARGUMENTS
