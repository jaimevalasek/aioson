# SDLC Genius — Integration Boundary

> Created: 2026-04-02
> Status: pre-pilot — defines what the app is allowed and not allowed to influence

---

## Boundary Rule

**AIOSON artifacts drive work. SDLC Genius may react to GitHub changes. SDLC Genius does not mutate AIOSON source-of-truth artifacts directly.**

---

## What SDLC Genius Must NOT Own

These artifacts are AIOSON's exclusive responsibility:

| Artifact | Owner | Reason |
|----------|-------|--------|
| `prd-{slug}.md` | @product | Product decisions require human + agent deliberation |
| `requirements-{slug}.md` | @product | Business rules require structured discovery |
| `spec-{slug}.md` | @product / @dev | Feature memory and phase gates are AIOSON's execution state |
| `architecture.md` | @planner | Architecture decisions require full project context |
| `design-doc*.md` | @planner | Scope decisions are AIOSON artifacts |
| `implementation-plan*.md` | @dev / @orchestrator | Execution sequencing belongs to AIOSON |
| `.aioson/constitution.md` | User | Never externally modified |
| `.aioson/rules/` | User / @dev | Project conventions are internal |

SDLC Genius must never write to these files, even indirectly.

---

## What SDLC Genius May Own Well

These are appropriate surfaces for a GitHub execution assistant:

| Surface | Notes |
|---------|-------|
| PR review comments | Secondary signal — complements @qa, does not replace it |
| Test generation suggestions | Must be reviewed by developer before accepting |
| Documentation nudges | Flags stale docs, does not rewrite them |
| GitHub workflow insights | Metrics and visibility in GitHub context |
| Code quality signals | Language-level feedback that AIOSON agents do not produce |

---

## How to Interpret SDLC Genius Output

When SDLC Genius comments on a PR:

1. **Check if the comment is already covered by AIOSON artifacts** — if `requirements-{slug}.md` or `spec-{slug}.md` already addresses the point, SDLC Genius is confirming what AIOSON decided
2. **If the comment contradicts a spec decision** — do not change the code; flag the contradiction to the user for a spec update
3. **If the comment is about language-level quality** (naming, type safety, unused imports) — act directly without spec update
4. **If the comment suggests a new requirement** — this is a spec change; route to @product, not directly to @dev

---

## Conflict Resolution

When SDLC Genius output conflicts with AIOSON artifacts:

**AIOSON artifact wins.** Always.

The spec is the single source of truth. SDLC Genius is a secondary signal.

If a conflict repeats across multiple PRs, this is a signal that the spec may need updating — not that SDLC Genius is right.

---

## What Happens When the Pilot Ends

After the pilot evaluation (Plan 70 Phase 5):

- **Outcome A (adopt):** this boundary document becomes a standing operating note, promoted to `template/.aioson/docs/sdlc-genius-operating-mode.md`
- **Outcome B (limited use):** this document is updated to reflect the narrower scope approved
- **Outcome C (reject):** this document is archived; SDLC Genius is uninstalled
