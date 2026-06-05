---
name: prompt-sharpener
description: Rewrite or review agent prompts, skills, PRDs, plans, handoffs, and other instruction-heavy markdown so they produce stronger reasoning with less dead context. Use when Codex is asked to improve AIOSON agents or skills, make prompts more intelligent, reduce prompt bloat without losing contracts, create sharper instructions, or turn vague guidance into evidence-driven decision behavior.
---

# Prompt Sharpener

Make the instruction create behavior, not just describe work.

The goal is not brevity. The goal is leverage: fewer passive lists, more operational pressure, clearer evidence rules, and sharper stopping conditions.

## Core Move

Turn this:

> "Review the plan and identify issues."

Into this:

> "Hold the plan against the user's stated intent until every mismatch is approved, patched, or routed back to the owner. If the answer is in the code, inspect the code instead of asking."

## Workflow

1. Identify the job the prompt must force.
2. Preserve non-negotiable contracts: language boundary, workflow routing, file outputs, security limits, telemetry, schemas, and ownership.
3. Delete or move boilerplate that does not change behavior.
4. Replace passive instructions with pressure rules:
   - "Do not advance while..."
   - "If X is knowable from artifacts, inspect them."
   - "Ask one question only when no artifact can answer it."
   - "Route to the owner when the fix changes product intent."
   - "Create ceremony only when the decision is costly, surprising, and trade-off based."
5. Add a small output contract only where downstream agents or tooling depend on it.
6. Read the rewritten prompt as an agent would: what will it do differently under pressure?

## Sharpness Tests

Use these questions before accepting a rewrite:

- What behavior does this sentence force?
- What evidence must the agent inspect before speaking?
- What must stop the agent from continuing?
- Who owns the correction when the artifact is wrong?
- Which parts are contract, and which parts are noise?
- Could this instruction make the model overconfident or invent details?
- Does the output format serve a downstream consumer, or is it decorative?

## Rewrite Patterns

### Make posture explicit

Define the agent's stance in one hard sentence.

Examples:

- "Challenge the plan until every dependency is resolved or named."
- "Never approve drift just because the code works."
- "Treat the PRD as product authority; treat the diff as delivery evidence."

### Prefer decision gates over checklists

Checklists are useful only when missing one item is risky. Otherwise, compress them into a gate:

- "Compare only contract-bearing pieces: must-haves, exclusions, permissions, states, acceptance criteria, side effects."

### Force evidence before questions

Use:

- "If the answer is in artifacts, inspect artifacts instead of asking."
- "Ask one question only after naming the contradiction and your recommended answer."

Avoid:

- broad discovery questions;
- asking the user to repeat information already in files;
- speculative file paths or claims.

### Route ownership clearly

Every unresolved problem needs an owner:

- product intent wrong -> `@product` or `@sheldon`
- requirements drift -> `@analyst`
- technical path unclear -> `@architect` or `@discovery-design-doc`
- implementation drift -> `@dev`
- verification uncertain -> `@qa` or `@tester`
- security finding -> `@pentester` detects, `@dev` fixes, `@qa` accepts

### Keep useful pressure, remove theater

Do not add threats, hype, or dramatic persona. Create pressure with evidence, gates, and refusal to advance on contradictions.

## Output

When rewriting an AIOSON prompt or skill, produce:

```markdown
## Diagnosis
- {highest-impact issue}

## Rewrite
{revised prompt section or full file}

## Contracts Preserved
- {language/workflow/output/security/runtime contracts kept}

## Risks
- {what the rewrite could weaken or needs testing}
```

For direct file edits, update the file and summarize the same four points briefly.

## Reference

For a deeper review rubric, read `references/prompt-diagnostics.md` only when auditing multiple prompts or planning a broad refactor.
