---
description: "File size guidelines, alert thresholds, and split strategies"
scope: "governance"
agents: [dev, deyvin, architect]
modes: [planning, executing]
task_types: [implementation, refactor, extraction, file-size]
load_tier: trigger
triggers: [large file, over 500 lines, split file, extract module, file size, growing file]
paths: [src/**, app/**, lib/**, template/**, tests/**]
---

# File Size — Governance Rules

> Loaded by the context selector when file size, split, extraction, or large-file risk is in scope. Override per-project via `.aioson/rules/`.

## Thresholds

| Lines | Status | Action |
|-------|--------|--------|
| < 300 | Ideal | Continue normally |
| 300–500 | Acceptable | Monitor growth; do not split preemptively |
| > 500 | Alert | Propose split before writing more code |

Lines are counted as pure logic — comments, blank lines, and closing braces do not count toward the threshold.

## Alert protocol

When estimating that a resulting file will exceed 500 lines:

1. Emit the alert with the estimated line count and file path
2. List 2–3 concrete extraction alternatives with real file paths
3. `@dev`: wait for user confirmation before proceeding
4. `@deyvin` pair mode: present alternatives and continue after 1 turn with no response

The alert is never blocking — it is a pause to think, not an impediment.

## Common split strategies

| Situation | Split approach |
|-----------|---------------|
| Large command / controller | Extract business logic to a `service/` or `lib/` module |
| Validation logic growing | Extract to `validate-{domain}.js` / `{domain}_validator.py` |
| Formatting / serialization | Extract to `format-{domain}.js` or a dedicated serializer |
| Mixed read/write concerns | Separate into a reader and a writer module |
| Route file growing | Group into feature sub-routers |
| Large test file | Split by domain or by test type (unit / integration / e2e) |
| Large React component | Extract sub-components and move logic to a custom hook |
| Large class with many methods | Extract related method groups into collaborator classes |

## Exceptions

These file types are exempt from the size guideline:

- Internationalization / locale files (`messages.json`, `en.yml`, `pt-BR.ts`)
- Test fixtures and factories
- Auto-generated files (migrations with timestamps, GraphQL schemas, OpenAPI specs)
- Configuration files with many entries (`routes.php`, `config/app.ts`, `webpack.config.js`)
