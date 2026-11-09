---
description: "Implementation plan contract — the exact frontmatter and section templates of implementation-plan-{slug}.md that Gate C, plan:bind, feature:trace and the phase capsule parse."
agents: [planner]
task_types: [planning, plan-writing, output-contract]
triggers: [implementation plan template, writing the plan, plan frontmatter, Implementation Delta, Capability Delivery Plan, Engineering Controls table]
---

# Implementation plan contract

Load this immediately before writing `implementation-plan-{slug}.md` (or `implementation-plan.md` in project mode). The Planner kernel owns the rules; this file is the exact shape the gates and tools parse.

## Frontmatter

```yaml
---
feature: {slug}
status: approved
plan_contract: 2
source_prd: .aioson/context/prd-{slug}.md
source_briefing: .aioson/briefings/{slug}/briefings.md
sheldon_review: required
prototype: .aioson/briefings/{slug}/prototype.html
prototype_status: current
prototype_feature: {slug}
---
```

Copy `prototype`, `prototype_status` and `prototype_feature` exactly from the verified PRD; `null`/`none`/`null` when no prototype binds this feature. Add `execution: single` for the single-DEV answer and `runtime_contract: required` for runtime work (owned prototype or migrations).

## Required sections

```markdown
# Implementation Plan — {slug}

## Objective
[One observable outcome sentence.]

## Repository evidence
- Production entry point: [path/command]
- Existing patterns to reuse: [exact paths/packages]
- Test runner: [command — resolved with `aioson detect:test-runner`; convention-guessing only as fallback. QA reuses it]

## Engineering Controls
| Concern | Evidence / trigger | Planned control | Verification | Recovery |
|---|---|---|---|---|
| compatibility | `src/current/contract.ext` is consumed by ... | Preserve the contract while extending ... in Phase 1 | exact integration command | revert the additive boundary; no migration |

## Implementation Delta
| CAP | Action | Existing evidence | Exact paths | Required change |
|---|---|---|---|---|
| CAP-{slug}-main | modify | `src/current/path.ext` currently handles ... | src/current/path.ext | Preserve ... and add ... |
| CAP-{slug}-main | create | No adapter after inspecting `src/current/registry.ext` | src/new/adapter.ext | Add the boundary |

## Capability Delivery Plan
| CAP | Phase | Files | Verification |
|---|---|---|---|
| CAP-{slug}-main | 1 | src/real-path.ext, tests/real-test.ext | exact command + production-path smoke |

## Phase 1 — [observable user result]
- CAP/AC: [IDs]
- User-visible outcome: [what works from the normal entry point]
- Implementation: [short technical sequence]
- Create/modify/reuse/retire: [exact repository-relative paths, matching Implementation Delta]
- Verification: [exact automated command and real runtime path]
- Done when: [binary observable result]
```

A capability delivered across phases keeps its one Capability Delivery Plan row and lists every phase in its Phase cell (`3, 7, 12`). When no cross-cutting concern is triggered, the Engineering Controls section says so with the exact boundaries inspected — never generic controls.
