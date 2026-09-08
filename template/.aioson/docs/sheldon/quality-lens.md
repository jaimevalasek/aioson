---
description: "Sheldon quality lens — horizontal product discovery, evidence-backed alternatives, and bounded selection before PRD approval."
agents: [sheldon]
task_types: [quality, review]
triggers: [quality lens, improvements, scorecard]
---

# Sheldon Quality Lens

Use inside the two review passes. Improve the result the user gets, not the number of capabilities in the PRD. Even a technically complete PRD can miss a valuable connection; a small change can already be the best solution.

## Explore horizontally

Start with the intended result, a concrete user situation, and the evidence of friction. Select the lenses that could change this decision; do not fill every lens for every PRD.

| Lens | Challenge |
|---|---|
| Whole journey | What happens immediately before and after the main action? Where does the user still copy, wait, repeat, or leave to finish the job? |
| Actors and handoffs | Who produces the input, uses the result, or handles an exception? Does context survive the handoff between actors already in scope? |
| Capability combinations | Can two existing capabilities share information or actions to remove a step or make a previously awkward outcome useful? Verify their boundaries first. |
| Subtraction and inversion | Could we remove a decision, field, screen, or repeated task while preserving the approved outcome? What if the user started from the desired result? |
| Adjacent-domain analogy | Does another domain solve the same friction with a transferable interaction or rule? Name the mechanism and where the analogy breaks; familiarity is not evidence of fit. |
| Repeated use and differentiation | What becomes painful on the tenth use? What would make this result specifically useful to these users rather than interchangeable with a generic CRUD? |
| Value and learning | What observable improvement would justify the idea, and what small experiment could disprove its value? Do not invent adoption figures or market demand. |

Explore distinct mechanisms, not several names for the same idea. Novelty can be simplification, reuse, or a better sequence; it does not require AI, automation, collaboration, or a new integration. Inferred opportunities are allowed without prior expansion files; label their uncertainty.

## Select with evidence

Compare only the strongest candidates with the approved baseline. For each material proposal, retain:

- the actor, situation, and friction, with a source or repository reference;
- the proposed mechanism and concrete before/after behavior;
- expected user value, confidence, added complexity, and a meaningful downside;
- the scope/prototype impact, disposition, and a cheap way to validate the hypothesis.

Use qualitative trade-offs. Do not manufacture numerical scores, ROI, implementation estimates, or a quota of improvements. Discard generic add-ons, duplicated prior ideas, and proposals that cannot explain their value. If none beats the baseline, record the evidence-backed no-change conclusion and continue.

## Keep discovery distinct from approval

| Conclusion | Action |
|---|---|
| Missing behavior necessary for an approved promise | Repair the PRD in place, cite the promise/current boundary, and give QA observable AC evidence. |
| Better behavior already covered by a recorded scope decision | Merge it into the same PRD with stable CAP/AC trace; preserve the approved prototype. |
| Valuable but unapproved addition or changed intent | Present a concise proposal with trade-off and recommendation; keep it deferred outside required CAP/AC rows until the owner accepts it. |
| Choice necessary to make the approved outcome coherent | Ask the one blocking product question with evidence, consequences, and a recommended answer. |
| Low value, already rejected, or incompatible with an exclusion | Cut it with a reason; reopen only when new evidence materially changes the decision. |

Low cost and a taxonomy bucket are never approval. Preserve Product's ownership of vision, users, problem, and scope. Interpret an approved prototype as a delivery constraint, not a ban on discussing alternatives; a changed interaction remains a proposal until explicitly accepted.

## Durable result

Put approved changes in the existing PRD. Keep material deferred alternatives in the existing review report (`alternatives` or a nonblocking `deferred` finding); use `expansion-audit.md` only when the expansion skill is triggered. These notes are not implementation authority or extra gates. Do not save a brainstorming transcript.

Before sealing, test: does each adopted improvement produce a specific user benefit and observable acceptance behavior? Would Planner have to invent a product decision? Has any optional idea quietly become a blocker? Show the user the material value delta and proposal dispositions before the normal handoff.

### CLI report guidance

`review:prepare` returns `context_sources`, including feature-owned expansion scout/audit when present. Read relevant sources as supporting evidence, never approval. If they reveal a material omission, repair it and prepare against the final PRD before checking. An unchanged generation with `terminal: true` reuses its current PASS; optional note changes do not reopen it.

Complete `report_template` and save it at `draft_path`; the CLI only returns the template. Preserve packet bindings and use existing finding fields: one of the prepared lenses (such as `coverage`), evidence, alternatives, recommendation, owner, and residual risk. Optional opportunities use `status: deferred` and nonblocking severity; a mandatory scope choice uses `decision_required`. Never claim that a deferred proposal is approved or create an unsupported report lens/field. `review:check` validates report structure and freshness, not creativity or user value.
