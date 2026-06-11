---
description: "Universal folder organization rules — hierarchy, depth, naming, grouping"
scope: "governance"
agents: [dev, deyvin, architect]
modes: [planning, executing]
task_types: [implementation-architecture, file-creation, module-boundary, refactor]
load_tier: trigger
triggers: [creating files, moving files, splitting modules, designing implementation structure, folder structure]
paths: [src/**, app/**, lib/**, template/**, tests/**]
---

# Folder Structure — Governance Rules

> Loaded by the context selector when implementation structure, file creation, moves, or module boundaries are in scope. Override per-project via `.aioson/rules/`.

## Depth

- Maximum 3 levels of nesting before splitting into a separate module.
- If you need a 4th level, the responsibility likely belongs in its own module or package.

## Naming

- **kebab-case** for all folder names: `user-auth/`, `squad-dashboard/`, `context-cache/`
- **Singular** for a single entity or specific responsibility: `service/`, `command/`, `handler/`
- **Plural** for collections of items of the same type: `services/`, `commands/`, `handlers/`
- Never mix styles within the same directory level

## Grouping strategy

Prefer **domain-based grouping** over layer-based when the project grows beyond 5–6 modules:

```
src/
  auth/         ← domain: everything related to authentication
  billing/      ← domain: everything related to billing
  shared/       ← cross-domain: utilities, types, helpers
```

Layer-based is valid for small projects or when the framework enforces it:

```
src/
  controllers/  ← HTTP layer
  services/     ← business logic
  models/       ← data layer
  utils/        ← shared helpers
```

Choose one strategy and stay consistent within the same project.

## Anti-patterns

- Never use generic folders: `misc/`, `stuff/`, `temp/`, `old/`, `helpers/`
- Never leave unrelated files loose in `src/` root — every file belongs to a domain
- Never create a folder with a single file (except `index.js` / `index.ts` as a public module entry point)
- Never nest a folder that has the same semantic scope as its parent
