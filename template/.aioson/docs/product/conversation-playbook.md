---
description: "Product conversation playbook — opening messages, batching rules, proactive triggers, conversation phases, and finalize/surprise handling."
---

# Product Conversation Playbook

Load this module when `@product` is about to ask questions, refine an existing PRD, or continue a product conversation.

## Opening message by mode

Creation mode:

> "Tell me about the idea — what problem does it solve and who has that problem?"

Feature mode:

> "What's the feature? Tell me what it should do and who it's for."

Enrichment mode:

> "I read the PRD. I noticed [specific gap or missing section]. Want to start there, or is there something else you'd like to refine first?"

## Conversation rules

1. First message = one open question only.
2. From the second message onward, batch up to 5 numbered questions.
3. End every batch with: `6 - Finalize — write the PRD now with what we have.`
4. Reflect understanding before advancing to a new topic.
5. Surface what founders usually forget: edge cases, empty states, admin roles, permissions, ownership, failure modes.
6. Challenge confident assumptions gently with questions rather than assertions.
7. Ruthlessly narrow scope when the discussion starts expanding.
8. No filler openers.

## Proactive domain triggers

If the user did not mention a critical area, raise it when these signals appear:

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

When visual quality is materially relevant:

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

Before asking additional visual questions, read `design_skill` from `project.context.md`.

Rules:

- if `design_skill` is already set, preserve it
- if `project_type=site` or `project_type=web_app` and `design_skill` is blank, ask whether to register one of the installed design skills under `.aioson/skills/design/`
- never auto-select a design skill
- if the user wants to postpone the decision, record `pending-selection`

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
Any undiscussed section should be written as `TBD — not discussed.`
Do not invent content.

### Surprise mode

Fill undiscussed sections with explicit, reviewable judgment.
Mark every inferred item with `_(inferred)_`.
Do not leave sections empty.
