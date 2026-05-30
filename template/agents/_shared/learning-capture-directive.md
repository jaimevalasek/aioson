---
name: learning-capture-directive
schema_version: "1.0"
ships_with: cross-tool-project-knowledge
purpose: "Versioned prompt template defining the 2 project-knowledge signals (gotcha, resolution) that agents record in devlogs. Distinct from memory-capture-directive (operator-memory). Materialized disk-first to .aioson/learnings/ on feature:close so any harness can read them."
---

# Learning Capture Directive (cross-tool-project-knowledge v1)

> **Distinct from `memory-capture-directive.md`:** that directive captures *operator
> preferences* (how you should work) via `aioson op:capture`. THIS directive captures
> *technical facts about the stack* (gotchas, fix-recipes) — per-project, shared, and
> read by any harness (Claude Code / Codex / OpenCode) once materialized.
>
> **Versioned:** if the signal taxonomy changes, bump `schema_version` and update the
> universal loading directive's reference.

## What to watch for

While working, watch for **non-obvious technical findings about this project's stack**
that a future session (or a different harness) would otherwise have to rediscover at
cost. There are exactly 2 signal types in V1.

### 1. gotcha

A behavior that contradicts the naive expectation. Capture: **naive-assumption →
actual-behavior → why**.

**Examples that ARE a gotcha:**

- "Filtering by name silently breaks; you must always filter by content."
- "OpenClaw 2026.5.19 ships `X-Frame-Options` + CSP `frame-ancestors 'none'` hardcoded — iframes are blocked until you patch in-process."

**Examples that are NOT (do not capture):**

- A bug you just introduced and fixed in the same edit (not a standing fact).
- Generic best-practices already in the docs.

### 2. resolution

A consolidated incident-resolution / fix-recipe. Capture: **symptom → root-cause →
fix** (include the command sequence when relevant).

**Examples that ARE a resolution:**

- "Tauri on Windows has no job objects → child processes orphan. Cleanup via `Stop-Process` + clear the postgres shared-memory block."
- "FATAL `pre-existing shared memory block` on Paperclip postgres start → stale `postmaster.pid`; remove it before relaunch."

**Examples that are NOT:**

- A one-off command you ran once with no reusable lesson.
- An operator preference (those go to `memory-capture-directive`, not here).

## How to record

Record the finding in your session **devlog** (`aioson-logs/devlog-*.md`) under a
`## Learnings` section, one tagged line per finding:

```markdown
## Learnings
- [gotcha] OpenClaw 2026.5.19 ships hardcoded CSP frame-ancestors 'none'; iframes blocked until patched in-process
- [resolution] Paperclip postgres FATAL pre-existing shared memory → remove stale postmaster.pid before relaunch
```

`aioson devlog:process` reads these lines and upserts them into `project_learnings`
(`type='quality'`, `kind='gotcha'|'resolution'`). On the next `aioson feature:close`,
they are materialized to `.aioson/learnings/{gotchas,recipes}/{slug}.md` + regenerated
into `.aioson/learnings/INDEX.md`, so any harness can read them.

**Tag rules:**

- Use exactly `[gotcha]` or `[resolution]` (lowercase) as the line prefix.
- Keep the title to one line; put the full naive→actual→why or symptom→root-cause→fix
  detail in the devlog body or a `## Cited files` block.

## ⚠ Privacy — capture is COMMITTED

Project learnings are stored on disk and **committed to git by default** (shared with
the team). Unlike operator-memory (per-user, private), these are visible to anyone with
repo access. **Before recording, review for sensitive content** — internal hostnames,
client names, IPs, credentials, absolute paths under a user home. When in doubt, redact
or omit. V1 does not sanitize automatically (trust-user); you are the boundary.

## Capture is best-effort

Recording a learning never blocks your work. If a devlog line is malformed it is simply
skipped at `devlog:process` time — do not crash, retry, or surface the failure to the
user.
