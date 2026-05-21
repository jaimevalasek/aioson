---
phase: 3
slug: universal-loading
feature: operator-memory
release_target: v1.14.0
status: pending
depends_on: [phase-1-storage-identity, phase-2-capture-promotion]
---

# Phase 3 — Universal loading directive (cross-cutting)

## Scope

Wire operator-memory into ALL agent prompts via a universal `## Memory loading` + `## Memory capture` directive injected into `template/CLAUDE.md` + `template/AGENTS.md`. Implements lazy decision loading by description match. This is the cross-cutting phase — affects ~30 agent files. Per inception risk: ships behind feature flag `AIOSON_OPERATOR_MEMORY=true` (default off until Phase 4 ships green).

## New or modified entities

- **`template/CLAUDE.md` + `template/AGENTS.md`** — inject TWO new sections at the existing `## Mandatory first action` step:
  - **`## Memory loading`** — preflight directive to read `~/.aioson/operators/{identity}/MEMORY.md` if env flag set; lazy-load matching decisions
  - **`## Memory capture`** — link to (or inline) the versioned `template/agents/_shared/memory-capture-directive.md` from Phase 2
- **`MEMORY.md` index format**:
  ```markdown
  ---
  identity_prefix: {first-8-chars-of-hash}
  decisions_count: N
  last_promoted: {ISO}
  ---
  
  # Operator Memory — Index
  
  - [Commit autonomy after slice approval](decisions/commit-autonomy-after-slice.md) — authorization, reinforced 2026-05-21
  - [npm publish stays manual](decisions/npm-publish-manual.md) — exclusion, reinforced 2026-05-20
  - ...
  ```
  Format: one line per decision, ≤ 150 chars (matches existing `MEMORY.md` index convention from harness auto-memory). Decisions section title (link text) is human-readable derived from decision `# Title` H1.
- **`op:list`** + **`op:show`** full implementations (Phase 1 stubs replaced).
- **`src/operator-memory/loader.js`** (NEW): `loadMemoryIndex(identity)`, `matchDecisions(index, taskKeywords)` — used by agents at preflight to identify which decisions are task-relevant.
- **Cross-harness format spec** at `.aioson/docs/operator-memory/memory-md-format.md` (NEW): canonical `MEMORY.md` + `decisions/*.md` schemas; reference impl pseudocode for non-Claude harnesses.
- **Support matrix** documented in same doc: Claude Code (native), Codex (compatible via AGENTS.md), Gemini CLI (compatible via AGENTS.md), Cursor (TBD), Aider (TBD). V1 explicit support: Claude Code + Codex + Gemini.

## User flows covered

- **F3.1 — Agent preflight load (flag ON)**:
  1. Env: `AIOSON_OPERATOR_MEMORY=true`
  2. Agent starts session, reads `CLAUDE.md`/`AGENTS.md`
  3. Mandatory first action includes new step: read `~/.aioson/operators/{sha256(git-email)}/MEMORY.md`
  4. Index entries visible in agent context (≤ 50 lines typically; budgeted ≤ 5KB)
  5. Agent task involves "commit" → matches `commit-autonomy-after-slice` description → lazy-loads `decisions/commit-autonomy-after-slice.md`
  6. Agent applies decision: no asks user about commit autonomy
- **F3.2 — Agent preflight (flag OFF, default)**:
  1. Env: `AIOSON_OPERATOR_MEMORY` unset or `false`
  2. Agent preflight skips memory loading silently (backward-compat per AC-P3-08)
- **F3.3 — Identity mismatch (multi-dev)**:
  1. Alice and Bob share `.aioson/` of same repo
  2. Alice's session: `~/.aioson/operators/{alice-hash}/MEMORY.md` loaded (her decisions only)
  3. Bob's session: `~/.aioson/operators/{bob-hash}/MEMORY.md` loaded (his decisions only)
  4. No cross-contamination — different `~` per OS user typically anyway, but even on shared `~`, hashes differ

## Acceptance criteria

- **AC-P3-01** Universal directive inserted in template/CLAUDE.md AND template/AGENTS.md at correct position (after existing `## Mandatory first action`); positions verified via T5 semantic parity.
- **AC-P3-02** Feature flag `AIOSON_OPERATOR_MEMORY`: default unset/false → directive guard skips memory loading silently. Set to `true` → directive activates.
- **AC-P3-03** `op:list` shows decisions with category + last_reinforced + signal_type per `--format=table` (default) and `--format=json` (machine-readable).
- **AC-P3-04** `op:show <slug>` prints decision body + frontmatter to stdout; exit 1 + stderr if slug not found.
- **AC-P3-05** `MEMORY.md` index regenerates atomically on every promote/forget/decay event (Phase 5 ships decay; Phase 3 handles promote/forget triggers). Index entries ≤ 150 chars each.
- **AC-P3-06** Byte budget audit (per DD-03 + refinement #12): directive bytes counted; total preflight overhead measured across all template agent files; reported in `scripts/memory-budget-audit.js` (NEW). Pass threshold = ≤ 300 tokens per agent preflight (≈ 1200 bytes per directive copy).
- **AC-P3-07** Cross-harness format spec at `.aioson/docs/operator-memory/memory-md-format.md` exists + documents schema for non-Claude harnesses (Codex, Gemini explicit; Cursor/Aider TBD).
- **AC-P3-08** Backward-compat: with flag OFF, existing AIOSON behavior is byte-identical at agent preflight (no extra reads, no stderr lines, no telemetry events). Verified via baseline file like `tests/baselines/agent-done-stdout.txt` from F2.
- **AC-P3-09** Lazy load: `matchDecisions(index, keywords)` returns ≤ 5 decision matches per task by default (tunable via env); avoids loading all decisions on every preflight.
- **AC-P3-10** Match heuristic: decision title + body keywords matched against task description keywords (Phase 3 starts with substring match; FTS5 query optimization deferred to follow-up). Documented as V1 simplification.
- **AC-P3-11** Sync-agents-preflight semantic parity check (T5 from workflow-handoff-integrity) detects drift between template/CLAUDE.md and template/AGENTS.md after directive injection — both must contain functionally equivalent directive blocks.
- **AC-P3-12** Smoke runner adds `[OM3] universal directive` section verifying directive present + flag-gated correctly + lazy-load returns expected matches for sample fixture.

## Implementation sequence

1. **`template/CLAUDE.md`** + **`template/AGENTS.md`** edits — add `## Memory loading` + `## Memory capture` sections at consistent position. Both files updated in single commit. T5 parity verifies.
2. **`src/operator-memory/loader.js`** (NEW): `loadMemoryIndex`, `matchDecisions`, `regenerateIndex`. Pure functions; sync OK (file reads).
3. **`src/operator-memory/index-md.js`** (NEW): `MEMORY.md` reader/writer with frontmatter handling (reuse existing `src/lib/frontmatter.js` if present, else inline).
4. **`src/commands/op-list.js`**, **`src/commands/op-show.js`**: full impls (Phase 1 stubs replaced). Both honor `--format=json` for machine consumers.
5. **`scripts/memory-budget-audit.js`** (NEW): counts bytes added to template files; outputs report; integrated into `npm run ci` as warning (not blocker V1).
6. **`.aioson/docs/operator-memory/memory-md-format.md`** (NEW): canonical schemas + cross-harness reference impl pseudocode.
7. **`tests/operator-memory-loading.test.js`** (NEW): 15+ tests AC-P3-01..12.
8. **Smoke runner** extension: `[OM3]` section.
9. **Promote/forget hooks** in `src/commands/op-promote.js` + `op-forget.js`: regenerate MEMORY.md after operation.
10. **Wiring audit** Phase 3 entry.

## External dependencies

None new. Reuses Phase 1 + Phase 2 infrastructure.

## Notes for @dev

- The directive in template files is the trickiest part. Use clean section markers so T5 semantic parity catches drift.
- Lazy-load match heuristic (AC-P3-10): keep simple V1. Substring match on title + frontmatter `signal_type` tags. FTS5-backed query optimization is great in V2 but defers to architect.
- Inception risk: feature flag `AIOSON_OPERATOR_MEMORY=true` is OFF by default for Phase 3 release. Flag flips ON when Phase 4 (conflict policy) ships and tests prove harmless preflight load.
- Cross-harness spec (AC-P3-07): write the doc treating Codex + Gemini reading `AGENTS.md` as already-supported; mark Cursor + Aider as V2 explicitly. Reference impl is just "read MEMORY.md if env flag set; pass content to model as context; lazy-load matched decisions by keyword."

## Notes for @qa

- Critical regression test (AC-P3-08): with flag OFF, run a full agent session — stdout/stderr should be byte-identical to pre-Phase-3 baseline. Use existing `tests/baselines/agent-done-stdout.txt` mechanism.
- Cross-template parity (AC-P3-11): verify T5 (semantic-sync-preflight) detects intentional divergence between CLAUDE.md and AGENTS.md if directives drift. Add a regression fixture similar to AC-T5-06.
- Multi-dev isolation smoke (F3.3): single fixture with 2 different `AIOSON_OPERATOR_ID` overrides — verify each session reads only its own MEMORY.md.

## Phase-specific reference sources

- `researchs/agent-memory-backends-2026/summary.md` — cross-system loading patterns (MEMORY.md is lightweight index; matches Engram + auto-memory precedent)
- AIOSON `tests/sync-agents-preflight-semantic.test.js` — T5 regression-guard pattern for cross-template parity
- AIOSON `.github/workflows/release-smoke.yml` (T6) — flag-gated rollout pattern (AIOSON_PREPUBLISH=true equivalent)
