---
generated_by: qa
generated_at: "2026-05-11T05:30:00.000Z"
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

## Current improvement focus

Feature `living-memory` was completed in 2026-05 (5 phases, 39 new tests, ~1100 lines of production + ~1440 lines of pt-BR documentation under `docs/pt/living-memory/`).

Next candidates surfaced during living-memory: promote autonomy-protocol v1.1 across consumer projects, surface adoption telemetry (reflection counts in SQLite), trim `dev.md` kernel below 15KB, and explore `harness-isolation` (real sandbox per tier, deferred from this feature).

Recently closed (2026-04-24): `sdlc-process-upgrade` — process-level corrections in the development workflow (gate approval ergonomics, handoff contract completeness, implementation-plan ownership, Sheldon PRD target detection, bootstrap/session/brain memory integration, observability for primary workflow agents).

## Business rules and constraints

- AIOSON should keep one workflow motor centered on `workflow:next` and `workflow:execute`.
- For MEDIUM work, gates A, B and C are blocking before implementation.
- Agents should write durable artifacts to disk instead of delivering only in chat.
- CLI/runtime should own deterministic state transitions; prompts should not rederive mechanical state when a command can provide it.
- Living Memory reflection never blocks workflows — hooks in `workflow:next` and `runAgentDone` are best-effort and fail silently.
- Tier3 commands (`git push`, `npm publish`, `cloud:publish:*`, `genome:publish`, `skill:publish`, `squad:publish`) are NEVER auto-materialized into any harness allow-list, regardless of `derived_from_tiers`. Irreversible operations always require explicit human action.
