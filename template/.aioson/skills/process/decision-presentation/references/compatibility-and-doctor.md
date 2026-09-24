---
description: Compatibility, migration, and doctor-check details for decision-presentation
agents: [neo, setup, product, dev, pentester]
task_types: [decision-compliance, profile-migration, jargon-diagnostics]
triggers: [jargon leak, beginner migration, force_profile, decision doctor]
---

# Decision Presentation Compatibility and Doctor

This reference is diagnostic context, not part of the ordinary decision hot path.

## Prompt-level surface

The current skill is prompt guidance and does not intercept output at runtime. `force_profile` is a reserved per-decision override; imperative helpers and behavioral profile detection are not active contracts.

## Jargon doctor

`jargon_leak_detection` checks creator-profile events from Neo, Setup, Product, Dev, and Pentester against the selected jargon map. Success is zero leaks. A failure is advisory (`warning`) and does not make the whole doctor report fail.

Developer and team profiles are outside this check. Missing maps should be reported as unavailable coverage, not as a user-output failure.

## Legacy profile migration

During update, legacy `profile: beginner` becomes `profile: creator`:

1. Rewrite the frontmatter value once.
2. Emit one informational migration event explaining the rename and how to choose `developer`.
3. Keep repeated updates idempotent.

Effective defaults remain:

- creator: `creator`, `auto`, empty, absent, legacy `beginner`
- developer: `developer`
- team: `team`

## Historical rollout boundary

The original rollout explicitly named Neo, Setup, Product, Dev, and Pentester. Other interactive agents may adopt the skill when their kernel requires it; the doctor scope stays unchanged until its executable contract and tests are deliberately expanded.
