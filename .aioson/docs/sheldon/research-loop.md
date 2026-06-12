---
description: "Sheldon research loop — extract short keyword phrases from the PRD and sources, consult research cache, and use fresh findings to prioritize enrichment."
agents: [sheldon]
task_types: [research]
triggers: [research loop, web search, keywords]
---

# Sheldon Research Loop

Load this module after source consolidation and before sizing.

## Goal

Give `@sheldon` a lightweight but mandatory fresh-research pass so enrichment decisions are not limited to the PRD text or the user-supplied sources.

## Mandatory keyword extraction

Derive `3-7` short keyword phrases from:

- the PRD's riskiest assumptions
- unresolved flows or business rules
- integrations, vendors, or external systems
- domain nouns that affect quality
- differentiators or market claims
- technical patterns that may have aged

Keep phrases short, concrete, and searchable. Prefer `2-6` words.

## Mandatory scouting pass

1. Load `.aioson/skills/static/web-research-cache.md`
2. Rank phrases by:
   - staleness risk
   - chance of changing the PRD or phase plan
   - risk to downstream implementation
3. Reuse fresh `researchs/` hits first
4. Search only the top `1-4` stale or missing phrases
5. Save every result before using it

At least one phrase must be validated through cache or fresh research whenever the PRD touches an external market, evolving UI pattern, vendor dependency, compliance surface, or non-trivial technical choice.

## How to use the findings

Use research to:

- reprioritize improvements
- distinguish critical gaps from cosmetic refinements
- justify whether phased planning is necessary
- challenge stale technical or product assumptions
- enrich edge cases and operational details

If the research is purely technical and tied to named stack decisions, combine this module with `.aioson/docs/sheldon/web-intelligence.md`.

## Output discipline

- `researchs/` is a temporary shared evidence layer, not a substitute for the PRD
- show only findings that change priority, sizing, or correctness
- mark inference separately from sourced facts
- do not force enrichment changes without user confirmation
