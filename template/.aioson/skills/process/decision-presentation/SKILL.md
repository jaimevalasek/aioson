---
name: decision-presentation
description: Profile-aware contract for necessary user decisions, localized language, and bounded question cadence
activation: Read profile from project.context.md; creator is the fallback for absent, empty, auto, or legacy beginner.
agents: [product, planner, briefing, refiner, setup]
task_types: [user-decision, approval]
triggers: [user decision, trade-off, approval choice, present options, decisao do usuario, apresentar opcoes]
---

# Skill: decision-presentation

Load before the first real user-facing decision. Do not load merely to produce an informational response.

## Profile contract

| profile | questions | jargon | extras |
|---|---|---|---|
| `creator` or absent/empty/`auto`/legacy `beginner` | one per turn | translate | recommended first option and pause option |
| `developer` | up to five independent decisions per batch | allowed | recommended first option with why and trade-off |
| `team` | same as developer | allowed | also write the executive summary at `agent:done`: `aioson feature:summary . --feature={slug} --write` (→ `.aioson/context/executive-summary-{slug}.md`, jargon translated per `interaction_language`); the owner records `aioson feature:acknowledge` |

## Core rules

### Rule 1 — Structured decisions in every profile

For a real choice, use the host's available structured question tool (`AskUserQuestion` or its equivalent) with 2–4 concrete options in every profile. If unavailable, present numbered options and the recommendation in text, subject to host constraints. Allow the user's own answer through the client-provided Other/free-text path. Never invent alternatives for a missing fact; ask for an irreducible fact only when evidence cannot supply it.

### Rule 2 — Recommend first

In every profile, the first option has a localized recommendation marker such as `(Recommended)` and a one-sentence explanation of why and the operational trade-off. Developer/team profiles change vocabulary and cadence, never remove the recommendation.

### Rule 3 — One question per turn

In creator mode, present at most one decision per turn; stage independent decisions across turns. A stricter agent cadence wins: Product always presents one decision at a time, including developer/team profiles.

### Rule 4 — Translate framework jargon

Immediately before emitting a framework term in creator mode, load exactly one matching `references/jargon-map.{interaction_language}.yaml`; support `en` and `pt-BR`, fallback to `en`. Replace case-sensitive whole terms only, never substrings. Developer/team may keep jargon; team executive summaries use translations.

### Rule 5 — Pause remains available

In creator mode, include a localized, non-default pause option explaining that work can resume from recorded state.

### Rule 6 — Five or more alternatives

Present the three strongest options plus the client-provided Other path. If Other is selected, interpret the answer against the known alternatives without forcing a false match.

### Rule 7 — No question without a blocked decision

Never ask because an agent activated. A question is justified only by a real fork that prevents safe progress. With no stated task or required continuation, provide a brief evidence-based status/recommendation and stop.

## Output contract

Every profile gets concrete options and a recommended first option with why and trade-off. A creator-mode decision contains one structured question, 2–4 mutually exclusive options, localized pause, translated jargon, and no second open question. Developer/team mode may batch at most five independent decisions when the agent permits it; Product always asks one at a time. A missing structured tool never removes options or the recommendation when the host permits a text fallback.

## Loading

1. Read the effective profile.
2. Continue without a question when reasonable evidence supports a safe default.
3. If a blocking decision remains, apply Rules 1–7.
4. Load one jargon map only when a framework term will be shown.

Load `references/compatibility-and-doctor.md` only when diagnosing compliance, migration, task-profile override, or historical V1 behavior.
