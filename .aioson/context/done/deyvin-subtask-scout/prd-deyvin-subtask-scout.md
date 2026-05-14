---
slug: deyvin-subtask-scout
classification: SMALL
status: in_progress
type: feature
source: follow-up from prd-deyvin-density.md (closed 2026-05-11)
created_at: 2026-05-13
---

# PRD — Deyvin Sub-Task Scout (structured code-survey sub-agent)

## Vision
Give `@deyvin` a structured way to dispatch a context-isolated **scout** that surveys >5 files or traces a runtime flow and returns deterministic JSON findings — closing the explicit "deferred" rubric row in `deyvin.md:111` so the parent agent can keep its own context lean while still doing diagnoses that today either burn tokens or get punted to `/architect`.

## Problem
The `deyvin-density` Scope decision rubric (line 111) explicitly states: *"Diagnosis ambiguous; needs survey of >5 files or tracing a runtime flow → Spawn sub-task scout (deferred to `deyvin-subtask-scout`; until shipped: pause and ask the user)."*

Without a scout primitive, `@deyvin` has two bad options when this row triggers:

1. **Read all the files inline** — burns the parent context (often ≥10k tokens), pollutes the agent's working memory, and forces the next user turn to compete with stale survey content.
2. **Hand off to `/architect` or pause** — overshoots the actual need (most surveys don't require architectural decisions, just "which file does X live in and why does it break Y") and breaks the conversation flow with a full agent switch.

The same pattern would help `@dev` and `@qa` too, but scope creep risk is real. V1 is `@deyvin`-only with a clear extension path.

## Users
- **`@deyvin` (primary)**: needs to dispatch quick diagnostic surveys without burning parent context. Receives a structured JSON report and decides the next move (handle, sub-task again, handoff).
- **AIOSON developers (jaime + downstream adopters)**: see deterministic scout reports in `.aioson/runtime/scouts/` and (for feature-attached scouts) in `.aioson/context/features/{slug}/scouts/` post-closure — auditable diagnostic trail per feature.
- **Future `@dev` / `@qa` / `@architect` integration**: V1 is closed to `@deyvin`, but the engine and CLI surface are designed for trivial expansion (parent_agent is a parameter, not a constant).

## MVP scope

### Must-have 🔴

- **CLI-less fallback** _(sheldon)_ — `deyvin.md` MUST carry both the CLI invocation block AND a manual fallback template usable when `aioson` binary is absent. Fallback skips telemetry/caps/archival but otherwise produces a valid scout report. Closes sheldon-005 (q=4) gap that "agents that hard-require CLI become unusable in plain Claude Code sessions".
- **Cold-load comprehension field `parent_session_excerpt`** _(sheldon)_ — REQUIRED in scout report (50-1000 chars, written by parent at `scout:prep` time, explains WHY scout was dispatched). Without it, future agents reading archived scouts in cold-load cannot reconstruct intent. Aligns with `agent-chain-continuity` (closed 2026-05-07) dossier philosophy.
- **`src/sub-task-engine.js`** — pure module: prompt template builder, input/output JSON schema validators (hand-rolled, zero new deps _(sheldon)_), cap counter management, lifecycle state. No I/O outside what the CLI commands explicitly invoke.
- **CLI verb `aioson scout:prep`** — accepts `{question, scope, parent_agent, parent_session_id, feature_slug?}`, validates inputs against schema, enforces caps (per-session count + scope file count), generates the standardized prompt for the harness sub-agent, returns `{id, prompt, output_path, cap_remaining}`. Mirrors the existing `harness:validate` headless pattern.
- **CLI verb `aioson scout:validate`** — accepts `--input=<path>` to a candidate scout report JSON, validates against output schema, tracks retry count in the scout state file. Returns exit 0 on PASS, exit 2 on FAIL with structured error.
- **CLI verb `aioson scout:commit`** — persists validated scout report at `.aioson/runtime/scouts/{id}.json`, emits `runtime:emit --type=sub_task --action=completed`, decrements `cap_remaining`. Idempotent: re-commit of same id is a no-op.
- **Output schema (`scout-report-{id}.json`)** — versioned (`schema_version: 1`), with: `id`, `parent_agent`, `parent_session_id`, `parent_session_excerpt` _(sheldon — required, 50-1000 chars)_, `feature_slug` (optional), `question`, `scope` (paths actually inspected), `findings[]` (each `{file, line, evidence (max 200 chars _(sheldon)_), relevance, explanation (20-300 chars _(sheldon)_)}`), `confidence`, `recommendation` (30-1000 chars _(sheldon)_), `files_inspected[]`, `next_scout_suggested?`, `errors[]`, `completed_at`, `status` (`success | partial | no_findings | error`). Sub-agent prompt enforces tool whitelist `[Read, Grep]` and forbids `[Bash, Edit, Write]` (Nautilus pattern, sheldon-003 q=5) _(sheldon)_.
- **Cap policy** — defaults: `max_scouts_per_session: 3`, `max_files_in_scope: 20`, `max_retries_on_malformed_json: 1`, `max_depth: 2` _(sheldon — allows scout to spawn 1 level of sub-scout)_. All overridable via `.aioson/config/scout-engine.json`. Cap exceeded returns exit 2 with `error.code = cap_exceeded | scope_too_large | retry_exhausted`. Unknown config keys rejected (strict validation _(sheldon)_).
- **Telemetry** — every lifecycle action (`prep`, `commit`, `failed`, `cap_exceeded`) writes a `runtime_events` row with `type=sub_task` and the appropriate `action`. Mirrors the existing `runtime:emit` convention.
- **`deyvin.md` rubric update** — line 111's `(deferred to deyvin-subtask-scout; until shipped: pause and ask the user)` is replaced with a concrete invocation contract. Workspace + template byte-identical post-merge.
- **Lifecycle on `feature:close`** — when a scout's `feature_slug` matches the closing feature, the file is copied from `.aioson/runtime/scouts/{id}.json` to `.aioson/context/features/{slug}/scouts/{id}.json` for archival. Archival ALSO appends a bullet to `.aioson/context/features/{slug}/dossier.md > ## Sub-task scouts` _(sheldon — mandatory, not optional, per agent-chain-continuity dossier convention)_. Runtime copy is left in place (pruned by `aioson doctor --fix` for files >**90 days** _(sheldon — raised from 30d for cold-load memory preservation)_ unattached). Opt-in `aioson scout:archive --id=<id> --target=<feature_slug>` to preserve orphans manually _(sheldon)_.

### Should-have 🟡
- **`aioson scout:list .`** — diagnostic: lists scouts in `.aioson/runtime/scouts/` with id, parent_agent, status, completed_at, feature_slug. Useful for `aioson doctor` checks but not blocking.
- **`aioson doctor` warning** — adds an advisory check `scouts_directory_pruning` that flags scouts >90 days unattached _(sheldon — promoted to Must-have via Phase 3 plan; AC W6 covers it)_. `--fix` deletes them.
- **`aioson memory:summary` integration** _(sheldon)_ — adds row "Scouts dispatched: N (top topics: ...)" derived from `runtime_events.type=sub_task`. Makes scouts visible to cold-load agent bootstrap. **Promoted to Must-have via Phase 3 plan AC W5** — without this, scouts are invisible to the memory layer that motivates this entire framework.

## Out of scope
- **Multi-agent expansion** (`@dev`, `@qa`, `@architect` as parent_agent values) — engine accepts the parameter, but rubric/prompts are wired only for `@deyvin` in V1. Expansion is a follow-up after observing real V1 usage.
- **`/scout` standalone slash command** — non-goal. Same rationale as the prior PRD: re-evaluate only if `@deyvin` users start asking for direct invocation.
- **CLI-only deterministic scout (no LLM)** — option (c) from the product conversation. Considered and rejected for V1: most useful scouts need interpretation, not just file location. CLI helpers for scope resolution are part of `scout:prep` (which globs and validates the scope), but the actual survey is LLM-driven via the harness's sub-agent capability.
- **Streaming or interactive scouts** — V1 is one-shot: prep → harness spawns sub-agent → sub-agent returns full JSON → validate → commit. No partial reports, no cancel-mid-flight.
- **Cross-session scout reuse** — scouts are tied to `parent_session_id`. Two parent sessions surveying the same scope produce two scouts. De-duplication is a future optimization.
- **Auto-scout on every "ambiguous" message** — `@deyvin` decides when to dispatch using its rubric. The engine never auto-fires.

## User flows

### Scout dispatch flow (happy path)
1. User asks `@deyvin` something matching rubric line 111 (e.g., *"why does workflow:next sometimes inherit stale completion records?"*)
2. `@deyvin` runs `aioson scout:prep --question="..." --scope-paths="src/commands/workflow-next.js,src/handoff-contract.js" --parent-agent=deyvin --parent-session-id=$SESSION_ID --feature-slug=null`
3. CLI returns `{id: "scout-2026-05-13-abc123", prompt: "<standardized scout prompt with the question + scope + output schema>", output_path: ".aioson/runtime/scouts/scout-2026-05-13-abc123.json", cap_remaining: 2}`
4. `@deyvin` invokes the harness's native sub-agent capability (Claude Code's Agent tool, Codex's sub-agent, etc.) with the returned `prompt`. Sub-agent runs in isolated context, reads the scope files, writes JSON to `output_path`.
5. `@deyvin` runs `aioson scout:validate --input=<output_path>`. PASS.
6. `@deyvin` runs `aioson scout:commit --input=<output_path>`. Telemetry emitted, cap counter decremented.
7. `@deyvin` reads `findings`, `confidence`, `recommendation` from the persisted JSON and folds the answer into the user-facing reply. Parent context grew by ~500 tokens (the report) instead of ~10k+ (the surveyed files).

### Sub-agent returns malformed JSON (recovery)
1. Steps 1-4 as above
2. `aioson scout:validate --input=...` fails with `{error: {code: "schema_invalid", details: [...]}}`. State file records `retry: 1`.
3. `@deyvin` re-prompts the harness sub-agent with corrective instructions (e.g., "Your previous output failed validation: <error.details>. Re-run and produce valid JSON.")
4. Second validate: if PASS → continue to commit. If FAIL again → `retry_exhausted`, scout file persists with `status: error`, `runtime:emit --type=sub_task --action=failed`. `@deyvin` informs the user the scout failed and offers manual handoff.

### Cap exceeded (V1 rejection)
1. `@deyvin` has dispatched 3 scouts in the current parent session
2. Fourth `aioson scout:prep` returns exit 2 with `{error: {code: "cap_exceeded", message: "max_scouts_per_session=3 reached for parent_session_id=...", remediation: "Either fold scout findings into a single answer, or open a new session, or override .aioson/config/scout-engine.json"}}`
3. `@deyvin` surfaces the message and asks the user how to proceed (likely: handoff to `/architect` if the surveys keep multiplying)

### Feature attachment + closure archival
1. `@deyvin` dispatches a scout while working on an `in_progress` feature (passes `--feature-slug=foo-feature`)
2. Scout commits at `.aioson/runtime/scouts/{id}.json` with `feature_slug: foo-feature`
3. Later, `aioson feature:close --slug=foo-feature --verdict=PASS` runs
4. As part of closure, all scouts with matching `feature_slug` are copied to `.aioson/context/features/foo-feature/scouts/{id}.json`. Runtime copies left untouched (pruned later by `doctor --fix`).
5. The feature dossier (`.aioson/context/features/foo-feature/dossier.md`) gets a `## Sub-task scouts` section listing the archived scout ids — supports post-mortem auditability.

## Success metrics

_(sheldon — split into honest metrics; total token cost is HIGHER than inline survey per arxiv 2510.26585: 4-15x amplification potential. Value is parent context preservation, not total token savings.)_

- **Adoption signal**: at least 1 scout dispatched by `@deyvin` per `/deyvin` session that triggers rubric line 111 (qualitative; tracked via `runtime_events` `type=sub_task` count). Target: validated within first 2 weeks post-merge by jaime in inception mode.
- **Parent context preservation** _(sheldon — was "Context-budget savings")_: parent agent context grows ≤1000 tokens per scout (only the report enters parent). Equivalent inline survey grows ≥5000. Measured by token diff in conversation transcript samples.
- **Sub-agent efficiency** _(sheldon — NEW)_: scout sub-agent total tokens ≤ 5x equivalent inline survey. Matches hierarchical-pattern token efficiency from arxiv 2603.22651 (financial doc benchmark). Above 5x = scope creep, sub-agent reading too much context.
- **Cold-load comprehension** _(sheldon — NEW)_: a fresh agent (Claude Code or Codex, no prior session memory) reading an archived scout in `.aioson/context/features/{slug}/scouts/{id}.json` can reconstruct WHY it was dispatched and WHAT to do next from `parent_session_excerpt` + `recommendation` alone. Validated qualitatively by jaime in cold-load test session.
- **Cap discipline**: ≤5% of scout sessions hit `cap_exceeded` in real usage. If higher → defaults are wrong; tune `max_scouts_per_session` in config.
- **Validation reliability**: ≥95% of scouts PASS validate on first attempt. Higher retry rate → prompt template needs tightening.

## Open questions

_(sheldon — most converted to pre-made decisions in `.aioson/plans/deyvin-subtask-scout/manifest.md`. Remaining open items below.)_

- ~~**Sub-agent capability detection across harnesses**~~ → **RESOLVED** _(sheldon)_: V1 fully supports Claude Code (Agent tool). On Codex MultiAgentV2 and other harnesses, the engine emits `error.code = harness_unsupported` and falls back to the CLI-less inline survey path. Cross-harness parity is a V2 concern. (Pre-made decision #14 in manifest.)
- ~~**Where exactly do orphaned scouts get pruned?**~~ → **DEFERRED to @dev** _(sheldon)_: documented as Phase 3 implementation decision in manifest. Default approach: `aioson doctor --fix`.
- ~~**Should scout id be deterministic?**~~ → **RESOLVED** _(sheldon)_: random for V1 (`scout-{slug?}-{ISO-date}-{rand6}`). De-dup is a V2 follow-up feature.
- **Should `parent_session_excerpt` block at `scout:prep` if absent, or warn?** _(sheldon — NEW)_: deferred to @analyst in requirements phase. Default leaning: required (block) — cold-load comprehension is the feature's core value.
- **Sub-agent timeout semantics** _(sheldon — NEW)_: does aioson enforce a max wall-clock per scout, or trust the harness? Deferred to @analyst → @dev. Defaulting to "trust the harness" leaks runaway scouts.

## Acceptance criteria (binary, for downstream agents)

1. **`scout:prep` contract** — `aioson scout:prep --question="..." --scope-paths="..." --parent-agent=deyvin --parent-session-id=<id>` returns valid JSON `{id, prompt, output_path, cap_remaining}` on stdout with exit 0. Missing required args or unknown `parent_agent` returns exit 2 with `{error: {code, message}}`. *Test*: snapshot test on output schema; argument-validation test for missing fields and unknown agents.

2. **`scout:validate` contract** — `aioson scout:validate --input=<path>` returns exit 0 if file matches output schema; exit 2 with `{error: {code: "schema_invalid", details: [...]}}` otherwise. Updates the scout state file's retry counter on each invalid call. *Test*: fixture set with valid/invalid samples; assert exit code + state-file mutation.

3. **`scout:commit` contract** — `aioson scout:commit --input=<path>` persists the report at `.aioson/runtime/scouts/{id}.json`, decrements `cap_remaining` for the `parent_session_id`, and emits `runtime:emit --type=sub_task --action=completed`. Re-commit of same id is a no-op (idempotent). *Test*: assert file exists post-commit, SQLite row exists, second commit doesn't double-decrement.

4. **Cap enforcement** — three lifecycle limits, all enforced and configurable: (a) `max_scouts_per_session=3` → 4th `prep` for same session returns `cap_exceeded`; (b) `max_files_in_scope=20` → scope resolving to >20 files returns `scope_too_large`; (c) `max_retries_on_malformed_json=1` → 2nd validate failure returns `retry_exhausted` and persists `status: error`. *Test*: three test cases, one per cap.

5. **Configuration override** — if `.aioson/config/scout-engine.json` exists with `{max_scouts_per_session: 5}`, the cap is 5 instead of 3. Schema-validate the config file; reject unknown keys. *Test*: write config, run 5 preps successfully, 6th rejected.

6. **Lifecycle archival on `feature:close`** — when `aioson feature:close --slug=<s>` runs and `.aioson/runtime/scouts/` contains files with `feature_slug: <s>`, those files are copied to `.aioson/context/features/<s>/scouts/`. Closure is not blocked if the scouts dir doesn't exist yet (created on demand). *Test*: setup scout with feature_slug, run close, assert copy at archive path; assert original untouched.

7. **`deyvin.md` rubric update + template sync** — `.aioson/agents/deyvin.md:~111` no longer contains the `(deferred ...)` parenthetical and instead references the `aioson scout:prep` invocation. `template/.aioson/agents/deyvin.md` byte-identical to workspace post-merge. Kernel size remains ≤15KB. *Test*: file content assertion (regex match on the new line + absence of "deferred"); `fs.statSync` byte equality; file size assertion.

8. **No regression** — `tests/deyvin-density.test.js` (9 cases) and `tests/handoff-contract-micro.test.js` (7 cases) remain green. Full pre-existing test suite passes. *Test*: CI / `node --test` run.

## Dependencies
- **`runtime:emit` + `runtime_events` table** (existing) — telemetry mechanism. Extends with new `type=sub_task` semantic, no schema migration needed.
- **Harness sub-agent capability** — Claude Code's Agent tool, Codex's sub-agent flow, etc. V1 documents the requirement in `deyvin.md` but does not implement a fallback if the harness lacks it. Risk flagged in Open questions.
- **`feature:close` command** (existing) — extended with one new step (copy scouts to feature archive). Backwards-compatible: missing scouts dir = no-op.
- **`deyvin-density` rubric** (closed 2026-05-11) — provides the trigger row this feature unblocks. Hard dependency on the closed feature being shipped.

## Risks
- **Sub-agent quality variance across harnesses** — Claude Code's Agent tool is mature; Codex sub-agents and others are less proven. Validate-then-retry mitigates malformed output, but not "sub-agent gives wrong answer". Mitigation: high-quality prompt template (downstream `@architect`/`@dev` decision); explicit `confidence: low` field for the sub-agent to self-flag.
- **Cap defaults are guesses** — `max_scouts_per_session: 3` and `max_files_in_scope: 20` come from intuition, not data. May need tuning post-launch. Mitigation: configurable via `.aioson/config/scout-engine.json`; success metric tracks `cap_exceeded` rate.
- **Sub-agent context still costs tokens** — even though parent context is preserved, the sub-agent burns tokens too. Net savings depend on the report being significantly smaller than the surveyed files (true for code-survey use cases, less true if the answer requires quoting large code sections). Mitigation: enforce `evidence` field max length (e.g., 200 chars per finding) in the schema.
- **State file race conditions** — if two scouts in the same parent session prep simultaneously, the cap counter could be wrong. Mitigation: file-lock the state file via existing `runtime-store.js` pattern (or accept eventual consistency for V1; document as known limitation).

## Follow-up features (queued, not in this PRD)
- **Multi-agent scout** — extend parent_agent to `@dev`, `@qa`, `@architect`. Each gets a tailored prompt template. Trigger after V1 has 2+ weeks of usage data.
- **Scout result reuse** — when two scouts in the same feature have identical `question + scope`, return the cached one. Requires deterministic id strategy.
- ~~**Scout-driven dossier auto-update**~~ → **PROMOTED INTO V1** _(sheldon)_: dossier auto-append is now mandatory in Phase 3 (AC W3). No longer a follow-up.
- **`/scout` standalone slash command** — only if user demand emerges.
- **`ajv` migration** _(sheldon)_ — only if scout schema grows beyond hand-roll comfort. V1 ships hand-rolled to preserve zero-dep philosophy.

## Delivery plan _(sheldon)_

External phased plan: **`.aioson/plans/deyvin-subtask-scout/manifest.md`** — 3 phases, sizing score 9 (Path B). All 13 pre-made decisions are final and live in the manifest; do not re-discuss in downstream agents. 5 deferred decisions are flagged with explicit owners and timing.

Phases:
1. **`core-engine`** — `src/sub-task-engine.js` + schemas + hand-rolled validator + unit tests (7 ACs)
2. **`cli-verbs`** — `scout:prep` / `scout:validate` / `scout:commit` + integration tests (9 ACs)
3. **`wiring-and-lifecycle`** — `deyvin.md` (CLI + CLI-less) + `feature:close` archival + dossier auto-append + `memory:summary` row + doctor advisory (8 ACs)

Total: 24 phase ACs. Each phase independently mergeable.

## Reference sources (sheldon)

- `researchs/sub-agent-patterns-2026/summary.md` — industry validation: Claude Code subagents, Codex MultiAgentV2, Cursor 3 Agents Window, Cline Plan/Act, shinpr/sub-agents-skills cross-LLM pattern
- `researchs/multi-agent-token-budget-2026/summary.md` — token cost honesty: 4-15x amplification per arxiv 2510.26585; hierarchical pattern is the high-efficiency baseline (arxiv 2603.22651)
- `.aioson/brains/sheldon/architecture-decisions.brain.json`:
  - sheldon-001 (q=5) — workspace/template parity (AC W2)
  - sheldon-003 (q=5) — Nautilus pattern → tool whitelist on sub-agent
  - sheldon-005 (q=4) — CLI fallback always available → CLI-less fallback Must-have
  - sheldon-006 (q=5) — wiring audit before close → Phase 3 ACs W1-W8
- `.aioson/context/done/deyvin-density/prd-deyvin-density.md` — closed PRD that surfaced this follow-up; rubric line 111 is the trigger
- `.aioson/context/bootstrap/what-it-does.md` — system context including `agent-chain-continuity` dossier convention
