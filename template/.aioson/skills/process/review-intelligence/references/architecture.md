# Architecture review

Use for `architect` after a concrete feature slug and design artifact exist. This is a self-review before the existing design gate or handoff.

## Pass 1 — design integrity

Challenge every prepared lens:

- **boundary:** Are responsibilities, sources of truth, inputs, outputs, trust boundaries, and ownership separated cleanly?
- **failure:** What happens on invalid input, timeout, partial write, retry, duplicate delivery, stale data, crash, and unavailable dependency?
- **security:** Are authorization, containment, secrets, data exposure, abuse bounds, auditability, and destructive actions explicit?
- **evolution:** Can the design migrate, version, roll back, coexist, and be removed without trapping current users or data?
- **implementability:** Are interfaces, sequencing, invariants, operational signals, and test seams concrete enough to build?

Check the design against requirements, spec, applicable structural rules, existing patterns, and the actual code map. Record evidence for claimed reuse and constraints.

## Pass 2 — operate the finished system

Imagine deployment, normal load, empty state, degraded dependency, restart, concurrent work, schema change, rollback, incident response, and handover to a maintainer. Identify where the proposed source of truth diverges from runtime truth or where recovery depends on an unstated manual step.

## Escalation

Resolve implementation facts from code and authoritative docs. Use targeted research only for external technical uncertainty that could change the design. Ask the user only when product policy, cost/risk tolerance, or irreversible trade-offs belong to them; provide the recommended design and alternatives. Do not convert architecture review into unbounded redesign.
