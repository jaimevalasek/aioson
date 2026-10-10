---
description: Guarded feature-lifecycle maintenance for Neo — close what QA passed, pause or abandon what went quiet, archive what is closed, normalize the index
agents: [neo]
task_types: [feature-lifecycle, local-maintenance, hygiene-triage]
triggers: [stuck features, abandoned features, paused features, features never closed, unarchived features, clean features.md, feature cleanup, features paradas, features abandonadas, features pausadas, fechar features, arquivar features, limpar features]
---

# Neo Feature Lifecycle

Load this module when the operator asks to clean, close, pause, abandon or archive features, or when
`hygiene:scan` reports `features_ready_to_close`, `stale_features`, `feature_status_aliases` or
`done_features_pending_archive` and the operator wants them resolved. Neo acts only through
`aioson feature:triage`, which measures every row and refuses any decision its evidence does not support.

## Boundaries

- Never edit `features.md`, `project-pulse.md` or `dev-state.md`, and never move or delete a feature file by hand.
- Never write `done` through `feature:register`; delivery is closed only by `feature:close` and its gates.
- Never pass `--force` to `feature:close`. A blocked close is reported with its blockers; bypassing them is the
  operator's own command, typed by the operator.
- Never pause or abandon the active feature unless the operator names it; only then add `--include-active`.
- A stale finding is a question, not a verdict: quiet work may be waiting on the operator, not forgotten.

## Procedure

1. Diagnose read-only:

   `aioson feature:triage . --json`

2. Present two groups, counts first, one line per feature (slug, status, evidence):

   - **Mechanical** (`decides: auto`): status spellings no reader matches (`status_alias`), closed features whose
     files are still in the live context (`closed_not_archived`), a pulse naming a closed feature (`active_is_closed`).
     No judgment involved — one approval covers all of them.
   - **Owner decisions** (`decides: owner`): `ready_to_close` (QA passed, row still open), `stale_open` and
     `stale_paused` (no artifact activity past the threshold), `unknown_status`, `active_not_registered`.

3. Ask once, using the decision-presentation skill: approve the mechanical fixes, and for each owner item choose
   close, pause, abandon, resume, or keep as is. A request such as "clean the features now" approves the mechanical
   group only; owner items still need the operator's choice per feature.
4. Preview what was approved without touching anything:

   `aioson feature:triage . --apply --close=<a,b> --pause=<c> --abandon=<d> --resume=<e> --dry-run`

   A refusal means the evidence contradicts the choice (no current QA PASS, spec changed after QA, active feature,
   wrong status). Report it; nothing ran.
5. Execute exactly the approved scope (same command without `--dry-run`).
6. Report what changed (rows rewritten, features archived, closes done) and every close that stayed blocked, with
   its blockers and `aioson feature:close . --feature=<slug> --verdict=<verdict> --preflight`.

## Routing after maintenance

- `ready_to_close` with `changed_after_qa: true`, or a close blocked by missing evidence → `@qa` re-verifies.
- A resumed or kept open feature → `@dev` (or `aioson workflow:next .`).
- A choice that needs product scope (split, rescope, replace) → `@product`.

Do not route to another agent merely to run these commands. After maintenance, re-run `aioson feature:triage .`,
show the remaining counts, and return to Neo's normal read-only routing behavior.
