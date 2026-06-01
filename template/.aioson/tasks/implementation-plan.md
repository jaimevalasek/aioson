# Task: Generate Implementation Plan

> Mandatory bridge between completed spec work and implementation start.
> Ensures consistency, defines sequence, and prepares a context package for a fresh chat.

## When To Run

### Automatically (agents detect)
- `/dev` detects that `implementation-plan.md` does not exist but these do exist:
  - `architecture.md` (SMALL/MEDIUM) or `project.context.md` (MICRO)
  - at least one of: `prd.md`, `prd-{slug}.md`, `readiness.md`
- `/orchestrator` detects the same in Step 1

### Manually
- User asks to generate the implementation plan.
- After `/architect` or `/pm` finishes their artifacts.

### Feature Mode
- Detects an existing `prd-{slug}.md` without `implementation-plan-{slug}.md`.
- Generates a plan scoped to that feature.

## Constitution Gate

Before generating or approving the implementation plan, verify:

- [ ] Article I — Work starts from an existing spec artifact (PRD or equivalent), not direct coding
- [ ] Article II — Classification (MICRO/SMALL/MEDIUM) is declared and process depth matches it
- [ ] Article IV — Acceptance criteria in requirements are independently verifiable, not vague
- [ ] Article V — Inputs are complete enough for the next agent to start without re-reading the full discovery chain
- [ ] Article VI — The plan does not introduce unnecessary phases, artifacts, or abstraction layers

If one or more items fail, stop and describe what is missing before continuing.

---

## Process

### Step 1 - Inventory Check

List all artifacts in `.aioson/context/`. For each one, verify:
- Does it exist? Is it complete? Is it consistent with the others?
- Signal gaps and contradictions.

Artifacts to check, in priority order:

| Artifact | Required for | If missing |
|----------|--------------|------------|
| `project.context.md` | MICRO, SMALL, MEDIUM | STOP — do not generate a plan without project identity |
| `architecture.md` | SMALL, MEDIUM | Warn — plan sequence will be less precise |
| `prd.md` or `prd-{slug}.md` | All, when present | Info — plan based only on architecture |
| `discovery.md` | SMALL, MEDIUM | Warn — risk of conflicts with existing entities |
| `ui-spec.md` | UI work | Info — UI phases will have less detail |
| `readiness.md` | When present | Info — plan assumes readiness = READY |
| `spec.md` | When present | Info — no prior decision history |
| `design-doc.md` / `design-doc-{slug}.md` | When present | Warn if `updated` > 60 days old or absent — verify before using as constraint |
| `requirements-{slug}.md` | Feature mode | Warn — business rules may be missing |

### Step 2 - Cross-Analysis

Read artifacts in this order: `project.context` → `discovery` → `architecture` → `prd` → `ui-spec` → `requirements` → `spec` → `design-doc`.

Actively look for:
- **Ghost entities:** referenced in PRD but absent from discovery
- **Technical contradictions:** architecture decision conflicts with PRD
- **Invisible dependencies:** ui-spec feature depends on something not covered
- **Implicit assumptions:** any artifact assumes something without declaring it
- **Scope creep:** requirements appear outside declared scope
- **Integration risks:** points where different modules must agree

For each issue, classify:
- **BLOCK** — cannot proceed without resolution, for example missing central entity
- **WARN** — can proceed with explicit assumption, for example inferred field
- **INFO** — note for dev awareness, for example possible future refactor

**Design-doc freshness check:**
- If `design-doc.md` or `design-doc-{slug}.md` exists and has `updated` older than 60 days: classify as **WARN** — "design-doc may be stale; verify whether decisions still reflect current state before using as constraint".
- If the design-doc exists but lacks `updated`: treat as potentially stale; same WARN.
- If the "Decisions still pending" section has unresolved items: list each as **INFO** — "pending design-doc decision: {item}".
- Do not block the plan due to staleness; ensure dev is aware before inheriting stale constraints.

### Step 3 - Sequence Planning

Define implementation order based on:

**Data dependencies first:**
1. Migrations / schemas / contracts
2. Models / types / entities
3. Repositories / data access

**Logic dependencies next:**
4. Services / actions / use-cases
5. Validation / policies / authorization

**Interface dependencies last:**
6. Controllers / API routes / handlers
7. Views / components / pages

**Independent modules:**
- Identify modules that do not share entities → can run in parallel.
- Identify modules that share entities → must be sequential.
- If `/orchestrator` will use this, explicitly mark `parallel: true/false`.

**For each phase, define:**
- Descriptive title
- What to implement, concrete and not vague
- Dependencies
- Which artifacts `/dev` must read
- Done criterion
- Checkpoint gate before continuing

### Step 4 - Context Package

The context package is the minimum file set the next agent or chat needs to execute the plan with high quality.

**Principles:**
- Less is more — 3-5 files is ideal, never more than 7.
- `implementation-plan.md` is always the first file.
- Artifacts already digested into the plan do not need to be re-read.
- Separate "required reading" from "on-demand reading".

**Context package format:**

```
Required reading (in this order):
1. implementation-plan.md ← this file
2. project.context.md
3. architecture.md (if SMALL/MEDIUM)
4. spec.md (if present — decision history)

On-demand reading (when touching the topic):
- discovery.md — when touching existing entities
- prd.md — when uncertain about a requirement
- ui-spec.md — when implementing UI
- requirements-{slug}.md — when implementing the feature

Do not re-read (already synthesized in this plan):
- [list of artifacts whose relevant content is already in the plan]
```

### Step 5 - Decision Registry

Separate decisions into two categories:

**Pre-made decisions (do not re-discuss):**
- Decisions from `/architect` that were already validated
- Stack choices documented in `project.context.md`
- Conventions defined in `rules/`
- Constraints documented in PRD

**Deferred decisions (`/dev` will make):**
- Trade-offs that only make sense with code in front of the agent
- Implementation choices, for example eager vs. lazy loading
- Optimizations that depend on profiling

For each deferred decision, describe the trade-off and indicate the preferred direction.

### Step 6 - Generate Plan

Save the plan as:
- **Project mode:** `.aioson/context/implementation-plan.md`
- **Feature mode:** `.aioson/context/implementation-plan-{slug}.md`

Artifact format:

```markdown
---
project: "{project_name}"
scope: "{project | feature}"
feature_slug: "{slug or null}"
created: "{ISO-8601}"
status: "draft"
classification: "{MICRO | SMALL | MEDIUM}"
source_artifacts:
  - project.context.md
  - architecture.md
  - prd.md
---

# Implementation Plan

> Generated after consolidating all spec artifacts.
> Approved by the user before any implementation.
> Status: draft → approved → in_progress → completed

## Pre-flight check

### Artifacts read
- [x] project.context.md — ok
- [x] architecture.md — ok
- [ ] discovery.md — missing (proceeding with assumptions)
[...]

### Consistency check
{issues found, classified as BLOCK/WARN/INFO}

### Readiness verdict
{READY | READY_WITH_ASSUMPTIONS | NOT_READY}

## Execution Strategy

### Phase 1 — {title} (estimate: {N files/commits})
- **What:** {concrete description — not "implement the module", but "create users migration with fields X, Y, Z + User model with hasMany Orders"}
- **Depends on:** nothing
- **Input artifacts:** {files dev must read}
- **Done criterion:** {example: migration runs without error, model relationship tests pass}
- **Checkpoint:** {example: verify users table exists and has the correct fields}

### Phase 2 — {title}
[...]

### Parallel phases (if /orchestrator will use them)
- Phase X and Phase Y can run in parallel (no shared entities)
- Phase Z depends on X (shared orders table)

## Pre-made Decisions
- {decision 1 — source: architecture.md — do not re-discuss}
- {decision 2 — source: prd.md — validated by product}

## Deferred Decisions
- {decision 1 — trade-off: A vs B — preferred direction: A because ...}
- {decision 2 — depends on Phase 1 result}

## Context Package

### Required Reading (order matters)
1. `implementation-plan.md` ← this file
2. `project.context.md`
3. `architecture.md`
4. `spec.md`

### On-Demand Reading
- `discovery.md` — when touching entities
- `prd.md` — when uncertain about a requirement
- `ui-spec.md` — when implementing UI

### Do Not Re-Read
- {artifact X — already synthesized in phases above}

## Instructions For The Next Agent

> For /dev or /orchestrator:
>
> 1. Read this file FIRST.
> 2. Follow the phase sequence in order.
> 3. After each phase, update spec.md with decisions made.
> 4. If you find a contradiction with this plan, STOP and ask the user.
> 5. Pre-made decisions are final — do not re-discuss them.
> 6. Deferred decisions are yours to make — record them in spec.md.
> 7. Mark the checkpoint when each phase is complete.
```

### Step 7 - Present To User

Show concise summary in the selected project language:

```
Implementation Plan generated.

Phases: {N} ({M parallel if orchestrator})
Consistency: {N blocks, M warns, P infos}
Readiness: {READY | READY_WITH_ASSUMPTIONS | NOT_READY}
Context package: {N required files + M on-demand files}

Sequence:
1. {phase 1 — one line}
2. {phase 2 — one line}
[...]

Recommendation: {start a new chat for implementation / continue here}
```

Ask in the selected project language whether the user wants to adjust anything before starting.

If the current chat already consumed many tokens with discovery/design, recommend starting a new implementation chat and mention that the context package is defined in the plan.

### Execution Mode

After plan approval, offer two modes in the selected project language:

**Standard mode** (recommended for MICRO/SMALL):
> Implement phase by phase in this chat with `/dev`.

**Precision mode** (recommended for MEDIUM or plans with 5+ phases):
> Open a new chat for each phase with isolated context.
> This avoids context contamination between phases and keeps each subagent focused.
>
> For each phase:
> 1. Open a new chat.
> 2. Paste the context package for that phase, as defined in the plan.
> 3. Execute with `/dev`.
> 4. When done: update `spec.md` and return to the plan.

If MEDIUM and `@orchestrator` is available: precision mode runs automatically via Task tool.

## Classification Adaptation

### MICRO
- Plan is optional; overhead may not be worth it.
- If generated: 1-3 phases, no deep cross-analysis.
- Context package: only `project.context.md` + `implementation-plan.md`.
- Skip Step 2 if artifacts are minimal.

### SMALL
- Plan is recommended.
- Typically 3-5 phases.
- Context package: 3-4 files.
- Cross-analysis: PRD ↔ architecture + discovery ↔ PRD.

### MEDIUM
- Plan is mandatory; orchestrator needs it before parallelizing.
- 5-10 phases with explicit dependencies.
- Context package: 4-5 files + subagent-specific packages.
- Full cross-analysis across all artifacts.
- Explicitly mark parallel phases.

## Rules

- Do not start implementation in this task; plan only.
- Do not ignore BLOCK gaps; signal them and STOP.
- Do not invent requirements; if it is not in the artifacts, it is a deferred decision.
- The plan is a persistent artifact; save it to disk, never only in chat.
- If readiness = NOT_READY, STOP and state what is missing before generating phases.
- Each phase must be concrete enough for `/dev` to execute without ambiguity.
- Vague phases such as "implement the backend" are forbidden; specify which files and entities.
- After user approval, change status from `draft` to `approved`.
