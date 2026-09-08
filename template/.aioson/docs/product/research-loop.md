---
description: "Product research loop — extract short keyword phrases, consult research cache, search fresh sources, and fold the findings back into the PRD conversation."
agents: [product]
modes: [planning, executing]
task_types: [product-research, external-validation, market-scouting, competitor-research, product-patterns]
load_tier: trigger
triggers: [web search, research cache, market assumptions, competitor, pricing, compliance, time-sensitive UX, external evidence]
---

# Product Research Loop

Load when an external fact, market assumption, or transferable product mechanism could materially change the PRD. Reuse relevant findings across synthesis and finalization; do not restart research merely because the conversation changed phase.

## Goal

Prevent `@product` from relying only on the chat. Use a lightweight, fresh external evidence pass to sharpen questions, differentiate the PRD, and avoid generic product output.

## Mandatory keyword extraction

Name the decision research should inform and the evidence that would change the recommendation. Derive only useful short keyword phrases from the conversation and artifacts. Favor concrete phrases such as:

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

Inspect authoritative source pages rather than treating snippets as proof. For creative exploration, research the mechanism behind an adjacent-domain analogy and the conditions under which it transfers, not just competitors' feature lists. Record source date, applicability, and contradictory evidence. Stop when further research would not change the scoped decision; unavailable evidence stays explicitly unverified.

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
- Research supports judgment; it never authorizes a material scope change. Apply objective corrections within approved intent without routine reconfirmation.
- A competitor pattern is evidence of one approach, not proof of user demand or an obligation to copy it. Keep speculative opportunities separate from approved requirements.
- If a required outcome depends on an unresolved external fact, record the blocker and owner; if only an optional proposal depends on it, defer the proposal without blocking delivery.
- Never force a PRD rewrite because research exists; use it to improve judgment and questions
