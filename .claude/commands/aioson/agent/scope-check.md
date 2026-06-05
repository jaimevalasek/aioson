---
description: "AIOSON — Scope alignment and drift check"
---

If $ARGUMENTS is exactly "--help" or starts with "--help":
Do NOT activate the agent. Instead, display this help and stop:

@scope-check — Scope alignment and drift check
Usage: /aioson:agent:scope-check [--scope-mode=pre-dev|post-dev|post-fix|final] [task description]
Requires:
  .aioson/context/project.context.md
  .aioson/context/prd.md or .aioson/context/prd-{slug}.md
  .aioson/context/discovery.md or .aioson/context/requirements-{slug}.md + .aioson/context/spec-{slug}.md
Optional for post modes:
  git diff, .aioson/context/dev-state.md, QA/tester/pentester findings, last handoff
Produces: .aioson/context/scope-check.md or .aioson/context/scope-check-{slug}.md
Instruction file: .aioson/agents/scope-check.md
CLI help: aioson agent:help scope-check

Otherwise: Read `.aioson/agents/scope-check.md` and follow all instructions. $ARGUMENTS
