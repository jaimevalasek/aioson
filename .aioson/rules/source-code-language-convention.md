---
name: source-code-language-convention
description: Source code identifiers and generated implementation code use technical English; user-facing copy still follows the project language.
priority: 8
version: 1.0.0
agents: [architect, dev, deyvin, qa]
modes: [planning, executing]
task_types: [implementation, refactor, code-generation, naming, framework-implementation]
load_tier: trigger
triggers: [source code, code language, naming, variables, functions, classes, implement, refactor, Laravel, PHP, controller, service, repository, migration]
paths: [app/**, src/**, lib/**, routes/**, database/**, tests/**, resources/**, config/**, template/**]
---

# Source Code Language Convention

Source code is implementation interface. Write identifiers, filenames, classes, functions, variables, database artifacts, migrations, service names, comments that explain code behavior, and generated framework code in technical English.

User-facing copy, documentation artifacts, PRDs, specs, CLI explanations, validation messages, and product text follow `interaction_language` from project context, falling back to `conversation_language`.

## Required Behavior

- Use English for source code identifiers: classes, methods, functions, variables, enums, constants, routes, migrations, factories, seeders, tests, services, jobs, events, listeners, policies, resources, repositories, query objects, and component names.
- Before inventing names, inspect nearby code and follow the project's naming pattern.
- If the project pattern is unclear, inspect `.aioson/context/bootstrap/how-it-works.md` and `.aioson/context/bootstrap/current-state.md` when selected by `context:select`; otherwise use the framework's official naming conventions.
- Keep framework-generated names conventional. For Laravel, prefer standard names such as `OrderController`, `StoreOrderRequest`, `OrderPolicy`, `OrderResource`, `CreateOrdersTable`, and `OrderFactory`.
- Do not translate technical identifiers into the conversation language. Avoid names like `PedidoController`, `criarUsuario`, `valorTotalEmCentavos`, or `servicoPagamento` in source code.
- Domain terms with established local legal or regulatory meaning may appear in user-facing copy or comments that quote regulation, but code identifiers still need a clear English abstraction.

## Review Checklist

- New source files and identifiers are in English.
- Names match the local framework and project pattern.
- User-facing text remains in the project language.
- No implementation layer uses translated variable, class, method, or migration names.
