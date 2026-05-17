---
name: decision-presentation
description: Process skill for profile-aware user-facing decisions. Translates framework jargon, enforces (Recomendado) marker on AskUserQuestion, and caps cadence at 1 question/turn when profile=creator. Load before the first user-facing question regardless of profile.
activation: |
  You are now running the decision-presentation process. Read `profile` from `.aioson/context/project.context.md`. If `profile=creator` (or absent/auto), enforce strict mode: 1 question per turn via AskUserQuestion with explicit (Recomendado) marker on the first option, plain-language `why`, and "Pausar / quero pensar" always available. If `profile=developer`, allow standard cadence (up to 5 numbered questions per batch, jargon permitted). If `profile=team`, behave as developer + emit `summary-{slug}-executive.md` at agent:done.
---

# Skill: decision-presentation

> Process skill. Profile-aware UX layer for user-facing decisions.
> Load this file first. Then lazy-load `references/jargon-map.{en,pt-BR}.yaml` only when about to emit a framework term.

## When to use

Load this skill before the first user-facing decision in any agent that interacts directly with the user. Mandatory in V1 for: `@neo`, `@setup`, `@product`, `@dev`, `@deyvin`.

Activation mode is decided by `profile` in `project.context.md`:

| profile | cadence | jargon | recommendation marker |
|---------|---------|--------|----------------------|
| `creator` (default) | 1 question per turn | translated via dictionary | mandatory `(Recomendado)` |
| `developer` | up to 5 per batch | permitted | optional |
| `team` | up to 5 per batch | permitted | optional + executive summary at agent:done |

When `profile` is absent, empty, or `auto`, treat as `creator` (safer default).

## Core rules

### Rule 1 — AskUserQuestion is mandatory for decisions

When `profile=creator`, never emit free-form open questions to the user. Always use `AskUserQuestion` with 2-4 options. Free-form input is only allowed inside an "Other / Conte com suas palavras" option of an otherwise-structured question.

### Rule 2 — Recommendation marker on first option

When `profile=creator`, the first option in every `AskUserQuestion` carries `(Recomendado)` in its label AND a one-sentence `description` explaining the recommendation in plain language. Trade-offs are expressed operationally: "se escolher X, demora mais mas evita Y".

### Rule 3 — One question per turn (creator mode)

When `profile=creator`, each agent turn emits at most 1 `AskUserQuestion`. Multiple decisions are staged across turns. Reflection of understanding precedes each new decision.

### Rule 4 — Jargon translation via dictionary

Before emitting any framework term, lazy-load the jargon-map for `interaction_language` (en or pt-BR; fallback to en). Look up the canonical term and substitute the `translation`. If a term is not in the dictionary, emit it verbatim (no transformation) and consider it a candidate for V2 dictionary coverage.

When `profile=developer`, jargon is permitted unaltered. When `profile=team`, jargon is permitted in the operator-facing flow but the executive summary uses translations.

### Rule 5 — Pause option always available

Every `AskUserQuestion` in creator mode includes an option labeled "Pausar / quero pensar" (or its `en` equivalent "Pause / let me think") with `description: "Você pode parar agora e retomar mais tarde. O agente registra o estado e continua na próxima sessão."`

### Rule 6 — Five-or-more alternatives escape hatch

`AskUserQuestion` accepts 2-4 options (harness limit). When a decision has 5+ valid alternatives:

1. Surface the 3 strongest alternatives via `AskUserQuestion` with `(Recomendado)` on the first.
2. Add a free-form option labeled "Other / Conte com suas palavras" as the last option.
3. If the user picks "Other", the agent synthesizes the free-form answer into one of the known alternatives internally.

## Loading order

1. Agent kernel preflight loads this `SKILL.md`.
2. Agent reads `profile` from `project.context.md`.
3. When about to emit a framework term, agent lazy-loads `references/jargon-map.{lang}.yaml` (only the file matching `interaction_language` or `conversation_language`).
4. Translation lookup is case-sensitive with word-boundary matching (regex `\b{term}\b`). Substring matches like "MICRO" inside "MICROserviços" do NOT match.

## API surface (V1 — prompt-level only)

V1 exposes no executable functions. The skill is pure prompt-level guidance — the agent reads these rules and adapts behavior. V2 may add imperative helpers (`present_decision(question, options, recommended_index, plain_language_why)`, `translate(term, target_lang, profile)`) if doctor check repeatedly catches violations.

Optional API hook reserved for task-mode override: `force_profile` — an explicit profile override that bypasses the project.context.md value for a single decision. V1 reads this from a per-call argument; V2 may activate task-mode (skill activates per task, not per identity).

## Output contract

When this skill is active, every user-facing decision produces:

- one `AskUserQuestion` (creator mode) or up to 5 batched numbered questions (developer/team mode)
- a `(Recomendado)` marker on the first option (creator mode; optional for developer/team)
- jargon translated via dictionary (creator mode) or verbatim (developer/team mode)
- a "Pausar / quero pensar" option (creator mode)
- no free-form open questions outside the escape hatch

## Doctor check integration

The doctor check `jargon_leak_detection` (defined in this same feature) verifies adherence in CI:

- scope filter: only events from `[neo, setup, product, dev, deyvin]`
- profile filter: only runs when active project has `profile=creator`
- success threshold: `count=0` jargon leaks in a feature MICRO completa run with `profile=creator`

Skill failure does not break `report.ok` — severity is `warning` (advisory).

## Default profile semantics

| project.context.md value | effective profile |
|--------------------------|-------------------|
| `profile: creator` | creator |
| `profile: developer` | developer |
| `profile: team` | team |
| `profile: auto` | creator (safer default) |
| `profile:` (empty) | creator |
| missing `profile` field | creator |
| legacy `profile: beginner` | creator (migrated by installer) |

## Migration note (beginner → creator)

Legacy projects with `profile: beginner` are migrated by `aioson update`:

1. Installer detects `profile: beginner` in `project.context.md` frontmatter.
2. Rewrites to `profile: creator`.
3. Emits `runtime:emit --type=migration --level=info` with message: "Profile `beginner` renamed to `creator` to better describe the user. Behavior unchanged. Edit `.aioson/context/project.context.md` to switch to `developer` if desired."
4. Migration is idempotent — running twice does not double-emit nor reverse.

## What this skill does NOT do

- Does not intercept agent output at runtime (no in-loop guard). Violations are caught after-fact by `jargon_leak_detection`.
- Does not auto-detect profile via behavioral heuristics (V2).
- Does not capture full agent transcripts (V2; V1 sees summaries via `agent_events`).
- Does not activate task-mode override (V1 reserves the API; V2 implements).
- Does not load for `@analyst`, `@architect`, `@qa`, `@discovery-design-doc`, `@briefing`, `@committer` (V2 follow-up after V1 validates).
