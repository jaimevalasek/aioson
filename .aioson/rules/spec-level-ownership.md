---
name: spec-level-ownership
description: spec.md is project-level, spec-{slug}.md is feature-level — the two levels never mix
priority: 9
version: 1.1.0
agents: [dev, qa, pm, sheldon]
modes: [planning, executing]
task_types: [spec-write, spec-update]
load_tier: trigger
triggers: [spec, feature spec, project spec, updating spec, writing spec]
paths: [.aioson/context/spec*.md]
---

# Spec Ownership: Project vs Feature Level

Legacy compatibility rule: new canonical features use PRD → implementation plan → QA report. Do not create a duplicate spec pack. These ownership rules apply only when an existing legacy spec is being maintained.

Two distinct levels — never mix them.

| File | Level | Owner | Content |
|---|---|---|---|
| `spec.md` | **Project** | `@dev` (full project) | Stack, global patterns, infrastructure — decisions affecting the whole project |
| `spec-{slug}.md` | **Feature** | `@dev` (specific feature) | Decisions, entities, dependencies, ACs for ONE feature |

## Absolute rules

1. `spec.md` never receives feature-specific content → create `spec-{slug}.md` for that.
2. `spec-{slug}.md` never receives project decisions → stack decisions go in `spec.md` or `architecture.md`.
3. Maintain an existing `spec-{slug}.md` when the legacy workflow uses it; creating one is not a prerequisite for canonical implementation. One file per slug. Slug must match `prd-{slug}.md` and `implementation-plan-{slug}.md`.
4. No `spec-{slug}.md` without a corresponding `prd-{slug}.md`.
5. Simple-plan work does not require `spec-{slug}.md`; keep its scope and decisions in `.aioson/context/simple-plans/{slug}.md` unless the work expands into a real feature.

## Legacy structure: spec-{slug}.md

```markdown
---
feature: {slug}
status: in_progress | paused | done | abandoned
phase_gates:
  requirements: approved | pending | skipped
  design: approved | pending | skipped
  plan: approved | pending | skipped
---

# Spec — {feature name}

## Implemented entities
## Technical decisions
## Dependencies
## QA approval
(filled by @qa on feature close)
```

## Legacy structure: spec.md (project level)

```markdown
# Spec — {project name}

## Stack and infrastructure
## Global code patterns
## External integrations
## Cross-feature architecture decisions
```

## On violation detected

1. Do not write to the wrong file.
2. Identify the correct level.
3. Write to the correct file (create if needed following mandatory structure above).
