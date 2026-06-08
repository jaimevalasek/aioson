---
generated_by: product
generated_at: "2026-06-01T15:12:13-03:00"
confidence: high
---

# What It Does

AIOSON is a Node.js CLI framework for spec-driven development with specialized agents, workflow routing, deterministic gates, runtime telemetry, context artifacts and recovery support.

## Active capabilities

- Creates and routes official agents through `.aioson/agents/`.
- Stores project and feature artifacts in `.aioson/context/`.
- Supports SDD flows with PRDs, requirements, specs, architecture, implementation plans and QA reports.
- Provides deterministic CLI helpers such as `preflight`, `gate:check`, `artifact:validate`, `workflow:next`, `workflow:execute`, `pulse:update`, `agent:done`, `verify:gate` and runtime/live session commands.
- Maintains runtime telemetry in `.aioson/runtime/aios.sqlite`.
- Supports project memory layers including bootstrap context, project pulse, devlogs, research cache and brains.
- Keeps `bootstrap/*.md` automatically in sync with project changes through the **Living Memory** pipeline: a deterministic heuristic (`src/memory-reflect-engine.js`) classifies git diffs after `agent:done` / `workflow:next --complete`, the CLI writes a manifest under `.aioson/runtime/reflect-prompt.json`, the in-harness agent reflects the targets, and `memory:reflect-commit` validates and persists.
- Enforces a 3-tier autonomy contract via `.aioson/config/autonomy-protocol.json` v1.1 — tier1 silent (read/telemetry), tier2 notified (memory writes), tier3 blocking (irreversible). `permissions-generator` materializes native allow-lists for Claude Code, Codex, Gemini, and OpenCode at install/update; tier3 is hard-rejected even when listed.
- Exposes `aioson notify --level=info|warn|block` as a visual wrapper over `runtime:emit`, with ℹ/⚠/⛔ prefixes and exit code 2 on `block`.
- Diagnoses Living Memory health through `aioson doctor` (warning-severity checks for bootstrap coverage, features dir, claude commands, version drift, permissions sync) with `--fix` auto-correcting permissions and structural gaps.
- Supports marketing-focused work through `@copywriter` Mode 6 (Campaign Package), G2.5 master copywriter selection across 8 schools, alternative copy structures (Tríade, KSTK, CPGC), and a copy gate that halts `@ux-ui` until `copy-{slug}.md` exists.
- Bounds the per-activation cost of `bootstrap/current-state.md` via the **agent loading contract**: `aioson memory:trim` + a `feature:close` auto-rollup split the hot log from a cold `current-state-archive.md`; `context:health` measures the bootstrap layer; a shared `code-health-analysis` lens loads on-demand for the test/analysis agents. See `.aioson/design-docs/agent-loading-contract.md`.
- Supports paused feature lifecycle semantics so parked features remain visible without blocking new workflow routing.
- Measures prompt/context cost with scoped `agent:audit` modes (runtime, template, inception) and a standalone `skill:audit` command.
- Reports advisory context drift through `context:health` warnings while preserving non-failing health output for review workflows.

## Current improvement focus

Active (in_progress) since 2026-06-08: `briefing-refiner` (SMALL) introduces a pre-production refinement agent between `@briefing` and `@product`. It will read `.aioson/briefings/{slug}/briefings.md`, generate an interactive local `review.html` for human specification review, persist structured edits/comments in `refinement-feedback.json`, reapply confirmed changes back to the briefing, and leave a `refinement-report.md` before approval and PRD generation. PRD: `.aioson/context/prd-briefing-refiner.md`.

Active (in_progress) since 2026-06-02: `quality-governance-baseline-and-new-regression-gate` (SMALL) frames a narrow AIOSON quality-governance MVP: define an AIOSON-native quality result contract, add experimental `aioson quality:audit`, use Fallow as the first Node.js provider, baseline existing debt, and gate only new regressions in changed code. PRD: `.aioson/context/prd-quality-governance-baseline-and-new-regression-gate.md`.

Recently closed (2026-06-01): `cost-context-optimization` (SMALL) shipped measurement/state correctness: paused lifecycle handling, stale workflow reset, scoped `agent:audit`, standalone `skill:audit`, advisory `context:health` drift warnings, and QA Gate D PASS. Report: `.aioson/context/qa-report-cost-context-optimization.md`.

Recently closed (2026-05-30): `cross-tool-project-knowledge` (SMALL) extends `active-learning-loop` with cross-harness project knowledge. Gotcha/resolution capture persists as `type='quality'` + `kind`, `feature:close` materializes `.aioson/learnings/{gotchas,recipes}/` plus `INDEX.md`, AGENTS/CLAUDE/OPENCODE load Project knowledge, `learning --sub=import-from-claude` imports selected Claude memory entries, greenfield setup ships learnings placeholders, and QA Gate D passed with artifacts archived under `.aioson/context/done/cross-tool-project-knowledge/`. PRD: `.aioson/context/done/cross-tool-project-knowledge/prd-cross-tool-project-knowledge.md`.

Paused since 2026-06-01: `gemini-phaseout` (SMALL) remains visible for future decision but no longer blocks new feature routing. The prior Phase 2 hard-removal path was paused after the project decision to remove Gemini work from the active lane.

Active (in_progress) since 2026-05-18: `release-page-1-9-0` (MICRO) — adds a standalone editorial HTML page at `tutorials/releases/1-9-0/index.html` narrating the 10-day evolution that culminated in v1.9.0 (Living Memory, Brains, Active Learning Loop, hardening R4-7, cross-platform, lay-user mode), plus a redesigned `tutorials/index.html` hub and visual polish on the 4 existing tutorials. Standalone HTML (zero build), structure prepared for future `tutorials/releases/{version}/`. Cross-repo work (mirror to `aioson-com`) intentionally out of scope — user copies manually later. PRD: `.aioson/context/prd-release-page-1-9-0.md`.

Feature `living-memory` was completed in 2026-05 (5 phases, 39 new tests, ~1100 lines of production + ~1440 lines of pt-BR documentation under `docs/pt/living-memory/`).

Next candidates surfaced during living-memory: promote autonomy-protocol v1.1 across consumer projects, surface adoption telemetry (reflection counts in SQLite), trim `dev.md` kernel below 15KB, and explore `harness-isolation` (real sandbox per tier, deferred from this feature).

Active (in_progress) since 2026-05-13: `active-learning-loop` (MEDIUM) — closes the open ends of AIOSON's existing learning infrastructure (`learning`, `pattern:detect`, brains, `evolution_log`) by wiring auto-distillation into `feature:close`, adding rule/brain usage telemetry (`context_load_events` SQLite table), three new doctor checks (`rule_staleness`, `learning_orphans`, `distillation_lag`), and two new CLI verbs (`memory:search` with FTS5 over `content_items` + `learnings`, `memory:archive` tier 2 human-approved). Inception-mirrored: every change lands in both `src/` and `template/`. Out of scope: auto-archive without human, cross-project memory, LLM clustering, multi-channel gateway. PRD: `.aioson/context/prd-active-learning-loop.md`. Triggered by insights from a video on Hermes Agent learning loops — AIOSON already has the primitives, this feature closes the loop.

Recently closed (2026-05-14): `deyvin-subtask-scout` (SMALL) — added a structured sub-task scout primitive so `@deyvin` dispatches context-isolated diagnostic surveys (>5 files or runtime-flow tracing) without burning parent context. Shipped `src/sub-task-engine.js`, three CLI verbs (`scout:prep`, `scout:validate`, `scout:commit`), versioned JSON output schema, per-session/scope/retry caps, telemetry via `runtime:emit --type=sub_task`, and lifecycle archival on `feature:close`. PRD: `.aioson/context/prd-deyvin-subtask-scout.md`. Follow-up surface: multi-agent scout deferred until V1 usage data exists.

Recently closed (2026-05-11): `deyvin-density` (MICRO) — enforced the Living Memory bootstrap gate on `/deyvin` activation, added a 9-layer Memory awareness preflight section, and codified an 11-row Scope decision rubric replacing the prior bullet-list Escalation map. **Companion router fix landed same session** (`@neo` routing split + `@sheldon` Strict scope boundary). **Inception-mode framework fix** in same dev slice: handoff contracts now MICRO-aware (`src/handoff-contract.js`) and workflow state transitions between features automatically (`src/commands/workflow-next.js`) — unblocked MICRO features inside MEDIUM projects.

Recently closed (2026-04-24): `sdlc-process-upgrade` — process-level corrections in the development workflow (gate approval ergonomics, handoff contract completeness, implementation-plan ownership, Sheldon PRD target detection, bootstrap/session/brain memory integration, observability for primary workflow agents).

## Business rules and constraints

- AIOSON should keep one workflow motor centered on `workflow:next` and `workflow:execute`.
- For MEDIUM work, gates A, B and C are blocking before implementation.
- Agents should write durable artifacts to disk instead of delivering only in chat.
- CLI/runtime should own deterministic state transitions; prompts should not rederive mechanical state when a command can provide it.
- Living Memory reflection never blocks workflows — hooks in `workflow:next` and `runAgentDone` are best-effort and fail silently.
- Tier3 commands (`git push`, `npm publish`, `cloud:publish:*`, `genome:publish`, `skill:publish`, `squad:publish`) are NEVER auto-materialized into any harness allow-list, regardless of `derived_from_tiers`. Irreversible operations always require explicit human action.

