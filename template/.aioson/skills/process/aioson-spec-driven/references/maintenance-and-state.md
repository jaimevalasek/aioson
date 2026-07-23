# Maintenance and State — Writing Useful Checkpoints

> Use when writing or reading `spec*.md`, updating checkpoints, or retaking work after a session break.

## The purpose of spec-{slug}.md

It is not just an implementation log. It is the **living memory** of a feature across all sessions, agents, and tools.

A well-written `spec-{slug}.md` allows:
- @deyvin to resume from the last checkpoint without re-reading the entire spec pack
- @qa to know what was decided and what was deferred
- A future developer (or AI) to understand *why* the code was written the way it was

A poorly written `spec-{slug}.md` forces every new session to rediscover what was already decided.

## What to write in phase_gates

```yaml
phase_gates:
  requirements: approved      # requirements are locked — no new scope without PRD change
  design: approved            # architecture is locked — no structural changes without @architect
  plan: approved              # execution sequence is locked — @dev follows plan, not instinct
```

Never mark a gate as `approved` if there are unresolved items in that phase.

## What to write in last_checkpoint

Format: `{phase-name}: {what was completed} — {what is next}`

Examples:
- `migration: users table created and seeded — next: implement CreateUser action`
- `auth: login and register complete, password reset pending — next: implement ResetPassword action`
- `api: GET /products and POST /products done — next: implement PATCH /products/{id}`

This one line is what @deyvin reads first. Make it actionable.

## What to write in pending_review

List items that need human verification before the next phase begins:

```yaml
pending_review:
  - "Confirm: should password reset expire after 1h or 24h? (decision was deferred)"
  - "Review: CreateUser action sends email — confirm SMTP config in staging before testing"
```

## What to write in Key decisions

Format: `[ISO-date] [decision] — [reason this decision reduces future debug or maintenance cost]`

Bad example:
- `2026-03-28 Used soft deletes`

Good example:
- `2026-03-28 Used soft deletes on users table — reason: billing history must remain intact after account deletion; hard delete would orphan invoices`

The reason is what makes the decision useful in 6 months.

## spec_version field

- Seeded at `1` by @analyst when creating the skeleton
- Incremented by any agent that modifies the spec body (entities, decisions, edge cases — NOT just `last_checkpoint` or `pending_review`)
- @dev checks at session start: if version changed since last `dev-state.md` update, read the spec diff before continuing
- @qa checks at review: if version doesn't match what @dev reported, flag as potential drift

## Unified resumption fields

Every agent that produces or updates a persistent artifact should include these fields in the artifact's frontmatter or closing section:

### In frontmatter (machine-readable):
- `last_agent: {agent-name}` — who was here last
- `last_session: {ISO-date}` — when
- `session_result: completed | interrupted | blocked` — what happened

### In closing section (human-readable):
```
## Session close — {ISO-date}
Agent: @{name}
Result: {completed | interrupted | blocked}
Next: {clear instruction for next agent or next session}
```

### Which artifact each agent updates:
| Agent | Primary artifact |
|-------|-----------------|
| @product | `prd.md` or `prd-{slug}.md` |
| @sheldon | the same `prd.md` or `prd-{slug}.md` |
| @planner | `implementation-plan-{slug}.md` |
| @analyst | `discovery.md` or `requirements-{slug}.md` |
| @architect | `architecture.md` |
| @dev | `dev-state.md` (already does this) |
| @deyvin | `dev-state.md` or the active Simple Plan |
| @qa | QA report file |

## How @deyvin should use this file

1. Read the plan status and `dev-state.md` checkpoint first
2. Resume the next incomplete plan phase, not the documentation chain
3. Read `pending_review` — these may need user input before proceeding
4. Read `Key decisions` only if the next task involves re-touching those areas
5. Do not load legacy spec packs unless the active plan explicitly references one
