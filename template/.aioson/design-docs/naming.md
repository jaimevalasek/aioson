---
description: "Naming conventions for files, variables, functions, and classes"
scope: "governance"
agents: [dev, deyvin, architect]
modes: [planning, executing]
task_types: [implementation-architecture, file-creation, naming, refactor]
load_tier: trigger
triggers: [naming files, naming APIs, creating files, adding functions, adding classes, choosing names]
paths: [src/**, app/**, lib/**, template/**, tests/**]
---

# Naming — Governance Rules

> Loaded by the context selector when naming files, APIs, functions, classes, or implementation paths is in scope. Override per-project via `.aioson/rules/`.

## Files

- **kebab-case** for all source files: `user-auth.js`, `billing-service.ts`, `context-writer.py`
- When inside a flat directory, use a domain prefix to group related files: `user-create.js`, `user-update.js`, `user-delete.js`
- Avoid generic suffixes when the domain name already conveys the type: prefer `auth.js` over `auth-helper.js`
- Test files mirror the source file name: `user-auth.test.js`, `billing_service_test.py`

## Variables and constants

| Type | JS / TS | Python / Ruby | Go / Rust |
|------|---------|---------------|-----------|
| Local variables | camelCase | snake_case | camelCase / snake_case |
| Global constants | SCREAMING_SNAKE_CASE | SCREAMING_SNAKE_CASE | SCREAMING_SNAKE_CASE |
| Environment variables | SCREAMING_SNAKE_CASE | SCREAMING_SNAKE_CASE | SCREAMING_SNAKE_CASE |

## Functions and methods

Pattern: **verb + noun** — describes what the function does and to what.

Good: `loadUser()`, `parseManifest()`, `validateEmail()`, `sendInvoice()`, `buildQuery()`
Avoid: `doUser()`, `process()`, `handle()` — too vague to understand intent
Avoid: `userLoader()`, `manifestParser()` — noun-first reads as a class or object, not a function

## Booleans

Always use a prefix that makes the boolean read as a yes/no question:

- `is` — state: `isReady`, `isEmpty`, `isAuthenticated`, `isValid`
- `has` — possession: `hasErrors`, `hasChildren`, `hasPermission`
- `should` — intent: `shouldRetry`, `shouldRedirect`, `shouldNotify`
- `can` — capability: `canEdit`, `canDelete`, `canPublish`

## Classes and components

- **PascalCase**: `UserService`, `BillingController`, `AuthModal`, `InvoiceJob`
- Singular: `User`, not `Users` — a class represents one entity, not a collection
- React / Vue / Svelte components: same PascalCase rule, filename in kebab-case: `UserCard.tsx` → `user-card.tsx`

## Avoid

- Abbreviations unless they are industry-standard: `url`, `id`, `api`, `html`, `dto` are fine; `usrCtx`, `mngr`, `cfg`, `hlpr` are not
- Single-letter variables except for loop indices (`i`, `j`, `k`) and math/geometry variables
- Names that describe the type instead of the intent: `dataObject`, `listArray`, `stringValue`
- Negative booleans: `isNotReady`, `hasNoErrors` — flip to positive: `isReady`, `isValid`
