---
title: "Design Governance — Code Organization Rules"
scope: "project"
agents: []
updated: "2026-04-12"
---

# Design Doc — Code Organization

> This file defines code organization rules for this project.
> `@dev` and `@deyvin` must load it before any implementation.
> It is generated/updated by `@discovery-design-doc` during the pre-dev gate.
> Agents may enrich this file with patterns discovered during implementation; never remove sections.

---

## Folder Organization

**Principle:** semantic hierarchical structure — each folder represents a responsibility, not a random collection of files.

**Rules:**
- Maximum 3 levels of depth before reassessing structure. If more is needed, the responsibility should probably become a separate module.
- Singular for a unique entity or specific responsibility: `command/`, `service/`, `handler/`, `util/`
- Plural for collections of same-type items: `commands/`, `services/`, `handlers/`, `utils/`
- Kebab-case for all folder names: `squad-dashboard/`, `context-cache/`, `runner/`
- Never mix naming styles within the same directory level.

**Grouping pattern:**
```
src/
  commands/       ← all CLI handlers, one file per command
  lib/            ← reusable logic without CLI dependency
    {domain}/     ← grouped by domain (genomes/, squads/, store/)
  squad/          ← squad-system-specific logic
  runner/         ← plan execution logic
  i18n/           ← internationalization
    messages/     ← translation files per locale
```

**Avoid:**
- Generic folders like `misc/`, `stuff/`, `temp/`, `old/`
- Loose files in `src/` root that belong to a specific domain
- A folder with a single file, except public-module `index.js`

---

## Componentization

**When to extract a component or separate module:**
- Logic appears in 2+ different places → extract to `lib/` or shared utility.
- File is approaching 300 lines of pure logic, excluding comments and blank lines.
- Responsibility can be described in one short distinct sentence.
- Code can be tested independently.

**When to keep inline:**
- Logic is used in one place and is under ~50 lines.
- Premature abstraction without confirmed second use.
- Extraction would create a one-function trivial file.

**Single responsibility:**
- One file = one primary responsibility.
- Supporting helper functions may coexist in the same file when they support the primary responsibility.
- Helpers used in 2+ files → move to `utils.js` or a dedicated module.

---

## Reuse

**Before creating any new file:**
1. Check whether `src/utils.js` already solves the problem.
2. Check whether a module in `src/lib/` has a nearby responsibility.
3. Check whether the pattern exists in a similar `src/commands/*.js` file.

**Reuse hierarchy:**
1. Existing utility function in `src/utils.js`
2. Lib module in `src/lib/{domain}/`
3. Local helper in the same file, if single-use
4. New file only when none of the above fits

**Composition over duplication:**
- Never copy-paste code blocks between files; extract to a named function.
- If two CLI commands have similar logic, shared logic goes to `src/lib/`.
- If two files import the same dependency sequence, create a factory or initializer.

---

## File Size

**Guideline:**
- **< 300 lines** — ideal. Focused and cohesive file.
- **300-500 lines** — acceptable. Monitor growth.
- **> 500 lines** — alert. `@dev` and `@deyvin` should propose a split before continuing.

**Alert protocol implemented by @dev and @deyvin:**
When estimating that a resulting file will exceed 500 lines:
1. Emit an alert with the estimate.
2. List 2-3 concrete extraction/componentization alternatives.
3. Wait for confirmation before continuing (`@dev`) or proceed after 1 turn without response (`@deyvin` pair mode).

**The alert is never blocking** — it is a pause to think, not an impediment.

**Common split strategies:**
- Extract validation functions to `validate-{domain}.js`.
- Extract formatting helpers to `format-{domain}.js`.
- Separate file read/write logic into an I/O module.
- Split a large CLI command into command handler + business logic in `lib/`.

**Documented exceptions:** i18n message files, test fixtures, and automatically generated files do not count toward the guideline.

---

## Naming

**Files:**
- kebab-case for all files: `squad-dashboard.js`, `context-writer.js`
- Domain prefix when inside a flat folder: `squad-plan.js`, `squad-status.js` inside `commands/`
- No generic suffixes such as `helper`, `manager`, `handler` when the domain name is already clear

**By layer:**
| Layer | Convention | Example |
|-------|------------|---------|
| CLI commands | `{namespace}-{action}.js` | `squad-deploy.js`, `workflow-next.js` |
| Lib / domain logic | `{responsibility}.js` | `context-compactor.js`, `learning-extractor.js` |
| Shared utils | `{type}-{domain}.js` or `utils.js` | `genome-format.js`, `utils.js` |
| Module entry points | `index.js` | `src/i18n/index.js` |
| Configuration | `{name}.config.js` or `constants.js` | `constants.js` |

**Variables and functions (JavaScript):**
- camelCase: `contextPackage`, `featureSlug`, `runtimeStore`
- Global constants: SCREAMING_SNAKE_CASE — `MAX_RETRIES`, `DEFAULT_TIMEOUT`
- Functions: verb + noun — `loadContext()`, `parseManifest()`, `emitEvent()`
- Booleans: prefix `is`, `has`, `should` — `isReady`, `hasErrors`, `shouldRetry`

**Database (SQLite):**
- snake_case for tables and columns: `agent_runs`, `session_key`, `started_at`
- Plural table names: `agent_runs`, `runtime_logs`
