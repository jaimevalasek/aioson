# Active Learning Loop — English guide

> **Active Learning Loop** is the cycle that closes the arc between AIOSON's existing learning primitives and the feature lifecycle. When a feature is closed with `feature:close --verdict=PASS`, the framework automatically triggers distillation: learnings are promoted to rules, `doctor` monitors curation gaps, and a human-approved archive flow keeps project memory organized.

This folder documents the complete feature — 6 phases, 4 new CLI verbs, 3 new doctor checks.

---

## What it does

- **Close the learning loop** — without Active Learning Loop, learnings accumulate in `project_learnings` but never become usable rules. This feature connects the two ends: `feature:close` → automatic distillation → rules ready for the next agent.
- **Measure real rule usage** — agents declare "I loaded this rule" via `aioson context:load`. The doctor uses that signal to identify rules no one consults anymore.
- **Search memory quickly** — `aioson memory:search` provides BM25 search over learnings, directly from the terminal.
- **Archive with traceability** — `aioson memory:archive` moves obsolete rules/brains to `_archived/` with an append-only evolution log; `memory:restore` undoes it if needed.
- **Surface curation gaps** — three new `doctor` checks (rule staleness, orphan learnings, distillation lag) generate actionable hints with ready-to-copy commands.

---

## Prerequisites

- AIOSON installed (version that shipped this feature)
- `.aioson/config/learning-loop.json` present in the project (copied automatically by the installer; see [Configuration](#configuration))
- Project classified as SMALL or MEDIUM — MICRO projects opt out automatically (no distillation, no doctor checks)

---

## Reading guide

### I want to understand what changed in my workflow (10 min)
1. [What is the Active Learning Loop](./active-learning-loop.md) — the problem, the 6 phases, the complete flow
2. [Diagrams](./diagrams.md) — ASCII flow of `feature:close` → distillation → `evolution_log` → `doctor`

### I want to use it now
3. [How to use](./how-to-use.md) — search a learning, archive a stale rule, what `feature:close` does now
4. [CLI reference](./cli-commands.md) — all flags for the 4 new verbs

### Something happened / I want to understand what the doctor is saying
5. [Doctor checks](./doctor-checks.md) — what each of the 3 new checks means and how to act
6. [Troubleshooting](./troubleshooting.md) — stuck lock, MICRO opt-out, `pattern:detect` deferred, `aioson update` overwrites config

---

## Canonical commands

| Command | What it does | Tier | Doc |
|---|---|---|---|
| `aioson context:load --target=rule:<slug> --agent=<name>` | Records that an agent loaded a rule/brain | tier-1 silent | [CLI reference](./cli-commands.md) |
| `aioson memory:search "<query>"` | BM25 search over learnings by keyword | tier-1 silent | [CLI reference](./cli-commands.md) |
| `aioson memory:archive --id=rule:<slug> --reason="<text>"` | Archives a rule/learning/brain with evolution log | tier-2 notified | [CLI reference](./cli-commands.md) |
| `aioson memory:restore --id=rule:<slug>` | Restores an archived item | tier-2 notified | [CLI reference](./cli-commands.md) |
| `aioson feature:close --slug=X --verdict=PASS` | Closes feature + triggers automatic distillation (new) | tier-2 notified | [How to use](./how-to-use.md) |
| `aioson doctor .` | Diagnostics, including 3 new curation checks | tier-1 silent | [Doctor checks](./doctor-checks.md) |

---

## Where artifacts live

| Path | Role |
|---|---|
| `.aioson/config/learning-loop.json` | Per-project loop configuration (thresholds, opt-out, timeout) |
| `.aioson/rules/_archived/YYYY-MM-DD/<slug>.md` | Archived rules with archival date |
| `.aioson/brains/_archived/YYYY-MM-DD/<id>.brain.json` | Archived brains |
| `.aioson/context/_archived/YYYY-MM-DD/<slug>.json` | Archived learnings |
| `.aioson/runtime/aios.sqlite` → table `evolution_log` | Append-only log of all memory mutations |
| `.aioson/runtime/aios.sqlite` → table `execution_events` | `rule_loaded` / `brain_loaded` events emitted by `context:load` |
| `.aioson/runtime/aios.sqlite` → virtual table `project_learnings_fts` | FTS5 index over `project_learnings` (title + evidence) |

---

## Configuration

`.aioson/config/learning-loop.json` is copied from the template on first install:

```json
{
  "$schema": "https://aioson.dev/schemas/learning-loop.v1.json",
  "enabled": true,
  "skip_on_classification": ["MICRO"],
  "execution_mode": "foreground",
  "lock_strategy": "sqlite-row",
  "auto_promote_threshold": 3,
  "staleness_window_features_min": 5,
  "timeout_ms": 5000
}
```

| Field | Controls |
|---|---|
| `enabled` | Enables/disables the entire loop for the project |
| `skip_on_classification` | Classifications that opt out automatically (default: `["MICRO"]`) |
| `auto_promote_threshold` | How many evidence entries a learning needs to be automatically promoted |
| `staleness_window_features_min` | Minimum closed features to calculate the staleness window |
| `timeout_ms` | Foreground distillation timeout (default: 5000ms) |

> **Warning:** `aioson update` currently **overwrites** this file (existing installer policy). Back up any customizations before running `aioson update`. See [Troubleshooting](./troubleshooting.md#aioson-update-overwrites-learning-loopjson).

---

## Status

The `active-learning-loop` feature was delivered in 6 phases:

| Phase | Slug | Delivery | Status |
|---|---|---|---|
| 1 | `telemetry-foundation` | CLI `context:load` + `rule_loaded`/`brain_loaded` events | PASS |
| 2 | `memory-search-fts5` | CLI `memory:search` + FTS5 BM25 index | PASS |
| 3 | `memory-archive-with-evolution-log` | CLI `memory:archive` + `memory:restore` + `evolution_log` | PASS |
| 4 | `doctor-curation-checks` | 3 new checks: staleness, orphans, distillation lag | PASS |
| 5 | `feature-close-distillation-hook` | Hook in `feature:close` + foreground distillation | PASS |
| 6 | `inception-mirror-parity` | `src/` ↔ `template/src/` parity validation | PASS |

112/112 deterministic tests passing. QA approved.

Specification artifacts (archived):
- [PRD](../../.aioson/context/done/active-learning-loop/prd-active-learning-loop.md)
- [Spec](../../.aioson/context/done/active-learning-loop/spec-active-learning-loop.md)
- [Architecture](../../.aioson/context/done/active-learning-loop/architecture-active-learning-loop.md)
