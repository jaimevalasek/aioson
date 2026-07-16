---
feature: briefing-refiner
status: approved
created_by: pm
created_at: 2026-06-08T00:00:00-03:00
classification: MEDIUM
feature_depth: SMALL
gate: C
gate_status: approved
---

# Implementation Plan — Briefing Refiner

## Gate C Summary

Gate C is approved for implementation because Gate A and Gate B are approved, the design/readiness package identifies exact paths, and the remaining work is deterministic Node.js filesystem behavior plus agent registry wiring. The feature remains SMALL in functional depth, but this repository is MEDIUM and the workflow requires an approved Gate C artifact before `@dev`.

## Required Context Package

`@dev` must read, in order:

1. `.aioson/context/project.context.md`
2. `.aioson/context/features/briefing-refiner/dossier.md`
3. `.aioson/context/prd-briefing-refiner.md`
4. `.aioson/context/requirements-briefing-refiner.md`
5. `.aioson/context/spec-briefing-refiner.md`
6. `.aioson/context/design-doc-briefing-refiner.md`
7. `.aioson/context/readiness-briefing-refiner.md`
8. `.aioson/context/implementation-plan-briefing-refiner.md`

## Pre-Taken Decisions

- `briefing-refiner` is an official available agent, but not a mandatory workflow stage in V1.
- No `aioson briefing:refine` command in V1; agent plus helper modules is enough.
- Canonical prompt is template-first: `template/.aioson/agents/briefing-refiner.md`, mirrored to `.aioson/agents/briefing-refiner.md`.
- `refinement-feedback.json` is the only canonical machine-consumed feedback source; never infer final changes from edited HTML DOM.
- Review artifacts live under `.aioson/briefings/{slug}/`, not `.aioson/context/`.
- Direct file save from HTML is progressive enhancement; export/download/copy fallback is mandatory.
- If an approved briefing is changed and `prd_generated` is null, set it back to `draft` and clear `approved_at`.
- Do not create or edit `prd*.md`.

## Execution Sequence

| Phase | Scope | Primary files | Done criteria |
|---|---|---|---|
| 1 | Register the agent and preserve template/workspace parity. | `template/.aioson/agents/briefing-refiner.md`, `.aioson/agents/briefing-refiner.md`, `src/constants.js`, `AGENTS.md`, `CLAUDE.md`, `template/AGENTS.md`, `template/CLAUDE.md` | Agent resolves via `getAgentDefinition('briefing-refiner')`; prompt contains structural sections; agent is not added to mandatory workflow stages. |
| 2 | Extract/reuse briefing registry behavior safely. | `src/commands/briefing.js`, `src/lib/briefing-refiner/briefing-registry.js` | Existing `briefing:approve` and `briefing:unapprove` semantics still round-trip; refinable list includes `draft` and approved-without-PRD, excludes implemented/PRD-generated. |
| 3 | Build deterministic briefing parsing, feedback schema, and static review artifacts. | `src/lib/briefing-refiner/briefing-sections.js`, `feedback-schema.js`, `review-html.js`, `refinement-report.js` | Review generation can create `review.html`, initial `refinement-feedback.json`, and preliminary `refinement-report.md`; mandatory briefing sections are preserved and escaped/sanitized. |
| 4 | Implement confirmed feedback application and status transitions. | `src/lib/briefing-refiner/apply-feedback.js`, `briefing-registry.js`, `refinement-report.js` | Cross-slug/stale feedback is blocked before automatic apply; confirmed changes update `briefings.md`; approved modified briefings return to draft; unresolved blockers prevent “ready for product” handoff. |
| 5 | Add focused regression coverage and final verification. | `tests/briefing-refiner.test.js`, `tests/agents.test.js`, `tests/agent-contracts.test.js` | Tests cover registry inclusion, prompt parity, artifact generation, schema validation, stale source detection, no-PRD constraint, and approved-to-draft transition. |

## Checkpoints

- After Phase 1: add dossier codemap/finding for agent registration and update `spec-briefing-refiner.md` with the registry decision.
- After Phase 2: run focused briefing registry tests before continuing.
- After Phase 3: run `node --test tests/briefing-refiner.test.js`.
- After Phase 4: update `spec-briefing-refiner.md` with status transition behavior and report any implementation trade-off.
- After Phase 5: run `node --test tests/briefing-refiner.test.js tests/agents.test.js tests/agent-contracts.test.js` and `npm run lint`.

## Verification Required Before Handoff

```bash
node --test tests/briefing-refiner.test.js tests/agents.test.js tests/agent-contracts.test.js
npm run lint
aioson artifact:validate . --feature=briefing-refiner
```
