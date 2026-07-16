---
description: "Canonical MEMORY.md format spec + cross-harness reference impl. Shipped Phase 3 / v1.14.0 of operator-memory feature."
schema_version: "1.0"
task_types: [operator-memory, memory-schema, harness-memory]
triggers: [MEMORY.md, operator memory, decision memory, memory format, op:capture]
retrieval_intents: [memory, implementation, documentation]
---

# Operator Memory — MEMORY.md format spec

This document is the **canonical format spec** for AIOSON operator-memory. Any harness (Claude Code, Codex, future) that wants to participate in operator-memory loading reads this spec.

## File layout

Per identity, two index files at `~/.aioson/operators/{identity}/`:

```
~/.aioson/operators/{identity}/
├── MEMORY.md              ← active tier — auto-loaded by agent preflight
├── MEMORY-archive.md      ← archive tier — lazy-load only on op:list --include-archived
├── decisions/             ← canonical decision body files (source-of-truth)
├── proposals/             ← pending-promotion queue
└── history/               ← soft-deleted decisions/proposals
```

## MEMORY.md frontmatter schema

```yaml
---
identity_prefix: <first 8 chars of the identity directory name>
decisions_count: <int>     # number of decisions in active tier (this file)
archived_count: <int>      # number of decisions in MEMORY-archive.md
last_promoted: <ISO-timestamp> | null
schema_version: "1.0"      # bumped on breaking schema changes
---
```

## Body schema

```markdown
# Operator Memory — Index

## Active decisions

- [Title](decisions/{slug}.md) — {signal_type}, reinforced {ISO-date}
- ...

## See also

- `MEMORY-archive.md` — {archived_count} archived decisions
```

**Active decisions list entry format:**

`- [<title>](decisions/<slug>.md) — <signal_type>, reinforced <YYYY-MM-DD>`

Where:
- `<title>` is the first 80 chars of the decision body's first line (markdown chars stripped).
- `<slug>` matches `^[a-z0-9-]+$` (kebab-case, deterministic from proposal text).
- `<signal_type>` is one of `authorization | exclusion | correction | confirmation` (PMD-06).
- `<reinforced>` is the `last_reinforced` field truncated to `YYYY-MM-DD`.

## Decision file schema (`decisions/{slug}.md`)

See `requirements-operator-memory.md` § Entities § `decision` for the full frontmatter table. Summary:

```yaml
---
slug: <kebab-case slug>
signal_type: authorization | exclusion | correction | confirmation
promoted_at: <ISO-timestamp>
last_reinforced: <ISO-timestamp>
reinforcement_count: <int>           # 0 at promote; ++ on each re-detection
superseded_by: <slug> | null          # V2 marker — V1 always null
category: identity | autonomy | tooling | default
source_agent: <agent_name>
quotes: [<verbatim quote>, ...]       # capped at 5 most recent
version_schema: "1.0"
deprecated_by: <slug> | null          # reverse pointer when superseded
---

# {Human-readable title}

{One paragraph in user-facing language, ≤ 500 chars}

## Trigger quotes
- "{quote 1}"
- "{quote 2}"
```

## Loading directive — how agents consume MEMORY.md

In v1.15.0+, agents read MEMORY.md by default. Set `process.env.AIOSON_OPERATOR_MEMORY === 'false'` to opt out. Per AIOSON's universal loading directive in `CLAUDE.md` / `AGENTS.md` (template), the pseudocode is:

```
if AIOSON_OPERATOR_MEMORY != "false":
  identity = sha256(git config user.email)[0..16]
  memory = read("~/.aioson/operators/" + identity + "/MEMORY.md")
  if memory:
    inject memory frontmatter + entries into agent context
    for entry in memory.entries:
      if task_description has keywords matching entry.title or entry.signal_type:
        lazy_load("~/.aioson/operators/" + identity + "/decisions/" + entry.slug + ".md")
        apply decision without re-asking user
        if conflict with .aioson/rules/*.md:
          surface stderr warning from operator-memory layer
          project rule wins
```

## V1 support matrix

| Harness | Status | Loading path |
|---|---|---|
| Claude Code | **native** | `CLAUDE.md` (project root + global) — `## Memory loading` section auto-injected by `aioson setup` |
| Codex | **compatible** | `AGENTS.md` (same `## Memory loading` section — Codex reads AGENTS.md, no Claude-specific syntax used) |
| OpenCode | **compatible** | `OPENCODE.md` (same `## Memory loading` section, no Claude-specific syntax used) |
| Cursor | **TBD (V2)** | Cursor reads `.cursorrules` / `.cursor/rules/*.md` — bridge file needed |
| Aider | **TBD (V2)** | Aider reads `.aider.conf.yml` + project conventions — bridge needed |

## Reference implementation for non-Claude harnesses

Any harness wanting to support operator-memory needs only to:

1. Read `~/.aioson/operators/<identity>/MEMORY.md` at session preflight (when flag is on).
2. Treat its content as additional context for the LLM call (prefix or suffix to system prompt).
3. Optionally, parse the link entries and lazy-load `decisions/{slug}.md` for description-matched entries.

There is **no custom binary, daemon, or socket** — operator-memory is filesystem-native. A 50-line shell script can implement this loading logic.

Example Bash reference (POSIX):

```bash
#!/bin/bash
# operator-memory-load.sh — minimal reference loader
if [ "${AIOSON_OPERATOR_MEMORY:-true}" != "false" ]; then
  EMAIL=$(git config --get user.email 2>/dev/null)
  if [ -n "$EMAIL" ]; then
    HASH=$(echo -n "$EMAIL" | sha256sum | cut -c1-16)
    MEMORY_FILE="$HOME/.aioson/operators/$HASH/MEMORY.md"
    if [ -f "$MEMORY_FILE" ]; then
      cat "$MEMORY_FILE"
    fi
  fi
fi
```

(The reference deliberately omits the reserved-prefix salt rehash from EC-08 — see `src/operator-memory/identity.js` for the canonical Node.js implementation that handles all edge cases.)

## Capture directive

Capture is also LLM-driven via the prompt template at `template/agents/_shared/memory-capture-directive.md`. Any harness that does not inject this directive cannot capture signals — but can still LOAD decisions captured from another harness, since the storage is filesystem-shared per identity.

## Forward compatibility

V2 may extend schema with:

- `start_at` / `end_at` per decision (full Zep validity-window pattern)
- Per-decision `confidence` field (LLM-tagged categorization)
- Scope tags (`this-turn` / `this-project` / `always`)

Schema changes will bump `schema_version`. V1 readers seeing `schema_version: "2.0"` should display a warning + fall back to V1-compatible field subset.
