# Session Snapshot — build-free, model-agnostic done-gates (SG-* static criteria + `audit:code`)

**Date:** 2026-06-29
**Branch:** main (pushed, in sync with origin)
**Commits:** `19d7cbc` → `20625d4` → `6beefb2` (base `5916326`)
**Suite at close:** 3506 tests — **3505 pass / 0 fail / 1 skip** (lone variance = known Windows parallel temp-dir teardown flake in `external-session.test.js`; passes 21/21 isolated)
**Net:** ~35 new test cases · 2 new source modules · 1 new CLI command · 3 commit-shipped capabilities

---

## 1. Goal

Harden AIOSON's done-gate with **cheap, deterministic, build-independent** verification that holds regardless of how capable the implementing model is. AIOSON already runs the automation end-to-end (autopilot-handoff + `@dev` phase-loop = "start and finish without asking, run to done"); the missing piece was a class of checks that **prove work was actually done without needing a working build or toolchain**. The same checks that force a weaker model to genuinely deliver also catch a stronger model's silent gaps (a stub left behind, a wiring that was described but never written, a forbidden pattern that slipped in).

## 2. Strategic frame — what was added, and why this shape

The expensive runtime smoke gate (`RG-*`) already proves a feature *runs* on the real stack, but it is costly (a working build + migrations + a booted app) so it runs **once**, at the last gate. That leaves a cheap-verification gap at every other stage. This session filled it with two build-free surfaces:

- **`SG-*` static criteria** — proven by *reading* the changed files (a required pattern is present, a forbidden one is absent) + a post-write parse-check. Costs ~milliseconds → runs at **every** gate, complementing `RG-*` rather than replacing it.
- **`aioson audit:code`** — a categorized, deterministic, build-free code-quality scan that auto-fires as an advisory in the flow and can be promoted to a hard gate per-project.

Everything is **pure Node** (`fs` + `RegExp` + `node --check` / `JSON.parse`) — no python, grep, bash, or `/tmp` — so it is cross-platform by construction.

---

## 3. What shipped

### Commit `19d7cbc` — SG-* static criteria + `audit:code` + agent hardening (19 files, +1288/−16)

**A. `SG-*` static criteria** — the standout.
- `harness-contract.json` criteria gain optional `must_match` (OR-across-files), `must_not_match` (absent-in-all), `files[]` — proven by **reading** the changed files + a post-write parse-check (`JSON.parse` for `.json`, `node --check` for `.js/.mjs/.cjs`). An invalid regex degrades to a literal-substring test, never throws.
- New `src/harness/static-criteria.js` (193 lines): `evaluateStaticCriteria` / `evaluateStaticCriterion` / `isStaticCriterion` / `patternTester` / `parseCheckFile`.
- `src/harness/contract-schema.js`: validates the new fields + **mutual exclusion** (a criterion is runtime `verification` **or** static, never both) + a static binary criterion is no longer flagged as verification debt.
- `src/harness/contract-integrity-gate.js`: evaluates static criteria **ALWAYS — even `runChecks:false`** → gates `@dev`-done at every stage **for free**, complementing the expensive `RG-*` runtime smoke that runs once at the last gate.
- `src/commands/harness-check.js`: surfaces `static_*` counts in the report, `last-check-output.json`, and human output; a failing `SG-*` blocks done like a failing test. `skipped_no_verification` no longer counts static criteria.
- **Prefix taxonomy:** `RG-*` runtime · `SEC-*` security · **`SG-*` static**.

**B. `aioson audit:code`** — new `src/commands/audit-code.js` (344 lines).
- Categorized, deterministic, build-free scan: **`ANTI_PATTERN`** (eval / `new Function` / innerHTML / `dangerouslySetInnerHTML` / `z.coerce.boolean` / stray `console.log` / `: any` w/ `// any-ok` escape) · **`TODO`** · **`DEAD_CODE`** (unused named imports — static TS6133 heuristic) · **`DUPLICATION`** (string literal repeated 3+× across 2+ files).
- `--changed` scopes to the git diff · `--category` filters · HIGH → exit 1 (`suppressExitCode` for programmatic callers) · persists `.aioson/context/audit-code.json`. SECURITY stays with `security:audit` (no duplication).
- `src/cli.js`: registered `audit:code` / `audit-code`. `src/parser.js`: `--changed` / `--strict` made boolean-only (the positional-swallow bug class).

**C. Agent hardening** (template + `.aioson` mirror byte-identical; kernels lean within the 30000-byte budget).
- `docs/sheldon/harness-contract.md` §2d — full SG-* authoring guide + schema (detail lives here; kernels point).
- `docs/dev/execution-discipline.md` — exit-code honesty (127 ≠ success; exit 0 + empty output = didn't run; 124 = timeout) + per-criterion SG-* evidence.
- `qa.md` — `audit:code` Gate-D gate (HIGH blocks, by category).
- `sheldon.md` / `orchestrator.md` — SG-* authoring pointers.

### Commit `20625d4` — `audit:code` auto-fires at dev/qa epilogue + phase-loop (4 files, +97/−2)

- `src/commands/agent-epilogue.js`: after every `@dev`/`@qa` completion, runs `audit:code --changed` as a **non-blocking advisory** (beside the existing `contract:integrity` advisory). HIGH → advisory `ok:false` step, but **never added to `errors`** → cannot flip the epilogue `ok`. Clean/empty diff is a fast no-op. Covers tracked + untracked sessions.
- `docs/dev/phase-loop.md` (template + mirror): step 2 now runs `audit:code . --changed --json` alongside `harness:check` for per-phase, changed-scoped feedback (HIGH = fix-before-advancing).

### Commit `6beefb2` — deterministic `audit:code` step in the TRACKED `workflow:next` gate (8 files, +250/−2)

- `src/commands/workflow-next.js` `finalizeCurrentStage`: at every `@dev`/`@qa` done-gate (right after contract-integrity + scope-drift), runs `audit:code` scoped to the diff. Result rides a summary (`result.auditCode`).
- `src/verification-policy.js`: new `audit_code` default + `normalizeAuditCode` + `getAuditCodePolicy` + round-trip. Policy in `verification.json`:
  - **`advisory`** (DEFAULT) — records summary + emits `audit_code_findings` guard event, **never blocks** (audit:code is a heuristic, not the declared contract → existing installs keep advancing).
  - **`block`** — a HIGH in scope is a hard gate (`[Code-Quality Gate]` throw). Opt-in enforcement.
  - **`off`** — skip.
  - `scope`: `changed` (git diff, default) | `full`.
- `template/.aioson/config/verification.json` + `docs/verification-config.md` updated (+ `.aioson` mirrors).

---

## 4. Complete file inventory

**New source (2):** `src/harness/static-criteria.js` · `src/commands/audit-code.js`
**New tests (3):** `tests/harness-static-criteria.test.js` (17) · `tests/audit-code.test.js` (9) · `tests/workflow-audit-code-gate.test.js` (4)
**Modified source (8):** `src/harness/contract-schema.js` · `src/harness/contract-integrity-gate.js` · `src/commands/harness-check.js` · `src/commands/agent-epilogue.js` · `src/commands/workflow-next.js` · `src/verification-policy.js` · `src/cli.js` · `src/parser.js`
**Modified tests (2):** `tests/agent-operations.test.js` (+3) · `tests/verification-policy.test.js` (+2)
**Framework docs/agents/config (template + `.aioson` mirror, byte-identical):** `agents/qa.md` · `agents/orchestrator.md` · `agents/sheldon.md` · `docs/sheldon/harness-contract.md` · `docs/dev/execution-discipline.md` · `docs/dev/phase-loop.md` · `docs/verification-config.md` · `config/verification.json`

---

## 5. New surfaces (quick reference)

```bash
aioson audit:code [path] [--changed] [--category=ANTI_PATTERN,TODO,DEAD_CODE,DUPLICATION] [--json] [--strict]
aioson harness:check . --slug={slug}    # now also evaluates SG-* static criteria
```

```jsonc
// harness-contract.json — a static (SG-*) criterion
{ "id": "SG-1", "binary": true,
  "files": ["src/x.ts"],
  "must_match": ["export function parseX"],
  "must_not_match": ["as any", "TODO"] }
```

```jsonc
// verification.json — tracked audit:code policy
"audit_code": { "tracked_gate": "advisory" /* block|advisory|off */, "scope": "changed" /* changed|full */ }
```

**audit:code now covers three points:** untracked (`agent:epilogue`) · per-phase (dev phase-loop) · tracked done-gate (`workflow:next`).

---

## 6. Design decisions & deliberately declined (rationale preserved)

- **SG-* runs at every gate; RG-* runs once.** Static is build-free and cheap → free at every stage; runtime is expensive → once at the last gate. They complement, never replace each other (a `must_match` proving an API call *appears* in source is not proof the endpoint *runs*).
- **audit:code default = advisory, block = opt-in.** audit:code is a heuristic opinion, not the feature's declared contract. Blocking by default would (a) false-block on legitimate `eval`/`new Function`/`innerHTML`, (b) change behavior for existing installs. So advisory is the non-surprising default; projects opt into `block`.
- **Declined:** block-by-default (above); `SG-*` seeding in `harness:init` (authors derive criteria from ACs — a placeholder is noise); orphan-file `DEAD_CODE` (lower precision than the unused-import heuristic kept).

---

## 7. Still open (if pursued later)

- A `--changed` default in more places.
- Wire the `audit_code` summary into the dashboard/telemetry view explicitly.
- Optional `block` preset for sensitive features (mirror the security floor).

---

*Operator memory: `project_aioson_build_free_gates`. Related: `project_aioson_lean_harness_redesign`, `project_aioson_runtime_gate_lean_lane`.*
