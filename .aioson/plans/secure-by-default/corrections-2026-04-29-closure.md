---
phase: 05-followup
created: 2026-04-29
status: resolved
---

# Corrections Plan — Feature Closure Follow-up — 2026-04-29

## Context
QA re-ran the `feature:close` regression fix on 2026-04-29. The malformed/stale `project-pulse.md` issue was already fixed; this follow-up tracked the remaining idempotency defect on repeated `feature:close --no-archive` runs.

## Optional corrections
### O-01 — Re-running `feature:close` duplicates identical Recent Activity lines
File: `src/commands/feature-close.js:32`
Problem: `updateProjectPulseFile()` reuses the last two `## Recent Activity` lines and always appends a new line, even when the same `feature:close` command is rerun idempotently. In practice, repeated `--no-archive` reruns produce duplicated closure entries in `project-pulse.md`.
Expected fix: dedupe the generated closure activity line before writing the pulse file, or replace the last identical closure entry instead of appending it again. Add regression coverage for a repeated PASS close on the same feature.
Affected AC: operability of `feature:close --no-archive` idempotent reruns

## Resolution
- `src/commands/feature-close.js` now filters out the exact closure activity line it is about to append before rebuilding `## Recent Activity`.
- Regression coverage added in `tests/feature-close.test.js` for repeated PASS reruns on the same feature with `--no-archive`.

## Verification
- `node --test tests/feature-close.test.js tests/pulse-update.test.js` → 21/21 passing
- `node bin/aioson.js feature:close . --feature=secure-by-default --verdict=PASS --residual="none" --no-archive`
- `.aioson/context/project-pulse.md` now keeps valid frontmatter, canonical body, and no longer duplicates identical closure lines on rerun
