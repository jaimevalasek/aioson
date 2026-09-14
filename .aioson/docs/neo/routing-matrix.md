---
description: Stage ownership and intent-to-agent routing matrix for Neo
agents: [neo]
task_types: [workflow-routing, agent-selection]
triggers: [next agent, route task, workflow stage, implementation request]
---

# Neo Routing Matrix

Choose the minimum owner whose contract matches the current evidence.

## Workflow stages

| Evidence | Route |
|---|---|
| Missing or invalid project context | `@setup` |
| Concrete bounded outcome passes Simple Plan gate | `@dev` in Simple Plan mode |
| New or materially unresolved product scope | `@product` |
| Product-ready PRD without a current hash-bound Sheldon PASS | `@sheldon` |
| Sheldon-approved PRD, no approved implementation plan | `@planner` |
| Approved plan, implementation not started | `@dev` |
| `dev-state.md` says `in_progress` | `@deyvin` for continuity or `@dev` for a new planned batch |
| Implementation complete, no current QA verdict | `@qa` |
| Current QA FAIL with bounded findings | `@dev`; machine-owned QA cycle controls the retry budget |
| Current QA PASS with production-path evidence | Gate D complete; ask about close/new work without re-reviewing |

Classification changes artifact and evidence depth, not the `product → sheldon → planner → dev → qa` chain.

## Direct intent routes

| User intent | Route |
|---|---|
| Continue, debug, inspect existing behavior, fix a known bug | `@deyvin` |
| Add tests, improve coverage, mutation/property testing | `@tester` |
| Security audit, auth/secrets/supply-chain/LLM injection concern | `@pentester` |
| Frame raw thinking before a PRD | `@briefing` |
| Refine an existing briefing | `@refiner` |
| Independently challenge an existing PRD | `@sheldon` |
| Named business-rule/entity question | `@analyst` |
| Named structural boundary or architecture decision | `@architect` |
| Concrete interaction or visual-system decision | `@ux-ui` |
| Backlog/release/stakeholder prioritization | `@pm` |
| Parallel execution of explicitly independent approved phases | `@orchestrator` |
| Domain, market, or competitor research | `@orache` |
| Conversion copy or marketing text | `@copywriter` |
| Commit message or requested commit | `@committer` |
| Assemble a multi-track squad | `@squad` |
| Generate/apply domain knowledge | `@genome` |
| Map/bootstrap codebase knowledge | `@discover` |
| Discovery/design document explicitly requested | `@discovery-design-doc` |
| Validate an explicitly enabled success contract/harness | `@validator` |
| Assess engineering quality, static analysis or evaluation effectiveness | `@quality` (optional; no acceptance gate) |
| Clone/extract a site's design | `@site-forge` |
| Combine two design skills | `@design-hybrid-forge` |
| Profile a person/persona | `@profiler-researcher → @profiler-enricher → @profiler-forge` |

## Decision rules

- Route from current intent and evidence, never from the last agent message alone.
- Product scope is not missing for a qualifying Simple Plan.
- New buttons, links, fields, menu items, or windows do not automatically require Product when placement and behavior are already specified.
- Sheldon is the mandatory independent PRD review before Planner, not code archaeology or debugging.
- Tester, Pentester, and Validator run only when explicitly enabled or directly requested; classification alone is not a trigger.
- Use `@scope-check` only for an explicitly requested intent-versus-plan or post-fix conformance check.
- Use `@qa` for independent delivery verdict, not as an infinite refinement loop.
- When two routes remain plausible and the wrong choice has meaningful cost, ask one question. Otherwise choose and state the primary evidence.

## Edge cases

- User insists on implementation without a required tracked gate: identify the missing artifact and route to its owner. Offer `@deyvin` only for a genuinely small known-context slice, not as a workflow bypass.
- Existing project has no discovery document: do not invent a mandatory discovery gate; route from the concrete task.
- User only wants conversation: route to `@deyvin`.
- No active work and Gate D is complete: recommend a new feature lane or explicit feature close; Neo never closes it.
