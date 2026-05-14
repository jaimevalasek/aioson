---
phase: 3
slug: wiring-and-lifecycle
status: pending
depends_on: [cli-verbs]
---

# Phase 3 — Wiring and lifecycle

## Scope
Make the scout primitive *actually used* and *actually integrated* into the AIOSON memory layer. Per sheldon-006 ("design-complete is not execution-complete — audit wiring before closing"), this phase is the actual done gate for the feature.

Touches: agent prompt files, `feature:close` archival hook, dossier auto-append, `memory:summary` integration, doctor advisory, and the CLI-less fallback path.

## Modified entities
- `.aioson/agents/deyvin.md` (workspace)
- `template/.aioson/agents/deyvin.md` (template — byte-identical sync)
- `src/commands/feature-close.js` (existing — extend with scout archival step)
- `src/dossier.js` (existing OR new helper — add `appendScoutToFeatureDossier({feature_slug, scout})` function)
- `src/commands/memory-summary.js` (existing — add scout count row)
- `src/commands/doctor.js` (existing — add `scouts_directory_pruning` advisory check)
- New: `tests/feature-close-scouts-archival.test.js`
- New: `tests/deyvin-scout-wiring.test.js`
- New: `tests/scout-memory-summary.test.js`

## `deyvin.md` changes (workspace + template)

### Change 1 — Rubric line (sheldon-001 q=5: workspace/template parity)

Replace:
> | Diagnosis ambiguous; needs survey of >5 files or tracing a runtime flow | **Spawn sub-task scout** (deferred to `deyvin-subtask-scout`; until shipped: pause and ask the user) |

With:
> | Diagnosis ambiguous; needs survey of >5 files or tracing a runtime flow | **Spawn sub-task scout** via `aioson scout:prep` (or CLI-less fallback below) |

### Change 2 — New section "Sub-task scout invocation"

Add before "## Memory awareness preflight" (or wherever fits the flow). Section content:

```markdown
## Sub-task scout invocation

When the rubric routes here ("Diagnosis ambiguous; needs survey of >5 files"):

### Preferred: CLI path (when `aioson` is installed)

1. Compose a 2-3 sentence excerpt explaining WHY you need the scout (this becomes `parent_session_excerpt` — your future-self in cold-load will read it).
2. Run:
   ```bash
   aioson scout:prep . \
     --question="..." \
     --scope-paths="path/to/file1.js,path/to/file2.js" \
     --parent-agent=deyvin \
     --parent-session-id=$AIOSON_SESSION_ID \
     --parent-session-excerpt="..." \
     [--feature-slug=<slug>]
   ```
3. Take the returned `prompt` and dispatch via your harness's native sub-agent capability:
   - **Claude Code**: Agent tool with `tools: [Read, Grep]`, `disallowedTools: [Bash, Edit, Write]`, prompt = the returned string. Sub-agent writes JSON to the returned `output_path`.
   - **Codex**: spawn subagent with the prompt; collect JSON from output_path.
   - **Other harnesses**: if your harness lacks isolated sub-agent capability, use the CLI-less fallback below.
4. Validate: `aioson scout:validate . --input=<output_path>`. On exit 2 `schema_invalid`, re-prompt the sub-agent with the `error.details` and try once more.
5. On `retry_exhausted`: surface to user, offer manual handoff to `/architect` or `/dev`.
6. On valid: `aioson scout:commit . --input=<output_path>`. Telemetry is now emitted; cap counter decremented.
7. Read findings/recommendation from the persisted JSON. Fold into your user-facing reply.

### Fallback: CLI-less path (when `aioson` is not available)

If `aioson --version` returns non-zero or the binary is absent:

1. Generate scout id locally: `scout-{ISO-date}-{6-char-rand}`. If feature context exists, prefix with feature slug.
2. Compose the parent_session_excerpt (2-3 sentences, 50-1000 chars).
3. Construct the prompt manually using this template (this is what the CLI would have generated — keep in sync with `src/sub-task-engine.js#buildPrompt`):

   ```
   You are a sub-task scout for AIOSON. Your job is read-only investigation.
   ## Question
   {question}
   ## Why this scout was dispatched (parent context)
   {parent_session_excerpt}
   ## Scope (files you may read)
   {list of paths}
   ## Hard constraints
   - Tools allowed: Read, Grep ONLY.
   - Tools forbidden: Bash, Edit, Write, NotebookEdit, any execution.
   - You may not request files outside the scope above.
   - You may not modify any file.
   - You must produce ONLY a single JSON object matching the output schema below. No prose outside the JSON.
   ## Output schema (required fields)
   schema_version (=1), id, parent_agent, parent_session_id, parent_session_excerpt,
   question, scope, completed_at, status (success|partial|no_findings|error),
   confidence (low|medium|high), recommendation (30-1000 chars),
   findings[] (each: file, line, evidence ≤200 chars, relevance, explanation 20-300 chars),
   files_inspected[]
   ## Output target
   Write the JSON to: .aioson/runtime/scouts/{id}.json (create dir if absent)
   ```

4. Dispatch via harness sub-agent with the prompt + tool whitelist `[Read, Grep]`.
5. Read the returned JSON yourself; visually inspect for the required fields. Skip schema validation (no engine).
6. Skip telemetry, cap enforcement, archival. These degrade silently when CLI is absent.
7. Read findings/recommendation. Fold into your reply.
8. If you later install `aioson`, run `aioson scout:commit --input=<path>` to retroactively register the scout in telemetry.

### Cap discipline (both paths)
- Default: max 3 scouts per session. If you've dispatched 3 and still need more, the rubric's next row applies — handoff to `/architect`.
- Default: max 20 files per scout scope. If your survey naturally needs more, split into 2 scouts with disjoint scopes.
- Defaults are tunable in `.aioson/config/scout-engine.json`.

### What NOT to do
- Do NOT inline-read >5 files yourself when the rubric routes here. That defeats the entire purpose (parent context preservation).
- Do NOT dispatch a scout for a question you haven't framed precisely. The `question` field is what the sub-agent works with — vague questions produce vague reports.
- Do NOT skip `parent_session_excerpt` even in the CLI-less fallback. Cold-load future agents need it.
```

### Change 3 — Kernel size check
After both changes, `.aioson/agents/deyvin.md` size MUST remain ≤ 15360 bytes (15KB) per the deyvin-density AC-06 standard. Current size: 9398B. Estimated additions: ~3.5KB. New estimated total: ~12.9KB. Within budget.

## `feature:close` archival hook

In `src/commands/feature-close.js`, after the existing artifact-move logic (PRD/spec/QA-report move to `done/{slug}/`), add:

```js
// Pseudocode — actual code in @dev's hands
const scoutsForFeature = listScoutsByFeatureSlug(rootPath, slug);
if (scoutsForFeature.length > 0) {
  const archiveDir = path.join(rootPath, '.aioson/context/features', slug, 'scouts');
  mkdirSync(archiveDir, { recursive: true });
  for (const scout of scoutsForFeature) {
    copyFileSync(scout.path, path.join(archiveDir, scout.filename));
    appendScoutToFeatureDossier({rootPath, feature_slug: slug, scout: scout.content});
  }
  emit({type: 'sub_task', action: 'archived_on_close', metadata: {slug, count: scoutsForFeature.length}});
}
// Original runtime/scouts/ files left untouched — pruned later by `aioson doctor --fix`.
```

## Dossier auto-append

In `src/dossier.js` (or new helper), implement `appendScoutToFeatureDossier({rootPath, feature_slug, scout})`:

1. Read `.aioson/context/features/{slug}/dossier.md`. If absent, create with frontmatter + `## Sub-task scouts` heading.
2. If `## Sub-task scouts` section absent, append it.
3. Append a bullet under that section: `- {scout.id}: {scout.question} → {scout.recommendation} (confidence: {scout.confidence})`.
4. Idempotent: if line with `{scout.id}` already present, skip (re-archival on re-close is a no-op).

## `memory:summary` integration

In `src/commands/memory-summary.js`, after existing rows, add:

```
Scouts dispatched (last {N} sessions): {total_count} (top topics: {top-3-question-keywords})
```

Derived from a SQL query on `runtime_events WHERE type='sub_task' AND action IN ('committed', 'archived_on_close')` joined with parent_session_id grouping.

If zero scouts in the window: row reads `Scouts dispatched: 0`. Always include the row so cold-load agents see "scout layer exists, just unused this window".

## Doctor advisory

In `src/commands/doctor.js`, add a new check:

```js
{
  id: 'scouts_directory_pruning',
  severity: 'warning',
  description: 'Unattached scout reports older than {prune_days} days in .aioson/runtime/scouts/',
  check: (rootPath) => {
    const scouts = listUnattachedScoutsOlderThan(rootPath, config.prune_unattached_after_days);
    return scouts.length === 0
      ? {ok: true}
      : {ok: false, message: `${scouts.length} stale unattached scouts. Run aioson doctor --fix to remove (or aioson scout:archive --id=<id> --target=<feature_slug> to preserve).`};
  },
  fix: (rootPath) => {
    deleteUnattachedScoutsOlderThan(rootPath, config.prune_unattached_after_days);
  }
}
```

## Acceptance criteria

| ID | Criterion | Test |
|----|-----------|------|
| W1 | `.aioson/agents/deyvin.md` rubric line 111 no longer contains `(deferred to deyvin-subtask-scout` substring; contains `aioson scout:prep`. New section "Sub-task scout invocation" present with both CLI and CLI-less subsections. File ≤ 15360 bytes. | `tests/deyvin-scout-wiring.test.js` — content + size assertions |
| W2 | `template/.aioson/agents/deyvin.md` byte-identical to workspace. | same test, `fs.statSync` + content compare |
| W3 | `aioson feature:close --slug=<s>` with 2 attached scouts in `.aioson/runtime/scouts/` copies both to `.aioson/context/features/<s>/scouts/`. Original files untouched. Dossier appended with 2 bullets under `## Sub-task scouts`. Re-running close = idempotent (no duplicate bullets). | `tests/feature-close-scouts-archival.test.js` |
| W4 | `aioson feature:close` with 0 attached scouts = no archival action, no error. | same test |
| W5 | `aioson memory:summary --last=5` includes a `Scouts dispatched:` row. With seeded `runtime_events`, count and top topics are correct. With zero scouts in window, row reads `Scouts dispatched: 0`. | `tests/scout-memory-summary.test.js` |
| W6 | `aioson doctor` reports `scouts_directory_pruning` warning when stale unattached scouts exist. `aioson doctor --fix` removes them. Attached scouts (with `feature_slug`) NEVER pruned. | extend existing `tests/doctor.test.js` or new |
| W7 | Full regression: existing tests for `feature-close`, `dossier`, `memory-summary`, `doctor` all pass. Zero breakage. | `npm test` |
| W8 | New `runtime_events.type='sub_task'` rows from `archived_on_close` action are queryable via the standard runtime-store helpers. | spot-check in W3 test |

## Implementation sequence
1. Edit `.aioson/agents/deyvin.md` (workspace) — rubric line + new section.
2. Edit `template/.aioson/agents/deyvin.md` — same edits, byte-identical.
3. Verify with `diff -q` (or PowerShell `Compare-Object`).
4. Implement `appendScoutToFeatureDossier` in `src/dossier.js`.
5. Extend `src/commands/feature-close.js` with the archival block.
6. Extend `src/commands/memory-summary.js` with the scout row.
7. Extend `src/commands/doctor.js` with the pruning advisory.
8. Write all 3 new test files. Run `npm test`. All green.

## External dependencies
- Existing `src/dossier.js` API surface (read it before extending).
- Existing `src/commands/feature-close.js` artifact-move logic (extend, do not rewrite).
- Existing `src/runtime-store.js` for telemetry and queries.

## Notes for @dev
- **Workspace/template parity is non-negotiable** (sheldon-001 q=5). Use `Compare-Object` (PowerShell) or `diff -q` (bash) after each edit.
- **Idempotency in W3** is critical: re-archival happens any time `feature:close` runs twice. Check by scout id presence in dossier line, not by timestamp.
- **`memory:summary` row is the cold-load signal** — without it, scouts are invisible to future agents bootstrapping the project. This is the "cold-load comprehension" feature value the user reinforced.
- **Doctor's prune list must distinguish attached vs unattached**: read the scout JSON to check for `feature_slug` field. If present and the feature is `done` and the scout is in archive dir → safe to prune from runtime/. If present and feature still `in_progress` → never prune.
- **CLI-less fallback in `deyvin.md`** is documentation, not code. There is no automated test of the fallback behavior other than asserting the section exists in the file. Real validation is human (jaime tries it in a fresh project without `aioson` installed).

## Notes for @qa
- W1/W2 file content tests should use regex (not exact string match) for resilience to harmless edits.
- W3 idempotency: run `feature:close` twice in the test. Count dossier bullets — must equal scout count, not 2x.
- W6 attached-scout protection: include a test where an attached scout is older than 90 days but the feature is still `in_progress` — assert it is NOT pruned.
- Check that W8's `runtime_events` row has `metadata.slug` and `metadata.count` populated (not null).
- **Manual smoke test**: in a fresh project without `aioson` installed, copy `.aioson/agents/deyvin.md` and verify the CLI-less section is self-contained (no broken references to engine internals). This is the actual value of the CLI-less fallback — automation can't verify it.

## Phase-specific reference sources
- `.aioson/agents/deyvin.md` (current state) — section to modify
- `src/commands/feature-close.js` (existing) — extension point
- `src/dossier.js` (existing) — helper API
- `src/commands/memory-summary.js` (existing) — extension point
- `src/commands/doctor.js` (existing) — advisory check pattern
- `.aioson/brains/sheldon/architecture-decisions.brain.json` node sheldon-006 — wiring audit checklist
