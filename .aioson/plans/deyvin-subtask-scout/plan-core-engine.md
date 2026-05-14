---
phase: 1
slug: core-engine
status: pending
depends_on: []
---

# Phase 1 — Core engine

## Scope
Pure module(s) implementing the scout contract logic. No I/O outside what callers explicitly invoke. No CLI wiring. No prompt template integration. The engine compiles and tests independently.

## New entities
- `src/sub-task-engine.js` — main module exporting: `buildPrompt(input)`, `validateInput(obj)`, `validateOutput(obj)`, `validateConfig(obj)`, `enforceCaps(state, action)`, `generateScoutId(opts)`, `loadConfig(rootPath)`, `defaultConfig()`.
- `src/sub-task-schemas.js` — schema definitions as plain JS objects (no external schema lib). Three schemas: `INPUT_SCHEMA`, `OUTPUT_SCHEMA`, `CONFIG_SCHEMA`. Each schema is a recursive object describing required keys, types, max lengths, enum values.
- `tests/sub-task-engine.test.js` — `node:test` suite covering all exports + at least 3 negative cases per validator.

## Output schema (canonical — encoded in `OUTPUT_SCHEMA`)

```json
{
  "schema_version": 1,
  "id": "scout-deyvin-subtask-scout-2026-05-13-a3f9c2",
  "parent_agent": "deyvin",
  "parent_session_id": "<harness-supplied id>",
  "parent_session_excerpt": "User asked why workflow:next inherits stale completion records when transitioning between features. Hypothesis: loadOrCreateState reads persisted state without checking feature transition. Need file-level evidence.",
  "feature_slug": "deyvin-subtask-scout",
  "question": "Where does workflow-next.js read completion state, and what guards (if any) prevent reading state from a closed feature?",
  "scope": {
    "paths": ["src/commands/workflow-next.js"],
    "globs": [],
    "exclude": [],
    "files_resolved": ["src/commands/workflow-next.js"]
  },
  "completed_at": "2026-05-13T14:32:11.123Z",
  "status": "success",
  "confidence": "high",
  "recommendation": "loadOrCreateState at workflow-next.js:486-514 reads persisted state without checking if existing.featureSlug matches the active feature from features.md. Add a transition guard at line 514 that discards state when slug differs.",
  "findings": [
    {
      "file": "src/commands/workflow-next.js",
      "line": 486,
      "evidence": "function loadOrCreateState(rootPath) { const persisted = readState(...); if (persisted) return persisted; ... }",
      "relevance": "high",
      "explanation": "Persisted state is returned unconditionally; no comparison against current active feature."
    }
  ],
  "files_inspected": ["src/commands/workflow-next.js"],
  "next_scout_suggested": null,
  "errors": []
}
```

Required fields: `schema_version`, `id`, `parent_agent`, `parent_session_id`, `parent_session_excerpt`, `question`, `scope`, `completed_at`, `status`, `confidence`, `recommendation`, `findings`, `files_inspected`.
Optional: `feature_slug`, `next_scout_suggested`, `errors`.
Constraints:
- `parent_session_excerpt`: string, length 50-1000 chars (forces meaningful but bounded)
- `question`: string, length 10-500 chars
- `scope.paths`: array of strings (paths relative to project root)
- `scope.files_resolved`: array of strings, length ≤ `max_files_in_scope` (default 20)
- `confidence`: enum `["low", "medium", "high"]`
- `status`: enum `["success", "partial", "no_findings", "error"]`
- `findings[i].evidence`: string, max 200 chars (truncate with `...` if longer when populated by sub-agent — schema rejects if exceeded post-truncation)
- `findings[i].relevance`: enum `["low", "medium", "high"]`
- `findings[i].explanation`: string, length 20-300 chars
- `recommendation`: string, length 30-1000 chars

## Input schema (canonical — encoded in `INPUT_SCHEMA`)

```json
{
  "question": "...",
  "scope_paths": ["src/commands/workflow-next.js"],
  "scope_globs": [],
  "scope_exclude": ["**/node_modules/**", "**/tests/**"],
  "parent_agent": "deyvin",
  "parent_session_id": "<harness id>",
  "parent_session_excerpt": "...",
  "feature_slug": "deyvin-subtask-scout",
  "max_files_in_scope_override": null
}
```

Required: `question`, `scope_paths` (or `scope_globs`), `parent_agent`, `parent_session_id`, `parent_session_excerpt`. Optional: `scope_globs`, `scope_exclude`, `feature_slug`, `max_files_in_scope_override`.

## Config schema (canonical — encoded in `CONFIG_SCHEMA`)

```json
{
  "max_scouts_per_session": 3,
  "max_files_in_scope": 20,
  "max_retries_on_malformed_json": 1,
  "max_depth": 2,
  "scout_dir": ".aioson/runtime/scouts",
  "archive_root": ".aioson/context/features",
  "prune_unattached_after_days": 90
}
```

All keys optional; missing keys fall back to `defaultConfig()`. Unknown keys → validator returns `{ok: false, errors: ["unknown config key: X"]}` (strict mode prevents silent misconfiguration).

## Prompt template (built by `buildPrompt(input)`)

The returned prompt is a multi-section string that the harness sub-agent receives. Skeleton:

```
You are a sub-task scout for AIOSON. Your job is read-only investigation.

## Question
{input.question}

## Why this scout was dispatched (parent context)
{input.parent_session_excerpt}

## Scope (files you may read)
{enumerated list of input.scope_paths + resolved globs}

## Hard constraints
- Tools allowed: Read, Grep ONLY.
- Tools forbidden: Bash, Edit, Write, NotebookEdit, any execution.
- You may not request files outside the scope above.
- You may not modify any file.
- You must produce ONLY a single JSON object matching the output schema below. No prose outside the JSON.

## Output schema
{JSON.stringify(OUTPUT_SCHEMA, null, 2)}

## Output target
Write the JSON to: {input.expected_output_path}

## Required fields you must populate
- parent_session_excerpt: copy verbatim from above
- recommendation: actionable, future-LLM-readable narrative (30-1000 chars)
- findings[i].explanation: why this finding matters to the question (20-300 chars)
- confidence: your honest self-assessment (low | medium | high)
- files_inspected: every file you actually read (audit trail)

## What success looks like
A future agent in cold-load reading this scout report should reconstruct WHY it was dispatched and WHAT to do next, without needing the parent agent's chat history.
```

## Acceptance criteria

| ID | Criterion | Test |
|----|-----------|------|
| E1 | `buildPrompt(input)` returns a string containing all 7 sections (Question, Why, Scope, Hard constraints, Output schema, Output target, Required fields, What success). Throws on missing required input fields. | `tests/sub-task-engine.test.js` — snapshot + negative cases |
| E2 | `validateInput(obj)` returns `{ok: true, errors: []}` for valid input; `{ok: false, errors: [<specific>]}` for: missing required field, scope_paths empty AND scope_globs empty, parent_session_excerpt < 50 or > 1000 chars, unknown parent_agent (V1 = `["deyvin"]`). | 4 negative + 1 positive case |
| E3 | `validateOutput(obj)` enforces all output schema constraints. Returns specific error per violation: missing required, evidence > 200, recommendation outside 30-1000 chars, schema_version != 1, enum mismatch. | 6 negative + 1 positive case |
| E4 | `validateConfig(obj)` accepts all-optional input (returns defaults via `defaultConfig()`); rejects unknown keys; rejects values outside sane ranges (e.g., `max_scouts_per_session < 1`). | 3 negative + 2 positive cases |
| E5 | `enforceCaps(state, action)` rejects action when `state.scouts_in_session >= config.max_scouts_per_session` with `error.code = "cap_exceeded"`; same for `scope_too_large` and `retry_exhausted`. Mutates state correctly when accepted. | 3 negative + 1 positive case per cap |
| E6 | `generateScoutId({feature_slug})` returns `scout-{slug}-{ISO-date}-{6-char-rand}` when slug provided; `scout-{ISO-date}-{6-char-rand}` otherwise. Two consecutive calls return distinct ids. | 2 cases |
| E7 | All tests in `tests/sub-task-engine.test.js` pass via `node --test tests/sub-task-engine.test.js`. Suite has ≥ 25 cases total. | CI run |

## Implementation sequence
1. Write `src/sub-task-schemas.js` (schemas as plain objects).
2. Write `src/sub-task-engine.js` exports.
3. Write `tests/sub-task-engine.test.js` covering ACs E1-E6.
4. Run `node --test tests/sub-task-engine.test.js`. All green.
5. Run `npm test` to confirm no regression in other suites.

## External dependencies
None. Phase 1 ships zero new `package.json` deps.

## Notes for @dev
- Schemas as plain JS objects (not strings) so the validator can iterate keys directly. Each schema entry: `{type, required, enum?, min?, max?, items?, properties?}`.
- Validator is recursive — same `validateValue(value, schemaNode)` function handles nested objects and arrays.
- For `enforceCaps`, the `state` is `{parent_session_id, scouts_in_session, retries_for_id}`. Caller (Phase 2 CLI) passes a state object loaded from the runtime store; engine mutates and returns. No file I/O inside engine.
- `generateScoutId` uses `crypto.randomBytes(3).toString('hex')` for the rand part. ISO date is `new Date().toISOString().slice(0,10)`.

## Notes for @qa
- Negative test cases matter more than positive: schema validation is the safety net for the entire feature. Aim for ≥ 3 negative cases per validator.
- Snapshot test on `buildPrompt` output is brittle by nature — use a structural test instead (assert `result.includes(input.question)`, `result.includes("Tools allowed: Read, Grep ONLY")`, etc.) so harmless prompt edits don't break the test.
- Cap enforcement tests should NOT touch the filesystem. State object is plain JS, mutated in memory.

## Phase-specific reference sources
- `researchs/sub-agent-patterns-2026/summary.md` — Claude Code `tools`/`disallowedTools` config maps directly to Nautilus prompt constraint
- `src/memory-reflect-engine.js` (existing) — same architectural pattern (pure module, no I/O, called by CLI commands). Use as structural template.
