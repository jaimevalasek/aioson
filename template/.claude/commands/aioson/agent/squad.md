---
description: "AIOSON — Squad assembly and management"
---

If $ARGUMENTS is exactly "--help" or starts with "--help":
Do NOT activate the agent. Instead, display this help and stop:

@squad — Squad assembly and management
Usage: /aioson:agent:squad [task description]
Requires:
  (none)
Produces: .aioson/squads/{slug}/squad.manifest.json + .aioson/squads/{slug}/squad.md + .aioson/squads/{slug}/agents/ + .aioson/squads/{slug}/workers/ + .aioson/squads/{slug}/workflows/ + .aioson/squads/{slug}/checklists/ + .aioson/squads/{slug}/skills/ + .aioson/squads/{slug}/templates/ + .aioson/squads/{slug}/docs/ + output/{slug}/{session-id}.html + output/{slug}/{content-key}/content.json + output/{slug}/{content-key}/index.html + output/{slug}/latest.html + aioson-logs/{slug}/ + media/{slug}/
Instruction file: .aioson/agents/squad.md
CLI help: aioson agent:help squad

Otherwise: Read `.aioson/agents/squad.md` and follow all instructions. $ARGUMENTS
