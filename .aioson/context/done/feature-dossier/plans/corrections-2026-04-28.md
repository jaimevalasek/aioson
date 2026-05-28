---
phase: 1
created: 2026-04-28
status: done
closed: 2026-04-28
---

# Corrections Plan — Phase 1 — 2026-04-28

## Context
QA ran on 2026-04-28 and found 0 Critical, 1 High, 1 Medium.

## Mandatory corrections

### H-01 — Missing interactive prompt for dossier:init when PRD absent (AC-F1-04 / EC-1)
File: src/commands/dossier.js:72-84, src/dossier/store.js:172-251
Problem: When `prd-{slug}.md` is absent, `dossier:init` silently writes placeholder text with `created_by: dossier-init`. The PRD requires an interactive prompt (EC-1) and `created_by: dossier-init-prompt`.
Expected fix: Implement interactive stdin prompt in `runDossierInit` when PRD is missing. Read `Why` and `What` from user input, then pass to `store.init`. Update `store.init` to accept `createdByOverride` or auto-detect prompt mode.
Affected AC: AC-F1-04
Test written: tests/commands/dossier.test.js:121-134

## Optional corrections

### M-01 — Schema status enum inconsistent with requirements
File: src/dossier/schema.js:50
Problem: `ALLOWED_STATUSES` only accepts `['active', 'completed']`, but requirements §2.1 specifies `['active', 'paused', 'closed']`.
Expected fix: Align `ALLOWED_STATUSES` with requirements. Update tests if any assert on the old values.
Affected AC: BR-11 (schema versioning)

## Residual risks
- Fase 2/3 commands (dossier:add-finding, revision:open, etc.) not yet implemented — deferred to later phases.
- Interactive prompt implementation must handle non-TTY environments gracefully (CI, pipes).
