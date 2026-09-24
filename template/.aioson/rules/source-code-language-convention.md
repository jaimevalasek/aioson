---
name: source-code-language-convention
description: Source code identifiers and generated implementation code use technical English; user-facing copy still follows the project language.
priority: 8
version: 1.0.0
agents: [product, sheldon, planner, dev, qa, tester]
modes: [planning, executing]
task_types: [implementation, refactor, code-generation, naming, framework-implementation, prd, planning]
load_tier: always
enforcement: source-code-language
triggers: [source code, code language, naming, variables, functions, classes, implement, refactor, Laravel, PHP, controller, service, repository, migration, criar, implementar, refatorar, nomear, componente, servico, rota, arquivo, pasta, classe, funcao, crear, implementar, nombrar]
aliases: [nomenclatura, nomes de arquivo, idioma do codigo, vocabulario canonico, canonical vocabulary, naming convention]
paths: ['**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs', '**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts', '**/*.vue', '**/*.svelte', '**/*.astro', '**/*.py', '**/*.php', '**/*.rb', '**/*.go', '**/*.rs', '**/*.java', '**/*.kt', '**/*.kts', '**/*.scala', '**/*.cs', '**/*.fs', '**/*.swift', '**/*.dart', '**/*.ex', '**/*.exs', '**/*.erl', '**/*.clj', '**/*.hs', '**/*.c', '**/*.h', '**/*.cc', '**/*.cpp', '**/*.hpp', '**/*.m', '**/*.mm', '**/*.sql', '**/*.prisma', '**/*.graphql', '**/*.proto', '**/*.tf', '**/*.sh', '**/*.ps1', '**/*.lua', '**/*.r', '**/*.jl', '**/*.sol', '**/*.vy', '**/*.cairo', '**/*.move', '**/*.zig', '**/*.nim', '**/*.ml', '**/*.mli', '**/*.fsx', '**/*.vb', '**/*.pas', '**/*.cr', '**/*.elm', '**/*.res', '**/*.gradle', '**/*.groovy', '**/*.pl', '**/*.pm', '**/*.scss', '**/*.sass', '**/*.less']
---

# Source Code Language Convention

Source code is implementation interface. Write identifiers, filenames, classes, functions, variables, database artifacts, migrations, service names, comments that explain code behavior, and generated framework code in technical English.

User-facing copy, documentation artifacts, PRDs, specs, CLI explanations, validation messages, and product text follow `interaction_language` from project context, falling back to `conversation_language`.

## Precedence

This rule outranks every feature-scoped artifact. A briefing promise, PRD acceptance criterion, implementation plan, prototype, or dossier decision cannot override it, narrow it, or spend it as an accepted deviation — not even when the upstream artifact is more specific or more recent.

A product's canonical vocabulary binds **UI strings and domain nouns**. It never extends to technical scaffolding: directories, filenames, layers, framework artifacts, generic verbs, and plumbing identifiers stay English regardless of what a feature artifact says about naming.

On conflict, stop and report it. The only legitimate resolution is a human editing this rule (or removing it for a genuinely locale-scoped project); an agent may never resolve it in favor of the feature artifact.

Compliance is measured, not asserted: `aioson rules:check . --changed` verifies paths and declared identifiers deterministically. `HIGH` is a translated technical term; `MED` is a native-language morphology signal worth a second look.

## Required Behavior

- Use English for source code identifiers: classes, methods, functions, variables, enums, constants, routes, migrations, factories, seeders, tests, services, jobs, events, listeners, policies, resources, repositories, query objects, and component names.
- Before inventing names, inspect nearby code and follow the project's naming pattern — casing, prefixes, and layer suffixes. Pattern never means language: surrounding code written in another language is not a licence to add more of it, and matching it is the one way a project drifts further from this rule while looking consistent.
- If the project pattern is unclear, inspect `.aioson/context/bootstrap/how-it-works.md` and `.aioson/context/bootstrap/current-state.md` when selected by `context:select`; otherwise use the framework's official naming conventions.
- Keep framework-generated names conventional. For Laravel, prefer standard names such as `OrderController`, `StoreOrderRequest`, `OrderPolicy`, `OrderResource`, `CreateOrdersTable`, and `OrderFactory`.
- Do not translate technical identifiers into the conversation language. Avoid names like `PedidoController`, `criarUsuario`, `valorTotalEmCentavos`, or `servicoPagamento` in source code.
- Domain terms with established local legal or regulatory meaning may appear in user-facing copy or comments that quote regulation, but code identifiers still need a clear English abstraction.

## Review Checklist

- New source files and identifiers are in English.
- Names match the local framework and project pattern.
- User-facing text remains in the project language.
- No implementation layer uses translated variable, class, method, or migration names.
