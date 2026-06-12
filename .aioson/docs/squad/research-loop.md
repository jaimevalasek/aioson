---
description: "Squad research loop — extract short domain phrases, consult research cache, and use fresh findings to improve executors, workflows, and output quality."
agents: [squad]
task_types: [research]
triggers: [squad research, web search]
---

# Squad Research Loop

Load this module before creating, extending, planning, repairing, or materially reworking a squad package.

## Goal

Prevent `@squad` from generating interchangeable squads. Use a small fresh-research pass to ground the package in current domain language, operating patterns, and quality expectations.

## Mandatory keyword extraction

Derive `3-7` short keyword phrases from the current squad ask, such as:

- domain or niche name
- deliverable type
- workflow style
- review or approval pattern
- audience or buyer language
- compliance or trust constraint
- output medium or channel

Keep phrases concrete and searchable. Favor `2-6` words.

## Mandatory scouting pass

1. Load `.aioson/skills/static/web-research-cache.md`
2. Rank phrases by:
   - chance of changing executor design
   - chance of changing workflow or output structure
   - freshness sensitivity
3. Check `researchs/` first
4. Search only the top `1-4` stale or missing phrases
5. Save every result before using it

At least one phrase must be validated through cache or fresh research whenever the squad serves an external domain, recurring workflow, content system, regulated environment, or specialized audience.

For regulated domains, this lightweight loop does not replace mandatory `@orache` investigation.
If an `investigation` report already exists, use it as the primary evidence source and run fresh scouting only to fill missing gaps.

## How to use the findings

Use research to improve:

- executor vocabulary and mission boundaries
- workflow stages and review loops
- checklists and quality gates
- anti-patterns that should become hard constraints
- output blueprints and deliverable structure

If the domain is broad, unfamiliar, or strategically important, use this lightweight loop first and then offer `@orache` for deeper investigation.

## Output discipline

- `researchs/` is a temporary shared evidence layer for reusable references
- keep only the findings that materially change the squad package
- do not let research inflate the squad with unnecessary executors or boilerplate
