---
description: "Sheldon harness contract generation procedure — schemas, criteria population, governor and contract_mode selection, MICRO/SMALL/MEDIUM rules."
agents: [sheldon, validator]
task_types: [harness, contract]
triggers: [harness contract, binary criteria, acceptance criteria]
---

# Sheldon Harness Contract Generation

Load this module when `@sheldon` reaches RF-05 in a MEDIUM enrichment. Implements AC-HD-06 of `harness-driven-aioson`.

## When to run

Run **after** writing `sheldon-enrichment-{slug}.md`, gated by `project.context.md` classification:

| Classification | Action |
|---|---|
| MICRO | Skip entirely — **unless it is a runtime feature** (`has_api`/DB/prototype): then produce a minimal `harness-contract.json` (just the §2c `RG-*` criteria) + `progress.json`. |
| SMALL | Produce `progress.json` only — **plus `harness-contract.json` with the §2c `RG-*` criteria when it is a runtime feature**, so `harness:check` can enforce the runtime gate. |
| MEDIUM | Produce both `harness-contract.json` and `progress.json`. |

A **runtime feature** (`has_api` / DB / migrations / `## Prototype reference`) therefore carries the `RG-*`
runtime gate at **every** classification. The CLI deterministically blocks the subset it can locate on disk
(prototype manifests and migration/Prisma paths from progress/git evidence) when the runtime contract is missing
or has no `RG-*`; the Play `has_api` case still requires the `@validator` Step 0 judgment because that flag lives
inside the target app. Non-runtime MICRO/SMALL keep the lightweight path (no contract).

## Steps

### 1. Initialize stub

If `.aioson/plans/{slug}/harness-contract.json` is absent:

```bash
aioson harness:init . --slug={slug}
```

This creates the contract scaffold and `progress.json` in the same folder. If the CLI command is unavailable, write both files manually using the canonical schemas at the bottom of this doc.

### 2. Populate `criteria[]`

For every AC in the enriched PRD with an objective, mechanically verifiable assertion (file existence, test pass, lint clean, exact API shape, exit code), append to `criteria[]`:

```json
{
  "id": "C1",
  "description": "<AC text — human-readable for PR review>",
  "assertion": "<machine-verifiable expression — e.g. 'tests/foo.test.js passes' or 'src/x/y.js exports parseX'>",
  "binary": true,
  "verification": "<shell command whose exit code 0 = pass — e.g. 'node --test tests/foo.test.js'>"
}
```

ACs that are subjective (UX feel, code style preference) get `binary: false` and become advisory only — `@validator` ignores them in the score.

**Rule of thumb:** if the assertion can be answered by a single shell command exit code or a single test, it qualifies as `binary: true`. Otherwise mark it advisory and let `@qa` cover it.

### 2b. Author `verification` commands

Every `binary: true` criterion **must** carry a `verification` shell command whenever one is mechanically possible. Exit code 0 = pass; anything else = fail. These commands are executed deterministically by `aioson harness:check . --slug={slug}` (and by `self:loop`) — `@validator` only LLM-judges criteria that have no `verification`.

Authoring rules for `verification`:

- **Prefer the project's own test runner** (`node --test tests/x.test.js`, `npm test -- --grep "..."`, `pytest tests/test_x.py`). A criterion backed by a real test is the gold standard.
- **One-liner assertions** when no test exists yet: `node -e "const m = require('./src/x'); process.exit(typeof m.parseX === 'function' ? 0 : 1)"`.
- **Deterministic only**: no network calls, no wall-clock dependence, no interactive prompts. *(Exception: the runtime-gate criteria in §2c — `build`/`migrate`/`boot`/`smoke` — MAY provision an ephemeral DB and boot the app. That setup is the point, not a violation.)*
- **Cross-platform**: single commands or npm scripts — avoid shell chaining (`&&`, `||`) and POSIX-only utilities (`grep`, `test -f`) on Windows-first projects; use `node -e` for file/shape assertions instead.
- **Self-contained**: the command must pass/fail on a clean checkout after install — no hidden setup steps. *(Runtime-gate criteria may require `db:up`/`migrate reset` as their declared first step; declare it inside the `verification`, never as a hidden prerequisite.)*
- A `binary: true` criterion **without** `verification` remains valid (judged by `@validator`, as before), but the contract schema emits a coverage warning — treat each one as debt and justify it in the enrichment log.

### 2c. Runtime gate criteria — MANDATORY for runtime features

A contract whose criteria are all unit/component test commands (e.g. `pnpm test -- <file>`) proves the
**tests** pass, not that the **app** runs. Tests mock the database, the auth SDK and the network; a feature
can be 100% green on unit tests while its migrations never applied, its UI was never wired to the API, and
the process never booted. To close that gap, any feature that ships a runtime surface MUST carry criteria that
exercise the **real, running stack** — not only mocks.

A feature is a **runtime feature** when ANY of these holds:

- `manifest.json` has `has_api: true`, declares a server/process, or a Play runtime; or
- the feature creates or changes a database / Prisma schema / migrations; or
- the feature carries a `## Prototype reference` (a clickable prototype whose Core interactions must work).

For a runtime feature, add these criteria (use the project's OWN commands; drop a row only with a written
reason in the enrichment log):

| id | what it proves | example `verification` (adapt to the project) |
|----|----------------|-----------------------------------------------|
| `RG-build` | the app compiles for real, not a mocked subset | `pnpm build` · `npm run build` · `tsc -p .` |
| `RG-migrate` | migrations **apply** to a fresh DB — not just exist as files | `prisma migrate reset --force` (or `migrate deploy`) against an ephemeral/throwaway DB |
| `RG-boot` | server + client start without crashing | start the process and probe health, e.g. `node scripts/smoke-boot.mjs` hitting `/api/health` → 200 |
| `RG-smoke` | the prototype's Core happy-path works on the running stack | `aioson qa:run` / `aioson qa:scan`, or an e2e/integration run that drives the **real** endpoints/UI end-to-end |

**Hard rules:**

- A runtime-feature contract containing **zero** of {`RG-build`, `RG-migrate`, `RG-boot`, `RG-smoke`} is
  **invalid** — treat it as a coverage *error*, not a warning, and do not declare the contract final.
  `@validator` rejects such a contract at its Contract-integrity precheck.
- **No duplicate verification.** Two `binary: true` criteria must never carry the **same** `verification`
  command. Each criterion maps to a distinct check. (Padding 11 criteria out of 6 commands is exactly how a
  hollow contract scores "11/11".) `RG-migrate` and `RG-boot` are separate criteria with separate commands.
- `RG-smoke` must drive at least the prototype-manifest's **Core** interactions for the feature
  (create / list / switch / edit / archive of the primary objects), end to end — never a mocked unit of one
  of them, and never a static source-string assertion that an API call *appears* in the code.
- These criteria are first-class binary criteria: `aioson harness:check` runs them like any other, and their
  exit code is the verdict. If the project lacks a smoke/boot harness, that harness is itself part of `@dev`'s
  scope — do not downgrade `RG-smoke` to a unit test to make it "self-contained".

> **CLI backstop (deterministic).** `aioson harness:check . --slug={slug}` enforces the first two hard rules
> itself, not only through `@validator`, and `workflow:next --complete=dev|qa` / `feature:close --verdict=PASS`
> call the same integrity gate before advancing. When the CLI detects a runtime surface it can locate
> deterministically — a `.aioson/briefings/{slug}/prototype-manifest.md`, or a migration/Prisma path in
> `progress.completed_steps`, `progress.changed_files`, or the git changed-file set — a missing contract is
> blocked, a contract with **no** `RG-*` criterion fails with `missing_runtime_gate`, and two binary criteria
> sharing one `verification` command fail with `duplicate_verification`; both flip the check's `ok` to `false`.
> The Play `manifest.json` `has_api` trigger lives in the target app and is **not** locatable from the framework
> in all projects — for that case the `@validator` Step 0 precheck remains the enforcer, and `RG-smoke` actually
> exercising Core (vs. a unit test wearing the id) is always a `@validator` judgment. In an **untracked** session
> (plain slash activation, no `workflow:next`), `aioson agent:epilogue --agent=dev|qa` surfaces the same check as a
> non-blocking **advisory** `contract:integrity` step — a signal in the dashboard trail, not a gate; only the
> tracked `workflow:next` / `feature:close` paths block. Treat a green `harness:check` as necessary, not sufficient.

### 3. Set `contract_mode`

By classification and risk surface, using the modes accepted by the harness schema:

- **SMALL** → `safe`
- **MEDIUM (default)** → `builder`
- **MEDIUM with sensitive surface** (auth, money, ownership, secrets, uploads, external URLs) → `safe`
- **Explicit user-approved long autonomous run** → `autopilot`

### 4. Set `governor` block

Safe defaults for a normal MEDIUM `builder` contract:

```json
{ "max_steps": 30, "cost_ceiling_tokens": 1000000, "error_streak_limit": 5 }
```

- `safe` applies the tight preset for risky or bounded runs.
- `builder` applies the normal MEDIUM preset.
- `autopilot` applies the largest preset and requires explicit user approval.

## Authoring rules

- The contract is **additive** to the enrichment log; both coexist. Enrichment explains *what* to enrich; contract defines *what "done" means*.
- Contract criteria are derived from the **enriched** PRD ACs — never invent criteria not anchored to an AC.
- Mention the contract path in the post-enrichment handoff message.
- The user approves the contract as part of the post-enrichment gate. Do not declare the contract final without confirmation.
- Once approved, the contract is the source of truth for `@validator`. Subsequent enrichment rounds may add new criteria, never remove approved ones without explicit user instruction.

## Canonical schemas

### `harness-contract.json`

```json
{
  "feature": "<slug>",
  "contract_mode": "balanced | safe | builder | autopilot",
  "governor": {
    "max_steps": 50,
    "cost_ceiling_tokens": 1000000,
    "error_streak_limit": 5
  },
  "criteria": [
    {
      "id": "C1",
      "description": "...",
      "assertion": "...",
      "binary": true,
      "verification": "node --test tests/foo.test.js"
    }
  ]
}
```

`verification` is optional per criterion (legacy contracts remain valid), executed via `aioson harness:check` with exit code 0 = pass.

### `progress.json`

```json
{
  "feature": "<slug>",
  "phase": 1,
  "status": "in_progress | waiting_validation | done | circuit_open",
  "completed_steps": [],
  "last_error": null,
  "session_count": 1,
  "last_updated": "<ISO-8601>",
  "circuit_state": "CLOSED | OPEN | HALF_OPEN"
}
```

## Failure modes to anticipate

- **No verifiable ACs in PRD** — go back to enrichment with `@product` and add concrete assertions before generating a contract.
- **All ACs are advisory** — flag to user; the harness adds no value. Skip contract generation, document the decision in `sheldon-enrichment-{slug}.md`.
- **`harness:init` CLI missing** — write stubs manually, but record in handoff that CLI was unavailable so `@dev` can install it.
- **All criteria are unit tests on a runtime feature** — the contract proves the tests pass, not that the app runs. This is the failure that ships a green-but-broken build (migrations never applied, UI never wired, process never booted). Add the §2c runtime-gate criteria before declaring the contract final; a runtime-feature contract without them is invalid.
