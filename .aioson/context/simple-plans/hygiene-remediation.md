---
slug: hygiene-remediation
status: done
owner: dev
created_at: 2026-07-16
updated_at: 2026-07-16
classification: MICRO
risk: medium
source: direct-user-request
---

# Simple Plan — Hygiene Remediation

## Scope

Resolve the current operational hygiene findings without opening a product feature: archive registered completed features, retain unowned historical evidence explicitly, close verified Neural Chain impact audits, and align the commit-guard documentation.

## Context selected

- `hygiene:scan` reports seven pending Neural Chain noise files, two registered done features pending archive, seven unowned review artifacts, and two unowned test artifacts.
- `feature:archive` is the canonical reversible archival mechanism for registered done features.
- Context boundary requires a Markdown project artifact for retention decisions; public behavior belongs in `docs/` after implementation.

## Implementation intelligence

- Reuse `feature:archive` for `briefing-refiner` and `loop-guardrails`; do not move arbitrary root files with shell commands.
- Add a Markdown retention registry consumed by `hygiene:scan`, so historical project evidence remains searchable without recurring as an unresolved hygiene item.
- Resolve Neural Chain items only after current regression evidence confirms their related slices; use the existing lazy deletion lifecycle rather than a second cleanup mechanism.
- Document the indexed policy source and headless-only `agent-safe` boundary in the existing CLI/security references.

## Done criteria

- `hygiene:scan . --json` has no actionable findings for the current set and retained evidence remains on disk.
- Registered done features are present in `context/done/` and recorded in `done/MANIFEST.md`.
- The retention registry is covered by focused hygiene-scan tests and cannot hide an open blocking security finding.
- All existing pending Neural Chain noise files are resolved only after focused/full regression verification.
- Portuguese and English reference documentation state the current commit-guard security behavior.

## Useful options considered

- Include now: retention registry, registered feature archival, verified noise resolution, and documentation alignment.
- Defer: interactive `hygiene:apply`, automatic archival of arbitrary artifacts, or changes to feature-close policy.
- Escalate: any unowned artifact with open/blocking findings or unclear security ownership.

## Expected files

- `src/commands/hygiene-scan.js`
- `tests/hygiene-scan.test.js`
- `.aioson/context/hygiene-retention.md`
- `.aioson/context/noises/*.md`
- `.aioson/context/done/MANIFEST.md`
- `docs/pt/5-referencia/comandos-cli.md`
- `docs/pt/5-referencia/secure-by-default.md`
- `docs/en/5-reference/cli-reference.md`

## Verification

- `node --test tests/hygiene-scan.test.js tests/neural-chain-noise-file.test.js`
- `npm run lint`
- `npm test`
- `aioson hygiene:scan . --json`

## Completion

- Archived `briefing-refiner` and `loop-guardrails` with the canonical `feature:archive` command; `feature:sweep` is clean.
- Retained nine unowned historical review/test artifacts through `hygiene-retention.md`; no evidence was deleted.
- Verified and resolved 208 Neural Chain impact items across seven noise files; the native lifecycle removed all resolved files.
- Updated the PT/EN commit-guard references for indexed policy loading and headless-only `--agent-safe` execution.
- Focused hygiene/noise tests passed (23/23); lint passed; the final full suite passed (3,816 pass, 0 fail, 1 skip); `hygiene:scan` is clean. A final retention hardening test keeps open blocking findings actionable.
