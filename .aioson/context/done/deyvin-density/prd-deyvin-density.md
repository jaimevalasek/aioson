---
slug: deyvin-density
classification: MICRO
status: in_progress
type: feature
source: plans/deyvin-system-corrections.md
created_at: 2026-05-11
---

# PRD — Deyvin Density (memory preflight + escalation rubric)

## Vision
Make `@deyvin` stop reasoning from stale context: enforce the Living Memory bootstrap gate on activation and give the agent a deterministic table for deciding what it owns vs what it must hand off — closing the gap that caused real mis-reasoning in the 2026-05-11 session that motivated this feature.

## Problem
`@deyvin` currently activates with a soft bootstrap gate (`if available`) and no explicit escalation rubric. Result: the agent skips `aioson memory:status`, reasons from auto-memory or chat-only context, and occasionally drifts from project reality. A real failure happened on 2026-05-11 — deyvin missed the Living Memory feature shipped the night before because it never read `bootstrap/*.md`. Existing CLAUDE.md rules push out-of-scope work to wrong agents (e.g., `/sheldon` for code analysis) because deyvin's own routing logic is implicit, not codified.

## Users
- **AIOSON developers (jaime + future adopters)**: need `/deyvin` sessions to start from current project reality, not from cached LLM impressions
- **Downstream AIOSON projects**: inherit `deyvin.md` via template sync — get the corrections automatically on `aioson update`
- **Other agents** (`@dev`, `@qa`, `@neo`): consume the escalation rubric to know when to recommend `/deyvin` vs `/product`/`/architect`/`/analyst`

## MVP scope

### Must-have 🔴
- **Enforce bootstrap gate on `/deyvin` activation**: `aioson memory:status .` becomes the first action when the CLI is available; advisory `⚠ [bootstrap] coverage <N>/4 (or stale <D>d)` is emitted before any reasoning when gaps exist. Graceful filesystem fallback when CLI absent.
- **Memory awareness preflight section in `deyvin.md`**: explicit checklist of the 9 memory layers (bootstrap, project-pulse, dev-state, dossier, brains, research cache, devlogs, git-recent, auto-memory) with when-to-consult rules. Loaded *on-demand*, not all-at-once.
- **Scope decision rubric table in `deyvin.md`**: deterministic mapping of user-message symptoms → action (handle / sub-task / handoff `/product` / handoff `/architect` / handoff `/analyst` / handoff `/sheldon`). Covers at minimum the 7 rows from the source briefing.
- **Template sync**: same edits applied to `template/.aioson/agents/deyvin.md` so downstream projects get them via `aioson update`.

### Should-have 🟡
- **Bootstrap-checked telemetry event**: deyvin emits `runtime:emit --type=bootstrap_checked` so the dashboard can confirm the gate ran. Nice-to-have but not blocking — the advisory text is the user-visible signal.

## Out of scope
- **Sub-task scout pattern** (capability 3 from the source briefing) — deferred to a separate feature `deyvin-subtask-scout` with its own `/product` session. That work has real code (`src/sub-task-engine.js`), schema definition, retry/cap logic, and JSON validation — too much for one MICRO.
- **Changes to `@sheldon` or `@neo`** — already landed in 2026-05-11 by `/deyvin` as Onda 1 router fix (workspace + template). Not part of this PRD.
- **Changes to workflow chain order** — the canonical `@product → @analyst → @architect → @ux-ui → @dev → @qa` stays unchanged.
- **Promoting scout to a standalone `/scout` slash command** — non-goal in the source briefing; reevaluated only after the scout feature observes real usage.
- **Auto-memory hygiene** — auto-memory layer is harness-loaded; this PRD does not touch how it's written or pruned.

## User flows

### Activation flow (corrected)
1. User invokes `/deyvin` (any harness)
2. Agent runs `aioson memory:status .` (or filesystem fallback)
3. If `Bootstrap < 4/4` OR stale > 30d → prefix first reply with `⚠ [bootstrap] coverage <N>/4 (or stale <D>d). Recommend /discover (or aioson memory:refresh) before broad work.`
4. Agent loads relevant memory layers on-demand (bootstrap always; others per symptom)
5. Agent applies scope decision rubric to user message → handle / sub-task (deferred) / handoff
6. Continues normally

### Mis-routing avoidance flow
1. User describes a system-correction task in any agent (or none)
2. Router (`@neo`, ambient LLM, or human) matches symptom against rubric in `deyvin.md`
3. Symptom matches "diagnose existing code / bug-vs-feature" → routes to `/deyvin`, not `/sheldon`
4. Onda 1 router fix (already shipped) makes this matching explicit at `@neo` and `@sheldon` level too

## Success metrics
- **Bootstrap gate adherence**: 100% of `/deyvin` sessions on aioson core after this ships emit the advisory or pass cleanly — tracked via runtime telemetry (target: first week post-merge)
- **Mis-routing reduction**: zero recurrences of "deyvin reasoned from stale context" of the type observed on 2026-05-11 — tracked by user report (qualitative)
- **Kernel size discipline**: `.aioson/agents/deyvin.md` stays below 15KB after the additions — enforced by doctor check (advisory) or PR review

## Open questions
- Should the bootstrap advisory be `⚠` (current spec, advisory) or block (`⛔`, halts the session)? Source briefing says advisory; user has not pushed back — keeping advisory as the default. Revisit if false negatives appear.
- Should the escalation rubric live inline in `deyvin.md` or in `.aioson/docs/deyvin/scope-rubric.md` (on-demand)? Default: inline if it fits the 15KB budget; on-demand doc if not. `@dev` decides during implementation based on actual size after merge.

## Acceptance criteria (binary, for `@dev`)

1. `/deyvin` activation on a project with `aioson` CLI available calls `memory:status` and surfaces advisory text when `Bootstrap < 4/4`. *Test*: integration test runs deyvin prompt against a fixture with `bootstrap/current-state.md` deleted → asserts advisory string in output.
2. `/deyvin` activation on a project without `aioson` CLI installed gracefully reads `.aioson/context/bootstrap/*.md` directly via filesystem. *Test*: integration test stubs `aioson` binary as absent → asserts agent still reads bootstrap.
3. `.aioson/agents/deyvin.md` contains a section titled "Memory awareness preflight" enumerating the 9 memory layers from the briefing. *Test*: doc structure check (section exists, layer count = 9).
4. `.aioson/agents/deyvin.md` contains a section titled "Scope decision rubric" with a table of at least 7 symptom→action rows. *Test*: doc structure check.
5. `template/.aioson/agents/deyvin.md` is byte-identical in the new sections to the workspace version. *Test*: file diff returns zero on the added blocks.
6. `.aioson/agents/deyvin.md` file size is ≤ 15360 bytes (15KB) after the merge. *Test*: file size assertion.
7. All existing deyvin-related tests continue to pass. *Test*: test suite green.

## Dependencies
- **Living Memory** (feature `living-memory`, done 2026-05-11) — provides `aioson memory:status`, `bootstrap/*.md` files, advisory format conventions. This PRD assumes that machinery exists.
- **Router fix Onda 1** (shipped 2026-05-11 by `/deyvin`) — `@neo` and `@sheldon` already route correctly. This PRD reinforces the deyvin-side of the same fix.

## Risks
- **Kernel size pressure**: `deyvin.md` is currently around 4-5KB and has headroom, but adding both a 9-row checklist and a 7+ row rubric may approach 8KB. Risk is low but flagged. Mitigation: move rubric to on-demand doc if needed.
- **Behavior change on older CLI versions**: if a downstream project pins an old `aioson` version without `memory:status`, the call will fail. Mitigation: graceful fallback (AC #2). Document the minimum CLI version in `deyvin.md` if needed.
- **Test fixtures**: integration tests need a fake project tree with `bootstrap/*.md` — small effort but new fixture pattern in the test suite.

## Follow-up features (queued, not in this PRD)
- **`deyvin-subtask-scout`** (next `/product` session): scout sub-task engine, `src/sub-task-engine.js`, JSON schema, `scout-report-*.json` contract, retry/cap logic, audit via `runtime:emit --type=sub_task`. Classification likely SMALL (new code + new doc + tests).
