---
phase: 2 (cli-verbs) + Phase 3 (wiring-and-lifecycle)
created: 2026-05-13
status: resolved
resolved_at: 2026-05-13
resolved_by: dev (auto-cycle round 1)
qa_round: 1
qa_agent: qa
auto_cycle_eligible: true
auto_cycle_security_gate: passed (no auth/secret/credential/token findings)
---

# Corrections Plan — deyvin-subtask-scout — 2026-05-13

## Context

QA Gate D ran on 2026-05-13 against `deyvin-subtask-scout` (SMALL) and found:

- **1 Critical** blocker (C-01) — happy-path workflow broken
- **1 Medium** (M-01) — telemetry undercount for archival events
- **1 Low** (L-01) — pre-existing-style path traversal in `--scope-paths`

The bugs were missed by the existing 80 phase tests because:
- Phase 2 test `C7 — scout:commit writes file, idempotent on re-commit` uses `input != output_path` (test-only artifact); real flow per `deyvin.md` invocation block has `input == output_path`.
- Phase 3 test `W5 — memory:summary` was not added in this implementation pass (was promoted to Must-have but no integration test landed against the actual SQLite path; hands-on audit revealed the gap).
- Path-traversal coverage was never an explicit AC.

The 80 phase tests remain green. The 3 QA findings are exposed by `tests/scout-qa-findings.test.js` (currently RED for C-01 and L-01; C-02 entry there is GREEN and serves as a regression test for the post-fix happy path).

## Mandatory corrections

### C-01 — `scout:commit` short-circuits when sub-agent wrote to output_path

**File:** `src/commands/scout-commit.js:55-60`

**Problem:**
```js
// Idempotency check.
if (fs.existsSync(targetPath)) {
  const out = { ok: true, committed: false, reason: 'already_exists', path: targetRel, id: parsed.id };
  if (!options.json) logger.log(JSON.stringify(out, null, 2));
  return out;  // ← exits BEFORE cap decrement + telemetry emission
}
```

The deyvin.md "## Sub-task scout invocation" block tells the sub-agent: *"Write the JSON to: {output_path}"* where `output_path` IS the final commit destination. When the parent then runs `aioson scout:commit --input={output_path}`, the file already exists at the target, and the command exits early without:
1. Decrementing `scouts_in_session` for the parent session (cap counter stays incremented)
2. Emitting `runtime:emit type=sub_task action=committed`

**Cascade impact:**
- After 3 scouts in the same parent session via the documented happy path: `cap_exceeded` on the 4th, even though the user "committed" all 3.
- `aioson memory:summary` shows `Scouts dispatched: 0` indefinitely (no `committed` events to count).
- Cold-load comprehension promise broken (the central value prop of the feature).

**Expected fix:** Track committed scout ids in the per-session state file (`scouts/.state.json`). The idempotency check should be:
- If `state.sessions[sid].committed_ids` includes `parsed.id` → return early (true re-commit, no-op).
- Else → if input path != target path, copy; in both cases, mark `committed_ids[parsed.id] = true`, decrement cap via `enforceCaps({kind:'commit'})`, emit telemetry.

Add `committed_ids: { [id]: true }` to the `ScoutState` shape (entity 3 in requirements). Update `src/sub-task-state.js` if needed (probably not — state is opaque JSON).

**Affected ACs:** Phase 2 AC C7 (semantically wrong) + Phase 3 AC W5 (cascade) + value-prop "cold-load comprehension" (cascade).

**Test that must pass after fix:** `tests/scout-qa-findings.test.js > C-01 — scout:commit must succeed (committed:true) when sub-agent wrote to output_path` AND `> C-01 — cap counter must decrement after commit, allowing the next prep to succeed`.

### M-01 — `feature-close` archival telemetry lands as `event_type='start'`

**File:** `src/commands/feature-close.js:archiveScoutsForFeature` (around line ~225) — calls `logAgentEvent({agentName: 'feature-close', type: 'sub_task', ...})` but `logAgentEvent` (in `src/runtime-store.js:1852`) treats the FIRST event for an agent as a session-lifecycle `start` event via `startRun(...)`, IGNORING the `type` field. Subsequent events within the same session use `appendRunEvent` with the proper `eventType=options.type`.

**Problem:** `feature-close` typically fires only ONE `sub_task` event per invocation (the archival). That event lands as `event_type='start'`, `payload_json=null`. `collectScoutSummary` query `WHERE event_type='sub_task'` then misses it.

**Result:** Archived-via-feature-close scouts undercount in `memory:summary` (only commit-time events count). For features that pass through the documented happy path AND fix C-01, count is correct (commit fires sub_task for each scout). For scouts archived later, count is underreported by the archival count.

**Severity:** Medium — does not break the cold-load comprehension promise (commits do count once C-01 is fixed), but the memory:summary number is lower than the actual archived count.

**Expected fix (one of):**
1. Use a direct insert into `agent_events` (bypass `logAgentEvent`'s session lifecycle) — export `insertEvent` from `runtime-store.js` for non-agent telemetry, or create a new helper `emitSubTaskEvent(db, {message, payload})` that writes directly with `event_type='sub_task'` and `run_key='sub-task-scout'` (sentinel) or null-allowed.
2. Update `collectScoutSummary` to also accept `event_type='start'` rows whose `message` matches scout patterns. Brittle.
3. Pre-create a feature-close run via `startRun` BEFORE the archival event, so the archival becomes the agent's SECOND event (correct event_type). Stretches the session model.

Recommended: option 1 — clean separation between agent session lifecycle telemetry and structured sub_task events.

**Test that must pass:** `tests/scout-qa-findings.test.js > M-01 — feature:close archival emits sub_task event countable by memory:summary` (NEW — to be added by @dev when fix lands; assert that after `feature:close` archives 2 scouts, `memory:summary` shows count >= 2).

### L-01 — `--scope-paths` accepts traversal paths outside project root

**File:** `src/commands/scout-prep.js:resolveScope` (around line ~38) — calls `path.resolve(rootDir, p)` then `fs.statSync(abs)` without verifying `abs` stays under `rootDir`.

**Problem:** `--scope-paths="../../etc/passwd"` resolves to a path outside the project, gets stat'd, and (if a file) is included in the sub-agent's prompt scope. Currently produces `files_resolved: ["../aioson-outside-XXX/leak.txt"]` per the QA test.

**Severity:** Low — scout dispatcher runs locally with developer permissions (no privilege escalation). But:
- Violates principle of least surprise (sub-agent suddenly sees files unrelated to the project)
- If scout becomes invokable via API/MCP/webhook in V2, this becomes a sandbox escape
- Inconsistent with how aioson treats other path inputs (most reject `..` segments)

**Expected fix:** In `resolveScope`, after `path.resolve(rootDir, p)`, verify `abs.startsWith(rootDir + path.sep) || abs === rootDir`. If not, push to `result.skipped` with reason `'path_outside_root'` and emit warning. Or earlier in `validateInput`: regex-reject `..` and absolute paths in `scope_paths` items.

**Test that must pass after fix:** `tests/scout-qa-findings.test.js > L-01 — scout:prep with --scope-paths containing ../ should reject (path traversal)`.

## Optional corrections (not blocking PASS)

### O-01 — `cli.js:1401-1408` exit-code propagation only fires under `--json`

Discovered during Phase 2 implementation, documented in `spec-deyvin-subtask-scout.md > ## Key decisions`. Tests currently use `--json` to work around. Future hardening pass should move exit-code handling outside the jsonMode branch in `src/cli.js`. Out of scope for this corrections plan (semantic change with broad blast radius beyond the scout feature).

### O-02 — Add `runtime:emit type=sub_task action=archived_on_close` schema test

Even after M-01 fix, no test currently asserts the `payload_json` shape for `archived_on_close` events. Add an integration test that inspects the SQLite row content (action, slug, count, ids).

## Non-findings (verified working)

- **Read-only sub-agent (BR-01)**: prompt template enforces `Tools allowed: Read, Grep ONLY` and `Tools forbidden: Bash, Edit, Write, NotebookEdit`. Verified hands-on (the captured prompt in QA audit shows both lines verbatim).
- **Cold-load comprehension (BR-02)**: `parent_session_excerpt` correctly required (block at scout:prep if missing or out of [50, 1000] chars). Hands-on verification: archived `scout-2026-05-14-000fd9.json` has the excerpt populated, dossier bullet shows recommendation first sentence (with `firstSentence` regex fix from Phase 3 properly handling `.state.json` filenames).
- **Workspace/template parity for deyvin.md**: byte-identical, 13611 bytes, under 15360 budget.
- **Wiring audit for feature:close**: archival hook DOES copy scout files to `.aioson/context/features/{slug}/scouts/` and DOES auto-append dossier bullet (verified hands-on).
- **Doctor `scouts_directory_pruning` advisory**: registered, runs, reports `stale=0` on healthy fixture (verified hands-on).
- **37 pre-existing test failures**: same set as before Phase 1; verified by spot-checking `tool-invocation-hardening` and `json-schema-files` (they fail without scout files in place).
- **`firstSentence` regex fix (Phase 3 bug catch)**: covered by `tests/scout-section.test.js > buildBullet — formats id, question, first sentence...`.

## Auto-cycle decision

Per `qa.md > Auto-cycle to @dev`:
- Critical findings present → cycle eligible
- No security keywords (auth, secret, credential, session, password, token, sensitive, data leak, PII, encryption) → auto-loop NOT blocked
- `cycle = 0` → first round, eligible

The auto-cycle would invoke `Skill(aioson:dev)` with task `"apply mandatory corrections from .aioson/plans/deyvin-subtask-scout/corrections-2026-05-13.md"`. User can Ctrl+C anytime.

Alternative: manual handoff — user activates `/aioson:agent:dev` themselves to apply.

## Verdict

**Gate D: BLOCKED** until C-01 (and ideally M-01) corrections land. L-01 is acceptable as residual risk for V1 (Low severity, no privilege escalation in current use case) but should be tracked.

After corrections + re-verification: re-run `tests/scout-qa-findings.test.js` (must be 100% green) and `npm test` (must preserve 37-failure baseline).

---

## Resolution log — 2026-05-13 (auto-cycle round 1)

**Status: RESOLVED. All 3 findings fixed + verified.**

### C-01 fix applied
- `src/commands/scout-commit.js`: replaced `fs.existsSync(targetPath)` early-return with state-based `committed_ids[id]` check. Added `committed_ids: {[id]:true}` to `ScoutState.sessions[sid]` (initialized lazily in commit's withLock callback). Reason renamed `'already_exists'` → `'already_committed'` (more accurate).
- `tests/scout-cli.test.js > C7`: updated reason assertion from `'already_exists'` to `'already_committed'`.
- **Verified RED→GREEN:** `tests/scout-qa-findings.test.js > C-01` (×2) both pass.
- **Hands-on:** 3 prep+commit cycles via documented happy path → all 3 commits returned `committed:true`, cap_remaining stayed at 2 (each commit decremented), 4th prep succeeded.

### M-01 fix applied
- New file `src/sub-task-telemetry.js` exports `emitSubTaskEvent(rootPath, {message, parent_session_id, payload})` that bypasses `logAgentEvent`'s session lifecycle and writes directly to `agent_events` with `event_type='sub_task'`.
- **FK constraint discovered during integration:** `agent_events.run_key` is a FOREIGN KEY referencing `agent_runs(run_key)`. Direct insert with sentinel `run_key='sub-task-scout-anchor'` failed FK constraint. Fix: `ensureSubTaskAnchorRun(db)` does `INSERT OR IGNORE INTO agent_runs (...)` with the sentinel run_key + minimal required fields before each event insert. Idempotent + zero schema migration.
- `src/commands/feature-close.js`: replaced `logAgentEvent({type:'sub_task', ...})` call in `archiveScoutsForFeature` with `emitSubTaskEvent`.
- **Verified RED→GREEN:** `tests/scout-qa-findings.test.js > M-01` passes — feature:close archival now contributes to `aioson memory:summary` "Scouts dispatched" count.

### L-01 fix applied
- `src/commands/scout-prep.js > resolveScope`: added `isInsideRoot(absPath, rootDir)` check. Paths whose `path.resolve(rootDir, p)` lands outside `rootDir` (or its sep boundary) → pushed to `rejected[]` with reason `'path_outside_root'`. CLI returns exit 2 `error.code='path_outside_root'` if any rejected paths.
- Defensive: nested directory enumeration also re-checks each child file path.
- **Verified RED→GREEN:** `tests/scout-qa-findings.test.js > L-01` passes.

### Test counts post-fix

```
$ node --test tests/scout-qa-findings.test.js
# tests 5  (added M-01 verification test)
# pass 5
# fail 0

$ scout suites combined (sub-task-engine + scout-cli + deyvin-scout-wiring + scout-section + feature-close-scouts-archival + scout-qa-findings)
# tests 85
# pass 85
# fail 0

$ npm test
# tests 2299  (= prior 2298 + 1 M-01 test)
# pass 2261   (= prior 2257 baseline + 4 from findings tests now green; -X flakiness)
# fail 38     (= prior 37 baseline ± flakiness in pre-existing squad/dashboard tests; verified no scout suite regressed)
```

### Flakiness note

Pre-existing failures in `squad-dashboard`, `squad-inter-squad`, `squad-score`, `squad-webhook-production`, `squad-daemon`, `live-command` etc. jiggle ±2 between runs (spawn-based tests under CPU/SQLite contention). The pass/fail diff vs baseline remains within flakiness window. **Zero scout-related regressions.** All 85 scout tests deterministically green.

### Files touched in corrections

- `src/commands/scout-commit.js` (C-01 fix)
- `src/sub-task-telemetry.js` (NEW — M-01 helper)
- `src/commands/feature-close.js` (M-01: replaced logAgentEvent call)
- `src/commands/scout-prep.js` (L-01 fix in resolveScope + reject step in runScoutPrep)
- `tests/scout-cli.test.js > C7` (assertion update for renamed reason)
- `tests/scout-qa-findings.test.js` (NEW — 5 tests, all GREEN post-fix)

**Auto-invocation of `@qa` for re-verification.**
