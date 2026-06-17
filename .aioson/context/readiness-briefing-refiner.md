---
feature: briefing-refiner
status: ready_with_warnings
created_at: 2026-06-08
next_agent: dev
gate_a: approved
gate_b: approved
---

# Readiness — Briefing Refiner

## Readiness Status

`ready_with_warnings`.

Gate A e Gate B estão aprovados. O @dev tem paths, contratos e decisões suficientes para implementar a V1 sem nova decisão de produto. As warnings são técnicas e devem ser tratadas durante implementação/testes.

## Downstream Recommendation

Next agent: `@dev`.

Reason: implementar o agente `@briefing-refiner`, helpers locais, registry wiring e testes focados conforme PRD, requirements, scope-check, architecture e design-doc desta feature.

Action: `/dev`

## Artifacts Consumed

```text
.aioson/context/prd-briefing-refiner.md
.aioson/context/sheldon-enrichment-briefing-refiner.md
.aioson/context/requirements-briefing-refiner.md
.aioson/context/spec-briefing-refiner.md
.aioson/context/scope-check-briefing-refiner.md
.aioson/context/architecture.md
.aioson/context/design-doc-briefing-refiner.md
researchs/file-system-access-api-2026/summary.md
researchs/local-html-editable-review-ui-2026/summary.md
```

## Implementation Paths Proposed

Create:

```text
template/.aioson/agents/briefing-refiner.md
.aioson/agents/briefing-refiner.md
src/lib/briefing-refiner/briefing-registry.js
src/lib/briefing-refiner/briefing-sections.js
src/lib/briefing-refiner/feedback-schema.js
src/lib/briefing-refiner/review-html.js
src/lib/briefing-refiner/refinement-report.js
src/lib/briefing-refiner/apply-feedback.js
tests/briefing-refiner.test.js
```

Change:

```text
src/constants.js
src/commands/briefing.js
AGENTS.md
CLAUDE.md
template/AGENTS.md
template/CLAUDE.md
tests/agents.test.js
tests/agent-contracts.test.js
```

Review before changing:

```text
src/commands/agents.js
src/commands/test-agents.js
src/commands/dossier-audit.js
src/commands/workflow-next.js
src/commands/workflow-plan.js
```

## Reuse Decisions

- Reuse `AGENT_DEFINITIONS` from `src/constants.js` as the source for agent lookup and prompt generation.
- Reuse `src/agents.js` behavior; no new resolver is needed.
- Reuse existing `briefing:approve` / `briefing:unapprove` semantics by extracting shared registry helpers instead of duplicating parser/serializer logic.
- Reuse `.aioson/briefings/{slug}/` as the artifact home; do not put `review.html` or `refinement-feedback.json` in `.aioson/context/`.
- Reuse `draft` as renewed-approval state for modified approved briefings; do not add `needs_reapproval`.

## Componentization and Split Notes

- Keep `src/commands/briefing.js` as command entry orchestration.
- Move reusable registry logic to a helper module if needed; avoid growing `briefing.js` into the refinement engine.
- Keep HTML generation in `review-html.js`; do not inline a long HTML string inside the agent prompt.
- Keep feedback validation independent from apply logic so QA can test malformed JSON without rendering HTML.
- Keep prompt text and runtime helper logic separate: the agent prompt tells the harness what to do; helper modules do deterministic filesystem work.

## Blocking Items

None.

## Warnings for @dev

- `artifact:validate` may still report missing downstream artifacts such as `implementation-plan-briefing-refiner.md` and `conformance-briefing-refiner.yaml`; for this SMALL feature, the readiness/design package is sufficient unless the workflow CLI demands an additional plan.
- `workflow-plan.js` and `workflow-next.js` disagree on SMALL sequencing. Do not refactor workflow sequencing as part of this feature unless a failing test proves it is required.
- The current briefing config serializer writes a fixed field set. If refinement metadata is added, tests must prove existing fields and approval commands still round-trip correctly.
- Generated HTML must sanitize/escape user-controlled Markdown text before embedding it into `<script>` or editable DOM.
- The File System Access API cannot be assumed. Export/copy/download must be the reliable fallback path.

## Assumptions

- `briefing-refiner` is an official available agent, but not a mandatory workflow stage.
- The user invokes it manually after `@briefing` and before `@product`.
- `@product` continues to consume only approved briefings with no generated PRD.
- The V1 does not include a dedicated CLI command.
- The V1 does not implement a server or dashboard UI.

## Ready Checklist

- Product intent is clear: yes.
- Requirements and ACs are explicit: yes.
- Gate A approved: yes.
- Gate B approved: yes.
- Exact implementation paths provided: yes.
- Reuse points identified: yes.
- File-size/component split risks identified: yes.
- Blockers: none.

## Handoff

```text
Design doc: .aioson/context/design-doc-briefing-refiner.md
Readiness: .aioson/context/readiness-briefing-refiner.md
Gate status: Gate A approved, Gate B approved, readiness ready_with_warnings
Next agent: @dev
Rationale: implement prompt-first briefing-refiner, local review artifacts, feedback application, registry wiring and focused tests
Action: /dev
```

> Recommended: `/compact` before activating the next same-feature agent. Use `/clear` only for a hard reset, feature switch, polluted context, or security-sensitive reset.
