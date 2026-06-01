---
name: simple-plan-lane
description: Lightweight implementation lane for bounded technical work that does not justify a PRD or full workflow.
priority: 9
version: 1.0.0
agents: [dev, deyvin, qa, neo]
---

# Simple Plan Lane

Use a simple plan when the active request is technical, bounded, and directly verifiable, but too large to keep only in chat.

Canonical artifact:

- `.aioson/context/simple-plans/{slug}.md`

Use this lane only when all conditions are true:

- Objective fits in one sentence.
- Scope is implementation-focused, not product-definition work.
- No new user journey, product surface, or business rule needs to be decided.
- No architecture-wide decision is required.
- No new external integration is introduced.
- The work does not touch auth, money, ownership, permissions, secrets, destructive deletion, or sensitive data storage.
- Expected implementation is small and reviewable.
- Done criteria and verification command can be written before coding.

Escalate instead:

- `@product` for product intent, users, UX flows, feature scope, or value decisions.
- `@analyst` for domain rules, entities, edge cases, or brownfield behavior mapping.
- `@architect` for cross-module architecture or structural decisions.
- `@pentester` / `@qa` for sensitive surfaces or formal verification.

Lifecycle:

- `draft` -> `in_progress` -> `done`, `paused`, or `abandoned`
- `paused` means intentionally parked and visible for later review; it must not block new simple plans or features.

When `@dev` or `@deyvin` uses this lane:

1. Write the simple plan to disk before implementation.
2. Run `aioson dev:state:write . --feature={slug} --next="<first slice>" --context=simple-plan`.
3. Implement in small slices.
4. Run the listed verification.
5. Update the simple plan status and session state before closing.

Detailed guide: `.aioson/docs/dev/simple-plan-lane.md`.
