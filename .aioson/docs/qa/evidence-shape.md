---
description: "QA verdict file shape — the qa-report-{slug}.md frontmatter and the machine-checkable evidence Gate D parses (CAP/AC table, commands, labeled production smoke)."
agents: [qa]
task_types: [qa-report, verification, output-contract]
triggers: [qa report, qa-report, writing the QA report, evidence table, verdict file]
---

# QA verdict evidence shape

Load this immediately before writing `.aioson/context/qa-report-{slug}.md`. The kernel's Output contract lists the required sections and when the verdict is `fail`; this file is the exact shape `gate:check --gate=D` and `ac:test-audit` read.

## Frontmatter

```yaml
---
feature: {slug}
verdict: pass
verified_at: {iso-timestamp}
production_entry: exact command/window/route
---
```

`verdict` is `pass`, `fail`, or — only after CLI eligibility per `.aioson/docs/delivery-followups.md` — `accepted_with_followups`.

## Minimal machine-checkable evidence shape

```markdown
## CAP/AC evidence table
| CAP | AC | Result | Evidence |
|---|---|---|---|
| CAP-example | AC-example-01 | PASS | `exact focused command` plus observed production behavior |

## Commands executed and results
- `exact command`: PASS (exit code 0)

## Production-path smoke
- Entry: exact normal command/window/route
- Trigger: exact user/system action
- Real boundary: real handler/API/IPC/persistence boundary reached
- State change: concrete persisted or externally observable change
- Visible result: concrete result observed by the user/operator
```

One concrete `PASS` row for every required AC; a row whose evidence is only a planned path, a file's presence, or a test count is not evidence. A browser walkthrough's report path is valid smoke evidence when its steps carry the AC ids and a `boundary`.

## Correction packet (FAIL)

A FAIL caused by a bounded implementation defect carries one entry per finding in the QA report — the mirror of tester's correction-packet shape, and exactly what `workflow:next --complete=qa` forwards to Dev:

- the `AC-*` id;
- the exact reproduction command;
- expected vs observed behavior;
- the suspected paths.

Prose-only findings are not a valid FAIL report.
