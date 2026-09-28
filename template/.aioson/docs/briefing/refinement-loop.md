---
description: Deterministic Refiner audit, browser-review, feedback application, and terminal-state loop
agents: [refiner]
task_types: [briefing-review, feedback-application]
triggers: [generate briefing review, pending refinement feedback, apply briefing feedback]
---

# Briefing Refinement Loop

Filesystem state chooses the operation. A generated browser review or explicit-confirmation request is a terminal state for the activation; never spin while waiting.

## Eligibility probe

A briefing is refinable when `status: draft`, or when `status: approved` and no PRD exists for the slug. Check both the registry marker (`prd_generated`) and the filesystem — `.aioson/context/prd-{slug}.md`, or `prd.md` naming the slug; the file check is authoritative because the registry marker has no automatic writer. Refining after a PRD exists would silently desync briefing and PRD, which is why post-PRD changes route through `@product` with the mandatory `@sheldon` re-review.

## Generate a review

Use when `refinement-feedback.json` is absent or the user explicitly requests regeneration.

1. Read the current `briefings.md`.
2. Load `.aioson/docs/feature-completeness-contract.md` as a review lens. Challenge ambiguity, redundancy, missing decisions, unclear risks, vague questions, inconsistent terms, vanished promises, happy-path-only behavior, broad nouns/verbs, failure/recovery, and current-system assumptions contradicted by repository evidence. Apply operational CRUD/list/form/filter/pagination lenses only when operational management is relevant.
3. Before writing findings, for rich operational or experiential scope, prior scout evidence, or an explicit enrichment request, load `.aioson/skills/process/briefing-expansion-scout/SKILL.md`. Assess existing ideas and discover overlooked user value independently; update the scout only when evidence or conclusions change. A game needs an experience walkthrough, not only a list of screens. Then write `.aioson/briefings/{slug}/refinement-findings.json` as a JSON array:

```json
[
  {
    "id": "F1",
    "section_id": "problem",
    "category": "pending-decision",
    "severity": "high",
    "blocking": true,
    "text": "<specific evidence-backed decision>",
    "question": "<plain-language question>",
    "selection_mode": "single",
    "options": [
      {
        "id": "recommended-path",
        "label": "<short visible label>",
        "description": "<what this choice means>",
        "impact": "<concrete trade-off>",
        "recommended": true,
        "evidence_refs": ["<repository or research path>"]
      },
      {
        "id": "alternative-path",
        "label": "<short visible label>",
        "description": "<what this choice means>",
        "impact": "<concrete trade-off>",
        "recommended": false,
        "evidence_refs": []
      }
    ],
    "selected_option_ids": [],
    "rationale": "",
    "evidence_refs": []
  }
]
```

Allowed categories: `ambiguity`, `redundancy`, `gap`, `risk`, `pending-decision`, `scope-suggestion`. Allowed severities: `low`, `medium`, `high`. Use `blocking: true` only when Product cannot responsibly write the PRD without resolution. `section_id` is the section-title kebab case.

Material choices use two to four legitimate alternatives. Use `single` for mutually exclusive paths and `multiple` only for independent compatible choices. Labels, descriptions and impacts must explain real differences; never add fake alternatives to make the card look complete. A finding with no real choice may keep the legacy `recommendation` shape and receives visible accept/change/defer actions.

For existing-system fit, include observed behavior and exact repository paths in `text`. Routine evidence-backed corrections belong in `recommendation`, not in a new user question.

If a visible surface lacks briefing- or project-level `identity.md` and no choice is already recorded, add at most one non-blocking `pending-decision` offering a reusable design system: create from references, consolidate from the prototype's accepted direction without references, or decide later. Explain that this saves colors, typography, spacing, and component rules for later screens; the client need not know the filename. Use stable option IDs `identity-references`, `identity-intent`, and `identity-later`. Follow the offer in `prototype-and-delegation.md`; an accepted, confirmed applied decision answers it, so do not ask again. A pending or merely recommended option is not authorization. Never force identity creation or block the review on it.

4. Translate the strongest unresolved scout candidates into actionable review findings before generation. Use nonblocking `scope-suggestion` for optional value, and `gap` or `pending-decision` with `blocking: true` only when a cited promised outcome cannot be responsibly specified without resolution. Explain the before/after benefit, downside and evidence or hypothesis in the existing fields; use two to four credible choices, including keeping the simpler baseline when viable. Leave `selected_option_ids` empty: `recommended: true` is advice, not consent. Cite `expansion-scout.md` and the relevant user intent; never fabricate a source promise for an agent idea. Do not manufacture findings when no useful proposal survives, or reopen accepted/rejected/deferred decisions without new evidence. Preserve enough accepted evidence for Product's future capability map without assigning `CAP-*`.
5. Generate deterministically:

```bash
aioson briefing:review . --slug={slug} --locale=<interaction_language> --json
```

Fix and rerun `invalid_findings`. On `pending_feedback`, stop and apply it first; pass `--force` only after the user explicitly discards pending feedback.
6. Run the kernel review-intelligence checkpoint, then hand off the browser artifact and stop.

The CLI owns `review.html`; do not hand-write it unless genuinely unavailable.

## Apply pending feedback

Use when `.aioson/briefings/{slug}/refinement-feedback.json` exists.

1. If the user pasted exported JSON, write it verbatim to the canonical feedback path.
2. Read the round through `aioson briefing:feedback . --slug={slug}` first — the lean view: every finding, comment, decision and blocking item, plus the text of only the sections a note or a status change touches. The raw JSON carries the whole briefing twice (`original_text` and `current_text` for every section); never read it end to end. Incorporate accepted findings and decision-bearing notes into the target section's `current_text` with a surgical edit of the named sections only. The CLI writes only `current_text`; notes alone never reach `briefings.md`. When text still equals `original_text`, fold in the decision/rationale, mark a resolved open question, and set the section to `change_requested`. Edit only feedback JSON. Ask instead of guessing an ambiguous note.
3. Dry-run:

```bash
aioson briefing:apply-feedback . --slug={slug} --json
```

Show changed/blocked sections, finding decisions, pending blockers, and every note incorporated into text. A dry-run never writes `briefings.md`. For stale feedback, default to regeneration; offer `--allow-stale` only if the user insists.
4. Stop for explicit confirmation.
5. On confirmation:

```bash
aioson briefing:apply-feedback . --slug={slug} --confirm --json
```

The CLI applies structured JSON, preserves mandatory sections, reverts `approved` to `draft` when needed, archives round inputs, and records `next_action`.

After confirmed apply, read `.aioson/docs/briefing/review-authority.md`. Only valid accepted selections (or a valid legacy accepted recommendation) from the exact applied archive become downstream authority; pending, rejected, deferred, merely recommended, malformed or stale material remains nonbinding.
6. On decline:

```bash
aioson briefing:apply-feedback . --slug={slug} --declined --json
```

The briefing stays unchanged; the CLI records skipped changes and archives `refinement-feedback.declined-round{N}.json`.

## Decide after apply

- `next_action: resolve_blockers` or materially changed briefing → create at most one fresh review, then stop for browser feedback.
- `next_action: build_prototype` → the briefing has visual scope but no owned prototype and no `prototype: not_applicable` declaration; run the prototype route before reporting readiness — `briefing:approve` refuses while it is unresolved.
- No blockers and no substantive open questions → report readiness for user approval and Product.
- Unchanged text with no new evidence → do not regenerate.

Never exit by hand-editing `briefings.md`.

## Round-owned outputs

Generation:

```text
refinement-findings.json
review.html
refinement-feedback.json
refinement-report.md
```

Application may archive:

```text
refinement-feedback.applied-round{N}.json
refinement-findings.applied-round{N}.json
refinement-feedback.declined-round{N}.json
```

All paths are under `.aioson/briefings/{slug}/`.
