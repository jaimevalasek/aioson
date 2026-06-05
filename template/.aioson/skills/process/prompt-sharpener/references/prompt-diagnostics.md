# Prompt Diagnostics

Use this when auditing many agent or skill prompts.

## Agent Prompt Audit

Score each prompt on five dimensions:

| Dimension | Good signal | Bad signal |
|-----------|-------------|------------|
| Posture | one clear operating stance | generic role description |
| Evidence | tells agent what to inspect before asking | asks user for knowable facts |
| Gates | explicit stop/route conditions | "continue" despite contradictions |
| Ownership | problem routes to correct agent | agent tries to own everything |
| Contract | output/schema/security preserved | format decorative or missing |

## High-Value Candidates

Prioritize prompts that:

- are used early in workflow (`product`, `analyst`, `sheldon`, `scope-check`);
- decide routing (`neo`, `orchestrator`, `qa`);
- touch high-risk behavior (`dev`, `pentester`, `tester`);
- exceed their file-size target;
- repeat shared boilerplate already available in rules/docs/skills.

## Rewrite Boundaries

Safe to improve:

- mission, posture, review loop, handoff language, decision gates;
- duplicated boilerplate that can move to shared docs/skills;
- vague instructions that can become evidence rules.

Do not change casually:

- artifact filenames and frontmatter contracts;
- lifecycle commands and runtime events;
- security ownership;
- language boundary;
- project classification routing;
- required output schemas used by tests or CLI.

## Pilot Plan

1. Rewrite one narrow agent.
2. Run contract tests and a realistic prompt generation test.
3. Compare output quality against the old prompt.
4. Only then expand to adjacent agents.

Broad prompt rewrites without pilots are risky because they can pass lint while weakening workflow behavior.
