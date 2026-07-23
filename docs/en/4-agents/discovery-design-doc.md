# `@discovery-design-doc` — opt-in discovery/design consultant

> **For whom:** teams that have a concrete discovery or design question that deserves a standalone investigation.

`@discovery-design-doc` is available, but it is not part of the canonical feature chain:

```text
optional Briefing → optional Briefing Refiner → Product
→ optional Sheldon → Planner → DEV → QA
```

MICRO, SMALL, and MEDIUM never add this agent automatically.

## When to use it

Invoke it explicitly when:

- a brownfield behavior or boundary is not yet understood;
- a technical option needs a focused design comparison;
- a high-impact flow needs a standalone discovery/design note before Product or Planner finalizes its artifact;
- the user specifically asks for a discovery and design document.

For vague pre-PRD framing, use `@briefing`. For a single material architecture decision, `@architect` is usually the narrower consultant.

## What it does

The agent:

1. identifies the exact question and authority it must not override;
2. reads only relevant project context and repository evidence;
3. records assumptions as confirmed or inferred;
4. compares viable options and names trade-offs;
5. produces a recommendation with evidence and residual uncertainty;
6. hands the finding back to Product or Planner for incorporation.

Its output is non-blocking evidence. It does not create a mandatory requirements/spec/readiness/conformance package, does not own the PRD, and does not own the implementation plan.

## Example

```text
You > @discovery-design-doc
      Investigate whether order cancellation should reuse the existing
      state machine or add a separate cancellation workflow.

@discovery-design-doc > Confirmed: OrderStatus already controls refund eligibility.
                        Inferred: a second state machine would duplicate transition rules.
                        Recommendation: extend the existing state machine with
                        cancel_requested and cancelled transitions.
                        Residual decision: whether delayed supplier approval is in scope.

@discovery-design-doc > Finding ready for Product/Planner incorporation.
```

## Handoff

- Before PRD approval: send the finding to `@product`.
- After PRD approval but before implementation: send a material product-impacting change back to `@product`; otherwise let `@planner` incorporate the technical evidence.
- During implementation: DEV may consult the note, but a finding that changes approved scope must return to Product.

The agent never advances the workflow by itself.

## See also

- [From idea to PRD via Briefing](../3-recipes/from-idea-to-prd-via-briefing.md)
- [Full feature with optional Sheldon](../3-recipes/full-feature-with-sheldon.md)
- [Agents index](./README.md)
