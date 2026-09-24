---
description: "Measured size limits for files and functions — the modularization floor rules:check enforces. Advisory by default (a pause to think); a project rule binding the same checkers makes it law."
task_types: [implementation, refactor, extraction, file-size, quality]
triggers: [large file, over 500 lines, split file, extract module, file size, long function, function length, function size, god object, modularization]
agents: [dev, qa, planner, validator]
paths: [src/**, app/**, lib/**, packages/**, services/**]
load_tier: trigger
enforcement: [file-size, function-size]
max_file_lines: 500
max_function_lines: 60
---

# Code size limits — measured, not felt

> `design-docs/file-size.md` carries the doctrine and the split strategies. This document makes its numbers **machine-checked**: the `file-size` and `function-size` checkers of `aioson rules:check` read their thresholds from this frontmatter, run in the tracked `@dev`/`@qa` done-gate over the changed files, and in `agent:epilogue`. A file that grew into a God object, or a function that narrates twenty steps, is a finding with a path and a number — never something an agent promised to remember.

## What is counted

A **logic line** is a non-blank line that is not a comment and is not made only of closing brackets (`}`, `)`, `]`, with or without `;`/`,`). Strings are not parsed for content; a multi-line string counts its lines. The same contract applies to every language the rules gate scans — JS/TS, Go, Rust, Java, Kotlin, C#, Swift, PHP, Dart, C/C++, Python, Ruby, Vue/Svelte/Astro.

A **function** is a named body: a declaration, a method, an arrow function assigned to a name, `fn`/`func`/`fun`/`def`. Anonymous callbacks are not measured — a long callback is still a long function, but a false negative there is cheaper than a false positive that teaches everyone to ignore the gate.

## Limits and tiers

| Checker | Default | Frontmatter key | Finding |
|---|---|---|---|
| `file-size` | 500 logic lines | `max_file_lines` | `FILE_SIZE` — one per file, keyed by the file (stable for `--baseline`) |
| `function-size` | 60 logic lines | `max_function_lines` | `FUNCTION_SIZE` — one per function, keyed by its name |

Bound by this **doc**, both report `MED`: advisory, surfaced in the gate output, never a refused handoff — the doctrine's "pause to think, not an impediment". Bound by a **rule** in `.aioson/rules/` (copy the frontmatter keys there with the project's numbers), they report `HIGH` and block like any rule; a rule's thresholds outrank this doc's, and among several documents the strictest value wins.

```yaml
# .aioson/rules/code-size.md — the project decides the law
---
name: code-size
description: "Files under 400 and functions under 40 logic lines — this codebase is read more than written"
enforcement: [file-size, function-size]
max_file_lines: 400
max_function_lines: 40
---
```

## Exemptions

The doctrine's exemptions are the checker's: tests, fixtures and factories, generated files, locale dictionaries (`pt-BR.ts`, `messages.json`, `i18n/`), configuration with many entries (`config/`, `routes.*`), migrations. Everything else in the scanned tree is measured.

## Legacy codebases

A tree that grew before the limit existed is not charged retroactively: the gate runs over the **changed** files, and `aioson rules:check . --baseline` records the existing findings as counted debt — visible in every run, never blocking, while every new violation still reports. Commit the baseline; it is a recorded decision.

## When the finding fires

Do not pad the threshold. Name the responsibilities the file or function carries, extract each into a named module or function (`design-docs/file-size.md` § Common split strategies), and keep the public behavior identical — the ACs are the proof. If a single body must stay long (a table-driven dispatcher, a generated parser), record the reason in the plan's deviation line so the next reader finds a decision, not an accident.
