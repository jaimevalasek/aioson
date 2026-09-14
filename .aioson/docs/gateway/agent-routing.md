---
description: Tool-neutral AIOSON starting lanes, concrete implementation gate, agent resolution, and direct-activation boundaries
task_types: [gateway-routing, lane-selection, agent-activation]
triggers: [no explicit agent, concrete request, what next, agent selection]
---

# Gateway Agent Routing

Load only when no agent is already active or routing is genuinely ambiguous.

## No concrete task

Offer these lanes and stop:

- Dev Simple Plan for a bounded technical change or refactor.
- Deyvin for continuity, pair debugging, or one small validated slice with known context.
- Help for beginner questions about how AIOSON works, its terms, agents, workflows, or commands.
- Briefing for an early idea not yet ready for PRD commitment.
- Refiner for an existing briefing that needs review.
- Product when the user already intends to define/build a feature.
- Neo when the user asks about project status or available agents, or when more than one lane remains genuinely plausible after this gate — Neo recommends one agent and stops.

Use `@agent` in Codex/natural-language clients and `/agent` in Claude-style slash-command clients.

## Concrete implementation lane gate

Classify the minimum user-confirmed outcome before Product, Briefing, or feature workflow routing:

1. Inspect the nearest implementation pattern and estimate expected paths as `behavior` or `support`.
2. Route directly to Dev Simple Plan when one specified observable outcome reuses existing boundaries, has no unresolved product/architecture/security decision, and fits up to 5 behavior files, 8 total paths, and 2 existing modules.
3. Tests, translations, exports, registrations/manifests, generated metadata, and lockfiles supporting that behavior do not independently promote the lane.
4. A specified button, menu item, link, field, or window affordance is not automatically a product feature.
5. Use MICRO only when bounded work needs feature memory or a small product decision (default review budget: 10 behavior files / 15 total paths). Use SMALL for multiple independently valuable capabilities, a new boundary/contract, or material unresolved decisions.

Do not inflate scope with optional edge cases. If execution must exceed the chosen budget, stop before widening it, show the before/after path estimate and causal reason, and request approval. An explicitly requested agent/lane wins unless its own hard boundary requires handoff.

### Active workflow relevance gate

Persisted workflow state is evidence about prior work, not proof that the current request belongs to it. Before calling `workflow:next` for a request that was not already activated by that command:

1. State the current requested outcome in one sentence.
2. Run `aioson feature:current . --with-summary --json` — it returns the active slug plus the PRD title, goal line, and artifact paths, so no artifact needs to be opened for this comparison. Compare the requested outcome against `summary.title`/`summary.goal` (a null title means the PRD is malformed: open it — never decide on a blank field).
3. If it is the same work, continue with `workflow:next --expect-feature=<active-slug>`.
4. If it is unrelated bounded implementation, preserve the active workflow unchanged and route to Dev Simple Plan without calling `workflow:next`.
5. If it is an unrelated feature, do not reuse the old feature's agents or artifacts; obtain only the feature-switch decision that is genuinely required.

An explicit request to resume the active feature or activate its current agent establishes the binding. Project classification, an unfinished gate, or a stale handoff does not. Never complete reflection, prototype, Product, Sheldon, or Briefing work from an unrelated feature merely to unblock the new request.

## Agent resolution

Named activation loads `.aioson/agents/{slug}.md` immediately. Main routes:

| Intent | Agent |
|---|---|
| Setup/repair project context | `setup` |
| Learn AIOSON / understand terms and commands | `help` |
| Early idea / existing briefing | `briefing` / `refiner` |
| Product scope / PRD enrichment / plan | `product` / `sheldon` / `planner` |
| Implement / pair continuity / test / acceptance | `dev` / `deyvin` / `tester` / `qa` |
| Post-delivery completeness walkthrough ("pente fino") | `shakedown` |
| Engineering quality / static analysis / test effectiveness / eval pipeline | `quality` (optional assessment; QA keeps acceptance) |
| Security / architecture / analysis / UI | `pentester` / `architect` / `analyst` / `ux-ui` |
| Status/router / coordination / scope conformance | `neo` / `orchestrator` / `scope-check` |
| Squad / domain investigation / genome | `squad` / `orache` / `genome` |
| Persona pipeline | `profiler-researcher` / `profiler-enricher` / `profiler-forge` |
| Copy / commit / project discovery | `copywriter` / `committer` / `discover` |
| Design hybrid / site forge / compiled harness | `design-hybrid-forge` / `site-forge` / `forge-run` |
| Frozen-prompt benchmark build | `benchmark` |

Other canonical files include `discovery-design-doc`, `pm`, and `validator`. `pair` is a compatibility alias for `deyvin`. Read `.aioson/docs/agent-help.md` only when options/examples are needed.

## Boundaries

- Setup, Product, Planner, Dev, and QA remain inside the canonical workflow.
- Help is read-only education. It explains the system and may name one safe next action; when routing depends on live project state, it recommends Neo and stops.
- Deyvin may act directly only for existing known context and a small validated slice. New projects/features, greenfield work, broad redesign, vague/contradictory scope, or mixed product+UX+implementation route away before code.
- Specialists are opt-in for a named unresolved decision; they do not create mandatory document hops.
- Dev Simple Plan ends in Dev after proportional validation; it does not silently become a tracked feature.
- Never bypass missing/invalid project context; route to Setup.
