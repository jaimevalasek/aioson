---
name: secure-tdd
description: Process skill for focused adversarial TDD when the active PRD/plan or concrete evidence identifies a sensitive attack surface.
activation: |
  Run focused adversarial TDD for the concrete sensitive surface. Read the PRD and approved implementation plan, load only the matching stack reference, write the minimum failing security test, then implement and verify the production boundary.
---

# Skill: secure-tdd

Use only when authentication, authorization/ownership, money/value, uploads, external URLs, secrets, sensitive storage, or another concrete attack surface is in the PRD/plan or observed implementation. Classification alone never loads this skill.

## Inputs

1. Read the active `prd-{slug}.md` and `implementation-plan-{slug}.md`.
2. Read the selected project security rules and exact production boundary.
3. Load only one matching stack reference from this skill. If none matches, use the smallest stack-native equivalent.

## Adversarial loop

1. Name the exact sensitive surface and relevant `CAP-*`/`AC-*`.
2. Select the smallest applicable attack class: auth bypass, IDOR/ownership, race/double-submit, server validation, upload validation, unsafe external URL, enumeration/rate limit, or secret exposure.
3. Write the minimum failing stack-native test against the real server/state boundary.
4. Implement the narrow production control.
5. Rerun the focused test and the normal production-path smoke.
6. Add the covered attack class, paths, command, and result to the feature dossier in best effort.

Frontend checks are never the authority for validation, authorization, limits, or sensitive state changes.

## Output boundary

- Produce code and focused adversarial tests only.
- Do not create or require requirements, spec, architecture, readiness, validation, conformance, or harness documents.
- Do not broaden product rules beyond the PRD.
- Do not invoke Pentester automatically. Escalate only when a suspicious finding or risk needs independent adversarial review.

Depth follows the number and severity of actual sensitive surfaces, not MICRO/SMALL/MEDIUM.
