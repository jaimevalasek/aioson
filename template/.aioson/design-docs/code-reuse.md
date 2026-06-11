---
description: "DRY principles, reuse hierarchy, and composition patterns"
scope: "governance"
agents: [dev, deyvin, architect]
modes: [planning, executing]
task_types: [implementation-architecture, file-creation, refactor, reuse]
load_tier: trigger
triggers: [creating files, adding shared utility, reusing code, avoiding duplication, extending existing module]
paths: [src/**, app/**, lib/**, template/**]
---

# Code Reuse — Governance Rules

> Loaded by the context selector when creating files, reusing code, extending modules, or avoiding duplication is in scope. Override per-project via `.aioson/rules/`.

## Before creating any new file

Always verify in this order:

1. Does a shared utility already solve this? (check `utils.js`, `utils/`, `helpers/`, `shared/`)
2. Does a domain module in `lib/`, `services/`, or `lib/` already own this responsibility?
3. Does a similar existing file already do something close enough to extend?

Create a new file only if none of the above applies.

## Reuse hierarchy

1. **Existing shared utility** — call it, do not reimplement
2. **Domain module** — if the logic is domain-specific, extend the right module
3. **Inline helper** — acceptable if single use and under ~50 lines
4. **New file** — only when no existing location is appropriate

## Composition over duplication

- Never copy-paste code blocks between files — extract to a named function instead
- If two modules import the same sequence of dependencies, consider a factory or initializer
- If the same validation logic appears in 3+ places, it belongs in a shared validator
- If two commands share a pattern for reading + transforming + writing, extract the pipeline

## DRY with pragmatism

DRY applies to **logic**, not to **structure**:

- Two functions that look similar but serve different domain concepts should stay separate
- Merging them to reduce lines often creates the wrong abstraction
- Duplicating a string or constant is worse than a duplicate variable — always use named constants
- Small, isolated duplication is sometimes better than a shared dependency that couples unrelated modules

## When NOT to reuse

- When the shared abstraction introduces coupling between unrelated modules
- When the reused code would need flags or conditionals to serve a new caller — that signals divergence, not reuse
- When the only shared thing is syntax, not semantics
