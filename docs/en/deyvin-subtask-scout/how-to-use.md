# How to use the Sub-task Scout

> Concrete examples. `@deyvin` uses the scout automatically when rubric line 111 fires. This page shows what happens under the hood and how to intervene when needed.

---

## 1. Happy path — successful scout

Scenario: the user asks `@deyvin` why `workflow:next` sometimes inherits completion records from a previous feature.

`@deyvin` identifies that the answer requires inspecting multiple files and dispatches a scout:

**Step 1 — Prepare the scout**

```bash
aioson scout:prep \
  --question="Why does workflow:next inherit completion records from previous features?" \
  --scope-paths="src/commands/workflow-next.js,src/handoff-contract.js" \
  --parent-agent=deyvin \
  --parent-session-id=sess-abc123 \
  --parent-session-excerpt="User reported bug where workflow:next inherits previous featureSlug on new handoffs; need to inspect loadOrCreateState and handoff-contract to identify where the old featureSlug is not cleared" \
  --feature-slug=current-feature
```

Output (`--json`):

```json
{
  "ok": true,
  "id": "scout-current-feature-2026-05-14-a3b7c1",
  "prompt": "You are a read-only code survey sub-agent...\n[full prompt]",
  "output_path": ".aioson/runtime/scouts/scout-current-feature-2026-05-14-a3b7c1.json",
  "cap_remaining": 2
}
```

**Step 2 — Call the sub-agent**

`@deyvin` uses the harness's sub-agent capability (Claude Code `Agent` tool or Codex sub-agent) with the returned `prompt`. The sub-agent runs in isolated context, uses only `Read` and `Grep`, and writes the result to `output_path`.

**Step 3 — Validate**

```bash
aioson scout:validate --input=.aioson/runtime/scouts/scout-current-feature-2026-05-14-a3b7c1.json
```

Exit 0 = PASS. The file is valid against the output schema.

**Step 4 — Commit**

```bash
aioson scout:commit --input=.aioson/runtime/scouts/scout-current-feature-2026-05-14-a3b7c1.json
```

Scout persisted, cap decremented (2→1), telemetry emitted.

**Step 5 — @deyvin reads and responds**

`@deyvin` reads `findings`, `confidence`, and `recommendation` from the JSON and folds the answer into the user-facing reply. Parent context grew ~500 tokens instead of ~10k+.

---

## 2. Invalid JSON recovery

The sub-agent returned malformed JSON (required field missing):

```bash
aioson scout:validate --input=.aioson/runtime/scouts/scout-abc.json
# exit 2
```

Output:

```json
{
  "ok": false,
  "error": {
    "code": "schema_invalid",
    "details": [
      { "field": "findings[0].evidence", "reason": "required field missing" },
      { "field": "confidence", "reason": "must be one of: high, medium, low" }
    ]
  },
  "retry_remaining": 1
}
```

`@deyvin` re-prompts the sub-agent with the explicit validation failures. On second attempt, if PASS → commit. If FAIL again → `retry_exhausted`:

```json
{
  "ok": false,
  "error": { "code": "retry_exhausted" },
  "retry_remaining": 0
}
```

Scout persists with `status: "error"`. `@deyvin` informs the user and offers manual handoff to `/aioson:agent:architect` if needed.

---

## 3. Cap exceeded

The agent tries to dispatch a 4th scout in the same session, but the default is 3:

```bash
aioson scout:prep --question="..." --scope-paths="..." --parent-agent=deyvin --parent-session-id=sess-abc123 --parent-session-excerpt="..."
# exit 2
```

Output:

```json
{
  "ok": false,
  "error": {
    "code": "cap_exceeded",
    "message": "max_scouts_per_session=3 reached for parent_session_id=sess-abc123",
    "remediation": "Either fold scout findings into a single answer, or open a new session, or override .aioson/config/scout-engine.json"
  }
}
```

`@deyvin` surfaces the message and asks the user how to proceed: usually handoff to `/aioson:agent:architect` if scouts keep multiplying.

To increase the limit in the project:

```json
// .aioson/config/scout-engine.json
{ "max_scouts_per_session": 5 }
```

---

## 4. Scope too large

```bash
aioson scout:prep \
  --question="..." \
  --scope-paths="src/"  # directory with 30+ files
  --parent-agent=deyvin \
  --parent-session-id=sess-abc123 \
  --parent-session-excerpt="..."
# exit 2
```

Output:

```json
{
  "ok": false,
  "error": {
    "code": "scope_too_large",
    "message": "scope resolved to 34 files, max_files_in_scope=20",
    "remediation": "Narrow scope_paths to specific files, or increase max_files_in_scope in scout-engine.json"
  }
}
```

Solution: specify concrete files instead of a directory, or adjust `max_files_in_scope` in config.

> **Note:** directories in `scope_paths` expand only 1 level deep (direct children). `scope_globs` is deferred to V2.

---

## 5. View dispatched scouts in the project

```bash
aioson memory:summary .
```

Output (relevant row):

```
Scouts dispatched: 4 (top topics: "workflow state", "handoff contract")
```

To inspect directly:

```bash
ls .aioson/runtime/scouts/
# scout-feature-a-2026-05-14-a1b2c3.json
# scout-2026-05-13-x9y8z7.json
# .state.json
```

---

## 6. Using the CLI-less fallback (no `aioson` installed)

In environments without the `aioson` binary (e.g., plain Claude Code without CLI configured), `@deyvin` uses the inline template from its prompt. The "Sub-task scout invocation — CLI-less fallback" section in `deyvin.md` describes how to build the prompt manually and inject it into the sub-agent via Agent tool.

The fallback produces the same JSON report, but without:
- Cap validation
- SQLite telemetry
- Automatic archival on `feature:close`

---

## 7. Verify archival after feature:close

After `aioson feature:close --slug=my-feature --verdict=PASS`:

```bash
ls .aioson/context/features/my-feature/scouts/
# scout-my-feature-2026-05-14-a1b2c3.json

grep "Sub-task scouts" .aioson/context/features/my-feature/dossier.md
# ## Sub-task scouts
# - scout-my-feature-2026-05-14-a1b2c3: "Why does workflow:next inherit..."
```

The runtime copy remains in `.aioson/runtime/scouts/` and will be pruned by `doctor --fix` after 90 days. Scouts with a defined `feature_slug` are **never** pruned — cold-load memory preservation takes priority.

---

## Continue reading

- [CLI reference](./cli-commands.md) — all flags documented
- [Diagrams](./diagrams.md) — full visual flow
- [Troubleshooting](./troubleshooting.md) — known issues
