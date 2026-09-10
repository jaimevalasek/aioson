# Local runtime storage

AIOSON uses one local database per clone: `.aioson/runtime/aios.sqlite`. It remains gitignored, is not shipped by
`aioson update`, must not be versioned, and needs no server. Each developer owns their operational runtime; shared
project history remains in versioned feature, learning, brain, rule, documentation, dossier, and plan files.

## What uses SQLite

| Command family | Main state | Current value | Retention |
|---|---|---|---|
| `runtime:*`, `live:*`, `agent:done`, `agent:recover` | `tasks`, `agent_runs`, events, artifacts | sessions, parent/child tasks, handoffs, observability | active work is protected; terminal history expires |
| `agent:execution:*` and dispatcher | `agent_execution_runs/events` | process/model/state and bounded safe output | terminal output: 14 days; stale terminal/paused execution: 30 days |
| `runner:queue*`, `runner:daemon` | `runner_queue` | local queue and model fallback | pending/running is protected; terminal rows expire |
| `chain:*` | `chain_edges`, `chain_work_items` | relationships and the claimed causal queue | actionable work items are never pruned |
| `squad:*` | handoffs, events, plans, workers, catalogs, metrics | squad coordination | in-flight state and configuration are protected |
| squad outputs | `content_items` | local index of files under `output/{slug}/` | rows with `source_path` expire; files and legacy source-less rows remain |
| learning, memory, evolution | learnings and `evolution_log` | knowledge retrieval/materialization | never pruned by runtime maintenance |

Runner `cascade` currently means fallback/escalation between models. Plan import records phase ordering in text and
priority, but does not yet maintain an executable task-dependency graph.

## Diagnostics and maintenance

```bash
aioson runtime:storage . --json
aioson runtime:prune . --dry-run --older-than=30 --output-older-than=14 --json
aioson runtime:prune . --older-than=30 --output-older-than=14 --compact --json
aioson runtime:compact . --json
```

Storage diagnostics and dry-run are read-only. Pruning removes expired telemetry and terminal local history while
protecting active coordination and durable knowledge. Compaction runs `quick_check`, a checkpoint, and `VACUUM`;
it refuses active work unless the operator explicitly uses `--force` after verifying those records are stale.
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
terminal raw output older than 14 days and stale terminal/paused executions older than 30 days in bounded batches.

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
