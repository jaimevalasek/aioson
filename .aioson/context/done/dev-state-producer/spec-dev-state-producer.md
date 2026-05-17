---
gate_execution: approved
feature: dev-state-producer
status: in_progress
started: 2026-05-17
classification: MICRO
---

# Spec — Dev State Producer

## What was built

### Single ship — MICRO scope (2026-05-17)

- [x] **`aioson dev:state:write` alias** registered in `src/cli.js` `KNOWN_COMMANDS` and dispatcher (also accepts `dev-state-write` kebab variant). Routes to `runStateSave` — no new module, just a semantically clearer name for kernel invocations.
- [x] **`--context` canonical types flag** added to `runStateSave` in `src/commands/state-save.js`. Accepts comma-separated tokens (`prd`, `requirements`, `spec`, `architecture`, `impl-plan`, `sheldon`, `design-doc`, `dossier`). Each token resolves to a feature-scoped relative path. Max 4 entries total (project.context.md anchor counted). Missing files emit warnings via the result `warnings[]` array and stdout `warn:` lines; never fail the command. Unknown tokens warn-and-skip with the full canonical list in the warning. Visible confirmation banner `✓ @dev will auto-resume on cold start: next_step="..."` printed when explicit context mode is used and zero warnings.
- [x] **Parser truncation bug fix** in `src/parser.js`. Root cause: `token.replace(/^--/, '').split('=')` + array destructuring `[k, v]` discarded anything after the second `=`. Affected **every CLI command** with `=` in a flag value (URLs, sentences with key=value pairs, SQL, etc.) — not just `state:save`. Fix: replace `.split('=')` with `indexOf('=')` + manual `slice`. Bug discovered while writing `dev-state.md` for lay-user-agent-mode Phase 2 (next_step truncated at `profile=creator`).
- [x] **`@analyst` kernel** gained a `## Dev handoff producer` section instructing the agent to invoke `dev:state:write` at session end when the next agent is `@dev`. Workspace + template byte-identical (17521 bytes).
- [x] **`@product` kernel** gained a `## Dev handoff producer` section scoped to MICRO classification only (SMALL/MEDIUM flows hand off to `@analyst` first, which owns the producer there). Workspace + template byte-identical (19826 bytes, safely under 20000 budget).
- [x] **Tests** — `tests/dev-state-producer.test.js` (16 tests) + `tests/parser-core.test.js` (3 new regression tests for the truncation bug).
- [x] **Backward compatibility** — calling `state:save` without `--context` falls back to legacy auto-detect behavior (`project.context.md` + `spec-{slug}.md` + plan if present). No breaking change for existing callers.

## Entities added

(Framework artifacts — no DB tables)

- **E1**: Comando CLI alias `dev:state:write` (cosmético — mesma função que `state:save`)
- **E2**: Flag `--context` com vocabulário canônico de 8 tipos
- **E3**: `## Dev handoff producer` section em `@analyst` e `@product` kernels

## Key decisions

- 2026-05-17 user — **Opção (a) sintética como must-have** para success metric. Acceptance fixture (próxima feature MICRO real) fica como deferred.
- 2026-05-17 user — **Recomendações para Q1-Q4** aceitas via "a" (interpretado como Q5 explícito + Q1-Q4 default): mecanismo A (CLI dedicado), agentes must=@analyst+@product, bundling do truncation fix incluído, schema via flags.
- 2026-05-17 @dev — **Truncation bug realocado de `state-save.js` para `src/parser.js`**. Originalmente classificado como bug no `state:save`, descoberto que o bug é no parser de args genérico (afeta toda CLI). Fix tem impacto bem maior que o PRD previa.
- 2026-05-17 @dev — **Self-eating implementado**: a feature `dev-state-producer` escreveu seu próprio `dev-state.md` usando o comando que ela mesma adicionou, no meio da implementação. Inception consumado.

## Edge cases handled

- Missing context file → warning + skip (not a hard failure)
- Unknown context token → warning + skip with canonical list shown
- 5+ context tokens requested → cap clip at MAX_CONTEXT=4 with explicit warning
- Empty `--context=""` → falls back to auto-detect (legacy path)
- `--context` with whitespace / double commas → trimmed, empty entries filtered
- Long `--next` value (1000+ chars with `=` markers inside) → preserved intact (parser fix)
- Idempotent re-runs → same frontmatter and context block (History section accumulates by design, as audit trail)
- `state-save` invoked via legacy callers without `--context` → backward compat preserved

## Dependencies

- **Reads**: `src/preflight-engine.js > scanArtifacts` (artifact existence checks), `.aioson/context/project.context.md`, feature-scoped artifacts
- **Writes**: `.aioson/context/dev-state.md`
- **Touched**: `src/parser.js` (parser fix), `src/cli.js` (alias registration), `src/commands/state-save.js` (--context flag + warnings), `.aioson/agents/{analyst,product}.md` + `template/.aioson/agents/{analyst,product}.md`, `tests/parser-core.test.js` (regression cases), `tests/dev-state-producer.test.js` (new test file)

## Out of scope (deferred to follow-up MICRO or V2)

- **`@sheldon`, `@architect`, `@ux-ui` invocations** — should-have per PRD; same pattern as `@analyst`, mechanically trivial (~3 lines per kernel). Reopens when sigh of dev cold-start surfaces in SMALL+Sheldon or MEDIUM flows.
- **`last-handoff.json` producer** — separate scope, mechanically independent.
- **Doctor check for "agent X handed to @dev without producing dev-state.md"** — V2 telemetry-driven check.
- **AIOSON CLI v1.10.0 publish bump** — Trilha A of the original `agent-chain-continuity-delivery-fix` briefing. Still open; remains the gap that makes the published `aioson` binary not include any of the new commands (`dev:resume-data`, `dev:state:write`, etc.) until the next npm publish.

## Notes

- This feature **does not solve** Bugs 1/3/4 from the original 2026-05-16 fluidity diagnostic (CLI publish drift, `workflow:next --complete` not invoked by upstream kernels, classification split-brain). Those remain as a separate follow-up. This MICRO addresses ONLY Bug 2 (upstream producer of `dev-state.md`) by the user's scope-cut decision.
- **Parser bug blast radius**: the truncation fix in `src/parser.js` likely fixes silent breakage in many other commands that pass flag values containing `=`. No known prior reports — the bug was discovered only because `state:save` exposes the truncated value back to the user, making the breakage observable. Other commands may have silently been losing flag content for a while.
- **Inception self-eat moment**: while implementing this feature, `@dev` invoked the new `aioson dev:state:write` command to write its own `dev-state.md` (after fixing the parser bug). The command and the feature it implements are now co-resident in the working tree.

## QA Sign-off

- **Date:** 2026-05-17
- **Verdict:** PASS
- **Gate D (execution):** approved

### Residual risks (documented, accepted)

1. **M-01 — Parser fix blast radius unknown:** the `.split('=')` bug pre-existed and silently truncated any flag value containing `=` across ALL CLI commands. The fix is correct and isolated regression-tested, but no systematic audit of existing callers was done. Other commands may have compensated with workarounds that now over-correct. Mitigation: 3 regression tests pin the corrected behavior; follow-up audit can `grep -r 'aioson.*--' .aioson/agents/` for kernel invocations with `=` in values.
2. **L-01 — Slug not validated in `--feature=`:** path-traversal slug like `../../etc/passwd` is accepted as-is. Not exploitable today (dev-state.md write path is fixed) but creates fragile coupling for future callers that derive paths from the slug. Follow-up MICRO: add `^[a-z0-9-]+$` regex validation at the top of `runStateSave`.
3. **L-02 — Soft-enforcement by design:** `@analyst` and `@product` are instructed to invoke `dev:state:write` via prompt-level kernel additions. No runtime assertion blocks closure if the agent forgets. Acceptable per PRD (prompt-level is the explicit design choice). V2 doctor check `handoff_state_md_missing` would harden this.
4. **AC-DSP-09 deferred:** `@sheldon`/`@architect`/`@ux-ui` kernel invocations are should-have per PRD. Same mechanical pattern as `@analyst`/`@product` — opens when SMALL+Sheldon or MEDIUM flows surface cold-start regressions.
5. **AC-DSP-10 deferred:** acceptance fixture (next real MICRO with `--context=prd` returning a usable `dev-state.md` consumed by a `@dev` cold-start without user pinging) — by design pinned at next-real-feature time.
6. **Out-of-feature follow-ups:** Bugs 1/3/4 from the 2026-05-16 fluidity diagnostic remain open as independent scope (CLI v1.10.0 publish bump, `workflow:next --complete` invocations in upstream kernels, classification SSOT). This feature addressed Bug 2 only by user's scope-cut decision.

### Surface analysis (no `@pentester` required)

- Feature does not touch auth, ownership, money, secrets, uploads, external URLs, supply chain.
- `--context` accepts a closed whitelist (`CONTEXT_TYPE_MAP`); unknown tokens warn-and-skip.
- The parser fix legitimately enlarges what flag values may contain — corrects pre-existing silent corruption, no new attack surface.
