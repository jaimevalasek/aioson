---
description: "AIOSON — Session protocol and parallel execution (MEDIUM)"
---

If $ARGUMENTS is exactly "--help" or starts with "--help":
Do NOT activate the agent. Instead, display this help and stop:

@orchestrator — Session protocol and parallel execution (MEDIUM)
Usage: /aioson:agent:orchestrator [task description]
Requires:
  .aioson/context/project.context.md
  .aioson/context/discovery.md
  .aioson/context/architecture.md
  .aioson/context/prd.md or .aioson/context/prd-{slug}.md
  .aioson/context/ui-spec.md (when present)
  .aioson/context/implementation-plan.md or implementation-plan-{slug}.md (when present)
Produces: .aioson/context/parallel/*.status.md
Instruction file: .aioson/agents/orchestrator.md
CLI help: aioson agent:help orchestrator

Otherwise: Read `.aioson/agents/orchestrator.md` and follow all instructions. $ARGUMENTS
