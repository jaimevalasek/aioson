---
name: prd-section-ownership
description: Defines which agent owns each PRD section — other agents cannot modify sections they do not own
priority: 9
version: 1.0.0
agents: [product, pm, analyst, architect, ux-ui, sheldon]
---

# PRD Section Ownership

`prd.md` and `prd-{slug}.md` are shared documents. Each section has one owner — others may only read or append sub-sections, never replace.

## Ownership table

| PRD Section | Owner | Others may |
|---|---|---|
| `## Objective` | `@product` | Read only |
| `## Problem` | `@product` | Read only |
| `## Users And Personas` | `@product` | Read only |
| `## Features` | `@product` | Read only |
| `## Acceptance Criteria` | `@product` (structure) / `@pm` (enrichment) | `@analyst`, `@architect` add technical sub-items |
| `## Delivery Phases` | `@pm` | Read only |
| `## Technical Constraints` | `@architect` | Read only |
| `## UX Considerations` | `@ux-ui` | Read only |
| `## Risks` | `@pm` | `@analyst`, `@architect` add new risks only |
| `## Registered Decisions` | `@sheldon` (project) / `@pm` (feature) | Read only |

## Modification rule

An agent may only modify sections it owns. Non-owners may only **add** a new sub-section at the end — never replace or rewrite existing content.

## Safe addition pattern

```markdown
## Acceptance Criteria
<!-- @product: owner of this section -->

- CA-01: User can schedule an appointment
- CA-02: System sends confirmation email

### Technical criteria (added by @analyst)
- CA-T01: Scheduling validates availability via DB query before confirming
- CA-T02: Email queue uses BullMQ with 3x retry
```

## On violation detected

1. Do not overwrite the section.
2. Create a sub-section with explicit attribution (`<!-- added by @{agent} -->`), OR create a separate artifact (`requirements-{slug}.md`, `architecture.md`, etc.).
