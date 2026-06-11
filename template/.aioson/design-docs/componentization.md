---
description: "When and how to extract components, modules, and abstractions"
scope: "governance"
agents: [dev, deyvin, architect]
modes: [planning, executing]
task_types: [implementation-architecture, module-boundary, refactor, extraction]
load_tier: trigger
triggers: [extract component, extract module, split module, abstraction, componentization, refactor duplicated logic]
paths: [src/**, app/**, lib/**, template/**]
---

# Componentization — Governance Rules

> Loaded by the context selector when extraction, module boundaries, duplication, or abstraction decisions are in scope. Override per-project via `.aioson/rules/`.

## When to extract

Extract a component, module, or function when ANY of these is true:

1. **Duplication** — the same logic appears in 2 or more different places
2. **Size** — a file is approaching 300 lines of pure logic (excluding comments and blank lines)
3. **Testability** — the piece of logic can be tested in isolation from the rest
4. **Description** — the responsibility can be stated in one short, specific sentence

## When to keep inline

Keep logic inline when ALL of these are true:

- Used in exactly one place
- Under ~50 lines
- Extracting it would create a file with a single trivial function
- No second confirmed use case exists

## Single responsibility

- One file = one primary responsibility
- Supporting helper functions for that primary responsibility may coexist in the same file
- Helper functions used in 2+ files → move to a shared utility or dedicated module

## Avoid premature abstraction

- Do not create abstractions for hypothetical future requirements
- Three similar-but-not-identical code blocks is not always a reason to abstract — wait for the pattern to stabilize
- An abstraction that is harder to understand than the original code is a liability, not an asset
- The right abstraction reveals intent. If the name cannot describe what it does in 3 words or fewer, reconsider.

## Signals that an abstraction is wrong

- The function needs many flags or mode switches to handle different callers
- The caller has to know internal details to use it correctly
- Tests for the abstraction are harder to read than tests for the original code
- Removing the abstraction and inlining the logic would make the code clearer
