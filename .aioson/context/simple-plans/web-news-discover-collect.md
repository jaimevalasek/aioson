---
slug: web-news-discover-collect
status: done
owner: dev
created_at: 2026-09-21
updated_at: 2026-09-21
classification: MICRO
risk: medium
source: direct-user-request
---

# Simple Plan - News discover and collect

## Scope
Add `web:discover` and `web:collect` so a query can match a feed or homepage on title or description, and the selected URLs can be scraped into `researchs/{slug}`.

## Context selected
- context:select: dev/planning over `src/web.js`, `web:scrape`, `web:save`, CLI registration, and the Portuguese command reference. Unrelated active feature `execution-roles-onboarding` stays untouched.
- Existing pattern to follow: thin `src/commands/web-*.js` handlers, `fetchPage`/`scrapePage`, `researchs/{slug}/summary.md` + `files/`, and the squad research provider when no URL is given.
- Applicable rule/doc: `simple-plan-lane`, `source-code-language-convention`, `implementation-structure-and-data-access`, `security-baseline` SEC-SBD-06, `process-and-research` shared research cache.

## Implementation intelligence
- Framework leverage: `fetchPage` with `safeRemote`, `scrapePage`, `scanInjectionPayloads`, and `createResearchProvider`.
- Structure and data boundary: parsing, scoring, and disk layout live in `src/web-news.js`. Command files only validate flags and print.
- Reuse over custom code: no embedding index and no new search vendor. Open-web discovery stays the existing provider hook.

## Done criteria
- `web:discover` reads an RSS/Atom feed, or an HTML page that points at one, or headline links on that page, and returns only items whose title or description matches the query on a word boundary.
- Matches carry `url`, `title`, `description`, `published_at`, `score`, and `matched_in`, sorted by score then date.
- The JSON result names the follow-up `web:collect` command.
- `web:collect` writes `researchs/{slug}/summary.md`, `links.json`, `links.md`, and `files/*.md` for the URLs the caller selected.
- Captured text is marked untrusted and scanned for instruction-shaped text.
- Private and localhost URLs are refused before fetch.
- Focused tests pass.

## Useful options considered
- Include now: feed and homepage discovery, lexical title/description match, provider fallback, collect of an explicit URL list or a candidates file, research cache layout, SSRF guard, injection stamp.
- Defer: embedding similarity, `--since`, a built-in list of news outlets.
- Escalate: none. The outcome was specified in the previous analysis.

## Out of scope
- Changing `web:save` / `web:extract` (visual mirror).
- Crawling the public web without a URL or `AIOSON_RESEARCH_PROVIDER_URL`.
- Workflow handoff for `execution-roles-onboarding`.

## Expected files
- `src/web-news.js` (behavior)
- `src/commands/web-discover.js` (behavior)
- `src/commands/web-collect.js` (behavior)
- `src/squad/research-provider.js` (behavior, keep description/snippet on candidates)
- `src/cli.js` (support)
- `src/i18n/messages/{en,pt-BR,es,fr}.js` (support)
- `tests/web-news.test.js` (support)
- `docs/pt/5-referencia/comandos-cli.md` (support)

Path count is above the simple-plan review signal of 8 because four locale files mirror one help surface. The behavior stays in the existing web command module. No second product capability.

## Verification
- `node --require ./tests/setup/windows-fs-retries.js --test tests/web-news.test.js tests/cli-registry-integrity.test.js tests/web-security.test.js`

## Session state
Next step: done. `web:discover` and `web:collect` are implemented and covered by `tests/web-news.test.js`.

## Notes
- Match is lexical (word-boundary tokens), not an embedding.
- `researchs/{slug}/files/` follows the shared research cache. `links.json` is the selection the next command can read.
- Verification: `node --require ./tests/setup/windows-fs-retries.js --test tests/web-news.test.js tests/cli-registry-integrity.test.js tests/web-security.test.js` — web-news 12/12 after the exit-code fix; registry and web-security passed on the previous run (27 pass, 1 test-assertion failure since fixed).
