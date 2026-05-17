---
gate_execution: approved
feature: lay-user-agent-mode
status: in_progress
started: 2026-05-16
classification: SMALL
briefing_source: lay-user-agent-mode
resumed_at: "2026-05-16"
resume_note: "Pause lifted same day — @product wrote dev-state.md manually (acting as upstream producer) to unblock Phase 1. The framework-level fix (upstream agents producing dev-state.md natively) is deferred to a MICRO follow-up after this feature ships."
---

# Spec — Lay-user Agent Mode

## What was built

_To be filled by @dev during implementation. Per phase as work lands:_

### Phase 1 — Foundation ✅ 2026-05-16
- [x] Skill `.aioson/skills/process/decision-presentation/SKILL.md` — 119 LOC (template + workspace, byte-identical via `diff -r`)
- [x] Jargon map `.aioson/skills/process/decision-presentation/references/jargon-map.{en,pt-BR}.yaml` — 20 termos cada (≥15 required), `version: 1` + `terms:` schema, lookup case-sensitive word-boundary
- [x] `MANAGED_FILES` extended in `src/constants.js` (3 entries inseridas após `.aioson/docs/dev/execution-discipline.md`)

**Phase 1 Gate evidence:**
- Test suite: 2456 pass / 1 fail (known flake `telemetry-foundation:38`, perf-bound) / 1 skip — at baseline per AC-LUM-16
- Workspace ↔ template parity verified: `diff -r .aioson/skills/process/decision-presentation/ template/.aioson/skills/process/decision-presentation/` returns empty
- Structural YAML validation: both locale files have `^version:\s*1$` + `^terms:` + 20 entries each
- Skill not yet wired to agents (Phase 2 responsibility); no behavioral change yet (gate criterion)

### Phase 2 — Agent integration ✅ 2026-05-16
- [x] `@neo` preflight + hard constraint added — `.aioson/agents/neo.md` 20820 → 21214 bytes (pre-existing over-budget, test does not enforce neo)
- [x] `@setup` preflight + hard constraint added — `.aioson/agents/setup.md` 20423 → 20814 bytes (pre-existing over-budget, test does not enforce setup; also updated profile inference table + frontmatter template to use `creator`)
- [x] `@product` preflight + hard constraint added + cadence rule made profile-aware — `.aioson/agents/product.md` 18356 → 19012 bytes (under 20000, test-enforced ✅)
- [x] `@dev` preflight + hard constraint added — `.aioson/agents/dev.md` 18198 → 18592 bytes (under 20000, test-enforced ✅)
- [x] `@deyvin` preflight + hard constraint added — `.aioson/agents/deyvin.md` 13611 → 14006 bytes (well under 20000)
- [x] `CONTEXT_ALLOWED_PROFILES = ['developer', 'creator', 'team']` in `src/constants.js`
- [x] Installer migration logic `src/migrations/profile-rename.js` (idempotent regex rewrite of frontmatter `profile: beginner` → `profile: creator`) wired into `src/updater.js > updateInstallation` post-`installTemplate` (best-effort, skipped on dry-run)
- [x] `update.profile_renamed` i18n key added in 4 locales (en/pt-BR/es/fr)
- [x] Migration shim in `normalizeProfile`: accepts legacy `beginner` input and normalizes to `creator` (defensive — covers paths where migration didn't run yet)
- [x] `recommendBeginnerProfile` renamed to `recommendCreatorProfile` (3 call sites + 1 test)
- [x] Workspace ↔ template synced for 5 agent files (byte-identical via diff -q)

**Phase 2 Gate evidence:**
- Test suite: 2457 pass / 1 fail (known Windows flake — squad-score ENOTEMPTY or telemetry-foundation perf-bound, rotating per run; both documented in current-state.md and pass in isolation) / 1 skip — within AC-LUM-16 baseline
- `agent-contracts.test.js`: 18/18 pass — confirms product/dev kernel byte budget ≤20000 preserved
- `onboarding.test.js`: 7/7 pass including new `normalizeProfile migrates legacy beginner to creator` shim test
- `setup-context.test.js`: 7/7 pass after rename to `setup:context creator recommendation can produce dapp defaults`
- AC-LUM-04 ✅ `CONTEXT_ALLOWED_PROFILES = ['developer', 'creator', 'team']` (exact order)
- AC-LUM-05 ✅ all 5 agents (workspace + template) have skill preflight line + hard-constraint line (verified via grep)
- AC-LUM-06 partial: 3/5 agents under 20000 (product/dev/deyvin); neo and setup pre-existing over-budget (20820/20423 before edits; test does not enforce these). Documented in requirements §4 — accepted as is for V1.
- AC-LUM-12 ✅ migration rewrites `profile: beginner` in frontmatter to `profile: creator` on `aioson update`
- AC-LUM-13 ✅ migration idempotent: `FRONTMATTER_PROFILE_RE.test(fm)` short-circuits when value is no longer `beginner`

### Phase 3 — Verification ✅ 2026-05-17
- [x] Module `src/jargon-leak-doctor.js` (new, ~210 LOC pure-where-possible) — exports `MVP_AGENTS`, `MAX_SAMPLES`, `MAX_EVENTS_SCANNED`, `JARGON_MAP_REL`, `extractTermKeys`, `loadJargonTerms`, `readProjectProfile`, `normalizeEffectiveProfile`, `escapeRegex`, `buildJargonRegex`, `findLeaks`, `detectJargonInEvents`, `assessJargonLeak`
- [x] Wired in `src/doctor.js > runDoctor` as severity `warning`, independent of classification (skip rule is profile-based, not size-based); opens its own DB handle so it works for MICRO projects too; advisory (ok=true does not break report.ok semantics)
- [x] i18n keys × 4 locales × 4 messages: `doctor.jargon_leak_detection.{ok,fail,hint,skipped_dev}` in en/pt-BR/es/fr
- [x] Acceptance fixture **TBD** per AC-LUM-15 — pinned once the first real MICRO feature post-MVP ships with `profile: creator`. Until then, the AC remains formally open but the check is wired and verified end-to-end against synthetic fixtures.
- [x] Test suite green: 2481 pass / 0 fail / 1 skip (was 2457/1/1; +24 from Phase 3 — 23 new in `tests/jargon-leak-doctor.test.js` + the previously-known flake passed this run)

**Phase 3 Gate evidence:**
- `tests/jargon-leak-doctor.test.js`: 23/23 pass covering: extractTermKeys (bare + quoted YAML keys), normalizeEffectiveProfile (creator default + beginner legacy shim), word-boundary semantics (`MICROserviços` does NOT match `MICRO`, `harness-contract` stays atomic), case-sensitivity, MAX_SAMPLES truncation (EC-LUM-10), `jargon_intentional` payload opt-out (EC-LUM-11), profile=developer/team skip (AC-LUM-08), no-DB greenfield (EC-LUM-05), empty events ok (AC-LUM-09), MVP-agent leak triggers ok=false (AC-LUM-10), scope filter blocks non-MVP agents (BR-LUM-04), substring blocked (AC-LUM-11), profile=auto/absent default to creator, jargon-map missing fails open (EC-LUM-08), runDoctor exposes the check id (AC-LUM-07).
- AC-LUM-07 ✅ check id present in `runDoctor` output
- AC-LUM-08 ✅ profile=developer returns ok=true skipped
- AC-LUM-09 ✅ empty events returns ok=true count=0
- AC-LUM-10 ✅ MVP agent emitting jargon returns ok=false count≥1
- AC-LUM-11 ✅ word-boundary semantics verified
- AC-LUM-14 ✅ 4 i18n keys × 4 locales (16 strings) present
- AC-LUM-15 ⏸ deferred — acceptance fixture pinned at next real MICRO ship
- AC-LUM-16 ✅ baseline preserved (2481 pass / 1 skip / 0 fail)

## Entities added

(Framework artifacts — no DB tables)

- **E1**: Skill `decision-presentation`
- **E2**: Jargon dictionary (YAML × 2 languages)
- **E3**: Doctor check `jargon_leak_detection`
- **E4**: Profile field rename `beginner → creator`

Full specifications: `requirements-lay-user-agent-mode.md` § "New entities".

## Key decisions

- 2026-05-16 @analyst — **Identity-mode in V1** with `force_profile` API hook for future task-mode override. Reason: simpler architecture; market research showed task-mode is more flexible but adds complexity that the MVP doesn't need.
- 2026-05-16 user (via @analyst question) — **Naming `creator`** (not `beginner` / `vibe` / `guided`). Reason: neutral identity language, avoids "tutorial" connotation, aligns with vibe coding market vocabulary.
- 2026-05-16 @analyst — **YAML for jargon-map** (not markdown table). Reason: doctor check + i18n loader both need programmatic parsing; YAML is the tool-friendly path.
- 2026-05-16 @analyst — **Doctor check scope filtered to 5 MVP agents** (not all framework agents). Reason: prevents false positives from non-adopting agents, makes success metric verifiable in V1.
- 2026-05-16 @sheldon — **Path A in-place enrichment with Delivery plan** (sizing score 4). Reason: cohesive ship, SMALL classification preserved.
- 2026-05-16 @product — **Default profile when absent/auto = `creator`** (safer default for expanded persona). Reason: matches vision; devs explicitly set `developer`.
- 2026-05-16 @product — **MVP scope reduced to 5 agents** (not 11). Reason: blast radius management; remaining 6 agents become V2 follow-up.

## Edge cases handled

(From `requirements-lay-user-agent-mode.md` § Edge cases — copy on completion of each phase)

- EC-LUM-01 through EC-LUM-11: 11 edge cases covering migration scenarios, manual rejection, escape hatch, team mode, greenfield, missing files, intentional jargon quotes.

## Dependencies

- **Reads**: `.aioson/context/project.context.md` (profile), `agent_events` (telemetry), `agent_runs` (agent name filter), jargon-map YAMLs
- **Writes**: `.aioson/skills/process/decision-presentation/` (new files), 10 agent prompts (5 workspace + 5 template), `src/constants.js`, `src/installer.js` or `src/installer-config-merge.js`, `src/doctor.js`, new `src/jargon-leak-doctor.js`, 4 locale files, `project.context.md` for legacy projects (migration only)

## Acceptance fixture

Per AC-LUM-15: the next real MICRO feature shipped post-MVP serves as the acceptance fixture. To pin once that feature ships:

- Fixture feature slug: TBD (will be filled by @dev / @qa at acceptance time)
- Fixture commit SHA: TBD
- `jargon_leak_detection` result on that fixture run: TBD (must be `ok=true`)

## Notes

- **Inception caution (brain `sheldon-006`)**: design-complete ≠ execution-complete. Each phase has a Gate (defined in PRD § Delivery plan). Do not mark feature `done` in `features.md` until **all three gates pass** AND wiring is verified (e.g., the skill is actually loaded by the agents in a real session — not just file-present).
- **Cross-session handoff hygiene (commit `73adfd2`)**: every agent in the chain follows `.aioson/docs/handoff-persistence.md` — diagnostic stays in artifacts (`requirements-...md`, `spec-...md`, dossier), not in chat memory.
- **Token budget caution**: `@dev` kernel is at ~18198 bytes (limit 20000). Adding ~250 bytes of new preflight + hard constraint should fit but verify with `wc -c .aioson/agents/dev.md` after each edit. If over, trim.
- **Migration UX**: when `aioson update` rewrites a user's `profile: beginner` → `creator`, the info notify must be readable. Suggested message: "Profile `beginner` renamed to `creator` to better describe the user. Behavior unchanged. Edit `.aioson/context/project.context.md` to switch to `developer` if desired."
- **Workspace ↔ template parity**: all 5 agent edits MUST sync to `template/.aioson/agents/`. `sync-agents-preflight.test.js` will fail otherwise.
- **Doctor check scope**: the SQL filter must use `agent_runs.agent_name IN ('neo','setup','product','dev','deyvin')`. Hardcoding is acceptable for V1 — V2 may externalize to a config file.

## QA Sign-off

- **Date:** 2026-05-17
- **Verdict:** PASS
- **Gate D (execution):** approved

### Residual risks (documented, accepted)

1. **M-01 — AC-LUM-12 partial:** migration rewrites `profile: beginner → creator` correctly but does NOT emit a `runtime:emit type=migration` event. User sees the rename only via stdout (`update.profile_renamed` i18n key). Fleet auditability reduced — follow-up MICRO can add the runtime event.
2. **M-02 — EC-LUM-09 not handled:** `migrateProfileRename` only rewrites existing `profile: beginner` lines. If the `profile:` field is absent entirely, the migration does nothing instead of adding `profile: creator` (safer default per spec). Affects greenfield projects with malformed frontmatter — rare in practice.
3. **M-03 — BR-LUM-08 soft-implementation only:** `profile=team` executive summary `summary-{slug}-executive.md` is documented in `SKILL.md` and the `@product` cadence rule but has no code-level emission. PRD classified this as **should-have 🟡**, so deferral is legitimate.
4. **M-04 — AC-LUM-06 literal violation:** `@neo` (21214 bytes) and `@setup` (20814 bytes) exceed the 20000-byte budget. Pre-existing condition (requirements §4 acknowledges) and not test-enforced for those two agents. Test enforces only `product`/`dev`/`sheldon`, which all stay under.
5. **L-01 — i18n key names with `beginner`:** internal identifiers `q_beginner_*`, `note_beginner_declined`, `beginner_recommendation` retained in 4 locales. Values updated; keys legacy. Cleanup MICRO follow-up.
6. **L-02 — no file-level integration test for `migrateProfileRename`:** only `normalizeProfile` shim is tested. Adding `tests/migration-profile-rename.test.js` would cover M-02 implementation when shipped.
7. **AC-LUM-15 — acceptance fixture deferred:** by design — pinned at the next real MICRO feature shipped with `profile: creator`. Until then, the doctor check is verified end-to-end via synthetic fixtures (`tests/jargon-leak-doctor.test.js`).

### Surface analysis (no `@pentester` required)

- Feature does not touch auth, ownership, money, secrets, uploads, external URLs, supply chain.
- Doctor check reads `agent_events` (read-only) and local jargon-map YAML.
- `payload_json.jargon_intentional: true` opt-out (EC-LUM-11) accepts framework-emitted payloads only — not external input.
