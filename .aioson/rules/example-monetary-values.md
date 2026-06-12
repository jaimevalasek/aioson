---
name: monetary-values
description: All monetary values must be stored as integer cents, never as floats
agents: [dev, architect, qa]
priority: 5
version: 1.0.0
modes: [planning, executing]
task_types: [payment, billing, pricing]
load_tier: trigger
triggers: [money, monetary values, price, pricing, currency, cents, payment, billing, checkout, invoice, refund]
---

# Monetary Values Convention

All monetary values in this project MUST be stored and calculated as integer cents.

## Rule

- NEVER use float or decimal types for money fields
- Store as integer: `1000` = R$ 10,00 or USD $10.00
- Display formatting is a UI concern only — format at the presentation layer, never in persistence or business logic
- This applies to: database columns, API payloads, internal calculations, test fixtures

## Rationale

Float arithmetic produces rounding errors in financial calculations.
Example: `0.1 + 0.2 === 0.30000000000000004` in most languages.
Using integer cents eliminates this class of bug entirely.

## Applies to

- Database migrations: column type must be integer or bigint, not decimal/float
- API contracts: monetary fields must be documented as integer cents
- @qa: test fixtures must use integer cents; any float in a money field is a bug
