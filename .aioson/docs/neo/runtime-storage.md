---
description: Guarded local SQLite diagnosis, retention preview, pruning, and compaction for Neo — plus the regenerable browser evidence on disk
agents: [neo]
task_types: [runtime-storage, local-maintenance, telemetry-retention]
triggers: [aios.sqlite large, runtime database size, remove old runtime data, prune, compact, screenshots taking space, visual-screenshots, walkthrough artifacts]
---

# Neo Runtime Storage

Load this module only for an explicit runtime-storage request. The database is local and disposable as a whole,
but active coordination inside it is not disposable while work is in progress.

## Boundaries

- Keep `.aioson/runtime/aios.sqlite` local and gitignored. Never propose versioning, uploading, or sharing it.
- Never run direct SQL. Use only the maintenance CLI below.
- Never delete durable project-memory files (`features`, `learnings`, `brains`, `rules`, `docs`, dossiers, or plans).
- Never delete squad files under `output/`; old `content_items` rows with a registered `source_path` are only a rebuildable local index.
- Pruning preserves active tasks/runs, paused executions inside the retention window, pending/running runner items, actionable Neural Chain work items,
  unresolved handoffs, artifacts, learnings, plans, and catalog/configuration rows.
- Preserve legacy `content_items` rows without `source_path` until their database-only payload has been exported to files.
- `--force` is forbidden unless the operator explicitly confirms that reported active runtime records are stale.

## Procedure

1. Diagnose read-only:

   `aioson runtime:storage . --json`

2. If cleanup is useful, preview exact policy targets without deleting:

   `aioson runtime:prune . --dry-run --older-than=30 --output-older-than=14 --json`

3. Show database size, dominant category, eligible direct rows, protected active counts, retention windows, and whether physical compaction is useful.
4. If the operator has not already explicitly requested execution, ask for confirmation once. A request such as "remove old runtime data now"
   is sufficient approval after the preview; a generic `@neo` activation is not.
5. Execute only the approved scope:

   - Cleanup: `aioson runtime:prune . --older-than=30 --output-older-than=14 --json`
   - Cleanup plus disk reclamation: add `--compact`.
   - Compaction without deletion: `aioson runtime:compact . --json`.

6. Report rows removed per table, bytes reclaimed, skipped compaction, and any integrity/locking error.

## Evidence artifacts on disk

The visual and browser gates leave regenerable binaries beside their reports: runtime captures under
`.aioson/context/features/{slug}/visual-screenshots/` (from `verify:artifact --kind=visual --screenshots`) and
per-step snapshots under `.aioson/briefings/{slug}/browser/{script}/` or `.aioson/context/features/{slug}/browser/{script}/`
(from `browser:run`). They are not the evidence — the JSON and Markdown reports next to them are — and every report carries
the line that regenerates its folder. The producers replace what they wrote once a run has measured (a capture run narrowed
by `--route` keeps its sibling captures), `feature:archive` drops the binaries when a feature closes, and `hygiene:scan`
lists what is orphaned or heavy under `heavy_evidence_artifacts`.

- Preview: `aioson evidence:prune . --dry-run` (add `--slug={slug}` for one owner). Orphans — files the latest report no
  longer references — are the default scope; `--all` removes every capture and snapshot, never a report.
- Execute only on an explicit request, after showing the preview: `aioson evidence:prune .` or `aioson evidence:prune . --all`.
- Never delete the reports (`visual-evidence.json`, `browser/{script}.json|.md`) or anything outside these folders.

Do not route to another agent merely to run these commands. After maintenance, return to Neo's normal read-only routing behavior.
