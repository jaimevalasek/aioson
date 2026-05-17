---
feature: lay-user-agent-mode
classification: SMALL
produced_by: analyst
date: 2026-05-16
prd_source: prd-lay-user-agent-mode.md
sheldon_enrichment: sheldon-enrichment-lay-user-agent-mode.md
briefing_source: lay-user-agent-mode
---

# Requirements — Lay-user Agent Mode

## Feature summary

Profile-aware UX layer that makes AIOSON agents friendly to non-developer users. Introduces a `decision-presentation` skill, a jargon translation dictionary (en+pt-BR), mandatory skill loading in 5 user-facing agents (`@neo`, `@setup`, `@product`, `@dev`, `@deyvin`), and a doctor check `jargon_leak_detection` that verifies adherence in CI. Renames `profile: beginner` → `profile: creator`. Default profile (when absent or `auto`) is `creator` — safer for the framework's expanded persona.

## Analyst decisions (closes sheldon-enrichment open questions)

| # | Question | Resolution | Authority |
|---|---|---|---|
| Q7 | Identity-mode vs task-mode | **Identity-mode in V1** with API hook for future task-mode (skill accepts optional `force_profile` parameter so task-mode override is possible without breaking V1 schema). | @analyst |
| Q8 | Naming `beginner` vs alternatives | **`creator`** — neutral, dignified, aligns with market vocabulary. Replaces `beginner` in `CONTEXT_ALLOWED_PROFILES`. Migration: `aioson update` should map legacy `profile: beginner` → `profile: creator` automatically (1-line installer logic). | User confirmed |
| Q9 | `agent_events` schema captures output? | **Yes (partial)** — schema verified: `agent_events` has `message` (TEXT NOT NULL DEFAULT '') + `payload_json` (TEXT). Captures summaries emitted via `runtime:emit`, not full agent transcripts. Sufficient for MVP success metric — jargon vazamento aparece nas summaries. Full transcript capture defers to V2. | @analyst (factual via `src/runtime-store.js:166-174`) |
| Q10 | Jargon-map schema | **YAML** — tool-friendly for doctor check parsing + i18n loader. Markdown table preterido (human-friendly but harder to consume programatically). Format spec in `## New entities` below. | @analyst |

## New entities (framework artifacts — adapted from standard table format)

### E1 — Skill `decision-presentation`

| Property | Value |
|---|---|
| Path | `.aioson/skills/process/decision-presentation/SKILL.md` |
| Size budget | ≤ 200 lines (per brain `skill-consolidation-patterns-2026` precedent) |
| Loadable by | Any agent via "Deterministic preflight" |
| Mandatory for | @neo, @setup, @product, @dev, @deyvin (MVP V1) |
| Reads | `profile` from `.aioson/context/project.context.md`, jargon-map YAML files |
| Exports (semantic API) | `present_decision(question, options, recommended_index, plain_language_why)`, `translate(term, target_lang, profile)` |

**Skill behavior contract:**
- When `profile=creator`: enforce 1 question per turn, mandatory AskUserQuestion with `(Recomendado)` marker on first option, plain-language `why`, jargon translation via dictionary, "Pausar / quero pensar" option always present.
- When `profile=developer`: skill loaded but rules relaxed — 5 questions/batch allowed, jargon OK, recommendation marker optional.
- When `profile=team`: behaves as `developer` during interaction + emits `summary-{slug}-executive.md` at agent:done (3-5 bullets in plain language).
- When `profile` is absent or `auto`: behave as `creator` (safer default per @product decision).

### E2 — Jargon dictionary

| Property | Value |
|---|---|
| Path (en) | `.aioson/skills/process/decision-presentation/references/jargon-map.en.yaml` |
| Path (pt-BR) | `.aioson/skills/process/decision-presentation/references/jargon-map.pt-BR.yaml` |
| Languages V1 | en + pt-BR only. es/fr deferred to follow-up MICRO. |
| Format | YAML keyed by canonical term; values include translations + context examples |
| Loading | Lazy — only loaded when skill is about to emit translation, not at kernel boot |

**YAML schema:**
```yaml
version: 1
terms:
  MICRO:
    translation: "rápida"
    context: "Tipo de feature pequena (1-2 horas de trabalho)"
    examples: ["feature MICRO", "classification: MICRO"]
  SMALL:
    translation: "padrão"
    context: "Tipo de feature de médio porte (1-3 dias)"
    examples: ["classification: SMALL"]
  MEDIUM:
    translation: "completa"
    context: "Tipo de feature complexa (1+ semana, com vários gates de revisão)"
    examples: ["classification: MEDIUM", "Gate D approved"]
  "Gate D":
    translation: "revisão final antes de fechar"
    context: "Última verificação que o QA faz antes de marcar feature como pronta"
    examples: ["Gate D pending", "Gate D: approved"]
  # ... ~15-20 terms total covering MICRO/SMALL/MEDIUM, Gate A-D, tier1/2/3,
  # circuit_open, harness-contract, waiting_validation, ready_for_done_gate,
  # dossier, brain, scout, in_progress, done, classification
```

### E3 — Doctor check `jargon_leak_detection`

| Property | Value |
|---|---|
| Module | `src/learning-loop-doctor.js` (extend existing) OR new `src/jargon-leak-doctor.js` (≤ 100 LOC) — @architect decides |
| Wire site | `src/doctor.js` `runDoctor()` function |
| Severity | `warning` (advisory; does not break `report.ok`) |
| Scope | Filtered by agent name to `[neo, setup, product, dev, deyvin]` — non-participants excluded to prevent false positives |
| Data source | SQL: `SELECT message, payload_json FROM agent_events ae JOIN agent_runs ar ON ae.run_key = ar.run_key WHERE ar.agent_name IN (...) AND ae.created_at > (last 100 events or N days configurable)` |
| Matching | Case-sensitive against jargon-map keys; word-boundary match (regex `\b{term}\b`) |
| Profile filter | Only flags when active project has `profile: creator`. Skip when `profile: developer` (jargon permitted). |
| i18n keys | `doctor.jargon_leak_detection.{ok,fail,hint,skipped_dev}` × 4 locales (en/pt-BR/es/fr) |
| Output structure | `{ id: 'jargon_leak_detection', severity: 'warning', ok: bool, count: n, samples: [...] }` consumed by report rendering |

### E4 — Profile field rename (`beginner` → `creator`)

| Property | Value |
|---|---|
| File | `src/constants.js` |
| Old value | `CONTEXT_ALLOWED_PROFILES = ['developer', 'beginner', 'team']` |
| New value | `CONTEXT_ALLOWED_PROFILES = ['developer', 'creator', 'team']` |
| Backward compat | `aioson update` migration: detect `profile: beginner` in existing `project.context.md` → rewrite to `profile: creator` + emit notify `level=info topic=migration message="profile renamed beginner→creator"`. |
| Default semantics | When `profile` absent/auto/empty → treat as `creator` (NOT `developer`). |

## Changes to existing entities

### Agent prompts (5 files, workspace + template = 10 files total)

For each of `@neo`, `@setup`, `@product`, `@dev`, `@deyvin`:

1. **Add to "Deterministic preflight" section:**
   > "Always load `.aioson/skills/process/decision-presentation/SKILL.md` before the first user-facing question. Mandatory regardless of profile."

2. **Add to "Hard constraints" section:**
   > "Never present multiple open questions in one turn when `profile=creator` (or default). Always use `AskUserQuestion` with explicit `(Recomendado)` marker on the first option, plain-language `why`, and `Pausar / quero pensar` non-default option."

3. **Profile-aware kernel branching:**
   - Read `profile` from `project.context.md` during preflight
   - Pass to skill calls — skill enforces cadence
   - For `@product`, lines 269-270 in current `product.md` (the "5 questions/batch" rule) — **replace** with a single rule that branches on profile internally. Old text:
     > "From the second message onward, ask up to 5 numbered questions per batch"
     New text:
     > "Cadence by `profile`: `creator` → 1 question per turn via AskUserQuestion; `developer` → up to 5 numbered questions per batch; `team` → up to 5 per batch + emit executive summary at agent:done."

4. **Kernel byte budget**: each agent's kernel must remain ≤ 20000 bytes after edits. `@neo` is currently at 20434 (already over for that agent's nominal budget, but not enforced by tests). `@product` is at ~18356, `@dev` at ~18198 — adding ~250 bytes of preflight + hard constraint should be safe but @dev will get close to 20000. If over, trim non-essential lines.

5. **`@neo` Camada A already incorporates the new diagnostic** (commit `72751cb`). For Camada B/C/D this commit, only the skill load + hard constraint additions are new.

### `src/constants.js`

- `CONTEXT_ALLOWED_PROFILES` — replace `beginner` with `creator`.
- `MANAGED_FILES` — add the new skill path + jargon-map files so the installer treats them as managed (backup on update, install on fresh).

### `src/installer.js` (or `src/installer-config-merge.js`)

- Migration logic: detect legacy `profile: beginner` in `.aioson/context/project.context.md` → rewrite to `profile: creator` + log via `runtime:emit`. Idempotent.

### `src/doctor.js`

- New check `jargon_leak_detection` wired alongside the existing `learning_loop_*` checks. Same return shape (`runCheckResult`).

### Locale bundles

- Add 4 new i18n keys per locale (en/pt-BR/es/fr) for `doctor.jargon_leak_detection`.

## Relationships

```
decision-presentation (SKILL.md)
   ├── reads:  project.context.md → profile
   ├── reads:  jargon-map.{en,pt-BR}.yaml (lazy)
   └── loaded-by: @neo, @setup, @product, @dev, @deyvin

jargon-map.*.yaml
   └── consumed by: skill (translation), doctor.jargon_leak_detection (matching)

doctor.jargon_leak_detection
   ├── reads: agent_events (filtered by agent_name IN MVP_SET)
   ├── reads: project.context.md → profile (skip if developer)
   └── consumes: jargon-map.en.yaml keys (matching dictionary)

CONTEXT_ALLOWED_PROFILES (constants.js)
   ├── enforced by: context validator (setup)
   └── migrated by: installer update path
```

## Migration additions

No new DB tables. Existing `agent_events` schema is sufficient. One data migration:

| Migration | Trigger | Effect | Idempotency |
|---|---|---|---|
| `profile: beginner` → `profile: creator` | `aioson update` post-install hook | Rewrites `project.context.md` frontmatter; emits info notify | Yes — checks current value before rewriting |

## Business rules

1. **BR-LUM-01** — When `profile=creator` (or absent), all user-facing decisions in the 5 MVP agents MUST use `AskUserQuestion` with the `(Recomendado)` marker on at least one option. Free-form open questions are forbidden in this mode (escape hatch: `AskUserQuestion` with one option "Other / Conte com suas palavras" still satisfies the rule).
2. **BR-LUM-02** — When `profile=creator`, the 5 MVP agents emit at most 1 question per turn. Multiple decisions must be staged across turns.
3. **BR-LUM-03** — Jargon dictionary lookup is case-sensitive but `\b{term}\b` word-boundary matched. False matches on substring (e.g., "MICROserviços" should NOT match "MICRO") are blocked.
4. **BR-LUM-04** — `jargon_leak_detection` doctor check scope: only events whose `agent_runs.agent_name` is in `[neo, setup, product, dev, deyvin]`. The other 6 framework agents are out of scope for MVP — their emissions do NOT count as failures.
5. **BR-LUM-05** — `jargon_leak_detection` skip condition: when current project's `profile=developer`, the check is bypassed and emits `ok=true` with severity-skip marker. Developers explicitly opt out of the friendly mode.
6. **BR-LUM-06** — Migration `beginner → creator` is one-way (no reverse migration). Users who want to keep `beginner` as a custom value cannot — the schema enforces the new vocabulary.
7. **BR-LUM-07** — Skill `decision-presentation` loaded ≠ skill activated. Activation is determined by the agent's user-facing decision points; the skill is a guideline + helper, not a runtime interceptor.
8. **BR-LUM-08** — Team mode (`profile=team`) generates `summary-{slug}-executive.md` in `.aioson/context/` only at agent:done (not per-turn). File is overwritten per slug; appended history would require V2 enhancement.
9. **BR-LUM-09** — Jargon-map updates DO NOT trigger doctor warnings for missing translations — that's a V2 enhancement (`jargon_dictionary_coverage` check, deferred per PRD out-of-scope).

## Edge cases

1. **EC-LUM-01** — Project context with `profile: beginner` exists at update time. Migration rewrites to `creator` AND emits info notify so user understands the rename.
2. **EC-LUM-02** — User manually adds `profile: beginner` after migration. Setup wizard validates against `CONTEXT_ALLOWED_PROFILES` and rejects with helpful message ("`beginner` was renamed to `creator` — use that").
3. **EC-LUM-03** — Decision genuinely has 5+ valid options (e.g., 7 framework alternatives). Per BR-LUM-01 escape hatch: agent presents 3 strongest via AskUserQuestion + adds free-form "Other" option. Trade-off documented in skill.
4. **EC-LUM-04** — Agent needs to ask question while `profile=team` and no per-stakeholder profile is captured. Skill defaults to `developer` cadence for the operator and accumulates context for the executive summary.
5. **EC-LUM-05** — `aios.sqlite` missing or empty (greenfield). `jargon_leak_detection` returns `ok=true` with `count=0` (no data to scan — not a failure).
6. **EC-LUM-06** — Old `profile: auto` value (already in allowed list at constants.js? — verify). If `auto` is allowed, treat as `creator` per default rule.
7. **EC-LUM-07** — Skill file deleted at runtime. Agent's preflight load fails → fail-open: agent continues without lay-mode behavior + emits warn notify. Doctor check `claude_commands_present` (or analog) catches this drift.
8. **EC-LUM-08** — Jargon-map file deleted. Skill translation falls back to original term (no transformation) + warn notify.
9. **EC-LUM-09** — Migration runs on a project where `profile` field is missing entirely. Migration adds `profile: creator` to the frontmatter (safer default).
10. **EC-LUM-10** — Doctor check finds 50+ leaks. Output truncated to first 10 samples + count. Avoids overwhelming CI output.
11. **EC-LUM-11** — Word "MICRO" appears in a legitimate code comment quoted by an agent (e.g., quoting source code). Doctor check might false-positive. V1 acceptance: this is rare; user can suppress per-event by `runtime:emit --payload='{"jargon_intentional": true}'`. V2 may add intent classification.

## Out of scope (for this feature, V1)

- Loading skill in the other 6 framework agents (`@analyst`, `@architect`, `@qa`, `@discovery-design-doc`, `@briefing`, `@committer`) — V2 follow-up.
- Spanish + French jargon dictionaries — V1 covers en + pt-BR only.
- Full agent transcript capture (beyond summaries in `agent_events`) — V2.
- Auto-detect of `profile` via behavioral heuristics — V2.
- Task-mode override (skill activates per task, not per identity) — V1 prepares API; V2 implements activation.
- `prd.md` (project main PRD) update to recognize lay-user as official persona — follow-up MICRO after MVP validates.
- Jargon dictionary coverage drift detection — follow-up MICRO.
- In-loop rule violation guard (real-time vs after-fact doctor check) — V2 enhancement.
- 3-5 lay-user interview validation — parallel research track, not blocking MVP delivery.
- Dashboard / live session UI for lay users — separate repository scope.

## Dependencies graph

```
Phase 1 (Foundation)
  Skill (E1)
  Jargon dictionary (E2)
  MANAGED_FILES update

Phase 2 (Agent integration)  — depends on Phase 1
  Agent prompt edits (5 agents × 2 files = 10 file edits)
  Profile rename (CONTEXT_ALLOWED_PROFILES)
  Installer migration (E4 backward compat)

Phase 3 (Verification)  — depends on Phase 2
  Doctor check jargon_leak_detection (E3)
  i18n keys (4 locales × 4 keys)
  Acceptance test fixture (real next-shipped MICRO feature with profile=creator)
```

## Open questions remaining for @architect / @dev

These are the implementation-detail decisions @analyst defers to architecture phase:

1. `[architect]` — Module location for `jargon_leak_detection` function: extend `src/learning-loop-doctor.js` (already has similar `*_detection` checks) OR create new module `src/jargon-leak-doctor.js`? Recommendation: new module for separation of concerns; learning-loop doctor is feature-specific to active-learning-loop.

2. `[architect]` — Skill API shape. Does the skill expose imperative helpers (`present_decision(...)`) that agents call via tool execution, or is it pure prompt-level instructions (no executable interface)? Pure prompt is simpler; imperative is testable. Recommendation: pure prompt for V1, imperative API in V2 if doctor check repeatedly catches violations.

3. `[dev]` — Where to place the migration logic in the installer? Inside `installer-config-merge.js` (alongside autonomy-protocol merge) or new module `src/migrations/profile-rename.js`? Affects discoverability.

4. `[dev]` — How does the doctor check distinguish "AIOSON's OWN agent emitting jargon in workspace-mode" (this very project, inception) vs "an installed project's agent emitting jargon"? Probably it doesn't — both are valid scans. Document in `.aioson/docs/handoff-persistence.md` or analog.

## Acceptance criteria (binary, verifiable)

AC-LUM-01 — File `.aioson/skills/process/decision-presentation/SKILL.md` exists in workspace AND template, byte-identical.
AC-LUM-02 — Files `jargon-map.en.yaml` AND `jargon-map.pt-BR.yaml` exist; both parse as valid YAML with `version: 1` and `terms:` keys.
AC-LUM-03 — Jargon dictionary contains ≥ 15 canonical terms covering MICRO/SMALL/MEDIUM, Gate A-D, tier1/2/3, circuit_open, harness-contract, waiting_validation, ready_for_done_gate, dossier, brain, scout.
AC-LUM-04 — `src/constants.js` `CONTEXT_ALLOWED_PROFILES = ['developer', 'creator', 'team']` (exactly this order).
AC-LUM-05 — 5 agents (`@neo`, `@setup`, `@product`, `@dev`, `@deyvin`) workspace + template files each contain the skill preflight load line AND the hard constraint line. 10 files total. Verified by grep.
AC-LUM-06 — Each of the 5 agents' kernel byte size remains ≤ 20000 after edits.
AC-LUM-07 — `aioson doctor .` reports `jargon_leak_detection` check in its output (id present in report).
AC-LUM-08 — `jargon_leak_detection` returns `ok=true` when project profile is `developer` (skipped check).
AC-LUM-09 — `jargon_leak_detection` returns `ok=true` and `count=0` when no `agent_events` rows from the 5 MVP agents contain jargon-map terms.
AC-LUM-10 — `jargon_leak_detection` returns `ok=false` and `count≥1` when at least one event from the 5 MVP agents contains a jargon term while profile is `creator`.
AC-LUM-11 — Doctor check uses word-boundary matching (test: term "MICRO" inside "MICROserviços" does NOT trigger).
AC-LUM-12 — Migration: `aioson update` on a project with `profile: beginner` writes `profile: creator` in `project.context.md` and emits one `runtime:emit type=migration` event.
AC-LUM-13 — Migration is idempotent: running `aioson update` twice does not double-emit nor reverse the change.
AC-LUM-14 — i18n keys `doctor.jargon_leak_detection.{ok,fail,hint,skipped_dev}` present in all 4 locale files (en/pt-BR/es/fr).
AC-LUM-15 — Acceptance fixture: the next real MICRO feature shipped post-MVP runs end-to-end with `profile: creator` and `jargon_leak_detection` returns `ok=true`. Documented in `spec-lay-user-agent-mode.md`.
AC-LUM-16 — No regression: full test suite remains within the known baseline (currently 2456+ pass / 1 known flake / 1 skip).
