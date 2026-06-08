---
feature: briefing-refiner
status: ready
created_at: 2026-06-08
source_prd: .aioson/context/prd-briefing-refiner.md
source_enrichment: .aioson/context/sheldon-enrichment-briefing-refiner.md
classification: SMALL
gate_a: approved
---

# Requirements — Briefing Refiner

## Feature Summary

Adicionar o agente `@briefing-refiner` como etapa opcional de pré-produção entre `@briefing` e `@product`, permitindo revisão humana interativa de briefings em HTML local, persistência estruturada de feedback e reaplicação confirmada no Markdown original.

O PRD não foi alterado após o enriquecimento do Sheldon; as recomendações P0/P1 foram incorporadas aqui como requisitos para evitar que decisões críticas sejam empurradas para implementação.

## Classification Result

| Criterion | Value | Score |
|---|---:|---:|
| User types | 1 primary operator role | 0 |
| External integrations | 0 | 0 |
| Business rule complexity | Complex state and artifact contracts | 2 |
| **Total** |  | **2 — SMALL** |

Depth: PRD + Sheldon enrichment + Analyst requirements/spec + scope-check + selective architecture/discovery-design-doc + dev + qa.

## New Entities and Fields

### Entity: Briefing Refinement Session

Filesystem-backed session represented by files under `.aioson/briefings/{slug}/`.

| Field | Type | Nullable | Constraints |
|---|---|---:|---|
| briefing_slug | string | no | kebab-case; must exist in `.aioson/briefings/config.md` |
| source_briefing_path | path | no | `.aioson/briefings/{slug}/briefings.md` |
| status | enum | no | `review_generated`, `feedback_pending`, `applied`, `blocked`, `stale_source` |
| review_html_path | path | no | `.aioson/briefings/{slug}/review.html` |
| feedback_path | path | no | `.aioson/briefings/{slug}/refinement-feedback.json` |
| report_path | path | no | `.aioson/briefings/{slug}/refinement-report.md` |
| source_hash | string | no | hash of `briefings.md` at review generation time |
| generated_at | datetime | no | ISO 8601 |
| last_seen_at | datetime | yes | ISO 8601 |
| applied_at | datetime | yes | ISO 8601; null until feedback is applied |

### Entity: Review Section

Structured representation of a briefing section inside the generated HTML and feedback state.

| Field | Type | Nullable | Constraints |
|---|---|---:|---|
| id | string | no | stable id, e.g. `context`, `problem`, `risks` |
| title | string | no | one of the mandatory `@briefing` sections or additional file section |
| source_path | path | no | source Markdown file |
| original_text | text | no | section text at review generation time |
| original_hash | string | no | hash of `original_text` |
| current_text | text | yes | edited plain text, if changed |
| status | enum | no | `unchanged`, `accepted`, `change_requested`, `remove_requested`, `blocked` |
| comments_count | integer | no | >= 0 |

### Entity: Refinement Feedback

Machine-consumed JSON written or exported by `review.html`, then read by `@briefing-refiner` on reentry.

| Field | Type | Nullable | Constraints |
|---|---|---:|---|
| schema_version | string | no | initial value `1.0` |
| briefing_slug | string | no | must match selected briefing |
| source_briefing_path | path | no | must point to selected `briefings.md` |
| source_hash | string | no | must match current source or trigger stale warning |
| review_generated_at | datetime | no | ISO 8601 |
| last_modified_at | datetime | no | ISO 8601 |
| export_method | enum | no | `file-system-access`, `download`, `copy-paste`, `manual-save` |
| sections | array<ReviewSection> | no | must include all mandatory briefing sections |
| comments | array<ReviewComment> | no | empty array allowed |
| decisions | array<ReviewDecision> | no | empty array allowed |
| blocking_items | array<BlockingItem> | no | empty array allowed |

### Entity: Review Comment

| Field | Type | Nullable | Constraints |
|---|---|---:|---|
| id | string | no | stable generated id |
| section_id | string | no | references `ReviewSection.id` |
| target_text_hash | string | yes | required when comment targets exact text |
| note | text | no | plain text only |
| severity | enum | no | `note`, `suggestion`, `important`, `blocking` |
| resolved | boolean | no | default false |

### Entity: Review Decision

| Field | Type | Nullable | Constraints |
|---|---|---:|---|
| id | string | no | stable generated id |
| section_id | string | no | references `ReviewSection.id` |
| original_text | text | yes | required for edit/remove decisions |
| proposed_text | text | yes | required for change decisions |
| status | enum | no | `accepted`, `change_requested`, `remove`, `blocked`, `note` |
| author_note | text | yes | plain text |
| applied | boolean | no | false until agent applies it |

### Entity: Refinement Report

Markdown audit file written by `@briefing-refiner`.

| Field | Type | Nullable | Constraints |
|---|---|---:|---|
| briefing_slug | string | no | selected briefing |
| source_briefing_path | path | no | selected `briefings.md` |
| feedback_path | path | no | feedback file consumed |
| applied_changes | list | no | may be empty in review-only mode |
| skipped_changes | list | no | may be empty |
| unresolved_comments | list | no | may be empty |
| blocking_items | list | no | may be empty |
| next_action | enum | no | `approve_briefing`, `resolve_blockers`, `rerun_review`, `route_to_product` |

## Changes to Existing Entities

### `.aioson/briefings/config.md`

Add refinement-aware metadata per briefing entry when supported.

| Field | Type | Nullable | Constraints |
|---|---|---:|---|
| refinement_status | enum | yes | `not_started`, `review_generated`, `feedback_pending`, `applied`, `blocked` |
| refinement_updated_at | datetime | yes | ISO 8601 |
| review_html | path | yes | `.aioson/briefings/{slug}/review.html` |
| refinement_report | path | yes | `.aioson/briefings/{slug}/refinement-report.md` |

Status rule:
- Existing `status: draft` remains draft after refinement.
- Existing `status: approved` with `prd_generated: null` must be treated as needing renewed approval after applied changes.
- Existing `status: implemented` or `prd_generated != null` must not be refined by default.

### Agent Registry and Routing Surfaces

The new agent must be registered consistently wherever AIOSON lists or routes official agents.

Expected surfaces include:
- `template/.aioson/agents/briefing-refiner.md`
- `.aioson/agents/briefing-refiner.md`
- root `AGENTS.md` / `CLAUDE.md` managed agent lists, if present
- template AGENTS/CLAUDE equivalents, if present
- workflow or agent command registry files that enumerate valid agents
- locale files only if this project requires localized agent aliases

## Relationships

| Source | Relationship | Target | Rule |
|---|---|---|---|
| Briefing Refinement Session | belongsTo | briefing registry entry | `briefing_slug` must exist in `.aioson/briefings/config.md` |
| Review Section | belongsTo | Briefing Refinement Session | section source must come from selected briefing files |
| Review Comment | belongsTo | Review Section | comment may target a section or exact text hash |
| Review Decision | belongsTo | Review Section | decision applies only to matching section/source hash |
| Refinement Report | belongsTo | Refinement Feedback | report summarizes exactly one feedback application pass |
| `@product` | consumes | refined briefing | only after briefing is approved/reapproved |

## Migration Additions

No database migration is required.

Ordered filesystem/template changes:
1. Add canonical agent prompt at `template/.aioson/agents/briefing-refiner.md`.
2. Mirror/sync to `.aioson/agents/briefing-refiner.md`.
3. Register agent references in AIOSON routing/documentation surfaces.
4. Add review artifact generation under `.aioson/briefings/{slug}/`.
5. Add feedback reentry/application behavior.
6. Add focused tests for agent registration, artifact paths, status transitions, and safety constraints.

## Business Rules

- REQ-BRIEFING-REFINER-001: `@briefing-refiner` must refuse to run when `.aioson/briefings/config.md` is missing or no briefing can be selected.
- REQ-BRIEFING-REFINER-002: The agent must list refinable briefings before reading or modifying one when multiple candidates exist.
- REQ-BRIEFING-REFINER-003: The agent must read `.aioson/briefings/{slug}/briefings.md` before generating or applying any review artifact.
- REQ-BRIEFING-REFINER-004: The generated `review.html` must be local/static and must not require a server or external service.
- REQ-BRIEFING-REFINER-005: `review.html` must keep editable text plain or sanitized; rich pasted formatting must not become canonical feedback.
- REQ-BRIEFING-REFINER-006: `review.html` must detect file-write capability and provide export/copy fallback when direct save is unavailable or denied.
- REQ-BRIEFING-REFINER-007: `@briefing-refiner` must consume `refinement-feedback.json` or explicit exported JSON content as the source of feedback, never the edited HTML DOM.
- REQ-BRIEFING-REFINER-008: Feedback application must require explicit user confirmation in the agent harness.
- REQ-BRIEFING-REFINER-009: Applied feedback must preserve all mandatory briefing sections: Context, Problem, Proposed solution, Themes, Risks, Identified gaps, Sources, Open questions.
- REQ-BRIEFING-REFINER-010: If `briefings.md` changed after review generation, the agent must warn and refuse automatic application until the user confirms how to reconcile.
- REQ-BRIEFING-REFINER-011: If feedback contains blocking items, the final handoff must not say the briefing is ready for `@product`.
- REQ-BRIEFING-REFINER-012: If an approved briefing is changed, it must require renewed approval before `@product` consumes it.
- REQ-BRIEFING-REFINER-013: If `prd_generated` is non-null, refinement must refuse by default and route to PRD enrichment or a new feature discussion.
- REQ-BRIEFING-REFINER-014: `@briefing-refiner` must never create or edit `prd*.md`.
- REQ-BRIEFING-REFINER-015: `@dev` must not consume `.aioson/briefings/` directly; downstream implementation starts from PRD/requirements/spec/design artifacts.
- REQ-BRIEFING-REFINER-016: Agent prompt edits must be template-first and preserve template/workspace parity.
- REQ-BRIEFING-REFINER-017: Session-end observability must follow the agent structural contract: `pulse:update` before `agent:done`.

## Acceptance Criteria

- AC-BRIEFING-REFINER-001: Given no `.aioson/briefings/config.md`, activating `@briefing-refiner` reports that a briefing must be created first and writes no review artifacts.
- AC-BRIEFING-REFINER-002: Given multiple draft/approved-unimplemented briefings, the agent presents the candidates and waits for selection before generating `review.html`.
- AC-BRIEFING-REFINER-003: Given a selected briefing, the agent creates `.aioson/briefings/{slug}/review.html`, `.aioson/briefings/{slug}/refinement-feedback.json`, and `.aioson/briefings/{slug}/refinement-report.md`.
- AC-BRIEFING-REFINER-004: Generated `review.html` shows mandatory briefing sections, status controls, comments/notes, blocking indicators, and a clear summary of what will be done vs unresolved.
- AC-BRIEFING-REFINER-005: Editing a section in `review.html` updates structured feedback state with section id, original hash, proposed text, status, and modified timestamp.
- AC-BRIEFING-REFINER-006: If file-write APIs are unavailable or denied, `review.html` exposes a download/copy/export path for `refinement-feedback.json`.
- AC-BRIEFING-REFINER-007: On reentry with pending feedback, the agent summarizes proposed changes and blocking items before asking for confirmation.
- AC-BRIEFING-REFINER-008: If the user declines application, `briefings.md` remains unchanged and `refinement-report.md` records skipped changes.
- AC-BRIEFING-REFINER-009: If the user confirms application, `briefings.md` is updated and still contains every mandatory `@briefing` section.
- AC-BRIEFING-REFINER-010: If current `briefings.md` hash differs from feedback `source_hash`, the agent warns about stale feedback before applying.
- AC-BRIEFING-REFINER-011: If feedback has unresolved blocking items, the report sets next action to `resolve_blockers` and the handoff does not route directly to `@product`.
- AC-BRIEFING-REFINER-012: If an approved briefing is modified, the briefing is marked as requiring renewed approval before `@product` can generate a PRD.
- AC-BRIEFING-REFINER-013: If a briefing has `prd_generated` set, the agent refuses default refinement and explains the correct route.
- AC-BRIEFING-REFINER-014: No `prd*.md` file is created or edited by `@briefing-refiner`.
- AC-BRIEFING-REFINER-015: The new agent file exists in both `template/.aioson/agents/` and `.aioson/agents/`, with parity verified after sync.
- AC-BRIEFING-REFINER-016: Agent command/routing registries recognize `briefing-refiner` as a valid official agent.
- AC-BRIEFING-REFINER-017: Focused tests cover artifact generation, feedback reentry, status transitions, stale source detection, and no-PRD/no-auto-approval constraints.

## Edge Cases

- Empty or malformed `briefings.md`.
- Briefing registry exists but selected slug directory is missing.
- Additional briefing files exist and contain overlapping sections.
- User edits the HTML but forgets to export/save feedback.
- Feedback JSON is invalid, from another slug, or from another source hash.
- Browser supports `contenteditable` but not file-write APIs.
- User tries to refine an already implemented briefing.
- User marks all sections accepted but leaves blocking comments unresolved.
- Section target text changed between review generation and application.
- Generated HTML is opened from a filesystem path with restricted browser behavior.

## Out of Scope for This Feature

- Building a dashboard or server-backed review app.
- Multi-user concurrent review.
- External annotation services.
- Automatic PRD generation or PRD modification.
- Changing `@dev` to read briefing artifacts.
- Refactoring the entire briefing lifecycle beyond the minimum status metadata needed for refinement.

## Gate A Evaluation

- Objectives are clear and unambiguous: yes.
- Expected behaviors are described: yes.
- Constraints and out of scope are explicit: yes.
- Open ambiguities are documented: yes, primarily around implementation details for status naming and save mechanism.
- Requirement IDs exist: yes.
- Acceptance criteria exist and are independently verifiable: yes.

Gate A: approved.
