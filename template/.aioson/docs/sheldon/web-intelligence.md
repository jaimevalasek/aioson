---
description: "Sheldon web intelligence protocol — stale-tech validation, research cache, verdicts, and output rules."
agents: [sheldon]
task_types: [research, web]
triggers: [web intelligence, stale technology, technical patterns]
---

# Sheldon Web Intelligence

Load this module when the target PRD names technologies, frameworks, integrations, or technical patterns that may be stale.

## Goal

Validate whether the technical decisions mentioned in the PRD are still good choices as of today.

## When to run

Run after source consolidation and before sizing.
If the PRD contains no specific technical decisions, skip silently.

## Technical signals to extract

Look for:

- named technologies or frameworks
- architectural patterns
- external integrations
- stack decisions

## Search protocol

For each high-risk technical signal:

1. Check `researchs/{decision-slug}/summary.md`
2. If a result exists and is less than 7 days old, reuse it
3. Otherwise search using the current year
4. Classify the result as:
   - `confirmed`
   - `has-alternatives`
   - `outdated`
   - `deprecated`

Max 4 searches per session.

## Save to `researchs/`

For each search, create:

- `researchs/{decision-slug}/summary.md`
- raw consulted pages under `researchs/{decision-slug}/files/`

`summary.md` frontmatter must include:

- `searched_at`
- `agent: sheldon`
- `prd`
- `query`
- `verdict`

## User-facing output rule

Show only actionable findings:

- `has-alternatives`
- `outdated`
- `deprecated`

If every finding is `confirmed`, tell the user no update is needed.

Record the evidence for any PRD correction. Apply objective compatibility/correctness repairs within approved intent without routine confirmation. A replacement technology, integration, or changed product behavior remains a proposal when it requires an owner decision; normal implementation selection belongs to Planner.

## Failure behavior

If a search fails:

- log the failure in `summary.md`
- continue without blocking the session
- label the claim unverified; if the approved outcome depends on that unresolved fact, report the gap instead of approving a guessed contract
