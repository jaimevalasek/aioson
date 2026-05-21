---
phase: 1
slug: storage-identity
feature: operator-memory
release_target: v1.12.0
status: pending
---

# Phase 1 — Storage + Identity foundation

## Scope

Lay the storage substrate and identity resolution that all subsequent phases build on. Six CLI command stubs are wired but most contain only smoke logic — the engine ships in Phase 2. No agent-prompt modifications in this phase (those are Phase 3).

## New or modified entities

- **`operator_identity`** (resolved at CLI startup, no on-disk schema): one of
  - `git_email_hash` mode (default): `sha256(trim(git config --get user.email))[0..16]`
  - `override` mode: `AIOSON_OPERATOR_ID` env var (validated per PMD-05)
- **Storage tree** at `~/.aioson/operators/{identity}/`:
  ```
  ~/.aioson/operators/{identity}/
  ├── MEMORY.md                  ← index (lazy-loaded by Phase 3 directive)
  ├── decisions/                 ← active decisions (Phase 2 populates)
  ├── proposals/                 ← pending capture queue (Phase 2 populates)
  └── history/                   ← soft-delete archive (Phase 2+5 populate)
  ```
- **`~/.aioson/operators/_index.sqlite`** (per PMD-01): single SQLite database shared across identities for FTS5 cross-decision search:
  ```sql
  CREATE TABLE operators (
    identity TEXT PRIMARY KEY,
    created_at TEXT,
    source TEXT  -- 'email-hash' | 'override'
  );
  CREATE VIRTUAL TABLE decisions_fts USING fts5(
    identity, slug, body, tokenize='porter'
  );
  ```
  Decisions body is mirrored to FTS5 on `op:capture`/`op:promote` (Phase 2). Phase 1 just creates the schema.

## User flows covered

- **F1.1 — First-time identity resolution**: dev runs first `aioson op:identity show` → resolves `git_email_hash` mode → creates `~/.aioson/operators/{hash}/` tree silently → prints identity prefix + mode.
- **F1.2 — Override via env**: `AIOSON_OPERATOR_ID=ci-bot-shared aioson op:identity show` → validates per PMD-05 regex → uses literal identity → prints `ci-bot-shared (override via AIOSON_OPERATOR_ID)`.
- **F1.3 — Invalid override**: `AIOSON_OPERATOR_ID=ci@bot aioson op:identity show` → validation fails → stderr `⚠ AIOSON_OPERATOR_ID 'ci@bot' invalid (^[a-z0-9][a-z0-9-]{2,31}$ required). Falling back to git-email-hash.` → continues with email hash.

## Acceptance criteria

- **AC-P1-01** `aioson op:identity show` resolves identity in <50ms (cold) on machine with no prior `~/.aioson/operators/` directory.
- **AC-P1-02** Storage tree is created idempotently on first use; second `op:identity show` does NOT modify mtimes.
- **AC-P1-03** `AIOSON_OPERATOR_ID` regex enforced; invalid override falls back to email hash with stderr warning (NOT hard error, NOT silent override).
- **AC-P1-04** Reserved prefixes `_*` and `aioson-*` are rejected by validation (treated as invalid).
- **AC-P1-05** Git email reads via `git config --get user.email` — if git absent OR no email configured, identity resolution emits `op_identity_unresolved` telemetry + falls back to `_anonymous` identity (under reserved prefix exception only for this fallback).
- **AC-P1-06** `~/.aioson/operators/_index.sqlite` is created with WAL mode + correct schema; `PRAGMA integrity_check` returns ok.
- **AC-P1-07** Six CLI commands present and respond with at least `--help` text: `op:capture`, `op:promote`, `op:forget`, `op:list`, `op:show`, `op:identity` (logic stubs OK for Phase 1, except `op:identity` which is fully functional).
- **AC-P1-08** Windows: `~/.aioson/` resolves to `%USERPROFILE%\.aioson\`. Mixed-slash path normalization tested (matches existing AIOSON `os.homedir()` pattern).
- **AC-P1-09** Cross-process safety: 2 simultaneous `op:identity show` calls do NOT corrupt `_index.sqlite` (FTS5 + WAL mode handles this; smoke test).
- **AC-P1-10** Identity hashing uses `crypto.createHash('sha256').update(email.trim()).digest('hex').slice(0, 16)` per DD-02 default; DD-02 architect resolution can extend to 64 chars without breaking AC-P1-10 if path normalization preserves.

## Implementation sequence

1. **`src/operator-memory/identity.js`** (NEW pure helpers): `resolveIdentity(env)`, `validateOverride(id)`, `hashEmail(email)`, `getStorageRoot(identity)`. Pure functions, no side effects.
2. **`src/operator-memory/storage.js`** (NEW): `ensureStorageTree(identity)`, `openIndexDb()`, `migrateIndexSchema(db)`. Idempotent.
3. **`src/commands/op-identity.js`** (NEW): `runOpIdentity` CLI command with `show` / `set` subcommands. `set` is V1 read-only — emits "use AIOSON_OPERATOR_ID env override" message. Actual `set` ships Phase 5.
4. **`src/commands/op-capture.js`**, **`src/commands/op-promote.js`**, **`src/commands/op-forget.js`**, **`src/commands/op-list.js`**, **`src/commands/op-show.js`** (NEW stubs): emit `Not yet implemented (Phase 2+)` with exit 1 + structured `op_command_stub` telemetry event.
5. **`src/cli.js`**: wire 6 new command aliases (`op:capture`, `op-capture`, etc.) + add to `KNOWN_COMMANDS` const.
6. **`tests/operator-memory-identity.test.js`** (NEW): 12+ tests covering AC-P1-01..10.
7. **Wiring audit entry** in `.aioson/context/wiring-audit-operator-memory.md` Phase 1 section (file created in this phase).

## External dependencies

None. Stdlib only: `crypto`, `fs`, `os`, `path`, `better-sqlite3` (already in deps).

## Notes for @dev

- Reuse existing AIOSON SQLite pattern: open with `better-sqlite3`, set `journal_mode=WAL`, prepare statements once. See `src/lib/dossier-telemetry.js` for reference.
- Identity validation regex MUST be exported from `identity.js` (downstream phases need it for `op:identity set`).
- DO NOT touch `template/CLAUDE.md` or `template/AGENTS.md` in this phase — that's Phase 3. Phase 1 is silent on the agent side.
- The CLI stubs in step 4 should be tiny — just enough to wire `cli.js` routing + emit a "phase X is coming" stderr line. Real implementations in Phase 2.

## Notes for @qa

- Smoke test on at least 2 OS: Linux + Windows (path normalization). Skip macOS if time-constrained — Linux + Windows covers POSIX vs `%USERPROFILE%` edge cases.
- Verify `AIOSON_OPERATOR_ID` invalid + reserved-prefix cases (AC-P1-03, AC-P1-04) emit STDERR warnings, not stdout.
- Verify cross-process safety (AC-P1-09) via concurrent subprocess spawn in fixture.

## Phase-specific reference sources

- `researchs/agent-memory-backends-2026/summary.md` § "SQLite + FTS5 is THE pattern" — informs PMD-01 hybrid choice for this phase
- AIOSON `src/lib/dossier-telemetry.js` — existing SQLite reference impl pattern
- AIOSON `src/preflight-engine.js` (parseFeaturesMap pattern) — file parsing precedent reusable for MEMORY.md format spec (Phase 3)
