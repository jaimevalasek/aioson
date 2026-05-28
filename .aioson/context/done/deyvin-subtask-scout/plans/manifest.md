---
target_prd: .aioson/context/prd-deyvin-subtask-scout.md
slug: deyvin-subtask-scout
classification: SMALL
sheldon_round: 1
created_at: 2026-05-13
status: pending
sizing_score: 9
sizing_decision: phased-plan
phases:
  - slug: core-engine
    file: plan-core-engine.md
    status: done
    depends_on: []
    completed_at: 2026-05-13
    files_added:
      - src/sub-task-schemas.js
      - src/sub-task-engine.js
      - tests/sub-task-engine.test.js
    tests_pass: 51/51
  - slug: cli-verbs
    file: plan-cli-verbs.md
    status: done
    depends_on: [core-engine]
    completed_at: 2026-05-13
    files_added:
      - src/sub-task-state.js
      - src/commands/scout-prep.js
      - src/commands/scout-validate.js
      - src/commands/scout-commit.js
      - template/.aioson/config/scout-engine.json
      - tests/scout-cli.test.js
    files_modified:
      - src/cli.js
    tests_pass: 10/10
    notes: "scope_globs deferred to V2 (Node 18-21 has no built-in fs.glob); V1 = scope_paths only with directory enumeration. Discovered cli.js exit-code propagation only fires under --json — tests use --json explicitly; behavior aligns with existing CLI test convention."
  - slug: wiring-and-lifecycle
    file: plan-wiring-and-lifecycle.md
    status: done
    depends_on: [cli-verbs]
    completed_at: 2026-05-13
    files_added:
      - src/dossier/scout-section.js
      - tests/deyvin-scout-wiring.test.js
      - tests/scout-section.test.js
      - tests/feature-close-scouts-archival.test.js
    files_modified:
      - .aioson/agents/deyvin.md (rubric line + new Sub-task scout invocation section)
      - template/.aioson/agents/deyvin.md (byte-identical mirror)
      - src/commands/feature-close.js (archiveScoutsForFeature hook + scoutArchive in result)
      - src/commands/memory.js (collectScoutSummary + Scouts dispatched row in summary)
      - src/doctor.js (assessScoutPruning + scouts_directory_pruning advisory + --fix)
      - src/i18n/messages/en.js (3 new keys: scouts_directory_pruning, _hint, fix_action)
    tests_pass: 19/19
    notes: "deyvin.md final size: 13611 bytes (under 15360 budget). Found firstSentence regex bug during scout-section.test.js — was splitting on ANY period (including in filenames like workflow-next.js); fixed to require period followed by whitespace or EOS."

corrections:
  - round: 1
    date: 2026-05-13
    plan: corrections-2026-05-13.md
    status: resolved
    triggered_by: qa Gate D round 1 (verdict: BLOCKED)
    findings_resolved:
      - id: C-01
        severity: critical
        title: scout:commit short-circuits when sub-agent wrote to output_path
        fix: state-based committed_ids tracking (replaces fs.existsSync check); reason renamed to 'already_committed'
      - id: M-01
        severity: medium
        title: feature-close archival telemetry lands as event_type='start' instead of 'sub_task'
        fix: new src/sub-task-telemetry.js with sentinel agent_runs anchor (FK-safe direct insert); replaces logAgentEvent in feature-close archival
      - id: L-01
        severity: low
        title: scope_paths accepts traversal paths outside project root
        fix: isInsideRoot sandbox check in resolveScope; rejected paths return exit 2 with error.code='path_outside_root'
    files_added:
      - src/sub-task-telemetry.js
      - tests/scout-qa-findings.test.js
    files_modified:
      - src/commands/scout-commit.js (C-01)
      - src/commands/feature-close.js (M-01: emitSubTaskEvent replaces logAgentEvent)
      - src/commands/scout-prep.js (L-01: isInsideRoot + rejected handling)
      - src/sub-task-engine.js (no change — committed_ids initialized in scout-commit, not engine)
      - tests/scout-cli.test.js (C7 reason assertion update)
    tests_pass: 5/5 findings + 85/85 scout suites
    schema_discoveries:
      - "agent_events.run_key is FOREIGN KEY → agent_runs.run_key with foreign_keys=ON enforcement; sentinel-anchor pattern documented for future direct-insert telemetry"
---

# Manifest — deyvin-subtask-scout

## Target PRD
`.aioson/context/prd-deyvin-subtask-scout.md` (SMALL)

## Overview

Sub-task scout primitive for `@deyvin`: dispatch context-isolated diagnostic surveys (>5 files / runtime-flow tracing) without burning parent context. Three-phase plan derived from sizing score 9 (Path B).

## Phases

| # | Slug | File | Depends on | What ships |
|---|------|------|-----------|-----------|
| 1 | `core-engine` | `plan-core-engine.md` | — | `src/sub-task-engine.js` + JSON schemas + hand-rolled validator + cap state + unit tests |
| 2 | `cli-verbs` | `plan-cli-verbs.md` | core-engine | `aioson scout:prep|validate|commit` + config schema + integration tests |
| 3 | `wiring-and-lifecycle` | `plan-wiring-and-lifecycle.md` | cli-verbs | `deyvin.md` invocation block (CLI + CLI-less fallback) + `feature:close` archival + dossier auto-append + `memory:summary` + `doctor` advisory |

Each phase is independently implementable (next phase has dependency on previous, but each can be merged standalone — engine compiles without callers, CLI compiles without prompt wiring).

## Pre-made decisions (FINAL — do not re-discuss)

1. **Trigger surface V1**: only `@deyvin`. Engine accepts `parent_agent` parameter, but rubric is wired only for deyvin in V1. Multi-agent expansion is a follow-up feature gated on usage data.
2. **Execution model**: aioson provides the contract layer (`prep` → `validate` → `commit`). The harness's native sub-agent capability spawns the isolated context (Claude Code Agent tool, Codex MultiAgentV2, etc.). Same pattern as `harness:validate` and `memory:reflect-prepare/commit`.
3. **JSON schema validation**: hand-rolled minimal validator in `src/sub-task-engine.js`. **Zero new deps**. Schema is small and stable — `ajv` adds 700KB for marginal benefit. Migrate to `ajv` in V2 only if schema grows.
4. **Sub-agent tool whitelist (Nautilus pattern, sheldon-003 q=5)**: prompt template enforces `tools: [Read, Grep]`, `disallowedTools: [Bash, Edit, Write]`, read-only. Documented in prompt body so even harnesses without machine-readable tool config (e.g., generic CLI fallback) honor it.
5. **CLI-less fallback (sheldon-005 q=4)**: `deyvin.md` carries BOTH the CLI invocation block (preferred) AND a manual fallback template (when `aioson` binary absent). Fallback skips telemetry, caps, archival — degrades gracefully, doesn't refuse.
6. **Cold-load comprehension field** (user reinforcement): scout report MUST include `parent_session_excerpt` (2-3 sentences written by parent at `scout:prep` time explaining WHY scout was dispatched). Required field, schema-enforced. Closes the cold-load comprehension gap that motivates AIOSON's disk-first philosophy.
7. **Lifecycle**: feature-attached scouts → permanent archival to `.aioson/context/features/{slug}/scouts/` on `feature:close`. Unattached scouts → 90-day prune in `.aioson/runtime/scouts/` (raised from 30d in PRD). Opt-in `aioson scout:archive --id=<id> --target=<feature_slug>` to preserve orphans.
8. **Dossier integration mandatory**: `feature:close` archival step ALSO appends a line to `.aioson/context/features/{slug}/dossier.md > ## Sub-task scouts` per archived scout. Format: `- {id}: {question} → {recommendation} (confidence: {confidence})`.
9. **`memory:summary` integration**: `aioson memory:summary --last=N` adds a row "Scouts dispatched: N (top topics: ...)" derived from `runtime_events.type=sub_task`. Makes scouts visible to cold-load agent bootstrap.
10. **Scout id format**: `scout-{slug}-{ISO-date}-{rand6}` when `feature_slug` provided; `scout-{ISO-date}-{rand6}` otherwise. Greppable per feature.
11. **Cap defaults**: `max_scouts_per_session=3`, `max_files_in_scope=20`, `max_retries_on_malformed_json=1`, `max_depth=2` (NEW — allows scout to spawn sub-scout up to one level). All overridable in `.aioson/config/scout-engine.json`.
12. **Evidence field**: schema-enforced max 200 chars per `findings[i].evidence`.
13. **Success metrics (honest)**: TWO distinct metrics — (a) parent context grows ≤1000 tokens per scout (parent-context-preservation); (b) sub-agent total tokens ≤5x equivalent inline survey (sub-agent-efficiency). Total cost is HIGHER than inline (industry: 4-15x amplification per arxiv 2510.26585) — value is parent context preservation, not total token savings.
14. **Harness sub-agent capability** (was Open Question in PRD): V1 fully supports Claude Code (Agent tool). On Codex MultiAgentV2 and other harnesses, the engine emits `error.code = harness_unsupported` and the CLI-less fallback inline-survey path is taken. Cross-harness parity is a V2 concern.

## Deferred decisions (downstream agents own these)

| Decision | Owner | When |
|----------|-------|------|
| Exact prune mechanism (`aioson doctor --fix` vs `workflow:next` startup hook) | @architect or @dev | Phase 3 implementation |
| Sub-agent invocation block per harness (Codex/Gemini specifics) | @dev | Phase 3 implementation; if research needed, route back to @sheldon |
| Whether `parent_session_excerpt` should be required at `scout:prep` (block on absent) or warned (allow with `excerpt: null`) | @analyst | Requirements phase |
| File lock strategy for cap state (existing `runtime-store.js` pattern vs simple `.lock` file vs eventual consistency) | @dev | Phase 1 implementation |
| Sub-agent timeout semantics (does aioson enforce, or trust harness?) | @analyst → @dev | Requirements + Phase 1 |

## Reference sources (sheldon)

- `researchs/sub-agent-patterns-2026/summary.md` — industry validation (Claude Code subagents, Codex MultiAgentV2, Cursor 3, Cline Plan/Act, shinpr/sub-agents-skills cross-LLM pattern)
- `researchs/multi-agent-token-budget-2026/summary.md` — token cost honesty (4-15x amplification per arxiv 2510.26585; hierarchical pattern is high-efficiency)
- `.aioson/brains/sheldon/architecture-decisions.brain.json` nodes: sheldon-001 (workspace/template parity), sheldon-003 (Nautilus pattern), sheldon-005 (CLI fallback), sheldon-006 (wiring audit)
- `.aioson/context/done/deyvin-density/prd-deyvin-density.md` — closed PRD that surfaced this follow-up; rubric line 111 is the trigger
- `.aioson/context/bootstrap/what-it-does.md` — system context including agent-chain-continuity dossier convention

## Sheldon version
1 (first enrichment session, single round)
