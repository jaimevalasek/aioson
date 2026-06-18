---
description: "Simple Plan lane for @dev and @deyvin: bounded technical implementation without PRD, with disk-first scope, implementation intelligence, done criteria, verification, and dev-state handoff."
agents: [dev, deyvin, qa, neo]
task_types: [simple-plan, bounded-work]
triggers: [simple plan, bounded technical work, small fix, refactor, polish, implementation intelligence]
---

# Simple Plan Lane

Use this guide when a user asks for a technical change that is clear enough to implement, but broad enough that chat-only planning would lose context.

## Purpose

The simple-plan lane reduces token cost for bounded implementation work. It is not a replacement for PRDs, requirements, architecture, or QA. It is a disk-first checkpoint for implementation tasks where the agent can define scope, done criteria, files, useful implementation options, and verification before coding.

It must not rely on model intuition alone. Before coding, the agent writes a lightweight implementation intelligence checkpoint into the simple plan: selected context, existing patterns, framework leverage, boundaries, and richer options considered.

## When to Use

Use this lane when all are true:

- The request is technical and implementation-focused.
- The scope is bounded to a small set of files or one narrow behavior.
- The agent can write observable done criteria before coding.
- The verification command is known or can be inferred from the repo.
- The agent can name at least one existing project/framework pattern to reuse or explicitly state none was found.
- No product, UX, domain, architecture, or security decision is being made.

Do not use it for new product surfaces, unclear requirements, sensitive surfaces, new integrations, or architecture-wide changes.

If a richer option would change product behavior, UX direction, permissions, data sensitivity, architecture, or delivery scope, park it in the simple plan and hand off to the correct workflow agent instead of implementing it silently.

## Implementation Intelligence Checkpoint

Complete this checkpoint before writing the final simple plan and before editing code:

1. Run `aioson context:select . --agent=<dev|deyvin> --mode=planning --task="<task>" --paths="<known paths>"` when available.
2. Read only selected rules/docs and the nearest existing code pattern for the touched area.
3. Identify framework leverage first: built-in framework APIs, conventions, generators, validation, data access, components, or testing helpers that should be reused before custom code.
4. Identify data and boundary placement: where queries, query builders, repositories, services, components, handlers, validation, and tests belong in this project.
5. Consider useful implementation options, then classify each as:
   - `include now`: improves the requested behavior without widening scope or risk.
   - `defer`: useful but not needed for the current verified slice.
   - `escalate`: requires product, UX, domain, architecture, security, or QA ownership.

Do not ask the user about every option. Ask only when the recommended option changes scope or requires a real decision. Otherwise, write the reasoning into the plan and proceed with the smallest valuable verified slice.

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

## Context selected
- context:select / fallback evidence:
- Existing pattern to follow:
- Applicable rule/doc:

## Implementation intelligence
- Framework leverage:
- Structure and data boundary:
- Reuse over custom code:

## Done criteria
- [Observable behavior or file-level outcome.]

## Useful options considered
- Include now:
- Defer:
- Escalate:

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

1. Complete the implementation intelligence checkpoint.
2. Write the simple plan before editing code.
3. Run `aioson dev:state:write . --feature={slug} --next="<first slice>" --context=simple-plan`.
4. Implement the smallest useful slice, including only `include now` options.
5. Run the verification listed in the plan.
6. Update `status`, `updated_at`, notes, useful options, and next step.
7. If the task expands beyond the lane, mark the plan `paused` and hand off to the correct workflow agent.

## Quality Bar

A valid simple plan is not just a TODO list. It must show:

- What context/rules/patterns were selected.
- Which framework or project convention will be reused.
- Where structure and data access belong.
- Which useful options were included, deferred, or escalated.
- The verification command that proves the slice.

## Status Semantics

- `draft`: scoped but not started.
- `in_progress`: active implementation.
- `done`: implemented and verified.
- `paused`: intentionally parked; visible for later and non-blocking.
- `abandoned`: intentionally dropped.

## Handoff Rules

If a simple plan remains unfinished at session end, keep it as `in_progress` or `paused` and update `dev-state.md` with `--context=simple-plan`.

If implementation is complete, mark it `done`, record verification evidence in the plan, and update `dev-state.md` only when more work remains.
