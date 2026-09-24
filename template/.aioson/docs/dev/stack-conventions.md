---
description: "Dev stack conventions — Laravel, Rust build discipline, UI/UX, design skill, motion, Web3, and any-stack separation rules."
agents: [dev]
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

## Rust conventions

A default `cargo` invocation spawns one `rustc` per logical core, and `*-sys` build scripts add MSVC `cl.exe`/`link.exe`/MSBuild processes on top — enough to exhaust the machine's memory. Treat builds as a serialized, capped resource:

- verify slices with `cargo check` (or `cargo clippy`); run `cargo build` only when a runnable binary is actually needed
- run scoped tests (`cargo test -p <crate> <filter>`); the full suite runs once at the delivery gate, not per slice
- one cargo invocation at a time — never start a second build/test while one runs, and never in parallel background shells or parallel worktrees (the target lock does not protect across worktrees)
- before the first heavy build, ensure `.cargo/config.toml` caps parallelism with `[build] jobs` (≈ half the logical cores) and sets `CMAKE_BUILD_PARALLEL_LEVEL` to match; create it and tell the user when missing
- `cc`-based build scripts share cargo's jobserver, so the jobs cap bounds them; cmake-driven ones only obey `CMAKE_BUILD_PARALLEL_LEVEL`

## UI / UX conventions

- use the project's component library when it exists
- do not reinvent standard controls
- mobile-responsive by default
- always implement loading, empty, and error states
- always provide visual feedback

## Design skill conventions

Read `design_skill` from `.aioson/context/project.context.md` before implementing user-facing UI.

- blank or `interface-design` → load `.aioson/skills/design/interface-design/SKILL.md`, the one design engine; a project-forged name → load that skill instead (`.aioson/skills/design/{design_skill}/SKILL.md` or `.aioson/installed-skills/{design_skill}/SKILL.md`)
- load only the references needed for the current screen or component
- treat the resolved skill as the only active visual system; never ask which design skill to use, never swap or mix
- when the PRD carries an `identity` binding, load that record too: it parameterizes the skill and never becomes a second visual system
- the PRD `identity` binding and the approved prototype outrank the skill's own defaults; with neither, follow the existing repository component language and say so explicitly
- stop for the user only when there is no identity, no prototype, and no established convention to conform to

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
