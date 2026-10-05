# Local runtime storage

AIOSON uses one local database per clone: `.aioson/runtime/aios.sqlite`. It remains gitignored, is not shipped by
`aioson update`, must not be versioned, and needs no server. Each developer owns their operational runtime; shared
project history remains in versioned feature, learning, brain, rule, documentation, dossier, and plan files.

## What uses SQLite

| Command family | Main state | Current value | Retention |
|---|---|---|---|
| `runtime:*`, `live:*`, `agent:done`, `agent:recover` | `tasks`, `agent_runs`, events, artifacts | sessions, parent/child tasks, handoffs, observability | active work is protected; terminal history expires |
| `agent:execution:*` and dispatcher | `agent_execution_runs/events` | process/model/state and bounded safe output | raw output: dropped when its feature closes, otherwise 14 days; runs: 30 days without activity, whatever their last state |
| `runner:queue*`, `runner:daemon` | `runner_queue` | local queue and model fallback | pending/running is protected; terminal rows expire |
| `chain:*` | `chain_edges`, `chain_work_items` | relationships and the claimed causal queue | actionable work items are never pruned |
| `squad:*` | handoffs, events, plans, workers, catalogs, metrics | squad coordination | in-flight state and configuration are protected |
| squad outputs | `content_items` | local index of files under `output/{slug}/` | rows with `source_path` expire; files and legacy source-less rows remain |
| learning, memory, evolution | learnings and `evolution_log` | knowledge retrieval/materialization | never pruned by runtime maintenance |

Runner `cascade` currently means fallback/escalation between models. Plan import records phase ordering in text and
priority, but does not yet maintain an executable task-dependency graph.

## What is kept and what is feature-scoped

| Kind | Tables | Lifetime |
|---|---|---|
| Durable knowledge | `artifacts`, `project_learnings`, `squad_learnings`, `evolution_log`, `chain_edges`, `implementation_plans`, `plan_phases`, squad catalogs and configuration | kept; never pruned |
| Open coordination | open `chain_work_items`, pending `runner_queue`, unresolved `squad_handoffs` | kept while open |
| Raw lane output | `agent_execution_events` with `event_type = 'output'` | only useful while the feature is in flight: removed at `feature:close` (any verdict) |
| Run history | `agent_execution_runs` and their lifecycle events | 30 days |
| Session telemetry | `execution_events`, `agent_events`, terminal `agent_runs` and `tasks` | 30 days |

Raw output is the biggest family by far, so most of the size belongs to the feature being built and goes away when it closes.

## Lifecycle maintenance (automatic)

`feature:close` runs the lifecycle at the end of every closure (PASS, FAIL or ACCEPTED_WITH_FOLLOWUPS) and reports it as
a `runtime db:` line. It removes the closed feature's raw lane output, applies the retention table above and runs `VACUUM`
when free pages are at least 8 MB and 25% of the file. Deleted rows never shrink `aios.sqlite` on their own; only `VACUUM`
returns the space to the disk. A run whose engine died stays in `running` or `correcting` forever, so retention looks at
how long a run has gone without activity, whatever its last state says.

Only work that moved in the last 120 minutes counts as live and holds compaction back. Rows a dead session left in an
active status are reported as `stale` by `runtime:storage`; `aioson agent:recover .` marks them abandoned so they expire.

`aioson doctor .` reports `runtime:db_health` (advisory). It warns when free pages pass that threshold or when the live
data passes 64 MB. `aioson doctor . --fix` prunes and compacts.

## Diagnostics and maintenance

```bash
aioson runtime:storage . --json
aioson runtime:prune . --dry-run --older-than=30 --output-older-than=14 --json
aioson runtime:prune . --older-than=30 --output-older-than=14 --compact --json
aioson runtime:compact . --json
```

Storage diagnostics and dry-run are read-only. Pruning removes expired telemetry and terminal local history while
protecting active coordination and durable knowledge. Compaction runs `quick_check`, a checkpoint, and `VACUUM`;
it refuses live work (activity in the last 120 minutes) unless the operator explicitly uses `--force`.
File-backed content index rows are rebuildable with `aioson runtime:ingest . --squad={slug}`; pruning never deletes
the output files.

`aioson update` opens and additively migrates the same database. It creates no second database and performs no
automatic destructive cleanup. Neo may diagnose, preview, and execute only these guarded commands after an explicit
operator request.

Project-owned files with new names under `.aioson/docs/` and `.aioson/rules/` survive updates. Framework files that
also exist in the template are managed and backed up before replacement, so project rules and docs should use separate
filenames. `.aioson/config/*.json` is additively merged and `.aioson/config.md` is local managed configuration.
`.aioson/constitution.md` and versioned `.aioson/context/` content are protected from update replacement.

New telemetry output is coalesced into bounded same-stream chunks (up to 16 KB), preserving order, secret redaction,
and the 1 MB per-execution cap while sharply reducing SQLite row and index growth. New execution bridges also prune
raw output older than 14 days and executions without activity for 30 days in bounded batches.

## Browser evidence on disk

Outside SQLite, the visual and browser gates leave regenerable binaries beside their reports: captures under
`.aioson/context/features/{slug}/visual-screenshots/` (from `verify:artifact --kind=visual --screenshots`) and per-step
snapshots under `.aioson/briefings/{slug}/browser/{script}/` or `.aioson/context/features/{slug}/browser/{script}/` (from
`browser:run`). They are not the evidence — the JSON and Markdown reports next to them are — and every report carries the
line that regenerates its folder. Producers replace what they wrote once a run has measured (a capture run narrowed by
`--route` keeps its sibling captures), the installer's `.gitignore` policy keeps
them out of the repository, `feature:archive` drops them when a feature closes (`--keep-diagnostics` archives them),
`hygiene:scan` lists what is orphaned or heavy under `heavy_evidence_artifacts`, and `aioson evidence:prune . --dry-run`
previews what `aioson evidence:prune .` removes (orphans by default; `--all` for every capture; `--slug` for one owner).
