---
description: "Persist context to plans/{slug}.md before suggesting /compact or /clear in a cross-session handoff — preserves the diagnostic so the next agent works from an artifact, not from chat memory."
task_types: [handoff]
triggers: [handoff, session persistence, last handoff]
---

# Handoff Persistence

Load this when you are about to issue a routing recommendation that involves `/compact`, `/clear`, a fresh terminal, or any other context boundary that may compress or drop the current conversation. Same-session handoffs that remain inside the same feature and do not depend on session-only diagnostics usually do not need this — skip the doc unless nuance would be lost.

## The problem

A routing agent (`@neo`, `@deyvin`) ends a session by suggesting:
1. `/agent` — activate the next agent
2. `/compact` — preserve continuity while freeing context before continuing

If the recommendation depends on diagnostic work done in this session (file reads, line numbers, decisions made, options weighed), and the user runs `/clear` first, **all of that context is lost**. `/compact` keeps a summary, but it can still compress away low-salience details. The next agent should read a durable artifact instead of relying on a seed prompt or chat memory.

A seed prompt is a memory of a conversation. An artifact is a memory of work.

## The rule

Before suggesting `/compact` or `/clear` to the user, persist the actionable diagnostic to `plans/{slug}.md` at the project root. Then the recommendation becomes:

```
1. Activate /briefing (or /product / /architect / …)
2. /compact is safe for same-feature continuation — the next agent reads plans/{slug}.md
3. /clear is safe only if the user wants a hard reset — the next agent still reads plans/{slug}.md
```

`plans/` is the canonical input directory for `/aioson:agent:briefing` (and a useful seed for `/aioson:agent:product` too). The directory may not exist yet — create it.

## When to apply

| Situation | Persist? |
|---|---|
| Handoff routes to an agent that takes raw plans (`/aioson:agent:briefing` first and foremost, sometimes `/aioson:agent:product`) | Yes |
| Handoff routes to an agent that needs a discovery pass (`/aioson:agent:analyst`, `/aioson:agent:architect`, `/aioson:agent:sheldon`) | Yes — they read context from `.aioson/context/` AND from raw plans |
| Same-session continuation (`/aioson:agent:dev` keeps going, `/aioson:agent:qa` reviews implementation just done) | No — context is in chat |
| Handoff happens via tracked live session (`aioson live:handoff`) | No — telemetry already carries the trail |
| Trivial routing ("you want `/aioson:agent:setup` first") with no diagnostic to preserve | No |

## What to write

Structure of `plans/{slug}.md` (lightweight — `/aioson:agent:briefing` will enrich it):

```md
# {Short title} — raw plan

> Status: raw input for /{next-agent}. Generated {date} during a /{this-agent} session.

## Why this exists
1-2 paragraphs framing the problem in the user's terms.

## Symptoms observed
Concrete pinned facts: line numbers, file paths, command outputs. Not opinions.

## What's already delivered
If part of the work landed in this session, name the commits/files.

## Proposed scope (if applicable)
Layers / phases / options the next agent should consider. Mark recommendations.

## Open decisions for the next agent to surface
Questions that need user input but were out of scope for this session.

## Pointers
Files, commits, line numbers, related plans/. The next agent reads these directly.

## Out of scope
What you deliberately did NOT cover. Prevents the next agent from re-litigating.
```

Slug rules: kebab-case, descriptive, unique inside `plans/`. Examples: `lay-user-agent-mode.md`, `payment-integration.md`, `auth-rewrite-rfc.md`. Avoid generic names like `notes.md` or `plan.md`.

## What to tell the user

After persisting, end with a clear handoff block. Example:

```
## Next Up
- Routed to: /briefing
- Activate: /briefing
- Context persisted: plans/lay-user-agent-mode.md
- /compact is recommended — the next agent reads from the file
- /clear is safe only if you want a hard reset

Session artifacts written:
- [x] plans/lay-user-agent-mode.md
- [x] {any other files this session produced}
```

## Anti-patterns

- **Inlining 2 KB of diagnostic as a "seed prompt" in the routing message.** The user shouldn't have to copy-paste a wall of text. Persist it.
- **Persisting trivial routings.** A user who asks "what does `/aioson:agent:setup` do" doesn't need a `plans/` file written. Apply the table above.
- **Persisting code archaeology.** Code lives in code; reading recommendations live in the artifact only when they would otherwise be lost across `/compact` or `/clear`.
- **Forgetting to mention the file.** If you wrote `plans/{slug}.md` but the handoff message doesn't reference it, the user won't know to read it (or to let the next agent read it).
