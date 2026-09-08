---
description: "Product quality lens — compare product shapes, ground differentiation, and converge on a valuable, observable first release."
agents: [product]
modes: [planning, executing]
task_types: [prd-writing, prd-finalization, prd-review, quality-review]
load_tier: trigger
triggers: [writing PRD, updating PRD, finalize PRD, PRD quality, review scorecard]
---

# Product Quality Lens

Load before writing or updating a PRD. Product originates the recommended product shape; Sheldon independently challenges the resulting commitment. Do not leave product imagination to the reviewer.

## Frame the value

Name the actor, triggering situation, desired progress, current workaround, and cost of leaving it unchanged. Separate observed evidence, user decisions, and hypotheses. A requested screen is a proposed means: understand its intended outcome while preserving explicit requirements.

For an existing PRD, preserve stable CAP/AC IDs and prior accepted/rejected choices. Reopen a decision only for new evidence or a user-requested change, naming the consequence.

## Explore before committing

For rich surfaces, prior exploration, or explicit creative enrichment, use `.aioson/skills/process/product-scope-expansion/SKILL.md`. For a bounded request, compare the requested outcome with the simplest existing behavior inline; do not manufacture an expansion artifact or questionnaire.

Choose lenses that expose a consequential alternative:

| Lens | Product question |
|---|---|
| Whole journey | What happens before arrival, at first value, after completion, and on return? Where is effort wasted? |
| Actor handoffs | Who supplies, decides, receives, or recovers the result? Could a clearer handoff remove a step? |
| Capability combinations | Can existing data or behaviors together solve the problem with less user work? |
| Subtraction and inversion | Could removal, a better default, or reversing the sequence produce the same value? |
| Adjacent-domain analogy | Which mechanism from another domain might transfer, and where would that analogy fail? |
| Differentiation | Which specific decision, output, or trusted evidence makes this useful beyond a generic alternative? |
| Adoption and repeated use | What makes the first result credible and the next use easier without adding avoidable setup? |

Compare meaningfully different behaviors, not renamed versions of one feature list. Include the current workaround or no-change option when viable. No quota of ideas, differentiators, or improvements: a well-supported existing shape may remain best.

For each serious candidate, capture the changed user moment, value mechanism, evidence or hypothesis, complexity/ongoing burden, downside, scope/prototype impact, and cheapest useful validation. Describe cost qualitatively unless measured; do not invent delivery estimates or market facts. Recommend with the trade-off that could change the choice, not an aggregate score.

## Converge into the PRD

- Repair objective gaps inside approved intent directly. Apply existing authorization and bounded delegated judgment; do not request approval again for the same decision.
- Proposals that materially change scope, behavior, cost, data, or risk need the owner's decision unless already authorized. An attractive idea or a `Core` label is not authorization.
- Put accepted behavior into CAP, fit, AC, flows, and scope. Preserve source promises and prototype deviations explicitly. Keep unselected proposals deferred or cut, with a reason; optional novelty does not block a coherent release.
- Make success measurable as an observable outcome, measurement method, and window when relevant. Distinguish proposed targets from measured baselines; do not invent analytics or instrumentation scope.
- Strip domain nouns from the vision and capability map. Rewrite claims that remain interchangeable using this product's real object, decision, and evidence. Preserve visual identity through the approved binding; composition belongs to the prototype/design engine.

## Self-review and CLI

Use the existing review-intelligence skill plus `references/framing.md` once a concrete feature PRD exists. Fit quality checks into its two passes: first challenge the framing and selected value; then walk through first use, repeat use, failures, and consequential handoffs. Record evidence and dispositions, not numerical quality scores. Do not add another review cycle.

`aioson review:prepare . --agent=product --feature={slug} --json` returns a packet and a template; it does not evaluate creativity or write the candidate report. Read feature-owned `context_sources` as optional evidence, never as scope authorization. Respect `terminal: true`; otherwise fill the returned `report_template`, save it at `draft_path`, and run `next_command`. Use existing lens IDs and finding fields. Deferred optional ideas may remain nonblocking; an unresolved material choice is `decision_required`, not PASS.

If the PRD changes during self-review, prepare against the final bytes before saving/checking the report. Follow the skill's manual fallback when unavailable; never claim a machine-current result without it. Product self-review never replaces Sheldon's independent approval.

Before handing off, verify that the selected outcome is valuable for the named actor, each required CAP has fit evidence and observable ACs, and unresolved questions do not hide required behavior. Run the kernel's source/prototype/PRD verification and classification commands. Their clean results prove mechanical contracts, not market demand, differentiation, or creative quality.
