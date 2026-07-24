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

## Research decision gate

Before synthesis, classify the work as exactly one:

- `live-required` — volatile, regulated, high-risk, current, price/version/status-sensitive.
- `live-check` — external, specialized, recurring, or medium-volatility.
- `cache-eligible` — stable, low-risk knowledge where a fresh-enough cache can confirm.
- `closed-world` — only private/user-provided material, or network use is explicitly inappropriate.

Apply the safest recommended class automatically. Pause only when choosing a weaker class would create a material user trade-off that artifacts cannot resolve.

For `live-required` and `live-check`, do not advance while the only evidence is cache or search-result snippets. Run discovery or source revalidation, inspect the pages, and persist an Evidence Pack. If the provider is unavailable, mark current claims `unverified`; never relabel stale cache as live evidence.

Freshness ceilings are policy-owned: `live-required` evidence is at most 6 hours
old and `live-check` evidence at most 24 hours old. A manifest may request a
stricter window but cannot loosen these ceilings.

For `closed-world`, do not access the network. Persist `not-applicable` with the reason and continue without a quality penalty.

## Mandatory scouting pass

1. Load `.aioson/skills/static/web-research-cache.md`.
2. Rank phrases by:
   - chance of changing executor design
   - chance of changing workflow or output structure
   - freshness sensitivity
3. Check `researchs/` as a seed.
4. Search only the top `1-4` phrases whose policy requires live work or whose cache is outside its policy window.
5. Open/extract sources, then save the shared cache and execution-linked Evidence Pack before using the findings.

At least one phrase must be live-validated whenever the squad serves an external domain, recurring workflow, content system, regulated environment, or specialized audience. A cache hit alone satisfies only `cache-eligible`.

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
- `.aioson/squads/{slug}/sessions/{session}/evidence/` is the execution record: query, policy, source timestamps/hashes, claims, contradictions, gaps, and citations
- every material claim declares `status: supported` plus explicit `source_ids`
  that resolve to collected sources; the runtime never assigns every source to a
  claim by default, and an unmapped claim keeps the pack `unverified`
- one responsible research stage produces the pack; downstream executors consume it instead of repeating the same search
- facts that can age belong in the Evidence Pack; stable methods and prohibitions may belong in genomes
- keep only the findings that materially change the squad package
- do not let research inflate the squad with unnecessary executors or boilerplate
