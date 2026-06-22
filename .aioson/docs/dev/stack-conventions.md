---
description: "Dev stack conventions — Laravel, UI/UX, design skill, motion, Web3, and any-stack separation rules."
agents: [dev, deyvin]
task_types: [implementation, conventions]
triggers: [stack conventions, framework patterns, implementing features]
---

# Dev Stack Conventions

Load this module when the active task touches framework-specific implementation details or user-facing UI.

## Laravel conventions

Respect this layout:

- `app/Actions/`
- `app/Http/Controllers/`
- `app/Http/Requests/`
- `app/Models/`
- `app/Policies/`
- `app/Events/` + `app/Listeners/`
- `app/Jobs/`
- `app/Livewire/`
- `resources/views/<resource>/`

Rules:

- controllers orchestrate; they do not own business logic
- use Form Requests for validation
- use Policies for authorization
- use Actions for business logic
- use queued events/listeners for side effects
- use Jobs for heavy processing
- eager-load to avoid N+1 queries
- implement `down()` in every migration

## UI / UX conventions

- use the project's component library when it exists
- do not reinvent standard controls
- mobile-responsive by default
- always implement loading, empty, and error states
- always provide visual feedback

## Design skill conventions

Read `design_skill` from `.aioson/context/project.context.md` before implementing user-facing UI.

If `design_skill` is set:

- load `.aioson/skills/design/{design_skill}/SKILL.md`
- load only the references needed for the current screen or component
- treat it as the only active visual system

If `design_skill` is blank and the task clearly depends on visual direction:

- stop and ask whether to route through `@ux-ui` or proceed explicitly without a registered design skill

## Motion and animation

When the framework is React or Next.js and motion is relevant:

- load `.aioson/skills/static/react-motion-patterns.md`
- prefer Framer Motion
- provide `prefers-reduced-motion` fallback
- do not add heavy motion to admin/CRUD interfaces without a clear reason

## Web3 conventions

For `project_type=dapp`:

- validate inputs on-chain and off-chain
- never trust client-provided values for sensitive contract calls
- use typed ABIs
- test contract interactions before UI wiring
- document gas implications for user-facing transactions

## Any-stack conventions

For stacks without a dedicated section:

- separate business logic from request handlers
- validate input at the boundary
- follow the framework's conventions first
- check `.aioson/skills/static/`, `.aioson/skills/dynamic/`, and `.aioson/skills/design/` before inventing patterns
- document deviations in `architecture.md` when needed
