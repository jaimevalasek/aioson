---
feature: operator-memory
slug: operator-memory
status: approved
created_by: pm
created_at: 2026-05-21
classification: MEDIUM
gate: C
gate_status: approved
release_strategy: progressive
release_sequence: ["v1.12.0", "v1.13.0", "v1.14.0", "v1.15.0", "v1.16.0"]
---

# Implementation Plan — Operator Memory

## Gate C Summary

Gate C approved. Prerequisites satisfied: Gate A (requirements + spec, 74 ACs), Gate B (architecture + 7 DDs resolved + module layout + data flows). PMD-AN-01..06 and DD-01..A2 ratified by architect. Path B 5-phase progressive release v1.12.0 → v1.16.0 (mirrors workflow-handoff-integrity DD-05). Same chain owns implementation: @dev (per phase) → @qa (Gate D at v1.16.0).

## Required Context Package (@dev reading order)

1. `.aioson/context/features/operator-memory/dossier.md` — Why/What + code map + research index + agent trail
2. `.aioson/context/prd-operator-memory.md` — PRD (this file enriches Delivery plan + ACs only)
3. `.aioson/context/requirements-operator-memory.md` — 6 entities field-level + 4 NFRs + 10 BRs + 10 ECs
4. `.aioson/context/architecture-operator-memory.md` — module layout + 5 per-phase data flows + 7 DDs resolved
5. `.aioson/context/spec-operator-memory.md` — gate states + PMDs registered (12 sheldon + 6 analyst)
6. `.aioson/plans/operator-memory/manifest.md` + `plan-{phase}.md` × 5 — per-phase scope, ACs, impl sequence, notes
7. Reference: `researchs/agent-memory-backends-2026/summary.md` (Mem0/Letta/Zep/Engram landscape)
8. Pattern reference (already shipped): `.aioson/context/done/workflow-handoff-integrity/` — DD-05 progressive-release precedent + wiring audit format

## Pre-Taken Decisions (do not re-discuss)

| ID | Decision | Source |
|---|---|---|
| PMD-01..12 | Storage hybrid, LLM-divergence, per-category TTL, 10k cap, regex validation, 4 signals, 2x threshold, silent audit, binary conflict, migration tied to features.md, Zep minimal, dossierTelemetry | sheldon manifest |
| PMD-AN-01..06 | Decision schema, MEMORY.md tier-based, body ≤500 chars, `_anonymous` fallback, salt rehash, corruption recovery | requirements |
| DD-01..A2 | Minimal Zep, 16-char hash, ≤300 token directive, extend dossierTelemetry, explicit op:migrate, file stays on archive, drop-rebuild FTS5 | architecture |
| Release strategy | 5 minor bumps v1.12.0 → v1.16.0 (DD-05); npm publish always manual per [[feedback_commit_publish_autonomy]] | sheldon + memory |
| Inception risk | Phase 3 directive ships behind `AIOSON_OPERATOR_MEMORY=true` default OFF; flip ON only after Phase 4 ships green | sheldon manifest |
| Cross-phase wiring audit | `.aioson/context/wiring-audit-operator-memory.md` Gate D blocker (BR-05/PMD-07 pattern) | workflow-handoff-integrity precedent |

## Execution Sequence

| Phase | Release | Scope | Primary files | Done criteria |
|---|---|---|---|---|
| **1** | v1.12.0 | Storage + identity foundation: sha256[0..16] hash, AIOSON_OPERATOR_ID override w/ PMD-05 regex, `~/.aioson/operators/{identity}/` tree, `_index.sqlite` (operators table + decisions_fts virtual), 6 CLI command stubs, op:identity full | `src/operator-memory/{identity,storage}.js`, `src/commands/op-identity.js`, `src/commands/op-{capture,promote,forget,list,show}.js` (stubs), `src/cli.js`, `tests/operator-memory-identity.test.js`, wiring audit Phase 1 entry | AC-P1-01..10 pass (12+ unit tests green); `op:identity show` works cold ≤50ms; cross-OS path normalization green; AIOSON_OPERATOR_ID invalid → stderr fallback (NOT crash); tag v1.12.0 |
| **2** | v1.13.0 | Capture + promotion engine: deterministic slug, proposals/decisions CRUD, atomic promote (SQLite transaction + atomic rename), FTS5 mirror, 1-liner silent audit on promote, versioned prompt template w/ 4 signal types × 3+ examples + anti-patterns | `src/operator-memory/{proposal,decision,slug}.js`, `src/commands/op-{capture,promote,forget}.js` (full impls replace Phase 1 stubs), `template/agents/_shared/memory-capture-directive.md`, telemetry extension (5 new event types), `tests/operator-memory-capture.test.js`, smoke `[OM2]` | AC-P2-01..12 pass (18+ tests); atomicity crash test green; FP corpus has 0 captures; tag v1.13.0 |
| **3** | v1.14.0 | Universal loading directive (cross-cutting ~30 agents): `## Memory loading` + `## Memory capture` in template/CLAUDE.md + AGENTS.md (≤300 tokens each), MEMORY.md tier-based active/archive index, lazy-load by description match, byte budget audit script, cross-harness format spec doc, `op:list`/`op:show` full impls. **Inception-flag: AIOSON_OPERATOR_MEMORY=true default OFF.** | `template/{CLAUDE.md,AGENTS.md}`, `src/operator-memory/{loader,index-md}.js`, `src/commands/op-{list,show}.js`, `scripts/memory-budget-audit.js`, `.aioson/docs/operator-memory/memory-md-format.md`, `tests/operator-memory-loading.test.js`, smoke `[OM3]` | AC-P3-01..12 pass (15+ tests); backward-compat baseline byte-identical with flag OFF; T5 semantic parity green between CLAUDE.md/AGENTS.md; budget ≤6k cross-cutting; tag v1.14.0 |
| **4** | v1.15.0 | Conflict policy + warning surface (binary V1): keyword threshold ≥2 + signal-type intersect, debounce 60s per (slug, rule) pair, stderr warning format. **Feature flag flip: AIOSON_OPERATOR_MEMORY default → true (CI gate before merge).** | `src/operator-memory/conflict.js`, extended `loader.js`, template directive update (T5 parity), `tests/operator-memory-conflict.test.js`, FP/FN corpus, smoke `[OM4]` | AC-P4-01..10 pass (15+ tests); FP rate ≤20%, FN rate 0%; flag-flip CI smoke green both directions; tag v1.15.0 |
| **5** | v1.16.0 | TTL decay + migration + closure: per-category half-life (365/180/90/90), `last_reinforced` tracking, 10k hard cap prune, decay prompt with 30d debounce, `op:reinforce`, `op:migrate` (idempotent, marks `user-profile.md` deprecated), `op:identity set` full impl, history/ cleanup at 365d, cross-phase consolidation, smoke `[OM-ALL]`, Gate D, feature:archive | `src/operator-memory/{decay,prune}.js`, `src/commands/op-{reinforce,migrate}.js`, `src/commands/op-identity.js` (set extended), `tests/operator-memory-{decay,migrate}.test.js`, smoke runner, wiring audit cross-phase table, CHANGELOG v1.16.0 | AC-P5-01..14 pass (23+ tests); cross-phase table confirms 5 phases wired; `[OM-ALL]` smoke green; Gate D approved; features.md → done; archived; tag v1.16.0 |

**Total expected:** 29 implementation slices, ~98+ unit tests, 5 smoke sections + 1 cross-phase, 5 tagged releases.

## Checkpoints

After **each phase ships** (before next phase starts):

1. Update `wiring-audit-operator-memory.md` with phase entry: call sites grep, tests passing count, smoke coverage status.
2. Update `spec-operator-memory.md § What was built` with phase summary (one paragraph).
3. Run full `npm test` — must be green (known flakes L-02 + AC-ALL-101 acceptable per project-pulse; re-run isolated to confirm transient).
4. Run `node scripts/smoke-run-chain.js` — must be green including new `[OMn]` section.
5. Update CHANGELOG with `[Unreleased]` entry pre-release, then promote to versioned section on tag.
6. Bump `package.json` + `project.context.md` `aioson_version`.
7. `git commit + tag vX.Y.Z + push origin main + push tag` (autonomous per [[feedback_commit_publish_autonomy]]).
8. **STOP and let user decide whether to `npm publish` (always manual per memory contract).**

At **Phase 5 closure** (after AC-P5-14 archive completes):

1. `gate:approve --gate=D` after QA sign-off recorded.
2. `feature:archive` moves all 7+ artifacts to `.aioson/context/done/operator-memory/`.
3. Final commit `chore(features): archive operator-memory (done)`.

## Risks + mitigations (compact)

- **R1 — Phase 3 universal directive breaks agent preflight:** flag default OFF until Phase 4 green; rollback path is env-flag, not code revert.
- **R2 — Conflict detection false positives spam stderr:** FP corpus (15 non-conflict pairs) tunes threshold; debounce 60s prevents same-pair repeat in session.
- **R3 — Schema migration v1→v2 traps users:** `version_schema` field on every decision; `rebuildIndexFromMarkdown` is the recovery + migration path (DD-A2).
- **R4 — Cross-OS path issues:** AC-P1-08 explicit Windows + POSIX testing in Phase 1.
- **R5 — Atomicity bugs in promote:** AC-P2-03 explicit crash-mid-transaction test fixture in Phase 2.
- **R6 — Inception session itself uses operator-memory mid-implementation:** flag OFF by default protects this until Phase 4. After Phase 4 flip, the framework's own dev sessions begin participating — exactly the validation we want.

## Handoff

```
Implementation plan written: .aioson/context/implementation-plan-operator-memory.md
PRD enriched in place: .aioson/context/prd-operator-memory.md § Delivery plan + § Acceptance criteria
Gate C: APPROVED
Next agent: @dev (Phase 1 — v1.12.0)
Why: MEDIUM chain @architect → @pm → @dev (operator-memory has no UX/UI surface — @ux-ui skipped per architecture handoff note).
Action: /dev
```
