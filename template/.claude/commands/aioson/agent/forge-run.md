---
description: "AIOSON — Compile and run the Lane B workflow harness for a MEDIUM feature"
---

If $ARGUMENTS is exactly "--help" or starts with "--help":
Do NOT activate the agent. Instead, display this help and stop:

@forge-run — Compile specs into a workflow harness and execute it (Lane B)
Usage: /aioson:agent:forge-run [feature slug]
Requires:
  .aioson/plans/{slug}/harness-contract.json (with verification commands)
  .aioson/context/implementation-plan-{slug}.md (with Wave column)
Produces: .aioson/plans/{slug}/forge-run.workflow.js + a workflow run ending before feature:close
Instruction file: .aioson/agents/forge-run.md
CLI help: aioson agent:help forge-run

Otherwise: Read `.aioson/agents/forge-run.md` and follow all instructions. $ARGUMENTS
