---
slug: hygiene-scan-neo-orchestration
status: done
owner: dev
created_at: 2026-06-19
updated_at: 2026-06-19
classification: MICRO
risk: medium
source: direct-user-request
---

# Simple Plan - Hygiene Scan + Neo Orchestration

## Scope
Add a read-only operational hygiene scan that detects stale AIOSON artifacts, then teach `@neo` to orchestrate that diagnostic instead of embedding cleanup intelligence in its prompt.

## Context selected
- context:brief selected command/test paths, `@neo`, and governance rules for structure, file size, disk-first artifacts, source-code language, and security baseline.
- Existing pattern to follow: `feature:sweep`/`feature:archive` in `src/commands/feature-archive.js`, command registration in `src/cli.js`, tmpdir-based `node:test` command tests.
- Applicable rule/doc: simple-plan lane, implementation structure/data access, agent structural contract, file-size governance.

## Implementation intelligence
- Framework leverage: reuse Node built-ins and existing `contextDir`, `readFileSafe`, `runFeatureSweep`, and archive artifact matching semantics where practical.
- Structure and data boundary: keep scan logic in a command module with pure helpers; `@neo` only calls/surfaces the CLI output and asks the user what to do.
- Reuse over custom code: reuse `feature:sweep` result for done-feature archive detection and mirror `feature:archive` slug collision assumptions instead of inventing a second archive engine.

## Done criteria
- `aioson hygiene:scan . --json` returns stable buckets for pending Neural Chain noises, done features pending archive, stale dev-state, on-demand review artifacts, and orphan slug artifacts.
- The scan is read-only and returns suggested commands/actions, never moves files.
- `@neo` activation docs call `hygiene:scan` and explain that decisions stay human-approved.
- Tests cover archive-pending features, stale `dev-state.md`, pending Neural Chain noises, resolved security review artifacts, and orphan slug artifacts.

## Useful options considered
- Include now: read-only `hygiene:scan` plus `@neo` orchestration docs.
- Defer: `hygiene:apply`, interactive per-file archival, and archival of arbitrary non-slug files.
- Escalate: changing feature-close policy or auto-deleting artifacts without human approval.

## Out of scope
- No destructive cleanup.
- No automatic archive of on-demand security/QA artifacts.
- No product workflow change or new SDD feature lifecycle.

## Expected files
- `src/commands/hygiene-scan.js`
- `src/cli.js`
- `src/i18n/messages/en.js`
- `src/i18n/messages/pt-BR.js`
- `src/i18n/messages/es.js`
- `src/i18n/messages/fr.js`
- `tests/hygiene-scan.test.js`
- `template/.aioson/agents/neo.md`
- `.aioson/agents/neo.md`

## Verification
- PASS: `node --test tests/hygiene-scan.test.js` (8/8)
- PASS: `node scripts/check-js.js`
- PASS: `npm test` (3319 pass, 1 skipped)

## Session state
Next step: complete. `@neo` can now surface `hygiene:scan` results and ask for cleanup decisions.

## Notes
- 2026-06-19: User confirmed the model/command should hold the intelligence and `@neo` should only orchestrate and ask.
- 2026-06-19: Implemented read-only `hygiene:scan` with CLI JSON output, localized help, focused tests, `pending_chain_noises`, and `@neo` template/workspace orchestration docs.
