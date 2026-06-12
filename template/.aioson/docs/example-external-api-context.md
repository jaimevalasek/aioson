---
description: "Template for documenting an external API integration context — replace with real content"
task_types: [integration]
triggers: [external api, integration context]
scope: "global"
agents: []
---

# External API Context — [API Name]

> Replace this file with real context for your integration.
> Rename it to reflect the actual system: e.g., `stripe-webhook-behavior.md`
> Keep it focused on behavior that agents cannot infer from the codebase alone.
> Delete sections that are not applicable.

---

## What This API Does

[One paragraph: what service this is, what it provides, why this project uses it, when it was integrated]

---

## Authentication

[Auth method, where keys are stored, any refresh/rotation behavior, scopes required]

---

## Key Endpoints Used

| Endpoint | Purpose | Notes |
|----------|---------|-------|
| `POST /resource` | Creates X | Idempotency key required |
| `GET /resource/{id}` | Reads X | Returns 404 if not found (not 403) |

---

## Non-Obvious Behavior

[Anything that caused or could cause bugs if an agent doesn't know it:]

- **Idempotency:** [describe if required and how to implement]
- **Rate limits:** [requests/minute, burst behavior, retry guidance]
- **Async callbacks:** [webhook events, polling, event ordering guarantees]
- **Pagination:** [cursor-based, offset, page size limits]
- **Error format:** [how errors are structured — not always standard HTTP semantics]

---

## Webhook Events (if applicable)

| Event | When it fires | Payload shape | Idempotent? |
|-------|--------------|---------------|-------------|
| `resource.created` | When X is created | `{ id, data, timestamp }` | Yes |

---

## Known Limitations

[What the API cannot do, versioning constraints, known bugs, deprecation status]

---

## Integration Points in This Codebase

[Where the integration lives — file paths, service names, which agents should know this]

---

## Last Verified

Date this doc was last confirmed accurate: [YYYY-MM-DD]
Verified by: [agent name or user]
