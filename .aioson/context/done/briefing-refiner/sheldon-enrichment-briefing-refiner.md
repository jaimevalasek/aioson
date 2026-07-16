---
target_prd: .aioson/context/prd-briefing-refiner.md
feature_slug: briefing-refiner
round: 1
created_at: 2026-06-08
agent: sheldon
sizing_score: 4
sizing_decision: "Path A — enrich PRD in place; add Delivery plan if user confirms"
plan_path: null
sources_used:
  - .aioson/context/prd-briefing-refiner.md
  - .aioson/context/features/briefing-refiner/dossier.md
  - .aioson/brains/sheldon/architecture-decisions.brain.json
  - researchs/file-system-access-api-2026/summary.md
  - researchs/local-html-editable-review-ui-2026/summary.md
improvements_applied: []
improvements_pending_confirmation:
  - Add persistence fallback requirement for review.html
  - Add refinement-feedback.json schema contract
  - Add approved-briefing status rule
  - Add delivery plan section
improvements_discarded: []
readiness: ready_for_analyst_with_pending_product_decisions
---

# Sheldon Enrichment — Briefing Refiner

## Verdict

O PRD está válido para seguir para `@analyst`, mas ainda tem decisões de contrato que precisam ser fechadas antes de implementação.

Recomendação: manter a feature como SMALL, enriquecer o PRD em-place e adicionar um `## Delivery plan` curto. Não há necessidade de plano faseado externo em `.aioson/plans/`.

## Sizing

Score: 4 → Path A.

- Main entities above 3: +1
- Distinct delivery phases above 1: +2
- External integrations: +0
- User flows above 3: +1
- AC complexity above 10: +0 neste estágio

Justificativa: a feature cria um agente e três artefatos principais (`review.html`, `refinement-feedback.json`, `refinement-report.md`). O risco é de contrato e estado, não de volume de módulos.

## Critical Gaps

### P0 — Persistence contract for `review.html`

Decision needed: `review.html` must treat direct file write as progressive enhancement, not as the only save path.

Recommended PRD delta:
- Add must-have: `review.html` must detect whether browser file-write APIs are available.
- Add must-have: when direct save is unavailable or denied, the HTML must provide export/import or copy/paste flow for `refinement-feedback.json`.
- Add acceptance boundary: agent reentry consumes only structured feedback, never edited DOM/HTML as source of truth.

Why: current browser file access requires explicit user permission and is not a silent local write path. Source: `researchs/file-system-access-api-2026/summary.md`.

### P0 — Approved briefing mutation rule

Decision needed: define what happens when `@briefing-refiner` changes an already approved briefing.

Recommended PRD delta:
- If a `draft` briefing is refined, it remains `draft`.
- If an `approved` briefing is refined and `prd_generated` is still null, status should return to `draft` or `needs_reapproval` before `@product`.
- If `prd_generated` is not null, refinement must refuse by default and route to a new feature/PRD enrichment flow.

Why: without this rule, `@product` may consume a briefing whose approval predates the refinements.

### P0 — Feedback schema contract

Decision needed: define the minimum machine-readable schema for `refinement-feedback.json`.

Recommended required fields:
- `schema_version`
- `briefing_slug`
- `source_briefing_path`
- `review_generated_at`
- `last_modified_at`
- `sections[]`
- `comments[]`
- `decisions[]`
- `blocking_items[]`
- `export_method`

Recommended item fields:
- `id`
- `section`
- `target_text_hash`
- `original_text`
- `proposed_text`
- `status`: `accepted | change_requested | remove | blocked | note`
- `author_note`
- `applied`: boolean

Why: the agent needs stable targets and explicit statuses to avoid applying free-form edits incorrectly.

## Important Improvements

### P1 — Editing model should prefer plain text blocks

Recommended PRD delta:
- Use `contenteditable="plaintext-only"` where possible.
- Capture changes via `input` events.
- Treat `beforeinput` only as optional enhancement.
- Sanitize pasted content before writing feedback state.

Why: `contenteditable` is viable, but rich paste and incomplete `beforeinput` coverage can corrupt structured Markdown review. Source: `researchs/local-html-editable-review-ui-2026/summary.md`.

### P1 — Agent file/template parity

Recommended PRD delta:
- Implementation must add the new agent prompt in `template/.aioson/agents/briefing-refiner.md` first, then sync or mirror to `.aioson/agents/briefing-refiner.md`.
- Routing docs and AGENTS/CLAUDE agent lists must reference the same canonical name.

Why: AIOSON agent prompts are template-owned; editing only workspace `.aioson/agents/` will be lost on sync.

### P1 — Refinement report should separate applied vs unresolved

Recommended PRD delta:
- `refinement-report.md` must include: applied changes, skipped changes, unresolved comments, blocking items, and next action.
- Blocking items must prevent the handoff from saying "ready for @product".

Why: the report is the human/audit bridge between HTML review and Markdown mutation.

### P1 — Source boundaries

Recommended PRD delta:
- `refinement-feedback.json` belongs under `.aioson/briefings/{slug}/`, not `.aioson/context/`.
- `.aioson/context/` remains Markdown-first; only PRD/enrichment/requirements artifacts go there.

Why: project rule `aioson-context-boundary` prohibits arbitrary JSON under `.aioson/context/`.

## Refinements

- Add a "review-only" mode acceptance criterion: generated HTML/report with no modification to `briefings.md`.
- Add a "dirty feedback" criterion: if feedback JSON has unapplied changes, reentry must summarize before applying or overwriting.
- Add a "missing source" criterion: if the source `briefings.md` changed after `review.html` generation, the agent must warn before applying feedback.
- Add a "no PRD creation" criterion: `@briefing-refiner` must never write `prd*.md`.

## Suggested Delivery Plan

Add this to the PRD only after user confirmation.

### Phase 1 — Agent contract and routing
- Create `@briefing-refiner` prompt with language boundary, required inputs, output contract, hard constraints, feature dossier, and handoff.
- Register the agent in canonical agent lists and natural-language routing docs.
- Ensure template/workspace parity.

### Phase 2 — Review artifact generator
- Implement generation contract for `review.html`.
- Produce initial structured `refinement-feedback.json`.
- Produce preliminary `refinement-report.md`.
- Support review-only mode.

### Phase 3 — Feedback reentry and briefing update
- Detect pending feedback.
- Summarize proposed changes.
- Apply only after confirmation.
- Update `briefings.md` while preserving mandatory sections.
- Write final `refinement-report.md`.

### Phase 4 — Workflow/status integration
- Define approved-briefing mutation behavior.
- Update handoff copy: briefing refined → approve → `@product`.
- Add tests for routing, artifact paths, status handling, and no-PRD/no-auto-approval constraints.

## Sources

- `researchs/file-system-access-api-2026/summary.md` — browser file write is permissioned and needs fallback.
- `researchs/local-html-editable-review-ui-2026/summary.md` — editable HTML is viable with `contenteditable` and `input`; `beforeinput` is not sufficient alone.
- `.aioson/brains/sheldon/architecture-decisions.brain.json` — template/workspace parity and classification depth.

## Decision Required

Recommended: apply P0/P1 deltas to the PRD in-place, including the suggested delivery plan.

Alternative: leave PRD unchanged and let `@analyst` translate these recommendations into requirements. This is faster now, but pushes product-contract decisions downstream.
