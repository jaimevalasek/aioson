---
description: "Product research loop — extract short keyword phrases, consult research cache, search fresh sources, and fold the findings back into the PRD conversation."
agents: [product]
modes: [planning, executing]
task_types: [product-research, external-validation, market-scouting, competitor-research, product-patterns]
load_tier: trigger
triggers: [web search, research cache, market assumptions, competitor, pricing, compliance, time-sensitive UX, external evidence]
---

# Product Research Loop

Load this module before the first synthesis, before any finalize decision, and before writing a non-trivial PRD.

## Goal

Prevent `@product` from relying only on the chat. Use a lightweight, fresh external evidence pass to sharpen questions, differentiate the PRD, and avoid generic product output.

## Mandatory keyword extraction

Derive `3-7` short keyword phrases from the current conversation. Favor concrete phrases with `2-6` words such as:

- problem or pain point
- user segment or buyer
- workflow or operating motion
- business model or pricing shape
- trust, compliance, or risk concern
- differentiation claim
- visual or experience cue when it changes the product

Good phrases are specific and searchable:

- `ai intake form`
- `b2b onboarding checklist`
- `field service scheduling`
- `subscription upgrade friction`

Avoid broad phrases such as `app idea`, `dashboard`, or `better ux`.

## Mandatory scouting pass

1. Load `.aioson/skills/static/web-research-cache.md`
2. Rank the extracted phrases by:
   - freshness sensitivity
   - product impact
   - likelihood of improving the PRD
3. Check the cache first for the top phrases
4. Reuse fresh cache entries when they are less than 7 days old
5. Search only the top `1-4` phrases that are stale or missing
6. Save every search to `researchs/` before using the result

At least one phrase must be validated through cache or fresh research whenever the PRD depends on an external market, product pattern, pricing model, competitor norm, compliance expectation, or time-sensitive UX convention.

## How to use the findings

Use research to:

- ask sharper follow-up questions
- surface missing constraints or edge cases
- challenge commodity positioning
- strengthen differentiation and first-release scope
- improve acceptance of what should stay `TBD`

Do not dump research into the chat. Surface only the deltas that materially change the product conversation.

## Output discipline

- Treat `researchs/` as a temporary shared evidence layer for current and nearby sessions
- Mark inferred conclusions as inference, not as sourced fact
- Never replace user confirmation with internet research
- Never force a PRD rewrite because research exists; use it to improve judgment and questions
