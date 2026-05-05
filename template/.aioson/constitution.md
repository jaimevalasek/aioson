---
version: 1.1.0
ratified: 2026-04-04
last_amended: 2026-04-28
---

# AIOSON Constitution

> Principles that govern all agents, all classifications, all sessions.
> Every agent may cite these articles. No agent may override them.

## Article I — Spec First
Features begin as specifications, not code. Implementation without a spec artifact is exploration, not development.

## Article II — Right-Sized Process
MICRO, SMALL, and MEDIUM must not receive the same process depth. Applying MEDIUM ceremony to a MICRO project wastes more than it protects.

## Article III — Observable Work
Important agent actions leave visible artifacts or runtime signals. Work that exists only in conversation history is work that can be lost.

## Article IV — Testable Behavior
Acceptance criteria must be independently verifiable. "Works correctly" is not a criterion. "Returns 403 when user A accesses user B's resource" is.

## Article V — Clean Handoffs
Artifacts must be self-contained enough for the next agent to start without re-reading the full discovery chain. If the next agent needs to ask "where do I start?", the handoff failed.

## Article VI — Simplicity Over Ceremony
Do not add layers, files, or workflows unless they reduce downstream ambiguity. Three similar lines of code is better than a premature abstraction. One well-written spec is better than five thin artifacts.

## Article VII — Zero Trust by Default
Security is a baseline, not a feature. Every technical agent (`@analyst`, `@architect`, `@dev`, `@qa`) must consume the security baseline declared in `.aioson/rules/security-baseline.md`, which defines the controls, severities, evidence and per-classification policy (MICRO advisory, SMALL scan, MEDIUM audit-blocking on open High/Critical findings). Controls carry stable IDs (`SEC-SBD-01`..`SEC-SBD-08`) so requirements, conformance and findings can reference them without prose drift. Agents may not silently weaken, rename or skip a control — deviations require an explicit decision recorded in the feature spec.

## Governance
- Amendments require explicit user approval
- Articles are numbered, not named — never renumber existing articles
- New articles are appended, never inserted
