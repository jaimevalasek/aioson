# What is the Active Learning Loop

## The problem

AIOSON already knew how to learn. After each session, `project_learnings` accumulates observations: detected patterns, corrected errors, decisions made. But there was a gap: those learnings rarely became active rules. Distillation existed as a manual command that few people ran. Existing rules accumulated without anyone knowing which ones were still consulted.

The practical result: after N features, the project's memory was full of learnings that never closed the loop — neither became usable rules nor were archived. The `doctor` had no visibility into the problem. Agents kept reading rules that nobody had validated in months.

Active Learning Loop closes that arc.

## What the feature does

Four new surfaces, interconnected:

**1. Load telemetry** — agents explicitly declare "I loaded this rule/brain" via `aioson context:load`. The CLI records a `rule_loaded` or `brain_loaded` event in `execution_events`. Silent, tier-1. The doctor uses that signal later.

**2. Memory search** — `aioson memory:search "JWT authentication"` performs BM25 search over the title and evidence of all active learnings. No configuration, no embeddings, no LLM call — native SQLite FTS5.

**3. Archive with traceability** — `aioson memory:archive --id=rule:my-rule --reason="replaced by X"` moves the physical file to `.aioson/rules/_archived/YYYY-MM-DD/` and writes a pair of rows to `evolution_log`: the previous active entry receives `end_at`, a new entry documents the reason. Append-only — history never changes. `memory:restore` reverses the process if needed.

**4. Automatic distillation in `feature:close`** — when you close a feature with `--verdict=PASS`, the CLI runs `runDistillation()` in the foreground (5s timeout), promotes learnings that crossed the threshold, emits a notification with the summary, and records the result in `evolution_log`. If it fails for any reason, the `feature:close` exit code remains 0 — distillation is best-effort.

## The 6 phases

### Phase 1 — telemetry-foundation

New CLI verb: `aioson context:load`. Agents call this command when they load a rule or brain at the start of a session. The event goes to `execution_events` as `rule_loaded` or `brain_loaded`, with payload: slug, agent, associated feature (optional).

The verb supports `--batch="rule-a,rule-b,rule-c"` to minimize calls when an agent loads multiple rules at once.

No visible change in agent behavior — it's silent telemetry. The value appears in phases 4 and 5.

### Phase 2 — memory-search-fts5

New verb: `aioson memory:search "<query>"`. Creates an FTS5 virtual table (`project_learnings_fts`) over `project_learnings`, synchronized via SQL triggers (INSERT/UPDATE/DELETE). BM25 ranking by default.

Query sanitization: each token (whitespace-separated) becomes a quoted phrase ANDed with the others. FTS5 operator characters (`*()^:+-"`) are stripped. Queries that result in an empty string return `{ ok: false, reason: 'query_unparseable' }` without error. 500-character limit.

Archived entries are excluded by default; `--include-archived` includes them.

### Phase 3 — memory-archive-with-evolution-log

Two new verbs: `memory:archive` and `memory:restore`.

`memory:archive` is tier-2 (notified): emits `aioson notify --level=warn` before any mutation, moves the physical file to `_archived/YYYY-MM-DD/`, and writes two rows to `evolution_log` — `end_at` on the previous active entry, a new entry with the reason. The operation is atomic: if the DB write fails after the physical move, the file is restored (FS rollback).

`--dry-run` simulates the entire operation without side effects.

`memory:restore` reverses it: moves the file back, writes `event_type='restored'` to `evolution_log`.

**Tier-2 human-only**: both `memory:archive` and `memory:restore` refuse execution when `AIOSON_RUNTIME_HOOK=1` is set (automated hook environment). These operations are intentionally restricted to humans.

### Phase 4 — doctor-curation-checks

Three new checks in `aioson doctor`, with `severity='warning'` (they do not block `ok=true`, but appear in `failedCount`):

1. **`living-memory:rule_staleness`** — rules with zero `rule_loaded` events in the last N closed features. N = max(5, ceil(average days between last 5 features ÷ 7)).
2. **`living-memory:learning_orphans`** — learnings with `status=promoted` whose target rule had no `rule_loaded` after the promotion. Indicates the generated rule was never used.
3. **`living-memory:distillation_lag`** — 5+ features closed, but fewer `auto_distillation` events than closed features. The loop is not running as expected.

Projects with MICRO classification opt out of all three checks.

The hint for each check includes the ready-to-copy command: `aioson memory:archive --id=rule:<slug> --reason="..."`.

### Phase 5 — feature-close-distillation-hook

`aioson feature:close --slug=X --verdict=PASS` now calls `runDistillation(X)` after the dossier finalization step, before returning.

The flow:
1. Reads the PRD classification — if MICRO, emits notify and skips.
2. Checks feature status in `features.md` — if `abandoned`, skips.
3. Attempts to acquire the lock via INSERT into `evolution_log` (row with `end_at=NULL`). If an active row for the feature already exists, emits notify "already in progress" and exits with 0.
4. Runs `learning:auto-promote --feature=X` with a 5s timeout.
5. On completion: UPDATE of the lock row with `end_at=now()` and `payload.state='complete'`.
6. Emits `aioson notify --level=info --topic=learning-loop --message="distillation: N promoted, M for review, K merge candidates"`.

If `runDistillation` throws, the catch records `event_type='distillation_failed'` in `evolution_log` and swallows the error. `feature:close` returns 0 regardless.

`--no-distill` disables the hook for the current call.

### Phase 6 — inception-mirror-parity

Infrastructure validation — no new user-facing surface. Ensures a project created with `aioson setup` inherits the same loop the AIOSON repository uses. `npm run sync:agents:preflight` was extended to detect drift in the 10 new files, autonomy-protocol entries, and `_archived/` placeholders.

## How the pieces connect

```
Agent loads a rule
  └─ aioson context:load --target=rule:authn --agent=dev
        └─ records execution_events (rule_loaded)

Agent works, feature closes
  └─ aioson feature:close --slug=authn-flow --verdict=PASS
        └─ runDistillation()
              ├─ learning:auto-promote → promotes mature learnings
              ├─ UPDATE evolution_log (distillation complete)
              └─ notify "N promoted, M for review"

Doctor checks periodically
  └─ aioson doctor .
        ├─ rule_staleness: rule 'authn' with no rule_loaded in 8 features
        ├─ learning_orphans: learning 'jwt-expiry-pattern' promoted but rule never loaded
        └─ distillation_lag: 7 features closed, 4 distillations recorded

Human acts on hints
  └─ aioson memory:archive --id=rule:authn --reason="obsolete after OAuth migration"
        ├─ notify --level=warn (before mutation)
        ├─ physical move: .aioson/rules/authn.md → .aioson/rules/_archived/2026-05-14/authn.md
        └─ evolution_log: end_at on previous entry, new entry with reason
```

## Continue reading

- [Diagrams](./diagrams.md) — detailed ASCII flow
- [How to use](./how-to-use.md) — concrete examples
- [CLI reference](./cli-commands.md) — all flags
- [Doctor checks](./doctor-checks.md) — what each check means
