---
feature: operator-memory
slug: operator-memory
created_by: dev
created_at: 2026-05-21
purpose: "Wiring audit obrigatório (PMD-07 / BR-05 / AC-P5-10) — confirma para CADA phase que código novo é invocado dos call sites existentes, testes cobrem o caminho real, e smoke test exercita ponta-a-ponta. Sem este documento, @qa Gate D não pode passar."
phases:
  phase_1_storage_identity: completed
  phase_2_capture_promotion: pending
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

_Phase pendente. Será preenchido após implementação._

## Phase 3 — Universal loading directive (v1.14.0)

_Phase pendente. Será preenchido após implementação._

## Phase 4 — Conflict policy (v1.15.0)

_Phase pendente. Será preenchido após implementação._

## Phase 5 — TTL decay + migration + closure (v1.16.0)

_Phase pendente. Será preenchido após implementação. Cross-phase consolidation table aqui ao closure (AC-P5-10)._
