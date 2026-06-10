---
slug: workflow-classification-and-autopilot-fixes
status: done
owner: dev
created_at: 2026-06-09
classification: MICRO
risk: medium
source: direct-user-request
---

# Simple Plan — Workflow fixes: classification precedence + autopilot activation

Two bugs found during @dev session of `loop-guardrails`, to be fixed in sequence.

## Scope

### Fix 1 — Classification precedence (preflight/gate dead-end for SMALL features)

`detectClassification` in `src/preflight-engine.js:364-386` reads `project.context.md` FIRST and only falls back to feature frontmatter — the inverse of the documented contract (feature PRD takes precedence), already implemented correctly in `workflow-next.js:635-654` and `handoff-contract.js:241-261`. Consequence: SMALL feature in MEDIUM project gets MEDIUM gating → preflight/gate:check demand `implementation-plan-{slug}.md` from @pm, an agent the SMALL sequence never runs → @dev permanently BLOCKED. Known issue, manually worked around in `workflow-hotfix-1-9-3` and `neural-chain` (see their `gate_plan_note`); the F4/T1 fix from `workflow-handoff-integrity` missed this consumer.

Second defect, same class: `GATE_REQUIRED_ARTIFACTS.C` in `src/commands/gate-check.js:39` requires `implementation-plan-{slug}.md` unconditionally — must be MEDIUM-only (pm.md:29-31, AC-SDLC-15).

Changes:
1. `src/preflight-engine.js` — `detectClassification`: when slug present, resolve spec/PRD frontmatter first, project context as fallback (mirror `resolveClassification` in handoff-contract.js).
2. `src/commands/gate-check.js` — Gate C artifact requirement conditional on `classification === 'MEDIUM'`; fix recommendation strings for SMALL.
3. Tests covering: SMALL feature in MEDIUM project → preflight classification = SMALL, no implementation-plan blocker; gate:check C passes for SMALL with Gates A+B approved; MEDIUM behavior unchanged.
4. Unblock `loop-guardrails`: run `aioson gate:check . --feature=loop-guardrails --gate=C` then `gate:approve` — must pass via official path, no manual frontmatter edit.

### Fix 2 — Autopilot handoff never activated (flag missing)

`workflow-autopilot-handoff` was implemented correctly (protocol doc + 4 agent sections + `buildAgentPrompt` wiring all in place and synced), but it is opt-in and `auto_handoff: true` was never added to `project.context.md` frontmatter. Absent = manual handoffs (documented default in `.aioson/docs/autopilot-handoff.md` activation rule 1). That is why everything still requires manual activation.

Changes:
1. Add `auto_handoff: true` to `.aioson/context/project.context.md` frontmatter.
2. Optional hardening (small): `aioson doctor` warns when the autopilot doc exists but the flag is absent — prevents this silent-inactive state for other users.

## Out of scope

- **Post-dev autopilot chain** (dev → pentester/tester/qa → dev correction loops → @scope-check post-fix → dev → qa until done): never implemented — the shipped autopilot deliberately stops at the @dev handoff ("Never auto-invoke @dev"). Only the existing qa-dev-cycle (@qa ↔ @dev corrections) is automated. This is a NEW FEATURE, not a bug: route through @product/@briefing.
- **loop-guardrails does NOT cover handoff automation** — it hardens the `self:loop` harness (file scope guard, token budget, human gates, criteria checks). Different layer.

## Expected files

- src/preflight-engine.js
- src/commands/gate-check.js
- tests/ (preflight/gate tests — locate existing suites)
- .aioson/context/project.context.md (frontmatter flag)
- src/doctor.js (optional, fix 2 hardening)

## Verification

- npm test
- npm run lint
- `aioson preflight . --agent=dev --feature=loop-guardrails` → Classification: SMALL, no implementation-plan blocker
- `aioson gate:check . --feature=loop-guardrails --gate=C` → PASS; `gate:approve` → approved
- Next feature session: @analyst auto-chains to next agent without manual activation

## Session state

Next step: none — implemented and verified (2026-06-09).

## Verification evidence (2026-06-09)

- `npm test`: 3001/3004 pass — only the 2 pre-existing AC-CTPK-06 failures (Windows CRLF, documented in workflow-autopilot-handoff plan; reproduced on clean HEAD). 2 dossier tests flaked once in a full run, passed in isolation and on re-run.
- `npm run lint`: clean.
- `node bin/aioson.js preflight . --agent=dev --feature=loop-guardrails`: Classification SMALL (was MEDIUM), no implementation-plan blocker, Readiness READY_WITH_WARNINGS (was BLOCKED).
- `node bin/aioson.js gate:check . --feature=loop-guardrails --gate=C`: PASS; `gate:approve`: approved via official path — first SMALL feature to clear Gate C without the manual frontmatter workaround.
- `node bin/aioson.js doctor .`: `[OK] Autopilot handoff flag declared`.
- Test fixture `sdlc-process-upgrade-regression.test.js` (AC-SDLC-15/17) updated to declare `classification: MEDIUM` explicitly — it encoded the old over-strict behavior with no classification in the fixture.
- Doctor hardening shipped: `context:auto_handoff_declared` warning check + i18n keys (en, pt-BR, es, fr) + 3 tests.
- NOTE: the globally installed `aioson` (npm) still has the old behavior until the next release — use `node bin/aioson.js` in this repo until then.
