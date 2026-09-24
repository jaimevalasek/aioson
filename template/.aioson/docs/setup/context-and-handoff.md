---
description: Setup project-context schema, artifact verification, optional spec, and canonical Product handoff
agents: [setup]
task_types: [context-write, context-validation, setup-handoff]
triggers: [write project context, verify setup, complete setup, route after setup]
paths: [.aioson/context/project.context.md, .aioson/context/spec.md]
---

# Setup Context and Handoff Contract

Load before writing or repairing `.aioson/context/project.context.md`, validating completion, or producing the final setup handoff.

## Required frontmatter

Do not finalize until these values are explicit and confirmed:

- `project_name`;
- `project_type`: `web_app`, `api`, `site`, `script`, `dapp`, or `desktop_app`;
- `profile`: `developer`, `creator`, or `team`;
- `framework`;
- `framework_installed` as a boolean;
- `classification`: `MICRO`, `SMALL`, or `MEDIUM`;
- `interaction_language`;
- `conversation_language`, synchronized as a legacy compatibility alias;
- `design_skill` (`interface-design`, written by the CLI; a blank value resolves to the same engine; a project-forged name only when the user gave it);
- `aioson_version` and `generated_at`.

For `dapp`, also require `web3_enabled`, `web3_networks`, `contract_framework`, `wallet_provider`, `indexer`, and `rpc_provider`.

## `framework_installed`

- `true`: framework structure was detected in the workspace. Downstream agents may reuse it and skip initial installation.
- `false`: no framework structure was detected. Downstream planning and implementation must include installation before feature work.

For a monorepo, confirm the primary framework and record the repository layout in Notes.

## Artifact shape

Write:

```markdown
---
project_name: "<name>"
project_type: "web_app|api|site|script|dapp|desktop_app"
profile: "developer|creator|team"
framework: "<explicit framework>"
framework_installed: true
classification: "MICRO|SMALL|MEDIUM"
interaction_language: "en"
conversation_language: "en"
design_skill: "interface-design"
test_runner: ""
web3_enabled: false
web3_networks: ""
contract_framework: ""
wallet_provider: ""
indexer: ""
rpc_provider: ""
aioson_version: "<installed version>"
generated_at: "<ISO-8601>"
---

# Project Context

## Stack
- Backend:
- Frontend:
- Database:
- Auth:
- UI/UX:

## Services
- Queues:
- Storage:
- WebSockets:
- Email:
- Payments:
- Cache:
- Search:

## Web3
- Enabled:
- Networks:
- Contract framework:
- Wallet provider:
- Indexer:
- RPC provider:

## Installation commands
[Only when framework_installed=false]

## Notes
- [warnings, repository layout, and confirmed setup decisions]

## Conventions
- Language:
- Code comments language:
- DB naming: snake_case
- JS/TS naming: camelCase
```

Use the installed AIOSON version; do not preserve a stale example version. YAML booleans remain unquoted.

## Write and verify

Prefer the deterministic setup command with confirmed options when available. Then run:

```bash
aioson verify:artifact . --kind=project-context
```

Repair objective validation failures and rerun until it passes. Never turn an unresolved product choice into a guessed validator-friendly value.

Keep canonical agent prompts in English. If the global CLI is available, `aioson locale:apply` may synchronize `interaction_language`; otherwise leave `.aioson/agents/` unchanged because the runtime language boundary controls user-facing output.

## Optional `spec.md`

After context verification, offer `.aioson/context/spec.md` once. Explain that it is optional living project memory for current state, features, and decisions. A declined or deferred spec never blocks setup.

If accepted, use:

```markdown
---
project: "<project_name>"
updated: "<ISO-8601>"
---

# Project Spec

## Stack
[Copy the confirmed context stack]

## Current state
[Current project phase]

## Features

### Done
- (none yet)

### In progress
- (none yet)

### Planned
- [Confirmed high-level goals]

## Open decisions
- [Unresolved decisions]

## Key decisions
- [Date] [Decision] — [Reason]

## Notes
- [Durable context]
```

Do not load or update a pre-existing spec unless the user accepts this optional action.

## Final handoff

Always state:

- whether context was created or repaired and verified;
- whether optional `spec.md` was created;
- the exact next agent.

For existing code (`framework_installed=true`), add:

> Run `aioson scan:project . --folder=src` when a local code map would help. Continue to `@product`; separate discovery or architecture documents are not canonical prerequisites.

Route every project type/classification to `@product` as the next feature-definition stage. Product then hands off to mandatory `@sheldon`, which must independently review and seal the PRD before `@planner`; setup does not invoke implementation. When a concrete visual direction is still unresolved, route it through `@briefing` → `@refiner` (approved prototype) before `@product`; an open interaction decision belongs to `@product`.

Example:

> Setup complete and project context verified. Next: activate **@product** to define the feature PRD.

At session end:

```bash
aioson agent:done . --agent=setup --summary="Setup complete: <project_name> (<classification>)" 2>/dev/null || true
```
