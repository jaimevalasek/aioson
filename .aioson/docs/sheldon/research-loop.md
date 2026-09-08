---
description: "Sheldon research loop — extract short keyword phrases from the PRD and sources, consult research cache, and use fresh findings to prioritize enrichment."
agents: [sheldon]
task_types: [research]
triggers: [research loop, web search, keywords]
---

# Sheldon Research Loop

Load this module when an external claim or analogy could materially change an enrichment decision, inside the existing review passes.

## Goal

Test decision-relevant assumptions beyond the PRD text or user-supplied sources. Research supports product imagination; it neither creates demand evidence by itself nor authorizes scope.

## Mandatory keyword extraction

Derive `3-7` short keyword phrases from:

- the PRD's riskiest assumptions
- unresolved flows or business rules
- integrations, vendors, or external systems
- domain nouns that affect quality
- differentiators or market claims
- an adjacent-domain mechanism that could remove observed user friction
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
- explain the value, constraints, or validation needed for a proposed alternative
- challenge stale technical or product assumptions
- enrich edge cases and operational details

If the research is purely technical and tied to named stack decisions, combine this module with `.aioson/docs/sheldon/web-intelligence.md`.

## Output discipline

- `researchs/` is a temporary shared evidence layer, not a substitute for the PRD
- show only findings that change priority, sizing, or correctness
- mark inference separately from sourced facts
- apply objective corrections within approved intent and record the evidence; new scope, changed product intent, and prototype deviations remain proposals until an owner decision accepts them
- do not run a separate research/review cycle or block delivery for an unverified optional idea
