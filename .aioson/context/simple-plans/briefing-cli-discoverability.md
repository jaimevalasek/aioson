---
slug: briefing-cli-discoverability
status: done
owner: dev
created_at: 2026-07-15
updated_at: 2026-07-15
classification: MICRO
risk: low
source: direct-user-request
---

# Simple Plan - Briefing CLI Discoverability

## Scope

Make the existing `briefing:*` commands discoverable in the localized CLI help, prove the real CLI dispatcher with an end-to-end test, and synchronize the objectively stale `aioson_version` metadata in `C:/dev/aioson-com`.

## Context selected

- `context:brief` / `context:select`: `src/cli.js`, `src/i18n/messages/`, CLI tests, project context, output brevity, file-size governance, source-code language, and implementation structure rules.
- Existing pattern to follow: `printHelp()` delegates each visible command to a localized `cli.help_*` key; CLI integration tests spawn `bin/aioson.js` with `node:child_process`.
- Applicable rule/doc: `.aioson/rules/simple-plan-lane.md`, `.aioson/docs/dev/simple-plan-lane.md`, `.aioson/rules/source-code-language-convention.md`.

## Implementation intelligence

- Framework leverage: reuse Node.js `node:test`, temporary directories, and the existing CLI spawn pattern; no dependency or new command registry.
- Structure and data boundary: help registration stays in the existing CLI entrypoint, translations stay in locale dictionaries, and dispatcher verification lives in a focused CLI test.
- Reuse over custom code: use the existing briefing registry writer for the fixture and the public CLI binary for mutation verification.

## Done criteria

- `aioson help` lists `briefing:approve`, `briefing:unapprove`, `briefing:review`, and `briefing:apply-feedback` in all supported locales.
- A CLI-spawned `briefing:approve --slug=<draft>` changes the fixture registry to `approved` and sets `approved_at`.
- Existing briefing/refiner tests remain green.
- `C:/dev/aioson-com/.aioson/context/project.context.md` reports `aioson_version: "1.37.1"`, matching the installed CLI.

## Useful options considered

- Include now: four localized help entries, global help registration, help inventory assertions, real dispatcher test, objective version metadata correction.
- Defer: extract the 1,800-line CLI help/dispatch inventory into a generated command catalog.
- Escalate: redesign command registration or introduce command-specific help; both are architectural changes beyond this fix.

## Out of scope

- Running `aioson update` across `aioson-com` and applying its 468-file template refresh.
- Archiving unrelated completed features.
- Changing briefing approval semantics or automatically approving the user's real briefing.

## Expected files

- `src/cli.js`
- `src/i18n/messages/en.js`
- `src/i18n/messages/pt-BR.js`
- `src/i18n/messages/es.js`
- `src/i18n/messages/fr.js`
- `tests/i18n-cli.test.js`
- `tests/briefing-cli.test.js`
- `C:/dev/aioson-com/.aioson/context/project.context.md`

## Verification

- `node --test tests/briefing-cli.test.js tests/i18n-cli.test.js tests/briefing-refiner.test.js tests/agent-command-references.test.js`
- `npm run lint`
- `npm test`
- `aioson doctor C:/dev/aioson-com --json` no longer reports `living-memory:version_drift`.

## Session state

Next step: none — implementation and verification completed.

## Notes

- `src/cli.js` is already over the file-size threshold; this slice adds only four help calls and deliberately avoids a broad extraction.
- The required Living Memory reflection was refreshed and committed before implementation because its original snapshot was stale.
- Focused verification: 35/35 tests passed.
- Full verification: 3,737 passed, 0 failed, 1 skipped; `npm run lint` passed.
- `aioson doctor C:/dev/aioson-com --json` reports `living-memory:version_drift` as healthy (`1.37.1` = `1.37.1`).
