---
description: "Measured duplication between files — the same top-level helper written twice, which rules:check reports as an advisory. It never blocks; the reader decides whether a copy should become one import."
task_types: [implementation, refactor, extraction, quality]
triggers: [duplicate helper, duplicated helper, duplicate constant, duplicate declaration, copied function, copy paste, same helper twice, reuse helper]
agents: [dev, qa, planner, validator]
paths: [src/**, app/**, lib/**, packages/**, services/**, components/**]
load_tier: trigger
enforcement: [duplicate-declaration]
---

# Duplicate declarations — measured, not remembered

An agent that starts on a new phase does not know what the earlier phases wrote, so it writes the helper again. The `duplicate-declaration` checker of `aioson rules:check` compares the top-level declarations of the files under check with the rest of the tree and names every copy. Under `--changed` the targets are the changed files and the index is everything else, so the phase loop charges only what this phase touched.

## What counts as a copy

The **language family**, the **name** and the **normalized body** all match. Normalization drops comments, whitespace, semicolons and trailing commas, and unifies quotes and numeric separators; a regex literal is one token. A function is compared by its block, so two copies with different type annotations on the signature still match, and an arrow function matches a `function` with the same block. What the block means has to match too: the order and defaults of the parameters it uses, and the values of the file's own top-level names it reads.

A same-name pair with different bodies is not a copy. That is what keeps `GET`, `Page` and a local `format` out of the report.

**Known limit:** it also means a near-copy goes unreported, on purpose. A `useLicenseDate` that one phase rewrote with `useMemo` around the same expression is a different body, and so is a `byName` written once to sort a list and once as a comparator. Both were real duplicates a QA found by hand. Read the neighbors before writing a helper: the phase capsule lists them.

Read lexically and build-free for JS/TS, Python, Go, Rust, PHP and Ruby: functions and constants in every language, classes in JS/TS, Python, PHP and Ruby. JS and TS are one family; no other language is compared across.

## What never counts

- Test files, fixtures, stories, migrations, declaration files, config files and generated code.
- Default exports, and exports a framework reads from each file (`GET`, `dynamic`, `metadata`, `generateMetadata`, `loader`…): the file convention forces the repetition.
- Per-file instances and loads: `const router = express.Router()`, `const fs = require('fs')`.
- Aliases (`const db = prisma as Client`), and lowercase scalars (`const limit = 10`).
- Values that depend on the file itself: `__dirname`, `import.meta`, `process.cwd()`, or another top-level binding of the same file.
- Empty bodies.

## Tier

`LOW`, whoever binds it, even in a rule and even under `--strict`: whether two copies should be one depends on context a text scan does not have. Two constants can match by coincidence (`const VERSION = '1.0.0'` of two unrelated tools), and a standalone script may copy a helper on purpose to stay self-contained. Each finding is one file and one name, keyed for `--baseline` like any other.

## When the finding fires

Import the existing declaration and delete the copy. If the existing one lives somewhere the new caller should not depend on, move it to a module both can import, in the same change. If the match is a coincidence or the copy is deliberate, leave it and say so in the phase report; the finding has no other switch than this document's `enforcement:` line.
