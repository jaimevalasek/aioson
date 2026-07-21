---
slug: secret-guard-p0
status: done
owner: dev
created_at: 2026-07-21
updated_at: 2026-07-21
classification: MICRO
risk: medium
source: direct-user-request
---

# Simple Plan - P0 security hardening: secret detector FN + operator-memory slug traversal

## Scope
Fix the 4 P0 findings from the adversarial review of v1.37.2→v1.39.0:
(1) modern OpenAI (`sk-proj-`) / Anthropic (`sk-ant-`) keys invisible to the detector;
(2) single-line PEM with `\n` escapes (.env format) not detected as private key;
(3) generic secret assignment misses quoted keys (JSON/Python dict) and unquoted shell/.env values;
(4) path traversal via slug in `op:reinforce`/`op:forget` (arbitrary .md read/delete).

## Context selected
- context:brief: rules/security-baseline.md (OWASP A03/A04, @dev implements), disk-first-artifacts, output-brevity; no gaps.
- Existing pattern to follow: `validateTargetSlug` (src/learning-loop-archive.js:58) — fail-closed slug whitelist; `deriveSlug` alphabet (src/operator-memory/slug.js) defines the canonical slug shape; FP-reduction heuristics from commit 84ec5a7d (staged-secret-detector.js) must be preserved.
- Brain: dev-001 (argv arrays over shell interpolation) — not directly applicable, no shell here.

## Implementation intelligence
- Framework leverage: none needed — Node stdlib regex/path only; reuse existing `collectMatches` hook of CONTENT_RULES and existing fixture-evidence suppression pipeline.
- Structure and data boundary: detector rules stay in `staged-secret-detector.js` (single security boundary); slug validation goes in `slug.js` (canonical alphabet) enforced at the fs boundary (`decisionPath`/`historyPath`/`proposalPath`) — fail-closed, protects all current and future callers; `cli.js` top-level catch converts the throw into clean exitCode 1.
- Reuse over custom code: keep rule id `openai_secret` (contentAllowRules reference ids); reuse PLACEHOLDER/synthetic-value guards for the new bare-value path instead of new heuristics.

## Done criteria
- `sk-proj-<body>` and `sk-ant-api03-<body>` produce `openai_secret` errors; lowercase kebab lookalikes without upper/digit do not.
- A flattened single-line PEM assignment (BEGIN block with escaped `\n` line breaks and >=64 base64 payload chars, .env style) produces `private_key_block`; marker-only references stay clean.
- JSON/dict quoted keys and bare shell-style exports with credential-shaped literals (12+ mixed letter/digit chars) produce `generic_secret_assignment` warnings; function calls, env lookups, comparisons and placeholder values stay clean (84ec5a7d FP tests unchanged and green).
- `decisionPath`/`historyPath`/`proposalPath` throw on invalid slugs; `op:forget ../../x` does not delete files outside storage root.
- Full `npm test` green.

## Useful options considered
- Include now: 4 fixes above + regression tests (detector cases in tests/git-guard.test.js; new tests/operator-memory-slug-validation.test.js).
- Defer: extra provider rules (glpat-, ASIA, xapp-, rk_live_, JWT, connection strings), entropy-based detection, sentinel per-rule + audit output, git-guard policy-from-HEAD (#3), local config contentAllowPaths tightening — listed in the review for P1/P2.
- Escalate: changing guard policy source (staged vs HEAD) is a security-model decision → @pentester/@product; PLACEHOLDER_FRAGMENT redesign touches FP/FN ownership → @qa.

## Out of scope
- P1/P2 findings (dispatcher lease, telemetry retry crash, feature-completeness parser, review-intelligence GC, etc.).
- Any change to suppression/fixture semantics beyond preserving current behavior.

## Expected files
- src/lib/security/staged-secret-detector.js (behavior)
- src/operator-memory/slug.js (behavior)
- src/operator-memory/decision.js (behavior)
- src/operator-memory/proposal.js (behavior)
- tests/git-guard.test.js (support)
- tests/operator-memory-slug-validation.test.js (support)

## Verification
- `node --test tests/git-guard.test.js tests/operator-memory-slug-validation.test.js` → 46/46 pass (2026-07-21)
- `npm test` → 3883 pass / 0 fail / 1 skipped (baseline 3867+1sk; +16 new tests) (2026-07-21)
- `npm run lint` → clean
- PoC matrix (27 cases incl. FP guards) → 27/27 before permanent tests

## Session state
Next step: none — plan done. Deferred items (provider rules, entropy, policy-from-HEAD) wait for user approval as P1/P2.

## Notes
- Bare-value pattern restricted by charset (no dots/parens/quotes/`$`) + requires >=12 chars, >=1 letter, >=1 digit — kills function-call/env-lookup/comparison FPs while catching shell/.env literals.
- Slug alphabet mirrors deriveSlug output: `^[a-z0-9][a-z0-9-]{0,80}$` (80 covers 40-char base + collision suffixes).
- PEM line-break regex `\\r?\\?n` covers all three flattened forms: `\n` (.env), `\r\n` (escaped CRLF), `\\n` (JS/JSON double backslash) — first PoC round regressed the double-backslash case and was caught by the PoC matrix before tests.
- Rule id `openai_secret` kept (contentAllowRules reference ids); reason updated to OpenAI/Anthropic-style.
- Slug validation enforced at the fs boundary (decisionPath/historyPath/proposalPath) — commands unchanged; cli.js top-level catch converts the throw into clean exitCode 1.
