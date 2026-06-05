---
status: proposed
created_at: 2026-06-05
owner: codex
skill: prompt-sharpener
---

# Prompt Sharpener Adoption Plan

## Purpose

Improve AIOSON agents, skills, and instruction-heavy artifacts by increasing reasoning leverage, not by making prompts small for its own sake.

The target style is: strong operating posture, evidence before questions, clear gates, explicit ownership, and preserved workflow contracts.

## Adoption Rule

Do not rewrite all prompts at once.

For each agent:

1. Diagnose behavior problems.
2. Rewrite only the highest-impact sections.
3. Preserve language, workflow, output, security, runtime, and schema contracts.
4. Run prompt/contract tests.
5. Compare generated output before expanding to the next agent.

## Priority Map

| Priority | Agent or area | Why it benefits | Risk | Recommendation |
|----------|---------------|-----------------|------|----------------|
| P0 | `@scope-check` | New agent; exactly about challenging drift and evidence | Low | Done as first pilot; continue testing with real workflows |
| P1 | `@analyst` | Early requirements drift compounds into every downstream phase | Medium | Sharpen evidence rules, ambiguity handling, and handoff to scope-check |
| P1 | `@sheldon` | Enrichment quality determines whether ideas stay aligned | Medium | Convert broad critique into decision pressure and source hierarchy |
| P1 | `@product` | PRD is the highest-authority artifact for product intent | Medium | Tighten question cadence, out-of-scope capture, and acceptance criteria |
| P2 | `@qa` | Owns final sign-off and routing to tester/pentester/dev | Medium | Sharpen fail/pass gates and optional scope-check trigger |
| P2 | `@dev` | Long prompt, high behavioral risk, many contracts | High | Improve in slices only; do not rewrite whole file initially |
| P2 | `@tester` | Very long prompt; benefits from clearer phase gates | High | Extract repeated methodology to docs before rewriting core |
| P2 | `@pentester` | Security ownership must stay exact | High | Only sharpen activation modes, evidence policy, and handoff wording |
| P3 | `@neo` | Routing agent; can reduce noisy guidance | Medium | Sharpen "what to do next" decision tree |
| P3 | `@orchestrator` | Coordination output can drift into generic planning | Medium | Tighten delegation contracts and stop conditions |
| P4 | Design skills | Many are verbose but useful as references | Medium | Reduce only after visual regression expectations are clear |
| P4 | Marketing/copywriter/genome | Large creative prompts; quality is harder to measure | High | Delay until evaluation examples exist |

## First Three Pilots

1. `@scope-check`
   - Goal: prove mode-based alignment checks work before and after dev.
   - Success: generated prompt includes mode, output contract, and drift verdicts.

2. `@analyst`
   - Goal: reduce requirements drift by making ambiguity and source hierarchy explicit.
   - Success: requirements output names uncertain assumptions and routes scope concerns to `@scope-check`.

3. `@sheldon`
   - Goal: make enrichment confront the PRD without over-expanding scope.
   - Success: enrichment distinguishes correction, optional enhancement, and rework request.

## Test Strategy

- Run `npm run lint`.
- Run focused workflow tests around `workflow-next`, `workflow-plan`, `workflow-execute`, and agent prompt generation.
- Add text-contract tests only for durable behavior, not wording aesthetics.
- For high-risk agents, generate before/after prompts with `aioson agent:prompt` and inspect whether the next action changes correctly.

## Non-Goals

- No mass rewrite.
- No shrinking prompts just to reduce line count.
- No removal of required lifecycle commands, output schemas, security ownership, or language boundary.
- No dramatic persona or threat language; pressure comes from evidence and gates.
