# What is the Sub-task Scout

> The scout closes the item explicitly deferred in the `deyvin-density` feature (2026-05-11). The `@deyvin` rubric at line 111 read: "Diagnosis ambiguous; needs survey of >5 files or tracing a runtime flow → Spawn sub-task scout (deferred to `deyvin-subtask-scout`; until shipped: pause and ask the user)." Now there's a primitive.

---

## The problem

Without the scout, `@deyvin` had two bad options when a question required inspecting many files:

1. **Read everything inline** — burns ≥10k tokens in the parent context, pollutes the agent's working memory, and forces the next turn to compete with stale survey content.
2. **Hand off to `/aioson:agent:architect` or pause** — overshoots the actual need (most surveys don't require architectural decisions) and breaks the conversation flow with a full agent switch.

The scout resolves this: the parent agent keeps its context lean and receives a structured report of ~500 tokens instead of the raw files.

---

## How it works

### Full lifecycle

```
User asks @deyvin something that triggers rubric line 111
(survey of >5 files or runtime flow tracing)
         │
         ▼
aioson scout:prep --question="..." --scope-paths="a.js,b.js" ...
  └─ validates inputs
  └─ checks caps (session, scope)
  └─ generates standardized prompt for sub-agent
  └─ returns { id, prompt, output_path, cap_remaining }
         │
         ▼
/aioson:agent:deyvin calls harness.sub-agent(prompt)
  └─ sub-agent runs in ISOLATED context
  └─ allowed tools: [Read, Grep]
  └─ disallowed tools: [Bash, Edit, Write]   ← Nautilus pattern
  └─ writes JSON to output_path
         │
         ▼
aioson scout:validate --input=<output_path>
  └─ validates JSON against OUTPUT_SCHEMA
  └─ PASS → proceed
  └─ FAIL → increments retry; @deyvin re-prompts (max 1 retry)
         │
         ▼
aioson scout:commit --input=<output_path>
  └─ persists to .aioson/runtime/scouts/{id}.json
  └─ decrements cap_remaining
  └─ emits telemetry action=committed
         │
         ▼
/aioson:agent:deyvin reads findings, confidence, recommendation
  └─ folds into user-facing reply
  └─ parent context grew ~500 tokens (just the report)
     vs inline survey: ~10k+ tokens (raw file contents)
```

### The report (OutputSchema)

| Field | Type | What it is |
|---|---|---|
| `id` | string | Unique scout identifier (`scout-{slug}-{date}-{rand6}`) |
| `parent_agent` | string | Dispatching agent (`"deyvin"` in V1) |
| `parent_session_id` | string | Parent session ID (for cap tracking) |
| `parent_session_excerpt` | string (50-1000 chars) | **Required.** Why the scout was dispatched — essential for cold-load by future agents |
| `feature_slug` | string \| null | Active feature, if any |
| `question` | string | The original question |
| `scope` | object | Files and directories to inspect |
| `findings[]` | array | Each finding: `file`, `line`, `evidence` (max 200 chars), `relevance`, `explanation` (20-300 chars) |
| `confidence` | `"high" \| "medium" \| "low"` | Sub-agent's self-assessment |
| `recommendation` | string (30-1000 chars) | What the parent agent should do next |
| `files_inspected[]` | string[] | Files actually read |
| `status` | `"success" \| "partial" \| "no_findings" \| "error"` | Final state |
| `completed_at` | ISO string | Completion timestamp |

---

## The 3 phases of the feature

### Phase 1 — `core-engine`
Pure module `src/sub-task-engine.js`: prompt template builder, hand-rolled JSON validators (zero new dependencies), cap state management, lifecycle state. No I/O — only what the CLI commands explicitly invoke.

### Phase 2 — `cli-verbs`
Three CLI verbs (`scout:prep`, `scout:validate`, `scout:commit`) + state with file-lock in `src/sub-task-state.js`. Config template `template/.aioson/config/scout-engine.json` (empty `{}`; defaults active). Sandbox path check: `scope_paths` outside the project root are rejected.

### Phase 3 — `wiring-and-lifecycle`
- `deyvin.md` (workspace + template byte-identical, 13611 bytes, under 15360 limit): new "Sub-task scout invocation" section with CLI path + CLI-less fallback per harness (Claude Code Agent tool, Codex MultiAgentV2/OpenCode with `harness_unsupported` message)
- `feature:close`: archival hook copies scouts with matching `feature_slug` to `.aioson/context/features/{slug}/scouts/`, appends bullet to dossier
- `memory:summary`: "Scouts dispatched: N (top topics: ...)" row always present — visible in agent cold-load bootstrap
- `doctor`: `scouts_directory_pruning` advisory check (orphaned scouts >90d); `--fix` deletes them; scouts with `feature_slug` are **never** pruned

---

## Security patterns

**Nautilus pattern** — tool whitelist on sub-agent:
- Allowed: `[Read, Grep]`
- Disallowed: `[Bash, Edit, Write]`
- Applied via prompt template; harnesses that support explicit tool configuration also receive the whitelist as a parameter

**Path sandbox** — `scope_paths` outside the project `rootDir` are rejected with `error.code = 'path_outside_root'`

**Cap discipline** — no scout can exceed the configured limits; exceeding returns exit 2 before dispatching the sub-agent

**`parent_session_excerpt` required** — blocked at `scout:prep` if absent. This field ensures future agents reading the archived scout in cold-load can reconstruct intent without any conversation history.

---

## Continue reading

- [How to use](./how-to-use.md) — concrete step-by-step flows
- [CLI reference](./cli-commands.md) — full flags
- [Diagrams](./diagrams.md) — visual flow
- [Troubleshooting](./troubleshooting.md) — known issues
