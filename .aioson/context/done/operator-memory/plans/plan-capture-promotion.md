---
phase: 2
slug: capture-promotion
feature: operator-memory
release_target: v1.13.0
status: pending
depends_on: [phase-1-storage-identity]
---

# Phase 2 — Capture + Promotion engine

## Scope

Implement the LLM-driven capture loop: agents observe standing-decision signals during conversations and emit `aioson op:capture` calls. Captured signals land in `proposals/`. On second detection (2x threshold, PMD-07), promote to `decisions/` with 1-liner silent audit (PMD-08). LLM-driven divergence from AIOSON's deterministic principle is acknowledged + mitigated via versioned prompt template (PMD-02).

## New or modified entities

- **`proposal`** schema at `~/.aioson/operators/{identity}/proposals/{slug}.md`:
  ```yaml
  ---
  slug: {kebab-case}
  signal_type: authorization | exclusion | correction | confirmation
  detected_count: 1
  first_detected: {ISO}
  last_detected: {ISO}
  quotes: [{verbatim_user_message}, ...]
  proposal: {paraphrase}
  source_agent: {agent_name}
  ---
  ```
- **`decision`** schema at `~/.aioson/operators/{identity}/decisions/{slug}.md`:
  ```yaml
  ---
  slug: {same as proposal}
  signal_type: ...
  promoted_at: {ISO}
  last_reinforced: {ISO}     # PMD-11 — updated on each new detection post-promote
  superseded_by: null         # PMD-11 — populated on op:forget that replaces
  category: identity | autonomy | tooling | default
  source_agent: {agent}
  ---
  
  # {Human-readable title}
  
  {Body — short paragraph capturing the decision in user-facing language}
  
  ## Trigger quotes
  - "{first quote}"
  - "{second quote}"
  ```
- **Versioned signal-detection prompt template** at `template/agents/_shared/memory-capture-directive.md` (read into each agent's preflight via Phase 3's universal directive injection). Contains:
  - 4 signal-type heuristics with 3+ concrete examples each
  - Capture-call format: `aioson op:capture --signal=<type> --quote="..." --proposal="..." --source-agent=<self>`
  - Anti-pattern examples (what NOT to capture: "neste PR específico" context-bound preferences)
- **Telemetry events** (per PMD-12, reusing `dossierTelemetry` per DD-04 default):
  - `op_capture` — `{identity, signal_type, slug, proposal_count}`
  - `op_promote` — `{identity, slug, signal_type, days_to_promote}`
  - `op_forget` — `{identity, slug, mode: 'manual'|'decay'|'supersede'}`

## User flows covered

- **F2.1 — First detection (proposal)**:
  1. User: "pode commitar autonomamente sempre que aprovar a fatia"
  2. Agent prompt observes authorization signal pattern → emits `aioson op:capture --signal=authorization --quote="pode commitar autonomamente sempre que aprovar a fatia" --proposal="commit autônomo após approval explícito de slice" --source-agent=dev`
  3. CLI writes `proposals/commit-autonomy-after-slice.md` with `detected_count: 1`
  4. CLI exits silently (no audit line on first detection — only on promotion)
- **F2.2 — Second detection (promote)**:
  1. Different session, user: "vai comitando sem perguntar, já confiei no esquema"
  2. Agent emits `op:capture` with similar `proposal` text (LLM-derived similarity, slug-collision tolerant)
  3. CLI matches existing proposal by slug → increments `detected_count` to 2 → triggers promotion
  4. CLI writes `decisions/commit-autonomy-after-slice.md`, removes proposal, updates `_index.sqlite` FTS5
  5. CLI emits stdout: `✔ Memory: 'commit autônomo após approval explícito de slice'. aioson op:forget commit-autonomy-after-slice p/ desfazer.`
- **F2.3 — Manual promote (skip threshold)**:
  1. User explicit: `aioson op:promote commit-autonomy-after-slice`
  2. CLI moves proposal to decision regardless of `detected_count` (V1 = manual gate; V2 may require confirmation if count=0)
- **F2.4 — Forget (soft-delete)**:
  1. `aioson op:forget commit-autonomy-after-slice`
  2. CLI moves decision file to `history/{ISO}-commit-autonomy-after-slice.md` + removes from FTS5
  3. Emits `op_forget` telemetry with mode='manual'

## Acceptance criteria

- **AC-P2-01** `op:capture` writes to `proposals/{slug}.md` with all schema fields populated; second call with same `--proposal=` (slug match) increments `detected_count` instead of duplicating.
- **AC-P2-02** Slug derivation from `--proposal=` is deterministic (kebab-case + truncate to 40 chars + collision suffix `-2`,`-3`,…). Two callers same paraphrase → same slug.
- **AC-P2-03** Second detection (`detected_count` reaches 2) triggers promotion atomically: decision written + proposal removed + FTS5 updated in single transaction. Crash mid-promote leaves either both old state or both new state — never partial.
- **AC-P2-04** 1-liner stdout audit emitted on promotion (PMD-08); silent on capture-only. Stderr clean unless error.
- **AC-P2-05** `op:promote <slug>` works on any existing proposal (skip threshold path); exits non-zero if slug not in proposals/.
- **AC-P2-06** `op:forget <slug>` moves decision (or proposal) to `history/{ISO}-{slug}.md`. Idempotent (second forget no-ops with exit 0). Telemetry `op_forget` emitted.
- **AC-P2-07** Signal-type validation: `--signal=<x>` only accepts one of 4 types (per PMD-06); invalid type rejected at CLI parse stage (exit 1, stderr error).
- **AC-P2-08** Telemetry events fire BEFORE the file write completes (same ordering as F2 `agent:done` in `workflow-handoff-integrity` — ensures auditable trail even if write fails downstream).
- **AC-P2-09** FTS5 mirror: after `op:capture` of a decision (post-promotion), `SELECT * FROM decisions_fts WHERE decisions_fts MATCH '<keyword from body>'` returns the row. Used by Phase 3 lazy-load matching.
- **AC-P2-10** Versioned prompt template at `template/agents/_shared/memory-capture-directive.md` has 4 signal types × ≥3 examples each + anti-pattern section + capture-call format. File-format tested via existing `sync-agents-preflight` semantic parity (T5 from workflow-handoff-integrity).
- **AC-P2-11** LLM-driven divergence acknowledged in CHANGELOG v1.13.0 entry + linked from prompt-template file (transparency requirement per PMD-02).
- **AC-P2-12** No regression: existing AIOSON behavior unchanged when no operator-memory directive is loaded (i.e. Phase 3 not yet shipped) — Phase 2 ships the engine but it is dormant until Phase 3 wires the agent-side directive.

## Implementation sequence

1. **`src/operator-memory/proposal.js`** + **`src/operator-memory/decision.js`** (NEW): pure CRUD on the schemas above; promote/demote/forget operations. Atomic via `better-sqlite3` transaction + fs renames.
2. **`src/operator-memory/slug.js`** (NEW): deterministic slug derivation (kebab + truncate + collision suffix).
3. **`src/commands/op-capture.js`**: replace Phase 1 stub with full impl.
4. **`src/commands/op-promote.js`**, **`src/commands/op-forget.js`**: replace Phase 1 stubs with full impls.
5. **`template/agents/_shared/memory-capture-directive.md`** (NEW): versioned prompt template (read by Phase 3 directive injection; this phase just ships the file).
6. **Telemetry**: extend `src/lib/dossier-telemetry.js` with 5 new event types (per DD-04 default; if architect picks new-table variant, this step changes).
7. **`tests/operator-memory-capture.test.js`** (NEW): 18+ tests covering AC-P2-01..12.
8. **Smoke runner** `scripts/smoke-run-chain.js` extension: add `[OM2] capture+promote` section that exercises full F2.1+F2.2 in isolated tmp identity.
9. **Wiring audit** Phase 2 entry.

## External dependencies

None new. Reuses `better-sqlite3`, `crypto`, `fs`.

## Notes for @dev

- Phase 2 ships the engine + prompt template, but NO agent file modifications. Agents won't actually call `op:capture` until Phase 3 wires the directive.
- For testing without Phase 3: smoke runner invokes `op:capture` directly via Bash/Node subprocess — same pattern as smoke-run-chain.js for F2.
- LLM-divergence (PMD-02): the prompt template is the canonical signal definition. Versioning via filename (`memory-capture-directive-v1.md`?) deferred — too early to optimize for migration.
- Atomicity (AC-P2-03): use `better-sqlite3` `db.transaction(() => { ... })` wrapper. File ops inside the transaction are committed-to-disk via fsync before SQL commit. See active-learning-loop FTS5 promote pattern.

## Notes for @qa

- Atomicity tests (AC-P2-03) require simulated crash. Use `process.kill` mid-transaction in test fixture — verifies state recovery on next CLI invocation.
- Anti-pattern corpora (AC-P2-10): create `tests/fixtures/operator-memory/false-positive-quotes.txt` with messages the prompt template should NOT capture (e.g. "neste PR brevidade", "agora vai com cuidado") — assert these don't trigger `op:capture` when prompt template is parsed by smoke harness.
- Cross-OS file rename atomicity: Windows + Linux + macOS. POSIX `rename(2)` atomic; Windows `MoveFileEx` with `MOVEFILE_REPLACE_EXISTING` — verify.

## Phase-specific reference sources

- `researchs/agent-memory-backends-2026/summary.md` — Letta LLM-driven pattern (acknowledged divergence per PMD-02)
- AIOSON `src/lib/dossier-telemetry.js` — telemetry pattern reuse
- AIOSON `tests/sync-agents-preflight-semantic.test.js` — T5 pattern for AC-P2-10 template parity validation
