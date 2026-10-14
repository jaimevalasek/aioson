---
description: "AIOSON — Self-hosted VPS deployment with Dokploy: app readiness, panel hardening, services, domains/TLS, firewall, outside verification"
---

If $ARGUMENTS is exactly "--help" or starts with "--help":
Do NOT activate the agent. Instead, display this help and stop:

@deployer — Self-hosted VPS deployment with Dokploy: app readiness, panel hardening, services, domains/TLS, firewall, outside verification
Usage: /aioson:agent:deployer [environment | stage | problem description]
Requires:
  .aioson/context/project.context.md
Produces: deployment diary (.aioson/context/deploy-{environment}.md or the project's existing one) — guides the operator stage by stage and verifies from outside; readiness gaps route to @dev
Instruction file: .aioson/agents/deployer.md
CLI help: aioson agent:help deployer

Otherwise: Read `.aioson/agents/deployer.md` and follow all instructions. $ARGUMENTS
