---
feature: operator-memory
slug: operator-memory
classification: MEDIUM
status: in_progress
started: 2026-05-21
release_strategy: progressive
release_sequence: ["v1.12.0 (storage+identity)", "v1.13.0 (capture+promotion)", "v1.14.0 (universal-loading)", "v1.15.0 (conflict-policy)", "v1.16.0 (ttl+migration)"]
analyst_completed: 2026-05-21
gate_requirements: approved
gate_design: approved
gate_plan: approved
gate_execution: pending
---

# Spec — Operator Memory

## What was built

_To be filled by @dev incrementally across Phases 1-5 (v1.12.0 → v1.16.0)._

## Entities added

See `requirements-operator-memory.md` § Entities for full field-level schemas:

- `operator_identity` (resolved-only, no on-disk schema)
- `_index.sqlite` with `operators` table + `decisions_fts` FTS5 virtual table (PMD-01)
- `proposal` (markdown frontmatter-only, ephemeral)
- `decision` (markdown + frontmatter — Zep minimal validity window per PMD-11; full schema resolved DD-08)
- `conflict_warning` (transient, stderr-emitted, debounced via `_conflict_state.json`)
- Auxiliary state files: `_decay_state.json` (Phase 5), `_conflict_state.json` (Phase 4)
- `MEMORY.md` + `MEMORY-archive.md` tier-based index (DD-09 resolution: tier-based, not pagination/truncation)

## Key decisions

### Pre-made by @sheldon (manifest)

- **PMD-01** Storage = hybrid SQLite (FTS5 index) + markdown (body) — aligns with active-learning-loop FTS5 precedent. Source: `researchs/agent-memory-backends-2026/summary.md`.
- **PMD-02** LLM-driven capture is acknowledged divergence from AIOSON's deterministic principle. Constraint: versioned prompt template at `template/agents/_shared/memory-capture-directive.md` + CHANGELOG transparency entry.
- **PMD-03** Per-category TTL half-life: identity=365d, autonomy=180d, tooling=90d, default=90d (NOT uniform 90d).
- **PMD-04** 10k memories hard cap per operator identity. Prune oldest non-identity `last_reinforced` first.
- **PMD-05** `AIOSON_OPERATOR_ID` validation regex `^[a-z0-9][a-z0-9-]{2,31}$`. Reserved prefixes `_*` and `aioson-*` blocked.
- **PMD-06** 4 signal types in V1: Authorization, Exclusion, Correction, Confirmation 2x+.
- **PMD-07** 2x detection threshold for promotion.
- **PMD-08** 1-liner silent audit on promotion (no Y/n prompt).
- **PMD-09** Conflict policy binary in V1 (project rules always win + warning emitted). Gradient deferred V2.
- **PMD-10** `user-profile.md` deprecation tied to features.md status `done`, not version numbers.
- **PMD-11** Engram-style validity window: `last_reinforced` (timestamp) + `superseded_by` (slug nullable). Full Zep `start_at`/`end_at` per fact deferred V2.
- **PMD-12** Telemetry events via existing `dossierTelemetry` pattern (same as workflow-handoff-integrity): `op_capture`, `op_promote`, `op_forget`, `op_conflict_warning`, `op_decay_prompt`, `op_migrate`, `op_history_cleanup`.

### Pre-made by @analyst (this requirements pass)

- **PMD-AN-01** Decision schema (DD-08 resolved) includes: `slug`, `signal_type`, `promoted_at`, `last_reinforced`, `reinforcement_count`, `superseded_by` (nullable), `category`, `source_agent`, `quotes[≤5]`, `version_schema`, `deprecated_by` (nullable). Minimal Zep pattern; not full validity window.
- **PMD-AN-02** MEMORY.md format (DD-09 resolved) = tier-based: `MEMORY.md` (active tier) + `MEMORY-archive.md` (archive tier). Decay sweep moves active → archive at category-half-life crossing. `op:reinforce` moves archive → active.
- **PMD-AN-03** Body of `decision` ≤ 500 chars (NFR-02-c sub-ac). Quotes array capped at 5 most recent (audit + storage bound).
- **PMD-AN-04** Identity resolution falls back to reserved `_anonymous` bucket when git email absent (EC-01). Telemetry warning emitted, not hard error.
- **PMD-AN-05** Reserved prefix collision (EC-08) for hash starting with `_`: re-hash with constant salt `aioson-v1` (deterministic, same email → same fallback hash).
- **PMD-AN-06** `_index.sqlite` corruption recovery (EC-04): rename corrupt file to `_index.sqlite.corrupt.{ISO}`, re-build FTS5 from markdown filesystem walk. Markdown is source-of-truth.

### Deferred to @architect (Gate B — pre-Phase 1 start)

- **DD-01** Validity window schema completeness — minimal (PMD-11) OR full Zep? Note: PMD-AN-01 leans minimal; architect may extend.
- **DD-02** Hash size — 16 chars (PMD-AN-04 default) OR 64 chars (defense-in-depth)?
- **DD-03** Universal directive byte budget — what threshold per agent preflight? (AC-NFR-02-a says ≤ 300 tokens; architect ratifies or revises.)
- **DD-04** Telemetry storage — extend `dossierTelemetry` (single table, 7 event types) OR new `operator_events` table?
- **DD-05** Migration UX — full auto-import on first `op:capture` (silent) vs `aioson op:migrate` explicit command vs both?
- **DD-A1** (analyst-surfaced) — Atomic move semantics on archive tier transition: file moves in `decisions/`, or stays put with only index pointer change?
- **DD-A2** (analyst-surfaced) — FTS5 schema migration strategy when `version_schema` bumps (drop-and-rebuild vs incremental ALTER)?

## Edge cases handled

10 edge cases documented in `requirements-operator-memory.md` § Edge cases:

- EC-01 Empty git email → `_anonymous` fallback
- EC-02 Email change → `op:identity set <old-hash>` mitigation
- EC-03 Concurrent op:capture → SQLite WAL + deterministic slug
- EC-04 `_index.sqlite` corruption → rebuild from markdown
- EC-05 Multi-conflict on single decision → per-(decision,rule) pair warning
- EC-06 Archive tier reactivation race → atomic rename per BR-AN-04
- EC-07 user-profile.md migration with conflicting fields → skip + log
- EC-08 Reserved prefix collision in hash → salt rehash
- EC-09 Windows path normalization
- EC-10 Decay sweep during active session → WAL snapshot consistency

## Dependencies

- **Reads:**
  - `.aioson/rules/` (project rules, including new optional `conflicts_with_signal_types` frontmatter field)
  - `.aioson/context/user-profile.md` (Phase 5 migration source — read once, marked deprecated)
  - `git config --get user.email` (identity resolution)
  - Existing `template/CLAUDE.md` + `template/AGENTS.md` (Phase 3 directive injection point)
  - Existing `src/lib/dossier-telemetry.js` (telemetry reuse per PMD-12)

- **Writes:**
  - `~/.aioson/operators/{identity}/` — new directory tree per identity
  - `~/.aioson/operators/_index.sqlite` — shared SQLite database across identities
  - `template/CLAUDE.md` + `template/AGENTS.md` (Phase 3 — additive directive insertion)
  - `template/agents/_shared/memory-capture-directive.md` (Phase 2 — versioned prompt template)
  - `.aioson/docs/operator-memory/memory-md-format.md` (Phase 3 — format spec doc)
  - `scripts/memory-budget-audit.js` (Phase 3 — byte budget check)
  - `tests/operator-memory-*.test.js` (per phase — unit tests)
  - `tests/fixtures/operator-memory/` (per phase — corpora for FP/FN testing)
  - `scripts/smoke-run-chain.js` (extensions per phase — `[OM1]`..`[OM5]` + `[OM-ALL]` sections, T6 pattern)
  - `.aioson/context/wiring-audit-operator-memory.md` (created Phase 1, populated per phase)

## Notes

- **Inception risk:** Phase 3 modifies template files that THIS framework uses (CLAUDE.md/AGENTS.md). Mitigation: ships behind `AIOSON_OPERATOR_MEMORY=true` flag default OFF until Phase 4 ships green. Mirrors workflow-handoff-integrity Phase 1 mitigation pattern.
- **Progressive release strategy:** mirrors workflow-handoff-integrity DD-05 (v1.9.5 → v1.10.0 confirmed exitoso). 5 phases × 5 minor releases v1.12.0 → v1.16.0.
- **Cross-phase consolidation mandatory:** wiring audit `.aioson/context/wiring-audit-operator-memory.md` § Cross-phase consolidation table is Gate D blocker (per BR-05/PMD-07 analog from workflow-handoff-integrity).
- **CI smoke gate:** Phase 5 extends `scripts/smoke-run-chain.js` with `[OM-ALL]` cross-phase section + extends `.github/workflows/release-smoke.yml` to cover operator-memory APIs alongside workflow-handoff-integrity.
- **Multi-harness V1 support matrix** (Phase 3 deliverable in `.aioson/docs/operator-memory/memory-md-format.md`): Claude Code (native), Codex (compatible via AGENTS.md), Gemini CLI (compatible via AGENTS.md). Cursor + Aider documented as V2-pending.

## QA Sign-off

_To be filled by @qa at Gate D (after all 5 phases ship)._
