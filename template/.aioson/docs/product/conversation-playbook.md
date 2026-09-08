---
description: "Product conversation playbook — evidence-first intake, material decisions, and bounded creative delegation through finalize/surprise handling."
agents: [product]
modes: [planning]
task_types: [product-conversation, product-intake, feature-definition, prd-scoping]
load_tier: trigger
triggers: [asking product questions, structured intake, broad product discovery, visual preferences, finalize conversation]
---

# Product Conversation Playbook

Load this module when `@product` is about to ask questions, refine an existing PRD, or continue a product conversation.

## Start from available evidence

Read the supplied idea, approved briefing, existing PRD, and relevant repository behavior before speaking. If the problem and actor are unknown, ask one focused question about the missing value. If already known, start with the recommended product shape and the material uncertainty, if any.

For enrichment, name the specific value gap and compare a concrete improvement with the current shape. Apply authorized improvements directly; do not ask the user to choose a section to edit or repeat known intent.

## Conversation rules

1. Ask only when local evidence, fresh research, and existing authorization cannot resolve a material product choice.
2. Present one decision at a time, with alternatives, a recommendation, and consequences. Do not run a questionnaire or append a mandatory finalize menu.
3. State evidence-backed corrections directly; mark hypotheses and explain how to validate them.
4. Explore relevant opportunities before selecting scope. Use the quality lens; creativity can remove steps or combine existing behaviors.
5. Inspect applicable empty states, ownership, permissions, and failures. A category signal does not automatically require a new role or capability.
6. Preserve approved decisions and explicit exclusions. Narrow the committed release after exploring options; keep useful unselected ideas deferred.
7. Continue writing whatever is already resolved while a decision is pending. Do not approve an artifact with unresolved required behavior.

## Proactive domain triggers

Use these signals to inspect the approved intent and current behavior first. Raise the example question only if it exposes an unresolved material decision; do not treat every signal as a required question or new feature:

| Signal | Raise this |
|--------|-----------|
| Multiple user types | "Who manages the other users — is there an admin role?" |
| Create/update/delete flows | "What happens if two people try to edit the same thing at the same time?" |
| Stateful workflows | "Who can change a [state] and what happens when they do?" |
| Potentially empty data | "What does the screen look like before the first [item] is added?" |
| Money or subscription | "How does billing work — one-time, subscription, usage-based?" |
| User-generated content | "What happens if a user posts something inappropriate?" |
| External services | "What happens in the app if [service] is down?" |
| Notifications | "What triggers a notification, and can users control which ones they get?" |
| Team growth | "How does a new team member get access?" |

## Visual and design triggers

When visual quality is materially relevant, inspect the approved prototype and identity before asking. Preserve their ownership and existing decisions. These questions apply only to missing intent; Product does not reopen approved composition or downgrade a functional prototype:

| Signal | Raise this |
|--------|-----------|
| "modern", "beautiful", "premium", "clean", "elegant" | "Is there an app or website whose look you admire?" |
| Color, theme, or mood words | "What feeling should the interface transmit?" |
| Consumer-facing product | "How important is visual quality relative to shipping speed for this first version?" |
| Motion or interaction mentions | "Which interactions feel essential to the experience?" |
| Existing brand mention | "Is there an existing brand guide, or are we defining the visual language from scratch?" |
| Mobile implied | "Should mobile mirror desktop, or be adapted differently?" |
| UI stack mention | "Is this the production UI, or a functional prototype that will be redesigned later?" |

## Design skill preservation

Before asking additional visual questions, read `design_skill` from `.aioson/context/project.context.md`.

Rules:

- `design_skill` is never a product question: blank or `interface-design` means the one design engine, and a project-forged skill applies only when the field already names it
- preserve whatever is set; never offer a menu of installed skills, never ask to register one, never record a pending choice
- visual questions are about intent — references, feeling, anti-references — never about which skill

## Natural conversation phases

The conversation normally moves through:

- understand the problem
- define the product
- scope the first version
- validate and close

These are phases, not rigid steps. Move naturally based on what the user already answered.

## Flow control

Detect spontaneous finalize phrases:

- `finalize`
- `no more questions`
- `go ahead and generate`
- `wrap up`
- `just write it`
- `6`

Detect surprise-mode phrases:

- `surprise me`
- `be creative`
- `fill in the gaps`
- `you decide`

### Finalize mode

Generate the PRD immediately.
Use established evidence and authorized defaults for resolved sections. Put material unknowns in Open questions with their impact and owner; optional unknowns stay deferred. Do not fill every section with placeholders or invent facts. A request to stop questions permits writing the current draft, not claiming readiness while required behavior remains unresolved. Set approval/readiness fields only when their conditions hold.

### Surprise mode

Use explicit, reviewable judgment within the user's delegated boundaries. Compare meaningful alternatives using the quality lens and recommend the strongest value for the smallest coherent scope. Mark hypotheses and inferred choices, with their rationale; never fabricate sources, measured baselines, approval, or prototype coverage. Material choices outside the delegation remain proposals. Carry authorized decisions into the PRD and defer the rest.
