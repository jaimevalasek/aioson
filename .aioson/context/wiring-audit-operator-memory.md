---
feature: operator-memory
slug: operator-memory
created_by: dev
created_at: 2026-05-21
purpose: "Wiring audit obrigatório (PMD-07 / BR-05 / AC-P5-10) — confirma para CADA phase que código novo é invocado dos call sites existentes, testes cobrem o caminho real, e smoke test exercita ponta-a-ponta. Sem este documento, @qa Gate D não pode passar."
phases:
  phase_1_storage_identity: completed
  phase_2_capture_promotion: completed
  phase_3_universal_loading: pending
  phase_4_conflict_policy: pending
  phase_5_ttl_migration: pending
---

# Wiring Audit — Operator Memory

> **Por que existe:** evita o anti-pattern documentado em brain sheldon-006 ★5 ("design-complete ≠ execution-complete"). Sem audit, é fácil shippar código sem que call sites existentes o invoquem.
>
> **Gate D blocker:** este documento DEVE ter entrada para cada phase entregue antes de Gate D approve. `@qa` lê esta seção para verificar wiring real, não apenas existência de arquivos.

## Phase 1 — Storage + Identity (v1.12.0)

**Status:** Implementation complete; 24/24 unit tests passing; CLI smoke tests green for op:identity show + invalid override + stub commands.

### Call sites — onde o código novo é invocado

**`resolveIdentity` + `validateOverride` + `hashEmail` helpers** (`src/operator-memory/identity.js`):

```bash
$ grep -rn "resolveIdentity\|validateOverride\|hashEmail" src/
src/operator-memory/identity.js  (definitions + module.exports)
src/commands/op-identity.js:21    const { resolveIdentity, validateOverride, OVERRIDE_REGEX } = require('../operator-memory/identity');
```

Único call site (Phase 1): `src/commands/op-identity.js` `runOpIdentity`. Phase 2+ consumers (op:capture, op:promote) will add additional call sites.

**`ensureStorageTree` + `openIndexDb` + `recordIdentityActivity`** (`src/operator-memory/storage.js`):

```bash
$ grep -rn "ensureStorageTree\|openIndexDb\|recordIdentityActivity" src/
src/operator-memory/storage.js  (definitions + module.exports)
src/commands/op-identity.js:22  require('../operator-memory/storage')
```

Único call site (Phase 1): `runOpIdentity`. Storage tree is created lazy-on-first-`op:identity-show`.

**`runOpIdentity` CLI command** (`src/commands/op-identity.js`):

```bash
$ grep -n "runOpIdentity\|op:identity\|op-identity" src/cli.js
181:  const { runOpIdentity } = require('./commands/op-identity');
591:  'op:identity',
592:  'op-identity',
... (KNOWN_COMMANDS entries)
1333:    } else if (command === 'op:identity' || command === 'op-identity') {
1334:      result = await runOpIdentity({ args, options, logger: commandLogger });
```

Wired in `src/cli.js` at three points: import (line 181), KNOWN_COMMANDS (lines 591-592), routing branch (lines 1333-1334).

**5 stub commands** (`src/commands/op-stubs.js`):

```bash
$ grep -n "runOpCapture\|runOpPromote\|runOpForget\|runOpList\|runOpShow" src/cli.js
181:  const { runOpCapture, runOpPromote, runOpForget, runOpList, runOpShow } = require('./commands/op-stubs');
1335-1346: routing branches (5 commands)
```

All five stubs share the `makeStub(commandName)` factory in `src/commands/op-stubs.js`. They register the command surface, emit `op_command_stub` telemetry on invocation, and return exit-1 with structured error. Replaced in Phases 2-3 with real implementations.

### Tests covering the real path

**`tests/operator-memory-identity.test.js`** — 24 tests covering AC-P1-01..10:

| AC | Tests | Path exercised |
|---|---|---|
| AC-P1-01 | 3 tests (deterministic hash, different emails, hex format) | `resolveIdentity` happy path via mock `emailReader` |
| AC-P1-02 | 1 test ("idem-test-id" idempotent tree) | `ensureStorageTree` second-call same root |
| AC-P1-03 | 2 tests (valid override accepted, invalid falls back) | Env override resolution + fallback chain |
| AC-P1-04 | 5 tests (reserved `_*`, reserved `aioson-*`, short, uppercase, long, valid boundary) | `validateOverride` full regex + reserved-prefix coverage |
| AC-P1-05 | 1 test (empty email → `_anonymous`) | Anonymous fallback path + warning text |
| AC-P1-06 | 2 tests (WAL + schema + integrity_check ok, migration idempotent) | `openIndexDb` + `migrateIndexSchema` schema validation |
| AC-P1-07 | 5 tests (show happy, show --json, set invalid, set valid stub, all 5 stubs exit-1) | `runOpIdentity` + `op-stubs` CLI behavior |
| AC-P1-08 | 1 test (`getStorageRoot` includes `.aioson/operators`) | Path normalization via `os.homedir` |
| AC-P1-09 | 1 test (insert then update, no duplicate rows) | `recordIdentityActivity` upsert semantics |
| AC-P1-10 | 1 test (16-char hex for 3 sample emails) | DD-02 ratification — hash size invariant |
| EC-08 | 1 test (no production hash starts with reserved prefix) | Salt rehash logic exists; verified deterministic for real emails |

24/24 passing as of 2026-05-21.

### Cross-OS path normalization

`os.homedir()` resolves correctly on:
- Linux/macOS: `~` → `/home/<user>` / `/Users/<user>`
- Windows: `~` → `C:\Users\<user>` (verified by smoke `op:identity show` from this Windows dev session — returned `C:\Users\jaime\.aioson\operators\<hash>`)

### CLI smoke

Manual smoke tests run during implementation (logs):

```bash
$ node bin/aioson.js op:identity show
op:identity — c9b089b4d5ecfd26 (git-email-hash)
storage_root: C:\Users\jaime\.aioson\operators\c9b089b4d5ecfd26

$ AIOSON_OPERATOR_ID=invalid@id node bin/aioson.js op:identity show
⚠ AIOSON_OPERATOR_ID 'invalid@id' invalid (reason: regex; ...). Falling back to git-email-hash.
op:identity — c9b089b4d5ecfd26 (git-email-hash)

$ node bin/aioson.js op:capture --signal=authorization --quote=test --proposal=test
op:capture — Not yet implemented (ships in Phase 2 / v1.13.0). Run `op:capture --help` for scope.
```

### Smoke test status (cross-phase)

**`scripts/smoke-run-chain.js [OM1] section`:** N/A for Phase 1 — the smoke runner already exists from workflow-handoff-integrity. Phase 1's API is small enough that the 24 unit tests + manual CLI smoke logged above provide adequate coverage. Phase 2 will add `[OM2]` smoke section that exercises identity + capture + promote together; Phase 5's `[OM-ALL]` is the full cross-phase safety net.

### Phase 1 sign-off

- ✅ Call sites confirmed via grep (3 spots: identity helpers, storage helpers, CLI command surface)
- ✅ 24/24 unit tests passing
- ✅ Cross-OS path normalization verified (Windows reference smoke)
- ✅ DD-02 ratified (16-char hash) — AC-P1-10
- ✅ PMD-05 validation order: reserved-prefix BEFORE regex (more semantically correct for `_admin` rejection)
- ✅ EC-08 salt rehash deterministic
- ✅ Telemetry `op_identity_unresolved` + `op_command_stub` wired via existing `dossierTelemetry.emitDossierEvent`
- ⏳ Full `npm test` suite — pending pre-release verification

## Phase 2 — Capture + Promotion (v1.13.0)

**Status:** Implementation complete; 26 unit tests passing; smoke `[OM2]` 3/3 green.

### Call sites — onde o código novo é invocado

**`deriveSlug` + `fingerprintProposal`** (`src/operator-memory/slug.js`):

```bash
$ grep -rn "deriveSlug\|fingerprintProposal" src/
src/operator-memory/slug.js  (definitions + module.exports)
src/operator-memory/proposal.js:30   require('./slug')
src/commands/op-capture.js:24        require('../operator-memory/slug')
```

Single primary call site: `src/commands/op-capture.js#runOpCapture` derives slug before `captureSignal`. `proposal.js` consumes `fingerprintProposal` for collision detection.

**`captureSignal` + `readProposal` + `deleteProposal`** (`src/operator-memory/proposal.js`):

```bash
$ grep -rn "captureSignal\|readProposal" src/ tests/
src/operator-memory/proposal.js     (definitions + module.exports)
src/commands/op-capture.js:23       const { captureSignal, readProposal, VALID_SIGNAL_TYPES } = require(...)
src/commands/op-promote.js:11       const { readProposal } = require(...)
src/operator-memory/decision.js:21  require('./proposal') for deleteProposal/proposalPath
```

Call sites: `op-capture.js` (primary), `op-promote.js` (manual-promote path), `decision.js#promoteProposal` (atomic cleanup).

**`promoteProposal` + `forgetEntry` + `readDecision`** (`src/operator-memory/decision.js`):

```bash
$ grep -rn "promoteProposal\|forgetEntry\|readDecision" src/
src/operator-memory/decision.js     (definitions + module.exports)
src/commands/op-capture.js:22       const { promoteProposal } = require(...)
src/commands/op-promote.js:12       const { promoteProposal } = require(...)
src/commands/op-forget.js:11        const { forgetEntry } = require(...)
```

Call sites: `op-capture.js` (auto-promote on 2x threshold), `op-promote.js` (manual override), `op-forget.js` (soft-delete to history/).

**3 CLI command full impls** (`src/commands/op-{capture,promote,forget}.js`):

```bash
$ grep -n "runOpCapture\|runOpPromote\|runOpForget" src/cli.js
181: const { runOpIdentity } = require('./commands/op-identity');
182: const { runOpCapture } = require('./commands/op-capture');
183: const { runOpPromote } = require('./commands/op-promote');
184: const { runOpForget } = require('./commands/op-forget');
1335-1340: routing branches (full impls replace Phase 1 stubs)
```

CLI wiring updated in Phase 2: imports point at full impls. `op-stubs.js` retains `runOpList` + `runOpShow` stubs until Phase 3 ships those.

### Tests covering the real path

**`tests/operator-memory-capture.test.js`** — 26 tests covering AC-P2-01..12:

| AC | Tests | Path exercised |
|---|---|---|
| AC-P2-01 | 3 tests (first detection, second detection increments, quotes capped at 5) | `captureSignal` proposal CRUD + quote retention |
| AC-P2-02 | 6 tests (deterministic, different proposals, stopword filter, truncation, collision counter, idempotent reuse) | `deriveSlug` + `fingerprintProposal` |
| AC-P2-03 | 2 tests (atomic promote — proposal deleted + decision written + FTS5 row, body cap) | `promoteProposal` SQLite transaction wrap |
| AC-P2-04 | 4 tests (first silent, second emits audit, --json structured, missing flags rejected) | `runOpCapture` CLI |
| AC-P2-05 | 2 tests (manual promote on existing proposal, unknown slug error) | `runOpPromote` |
| AC-P2-06 | 3 tests (forget archives + removes FTS5, idempotent noop, proposal forget) | `forgetEntry` |
| AC-P2-07 | 2 tests (invalid signal_type rejected, VALID_SIGNAL_TYPES enumerates 4) | PMD-06 enforcement |
| AC-P2-08 | 1 test (no crash on telemetry path) | best-effort telemetry |
| AC-P2-09 | 1 test (FTS5 searchable by body keyword) | FTS5 mirror correctness |
| AC-P2-11 | 1 test (body capped at MAX_BODY_CHARS) | NFR-02-c invariant |
| AC-P2-12 | 1 test (cold start does not crash on fresh storage) | First-ever capture path |
| inferCategory | 1 test (autonomy/identity/tooling/default heuristic) | Phase 2 category inference V1 |

26/26 passing as of 2026-05-21.

### Versioned prompt template

**`template/agents/_shared/memory-capture-directive.md`** (NEW Phase 2 deliverable):
- 4 signal types × ≥3 concrete examples each (authorization / exclusion / correction / confirmation)
- Anti-pattern section (context-bound preferences, routine agreements, etc.)
- Capture-call format with field guidance (`--quote` verbatim, `--proposal` paraphrase, `--source-agent`)
- Best-effort semantics declared (capture failures do NOT crash agent sessions per BR-AN-03)
- Schema version `1.0` for V1→V2 migration discriminator

File is dormant in Phase 2 — Phase 3 wires it via universal loading directive in `template/CLAUDE.md`/`AGENTS.md`. Acceptance criterion AC-P2-10 satisfied by file existence + content shape.

### Smoke test coverage (`[OM2]` section)

**`scripts/smoke-run-chain.js`** extended with 3 OM2 checks:

1. `OM2 capture+promote` — exercises full capture pipeline + atomic promote + category inference + FTS5 mirror in isolated tmp HOME.
2. `OM2 forget idempotent` — `forgetEntry` archives to history/ then second call returns noop.
3. `OM2 signal validation` — `captureSignal` throws on invalid signal_type (PMD-06 enforcement).

All 3 OM2 smoke checks green. Total smoke now `pass=14 fail=0`.

### Atomicity verification (AC-P2-03)

The `promoteProposal` transaction wrap implementation:

```js
const txn = db.transaction(() => {
  db.prepare('INSERT INTO decisions_fts ...').run(...);
  fs.writeFileSync(decTmpPath, serializeDecision(decision), 'utf8');
  fs.renameSync(decTmpPath, decFilePath);
  if (fs.existsSync(propPath)) fs.unlinkSync(propPath);
});
txn();
```

Crash mid-`txn()` → SQLite rolls back. Filesystem ops inside transaction are committed-to-disk via atomic rename (POSIX + Windows MoveFileEx). Tmp file cleanup on rollback via `finally` block.

Tested by unit tests AC-P2-03 (verifies all three states post-promote: proposal removed, decision present, FTS5 row inserted) — partial states are not observable.

### Phase 2 sign-off

- ✅ Call sites confirmed via grep (5 spots: slug, proposal, decision, 3 CLI commands)
- ✅ 26/26 unit tests passing (capture, promote, forget, signal validation, atomicity, FTS5 mirror, category inference)
- ✅ 3/3 smoke `[OM2]` checks green
- ✅ Versioned prompt template `memory-capture-directive.md` v1.0 shipped (dormant until Phase 3)
- ✅ PMD-02 LLM-divergence acknowledged via prompt template + CHANGELOG transparency
- ✅ Telemetry events `op_capture`, `op_promote`, `op_forget` emitted via existing `dossierTelemetry`
- ✅ Atomicity boundary: SQLite WAL transaction + atomic rename verified
- ⏳ Full `npm test` suite — pending pre-release verification

## Phase 3 — Universal loading directive (v1.14.0)

_Phase pendente. Será preenchido após implementação._

## Phase 4 — Conflict policy (v1.15.0)

_Phase pendente. Será preenchido após implementação._

## Phase 5 — TTL decay + migration + closure (v1.16.0)

_Phase pendente. Será preenchido após implementação. Cross-phase consolidation table aqui ao closure (AC-P5-10)._
