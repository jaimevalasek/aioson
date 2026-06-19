---
name: implementation-structure-and-data-access
description: Build maintainable implementation slices with framework-first structure, small files, clear module boundaries, and data access kept out of presentation/control flow.
priority: 8
version: 1.0.0
agents: [architect, dev, deyvin, qa, tester, pentester]
modes: [planning, executing]
task_types: [implementation-architecture, implementation, refactor, module-boundary, data-access, framework-implementation]
load_tier: trigger
triggers: [componentization, split module, folder structure, framework conventions, Laravel, controller, service layer, repository, query builder, database query, raw SQL, maintainability, files too large]
paths: [app/**, src/**, lib/**, routes/**, database/**, tests/**, resources/**, config/**, template/**]
---

# Implementation Structure And Data Access

Build code in small, maintainable units that fit the installed framework. Prefer the project's existing structure and the framework's official extension points before creating pure custom plumbing.

## Framework-First Rule

- Detect the installed framework from project context, package manifests, lockfiles, config files, and existing directories.
- Use framework-native features before hand-rolled alternatives when they solve the same problem cleanly.
- If a framework convention exists locally, follow the local convention first; if the project has no pattern yet, follow the framework convention.
- Do not introduce a new architectural pattern when a nearby module already solves the same class of problem.

## Componentization

- Keep files focused on one responsibility. Split large files before adding unrelated behavior.
- Put orchestration in services/actions/use-cases, not in controllers, route handlers, UI components, commands, or jobs.
- Keep controllers and route handlers thin: validate input, call application logic, return a response.
- Keep UI components focused on rendering and interaction state; move business rules and data access to the appropriate application layer.
- Prefer cohesive folders/subfolders when a feature grows: requests, resources, actions/services, queries/repositories, policies, jobs, events/listeners, tests, and feature-local components where the framework supports them.
- Add an abstraction only when it removes real duplication, clarifies a boundary, or matches an established local pattern.

## Data Access Boundary

- Do not expose raw SQL, query builders, ORM chains, or database filtering deep inside controllers, route handlers, UI components, views, jobs, or unrelated services.
- Put data access in the framework-recommended place: model scopes, repositories, query objects, data mappers, service methods, or dedicated persistence modules depending on the stack.
- Parameterize all queries. Never interpolate user input into SQL strings or query fragments.
- Keep read queries and write transactions explicit. Use framework transaction helpers for multi-step writes.
- For Laravel, prefer FormRequest for validation, Eloquent scopes or dedicated query classes for reusable filters, policies for authorization, resources for API shape, jobs for background work, and service/action classes for application workflows.
- For non-Laravel stacks, translate the same boundary to the framework's idioms instead of copying Laravel folder names blindly.

## Review Checklist

- The implementation follows existing project/framework conventions.
- Files stay small enough to scan and test.
- Controllers, route handlers, UI components, and views do not contain persistence details.
- Queries live in the proper data access layer and are parameterized.
- Scan controllers, routes, views, and components for `DB::`, raw SQL, or long query-builder chains; move them to the data access layer.
- New folders are justified by framework convention or repeated local structure.
