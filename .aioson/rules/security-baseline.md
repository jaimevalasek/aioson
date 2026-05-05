---
name: security-baseline
description: Secure by Default baseline controls for technical agents
priority: 10
version: 1.0.0
agents: [analyst, architect, dev, qa]
---

# Security Baseline — Secure by Default

> Implements `Article VII — Zero Trust by Default` of the AIOSON constitution.
> Loaded by `@analyst`, `@architect`, `@dev`, and `@qa`. Other agents must not
> load this rule — product, copy, design and orchestration scopes are out of band.

This rule defines the minimum security baseline every technical agent must
respect. It does **not** promise absolute security. It declares concrete
controls, expected evidence and how each project classification consumes them.
Deviations are allowed only when recorded as an explicit decision in the
feature `spec-{slug}.md` with N/A rationale.

## Classification policy

| Classification | Behavior |
|---|---|
| **MICRO** | **Advisory.** Controls are surfaced as recommendations. No automated blocking. `@qa` may still flag obviously dangerous patterns. |
| **SMALL** | **Scan-oriented.** Static checks and tool-first scans run automatically. `@pentester` is **not** mandatory. Open Medium+ findings are reported but do not block by default. |
| **MEDIUM** | **Audit-blocking.** Surface assessment runs against attack-surface map. **Open High or Critical findings block Gate D** until resolved or explicitly waived with rationale recorded in `spec-{slug}.md`. |

`@pentester` (`app_target` mode) may be invoked by `@qa` for any feature with
auth, money, ownership, file uploads, external URLs or suspicious audit
findings — regardless of classification. It is never required by classification
alone.

## Severity scale

| Severity | Examples |
|---|---|
| `critical` | Ownership bypass, financial race condition, committed production secret. |
| `high` | Missing server-side validation, unsafe upload signature handling, missing rate limit on sensitive endpoint. |
| `medium` | Unsanitized external URL, low-impact tracker, storage boundary abuse surface. |
| `advisory` | MICRO recommendations or surfaces marked N/A with explicit rationale. |

## Direct LLM mode (no CLI)

When the `aioson` CLI is unavailable, agents must fall back to **checklist-only
verification** of the controls below, record the limitation in the session
devlog, and **must not** fabricate runtime telemetry events. Findings still
land in `.aioson/context/security-findings-{slug}.json` (one of the few
machine-readable exceptions allowed under `.aioson/context/`).

## Controls

### SEC-SBD-01 — Server-side input limits

- Maps to: OWASP A03 / A04
- Default severity: `high`
- Owner agent: `@dev` (implements), `@analyst` (declares limits), `@qa` (verifies)
- Applies to: analyst, dev, qa
- Classification policy: MICRO advisory; SMALL scan-oriented; MEDIUM audit-blocking when feature accepts user input
- Required evidence: explicit field-length / type / range limits enforced server-side, plus negative tests asserting rejection on overflow or wrong type. N/A rationale required when feature has no user input.

### SEC-SBD-02 — Upload file signature validation

- Maps to: OWASP A03 / A05
- Default severity: `high`
- Owner agent: `@dev` (implements), `@qa` (verifies)
- Applies to: analyst, dev, qa
- Classification policy: MICRO advisory; SMALL scan-oriented; MEDIUM audit-blocking when feature accepts uploads
- Required evidence: magic-byte / file-signature validation independent of MIME header and extension; rejection test for spoofed extension. N/A when no upload surface exists.

### SEC-SBD-03 — Ownership / IDOR authorization

- Maps to: OWASP A01
- Default severity: `critical`
- Owner agent: `@dev` (implements), `@analyst` (maps surfaces), `@qa` (verifies)
- Applies to: analyst, architect, dev, qa
- Classification policy: MICRO advisory; SMALL scan-oriented; MEDIUM audit-blocking on every endpoint that returns or mutates per-user data
- Required evidence: ownership check at the data layer (not only route), and a negative test where user A attempts to access user B's resource and receives 403/404. N/A only when resource is intentionally public.

### SEC-SBD-04 — Atomic critical state changes

- Maps to: OWASP A04
- Default severity: `critical`
- Owner agent: `@architect` (designs), `@dev` (implements), `@qa` (verifies)
- Applies to: architect, dev, qa
- Classification policy: MICRO advisory; SMALL scan-oriented; MEDIUM audit-blocking on money, inventory, quotas, ownership transfers, balance updates
- Required evidence: transactional boundary (DB transaction, row lock, or equivalent) plus a concurrency test or documented invariant proving no double-spend / lost update. N/A when feature has no shared mutable state.

### SEC-SBD-05 — Secrets outside code

- Maps to: OWASP A02 / A05
- Default severity: `critical` (committed) / `high` (config drift)
- Owner agent: `@dev` (implements), `@qa` (verifies)
- Applies to: analyst, architect, dev, qa
- Classification policy: MICRO advisory; SMALL scan-oriented; MEDIUM audit-blocking on any commit
- Required evidence: secrets loaded from environment / vault / managed config; `.env` and equivalents in `.gitignore`; secret-scan pass on diff. Brownfield exception: pre-existing secret must be rotated and tracked, never silently kept.

### SEC-SBD-06 — External URL sanitization

- Maps to: OWASP A03 / A10
- Default severity: `medium` (raises to `high` when URL is followed server-side)
- Owner agent: `@dev` (implements), `@qa` (verifies)
- Applies to: analyst, dev, qa
- Classification policy: MICRO advisory; SMALL scan-oriented; MEDIUM audit-blocking when feature accepts or follows external URLs
- Required evidence: scheme allowlist, host validation, SSRF protection (private-range block) when followed server-side, escaping when rendered. N/A when no external URL is accepted.

### SEC-SBD-07 — Storage default-deny / RLS boundary

- Maps to: OWASP A01 / A05
- Default severity: `critical`
- Owner agent: `@architect` (designs), `@dev` (implements), `@qa` (verifies)
- Applies to: architect, dev, qa
- Classification policy: MICRO advisory; SMALL scan-oriented; MEDIUM audit-blocking on every multi-tenant or per-user store
- Required evidence: storage layer denies by default (RLS policies enabled, bucket private, queue ACL closed) plus a negative test from an unauthorized identity. N/A when storage is single-tenant and intentionally public.

### SEC-SBD-08 — Auth enumeration / rate limiting

- Maps to: OWASP A07
- Default severity: `high`
- Owner agent: `@dev` (implements), `@qa` (verifies)
- Applies to: analyst, dev, qa
- Classification policy: MICRO advisory; SMALL scan-oriented; MEDIUM audit-blocking on login, password reset, signup, OTP and any auth-adjacent endpoint
- Required evidence: per-endpoint rate limit (per IP and per identifier), uniform error response for "user not found" vs "wrong password", lockout or backoff after N failures, and a negative test asserting enumeration is not possible. N/A when feature has no auth surface.

## Out of scope (v1)

The following are explicitly **not** part of this baseline and require a future
PRD before adoption: deceptive endpoints (honeypots), jump-scare responses,
adversarial CAPTCHAs, and any technique whose primary purpose is to deceive
attackers. The baseline is preventive, not deceptive.

## Maintenance

- Control IDs are stable. Adding a control means appending `SEC-SBD-09`, never
  renumbering or repurposing an existing ID.
- Severity defaults can be raised per-feature in `spec-{slug}.md` with rationale; they cannot be silently lowered.
- Changes to this rule require an explicit decision recorded in the relevant
  feature spec and a `last_amended`-style note in the constitution if they
  alter Article VII semantics.
