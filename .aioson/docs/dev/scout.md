---
description: "Sub-task scout — read-only investigation @dev dispatches when a diagnosis needs a >5-file survey or a runtime trace, via `aioson scout:prep` or its CLI-less contract."
agents: [dev]
task_types: [implementation, verification, debugging]
triggers: [scout, sub-task scout, ambiguous diagnosis, trace runtime flow, scout fallback]
---

# Sub-task scout

Use a scout when a diagnosis is ambiguous and answering it needs a survey of more than 5 files or tracing a runtime flow. The scout reads in a fresh context and returns structured findings, so the parent session keeps its context for the fix.

## CLI path

1. Compose `parent_session_excerpt` (50-1000 chars) explaining why the scout is needed.
2. Run `aioson scout:prep . --json --question="..." --scope-paths="path1,path2" --parent-agent=dev --parent-session-id=$AIOSON_SESSION_ID --parent-session-excerpt="..." [--feature-slug=<slug>]`.
3. Dispatch the returned prompt with a read-only sub-agent:
   - **Claude Code**: Agent tool, allowed `Read` and `Grep`, no `Bash`, `Edit`, or `Write`.
   - **Codex MultiAgentV2**: spawn a subagent with the prompt; collect JSON from `output_path`.
4. Run `aioson scout:validate . --json --input=<output_path>`, then `aioson scout:commit . --json --input=<output_path>`.
5. Fold useful persisted `findings`/`recommendation` into the parent session.

## CLI-less contract

Use this only when `aioson --version` fails; otherwise `scout:prep` owns the contract. Compose the scout prompt with exactly:

1. Header: `You are a sub-task scout for AIOSON. Your job is read-only investigation.`
2. Parent context block carrying `{parent_session_excerpt}` (50-1000 chars, mandatory for cold-load comprehension).
3. Hard constraints: `Tools allowed: Read, Grep ONLY. Tools forbidden: Bash, Edit, Write.`
4. Output contract: one JSON object with `schema_version`, `id`, `parent_agent` (`dev`), `parent_session_id`, `parent_session_excerpt`, `question`, `scope`, `completed_at`, `status`, `confidence`, `recommendation`, `findings[]`, `files_inspected[]`.

## Caps

At most 3 scouts per parent session and 20 files per scope. A question that still needs more is a boundary decision: record it in the plan and route it to `@planner`.
