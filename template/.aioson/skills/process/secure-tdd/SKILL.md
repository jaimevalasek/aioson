---
name: secure-tdd
description: Process skill for adversarial TDD in security-sensitive features. Load after aioson-spec-driven when classification and attack surface justify it.
activation: |
  You are now running the secure-tdd process. Confirm the feature classification and attack surface, load only the stack reference you need, write adversarial tests first, then implement production code.
---

# Skill: secure-tdd

> Process skill. Adversarial tests before production code.
> Load this file first. Then load only the stack reference you need.

## When to use

Load this skill only after the normal feature workflow is already active.

- **MEDIUM:** load when the feature has auth, ownership, money, uploads, external URLs, secrets/credentials, or sensitive storage boundaries.
- **SMALL:** optional reduced mode for the same surfaces.
- **MICRO:** do not auto-load.

This skill complements `aioson-spec-driven`. It never replaces it.

## Loading order

1. Load `.aioson/skills/process/aioson-spec-driven/SKILL.md` first when the feature is spec-driven.
2. Read the current `requirements-{slug}.md`, `spec-{slug}.md`, and `architecture.md`.
3. Load `secure-tdd/SKILL.md`.
4. Load only one stack reference:
   - `references/node-express.md`
   - `references/nextjs.md`
5. If your stack is not covered by a full v1 reference, read `references/planned-stacks.md` for the minimal fallback.

## Goal

Make `@dev` write the security-sensitive tests first, before implementation, for the attack paths most likely to regress:

- auth bypass
- IDOR / ownership breaks
- race conditions / double-submit
- server-side validation gaps
- upload validation gaps
- unsafe external URL handling
- auth enumeration / rate limiting gaps

## Core rule

Frontend is never the authority.
Validation, authorization, limits, and sensitive state rules must be enforced server-side.

## Adversarial loop

1. Confirm the sensitive surface from requirements or the Attack Surface Map.
2. Map the surface to the relevant controls:
   - `SEC-SBD-01` input limits
   - `SEC-SBD-02` upload validation
   - `SEC-SBD-03` ownership / IDOR / auth bypass
   - `SEC-SBD-04` race condition / atomicity
   - `SEC-SBD-06` external URL sanitization
   - `SEC-SBD-08` auth enumeration / rate limiting
3. Write the minimum failing adversarial tests first.
4. Implement only enough production code to make those tests pass.
5. Re-run the tests immediately.
6. Record in `spec-{slug}.md` which attack classes are now covered.

`SEC-SBD-05` remains primarily tool-first via `security:scan`. Mention it in implementation decisions when relevant, but do not turn this skill into a secrets-scanning checklist.

## Output contract

When this skill is active, `@dev` should produce:

- at least one adversarial test per relevant sensitive surface
- a short note in `spec-{slug}.md` listing the covered attack classes
- no new product rules beyond what requirements and architecture already define

## Reduced mode for SMALL

For SMALL features:

- choose only the highest-risk surfaces
- prefer 1-2 adversarial tests over a full matrix
- do not block implementation just to expand the suite

## Non-goals

- do not invoke `@pentester`
- do not emit runtime events
- do not create CLI commands
- do not auto-generate large prompt libraries
- do not duplicate the baseline rule prose

## References available

| File | Load when |
|---|---|
| `references/node-express.md` | Implementing Node / Express or service-style Node boundaries |
| `references/nextjs.md` | Implementing Next.js route handlers, server actions, or server-side validation |
| `references/planned-stacks.md` | The target stack is Laravel, Django, Rails, FastAPI, or another non-v1 stack |
