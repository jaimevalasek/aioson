---
name: simple-plan-lane
description: Lightweight implementation lane for bounded technical work that does not justify a PRD or full workflow, with an implementation intelligence checkpoint before coding.
priority: 9
version: 1.0.0
agents: [dev, deyvin, qa, neo]
modes: [planning, executing]
task_types: [simple-plan, bounded-work, refactor]
load_tier: trigger
triggers: [simple plan, bounded technical work, small fix, refactor, polish, implementation intelligence]
paths: [.aioson/context/simple-plans/**]
---

# Simple Plan Lane

Use a simple plan when the active request is technical, bounded, and directly verifiable, but too large to keep only in chat.

Canonical artifact:

- `.aioson/context/simple-plans/{slug}.md`

A simple plan is not valid as a bare TODO list. Before implementation it must record:

- selected context/rules/docs or the CLI-less fallback evidence
- the existing project/framework pattern to follow, or `none found`
- framework leverage before custom code
- structure and data boundary placement
- useful options considered as `include now`, `defer`, or `escalate`

Use this lane only when all conditions are true:

- Objective fits in one sentence.
- Scope is implementation-focused, not product-definition work.
- No new user journey, product behavior, or business rule needs to be **decided**. A fully specified menu item, button, link, field, or other small affordance over an existing pattern is allowed; visual novelty alone does not make a feature.
- No architecture-wide decision is required.
- No new external integration is introduced.
- The work does not touch auth, money, ownership, permissions, secrets, destructive deletion, or sensitive data storage.
- Expected implementation is small and reviewable under the scope budget below.
- Done criteria and verification command can be written before coding.
- Useful implementation options can be classified without changing product, UX, domain, architecture, or security ownership.

## Scope budget (routing guardrail, not a blind classifier)

Classify the minimum behavior the user confirmed, never optional behavior invented during planning.

- **Simple Plan default:** one observable outcome, at most 5 behavior-bearing files, at most 8 total expected paths, and at most 2 existing modules.
- A **behavior-bearing file** contains the component, handler, command, service, domain, backend, or integration behavior being changed.
- Mirror tests, translation entries, index/exports, manifests/registrations, generated metadata, and lockfiles that only support the same behavior count in total paths but do not independently promote the lane.
- Exceeding a number triggers a scope review; it does not automatically promote the task. Name the causal capability, boundary, or unresolved decision that justifies promotion.
- A MICRO feature normally stays within one coherent outcome, at most 10 behavior-bearing files and 15 total paths. Prefer MICRO over SMALL only when product memory/traceability is genuinely needed.
- SMALL requires multiple independently valuable capabilities, a new contract/boundary, or material unresolved product/architecture decisions. Never choose SMALL merely because the project is MEDIUM, the UI gains a new control, or support files raise the raw file count.

Before implementation, list expected paths and label them `behavior` or `support`. If a Simple Plan or MICRO task will exceed its approved budget, stop before widening it, show the before/after estimate and concrete reason, and ask for approval.

Escalate instead:

- `@product` for product intent, users, UX flows, feature scope, or value decisions.
- `@analyst` for domain rules, entities, edge cases, or brownfield behavior mapping.
- `@architect` for cross-module architecture or structural decisions.
- `@pentester` / `@qa` for sensitive surfaces or formal verification.

If an option would widen behavior, UX, permissions, data sensitivity, architecture, integration scope, or verification ownership, do not implement it as part of the simple plan. Park it under `Useful options considered -> Escalate` and hand off.

Simple Plan is terminal inside `@dev`: run only the targeted verification recorded in the plan, mark it done, and stop. Do not create PRD, requirements, spec, feature design doc, readiness, implementation plan, harness contract, QA/Tester/Pentester/Validator stages, or call `workflow:next` for this lane. Project-level `.aioson/context/design-doc.md` and `.aioson/design-docs/` may be read as selected references; do not create `design-doc-{slug}.md` unless a separately approved feature introduces a real architectural delta.

Lifecycle:

- `draft` -> `in_progress` -> `done`, `paused`, or `abandoned`
- `paused` means intentionally parked and visible for later review; it must not block new simple plans or features.

When `@dev` or `@deyvin` uses this lane:

1. Write the simple plan to disk before implementation.
2. Include `Context selected`, `Implementation intelligence`, and `Useful options considered` sections.
3. Run `aioson dev:state:write . --feature={slug} --next="<first slice>" --context=simple-plan`.
4. Implement in small slices, only including options classified as `include now`.
5. Run the listed verification.
6. Update the simple plan status and session state before closing.

Detailed guide: `.aioson/docs/dev/simple-plan-lane.md`.
