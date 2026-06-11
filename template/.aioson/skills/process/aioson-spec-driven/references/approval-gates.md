# Approval Gates — Spec-Driven Phase Transitions

> Use when preparing a handoff or checking if a phase is ready to proceed.
> Gates are blocking in MEDIUM. Informational in MICRO/SMALL.

## Gate A — Requirements approval

**Before leaving @product / @analyst → @scope-check, @architect, or @dev**

Required for the gate to pass:
- [ ] Objectives are clear and unambiguous
- [ ] Expected behaviors are described (not just features — what happens when X)
- [ ] Constraints are explicit (what this version does NOT do)
- [ ] Out of scope is listed
- [ ] Open ambiguities are documented (not silently ignored)
- [ ] Requirement IDs exist for all business rules: `REQ-{slug}-{N}`
- [ ] Acceptance criteria exist for all behavioral requirements: `AC-{slug}-{N}`

**Signal in `spec-{slug}.md`:** set `phase_gates.requirements: approved`

**Not ready if:**
- Requirements reference behavior that hasn't been decided
- ACs are not independently verifiable (e.g., "works correctly" is not an AC)
- There are contradictions between PRD and requirements

---

## Gate B — Design approval

**Before leaving @architect → @dev**

Required for the gate to pass:
- [ ] Technical approach is chosen and documented
- [ ] Module/folder structure is defined
- [ ] Dependencies between components are explicit
- [ ] Risks and non-goals are documented
- [ ] Decision rationale exists for non-obvious choices
- [ ] @dev can start without having to invent business logic or architecture

**Signal in `spec-{slug}.md`:** set `phase_gates.design: approved`
**Signal in `architecture.md`:** closing line `> **Gate B:** Architecture approved — @dev can proceed.`

**Not ready if:**
- There are open decisions that @dev would need to make up during implementation
- The architecture introduces patterns not supported by the project's stack
- There are circular dependencies in the module structure

---

## Gate C — Plan approval

**Before @dev or @deyvin executes a significant batch**

Required for the gate to pass:
- [ ] Execution sequence is defined
- [ ] Checkpoints are listed with criteria of done
- [ ] Context package is listed as a short primary activation package plus phase-triggered loads (which files to read before each phase, and why)
- [ ] Review / QA requirements are noted
- [ ] Decisions marked "pre-taken" are FINAL — @dev does not re-discuss

**Signal in `spec-{slug}.md`:** set `phase_gates.plan: approved`
**Signal in `implementation-plan-{slug}.md`:** status field = `approved`

**Not ready if:**
- The plan has phases with unclear done criteria
- There are external dependencies not yet resolved
- @dev would need to re-read the full spec from scratch to start

---

## Gate D — Execution verification (must_haves)

**Before marking a phase or feature as complete**

Required:
- [ ] All truths verified (behavioral — not just "I think it works")
- [ ] All artifacts verified (substantive — not stubs)
- [ ] All key_links verified (wiring — imports, registrations, middleware)

**Not complete if:**
- Any truth has no passing test or manual verification step
- Any artifact is empty, a stub, or missing required exports
- Any key_link shows the code exists but isn't connected

**Signal:** update `last_checkpoint` in `spec-{slug}.md` with which must_haves passed and which failed.

---

## Checkpoint taxonomy reference

When any agent needs human interaction during execution:

| Type | When | Expected frequency |
|------|------|--------------------|
| `verify` | Confirm visible behavior | Common - after each testable delivery |
| `decision` | Architectural or product fork | Rare - only when unspecified |
| `action` | Step the agent literally cannot execute | Very rare - <1% of steps |

Rule: if the agent can execute without risk, execute. Do not ask for unnecessary confirmation.

---

## How agents communicate gate status

Each agent, at session end, should:
1. Update `phase_gates` in `spec-{slug}.md`
2. Tell the user clearly: "Gate [A/B/C] passed — activate [@next-agent]" OR "Gate [A/B/C] blocked — [reason]. Resolve before continuing."

Never silently assume a gate is passed.
