---
description: "Simple Plan lane for @dev and @deyvin: bounded technical implementation without PRD, with disk-first scope, done criteria, verification, and dev-state handoff."
---

# Simple Plan Lane

Use this guide when a user asks for a technical change that is clear enough to implement, but broad enough that chat-only planning would lose context.

## Purpose

The simple-plan lane reduces token cost for bounded implementation work. It is not a replacement for PRDs, requirements, architecture, or QA. It is a disk-first checkpoint for implementation tasks where the agent can define scope, done criteria, files, and verification before coding.

## When to Use

Use this lane when all are true:

- The request is technical and implementation-focused.
- The scope is bounded to a small set of files or one narrow behavior.
- The agent can write observable done criteria before coding.
- The verification command is known or can be inferred from the repo.
- No product, UX, domain, architecture, or security decision is being made.

Do not use it for new product surfaces, unclear requirements, sensitive surfaces, new integrations, or architecture-wide changes.

## Artifact

Create one file:

```text
.aioson/context/simple-plans/{slug}.md
```

Use this structure:

```markdown
---
slug: {slug}
status: in_progress
owner: dev | deyvin
created_at: {YYYY-MM-DD}
updated_at: {YYYY-MM-DD}
classification: MICRO
risk: low | medium
source: direct-user-request
---

# Simple Plan - {Title}

## Scope
[One narrow implementation objective.]

## Done criteria
- [Observable behavior or file-level outcome.]

## Out of scope
- [Explicit exclusions.]

## Expected files
- path/to/file.js

## Verification
- command

## Session state
Next step: [first implementation slice.]

## Notes
- [Decisions made during implementation.]
```

## Execution Protocol

1. Write the simple plan before editing code.
2. Run `aioson dev:state:write . --feature={slug} --next="<first slice>" --context=simple-plan`.
3. Implement the smallest useful slice.
4. Run the verification listed in the plan.
5. Update `status`, `updated_at`, notes, and next step.
6. If the task expands beyond the lane, mark the plan `paused` and hand off to the correct workflow agent.

## Status Semantics

- `draft`: scoped but not started.
- `in_progress`: active implementation.
- `done`: implemented and verified.
- `paused`: intentionally parked; visible for later and non-blocking.
- `abandoned`: intentionally dropped.

## Handoff Rules

If a simple plan remains unfinished at session end, keep it as `in_progress` or `paused` and update `dev-state.md` with `--context=simple-plan`.

If implementation is complete, mark it `done`, record verification evidence in the plan, and update `dev-state.md` only when more work remains.
