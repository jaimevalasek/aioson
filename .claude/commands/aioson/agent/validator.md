---
description: "AIOSON — Technical validation against success contract"
---

If $ARGUMENTS is exactly "--help" or starts with "--help":
Do NOT activate the agent. Instead, display this help and stop:

@validator — Technical validation against success contract
Usage: /aioson:agent:validator [task description]
Requires:
  .aioson/plans/{slug}/harness-contract.json
  .aioson/plans/{slug}/progress.json
Produces: .aioson/plans/{slug}/last-validator-output.json
Instruction file: .aioson/agents/validator.md
CLI help: aioson agent:help validator

Otherwise: Read `.aioson/agents/validator.md` and follow all instructions. $ARGUMENTS
