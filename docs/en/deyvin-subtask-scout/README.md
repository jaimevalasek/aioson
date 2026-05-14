# Deyvin Sub-Task Scout — English guide

> **Sub-task scout** is `@deyvin`'s structured diagnostic primitive. When a question requires inspecting more than 5 files or tracing a runtime flow, the agent doesn't read everything inline (burning parent context) — it dispatches a scout. The scout runs in isolated context, inspects the scope, and returns a JSON report with findings, confidence, and recommendation. The agent reads the report (~500 tokens) instead of the files (~10k+ tokens).

This folder documents the full feature — 3 phases, 3 CLI verbs, 1 advisory check in doctor.

---

## What it's for

- **Preserve parent agent context** — surveys of >5 files enter the parent context as a compact report, not raw file contents.
- **Diagnostic traceability** — scouts are persisted in `.aioson/runtime/scouts/` and (after `feature:close`) archived to `.aioson/context/features/{slug}/scouts/`.
- **CLI-less fallback** — `deyvin.md` carries a manual scout template for environments without the `aioson` binary.
- **Cap discipline** — configurable limits prevent sub-task explosion: `max_scouts_per_session=3`, `max_files_in_scope=20`.

---

## Prerequisites

- AIOSON installed (version that shipped this feature)
- Harness with sub-agent support: Claude Code (Agent tool) or Codex (MultiAgentV2)
- `.aioson/config/scout-engine.json` in the project (copied automatically by the installer as `{}`, defaults active)

> **Gemini CLI / OpenCode:** emit `harness_unsupported` and automatically fall back to `deyvin.md`'s CLI-less inline flow. Full harness parity is V2.

---

## Reading guide

### I want to understand what changed in @deyvin (10 min)
1. [What is the sub-task scout](./sub-task-scout.md) — the problem, 3 phases, full lifecycle
2. [Diagrams](./diagrams.md) — ASCII flow: `scout:prep` → sub-agent → `scout:validate` → `scout:commit`

### I want to see @deyvin using a scout
3. [How to use](./how-to-use.md) — happy path, invalid JSON recovery, cap exceeded

### I want to configure or understand the limits
4. [CLI reference](./cli-commands.md) — full flags for all 3 verbs (`scout:prep`, `scout:validate`, `scout:commit`)

### Something went wrong / I want to adjust limits
5. [Troubleshooting](./troubleshooting.md) — cap exceeded, malformed JSON, harness without sub-agent, orphaned scouts

---

## Canonical commands

| Command | What it does | Tier | Doc |
|---|---|---|---|
| `aioson scout:prep --question="..." --scope-paths="..." --parent-agent=deyvin --parent-session-id=<id>` | Validates inputs, applies caps, generates standardized prompt for sub-agent | tier-1 silent | [CLI reference](./cli-commands.md) |
| `aioson scout:validate --input=<path>` | Validates the JSON returned by the sub-agent against the output schema | tier-1 silent | [CLI reference](./cli-commands.md) |
| `aioson scout:commit --input=<path>` | Persists the validated report, emits telemetry, decrements cap | tier-1 silent | [CLI reference](./cli-commands.md) |
| `aioson doctor .` | Includes the `scouts_directory_pruning` advisory (orphaned scouts >90d) | tier-1 silent | [Troubleshooting](./troubleshooting.md) |

---

## Where artifacts live

| Path | Role |
|---|---|
| `.aioson/runtime/scouts/{id}.json` | Active scout report (ephemeral; pruned by doctor after 90d if orphaned) |
| `.aioson/runtime/scouts/.state.json` | Cap state per session_id; lock at `.state.json.lock` |
| `.aioson/config/scout-engine.json` | Per-project configuration (override of defaults) |
| `.aioson/context/features/{slug}/scouts/{id}.json` | Scout archived after `feature:close --verdict=PASS` |
| `.aioson/context/features/{slug}/dossier.md` → `## Sub-task scouts` | Bullets of archived scouts (append-only, idempotent) |
| `agent_events` (SQLite) | Telemetry: `event_type='sub_task'`, `action ∈ {prepared, validation_failed, retry_exhausted, committed, slow_completion, cap_exceeded}` |

---

## Configuration

`.aioson/config/scout-engine.json` is copied as `{}` on first install — all defaults apply:

| Field | Default | What it controls |
|---|---|---|
| `max_scouts_per_session` | 3 | Scouts per `parent_session_id` |
| `max_files_in_scope` | 20 | Files in the `scope_paths` sum |
| `max_retries_on_malformed_json` | 1 | Re-validations before `retry_exhausted` |
| `max_depth` | 2 | Nested scout depth (1 sub-scout per scout) |
| `prune_unattached_after_days` | 90 | Days before `doctor --fix` prunes scouts without `feature_slug` |
| `slow_completion_warn_seconds` | 300 | Threshold for emitting `slow_completion` telemetry |

Override example:

```json
{
  "max_scouts_per_session": 5,
  "max_files_in_scope": 30
}
```

> Unknown keys are **rejected** (strict validation). Use only the fields above.

---

## Status

The `deyvin-subtask-scout` feature was delivered in 3 phases:

| Phase | Slug | Delivery | Status |
|---|---|---|---|
| 1 | `core-engine` | `src/sub-task-engine.js` + schemas + hand-rolled validator | PASS |
| 2 | `cli-verbs` | `scout:prep` + `scout:validate` + `scout:commit` + state with file-lock | PASS |
| 3 | `wiring-and-lifecycle` | `deyvin.md` updated (CLI + CLI-less), archival in `feature:close`, `memory:summary` row, doctor advisory | PASS |

80 deterministic tests passing. QA approved.

Specification artifacts (archived):
- [PRD](../../.aioson/context/done/deyvin-subtask-scout/prd-deyvin-subtask-scout.md)
- [Spec](../../.aioson/context/done/deyvin-subtask-scout/spec-deyvin-subtask-scout.md)
