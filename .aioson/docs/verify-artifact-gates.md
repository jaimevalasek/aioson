---
description: "Artifact done-gates (verify:artifact) — build-free, model-agnostic completeness/integrity checks for the non-code artifacts the specialized agents produce before they register done."
agents: [setup, genome, profiler-researcher, profiler-enricher, profiler-forge, discover, orache, design-hybrid-forge, site-forge, copywriter, committer, squad]
task_types: [verification, configuration]
triggers: [verify:artifact, artifact gate, done gate, artifact done-gate, placeholder gate, kind=]
---

# Artifact done-gates — `aioson verify:artifact`

The periphery analog of the code pipeline's `SG-*` / `RG-*` harness gates: a
build-free **"done = proven, not asserted"** check for the **non-code artifacts**
the specialized agents produce. Where `audit:code` scans code quality and the
harness contract gates a feature, `verify:artifact` proves a produced artifact is
complete and well-formed before the agent calls `agent:done`.

The failure mode it closes is the one the runtime smoke gate closed for code: an
agent self-declaring done with no proof — a `project.context.md` with an invalid
enum, a genome missing its manifest, a research report with an unfilled
`[Full Name]`, a generated site that never built.

```bash
aioson verify:artifact . --kind=<kind> [--slug=<slug>] [--file=<path>] [--advisory] [--strict]
```

A `kind` routes to either an **existing validator** or a declarative **SG-\***
**ruleset** over the shared static-criteria engine — pure `fs` + `RegExp` +
`JSON.parse` / `node --check` (no shell, no build, cross-platform by
construction). Adding a gate to a new agent is a registry entry plus one
done-gate line, not a bespoke implementation.

| kind | agent | backed by | default |
|---|---|---|---|
| `project-context` | `@setup` | `validateProjectContextFile` (required fields, enums, frontmatter parse) | blocking |
| `genome` | `@genome`, `@profiler-forge` | `genome:doctor` (manifest/references/anchor/Track-4.3 quality) | blocking |
| `research-report` | `@profiler-researcher` | ruleset (frontmatter + inventory/extracted/gaps sections, no template token) | blocking |
| `enriched-profile` | `@profiler-enricher` | ruleset (exec summary / psychometric / operational method / trait interactions) | blocking |
| `bootstrap` | `@discover` | ruleset (all 4 cold-start files exist with real frontmatter, no placeholder) | blocking |
| `orache-report` | `@orache` | ruleset, resolved via `--file` (7 dimensions + impact + source) | blocking |
| `hybrid-skill` | `@design-hybrid-forge` | ruleset (`.skill-meta.json` parses + sources, SKILL.md, both previews) | blocking |
| `site` | `@site-forge` | static floor + `npm run build` on the real stack | blocking |
| `copy` | `@copywriter` | ruleset (placeholder / Lorem / TODO / unfilled-token scan) | advisory |
| `commit-message` | `@committer` | subject heuristics (`--file` draft or HEAD commit) | advisory |

## Contract

- Every gate returns a uniform `{ ok, issues[], warnings[] }`, persists
  `.aioson/context/verify-artifact-<kind>.json`, and sets **exit 1** on a hard
  failure — **unless `--advisory`** (warn-only, always exit 0). `--strict`
  promotes warnings to blocking issues.
- `--slug` resolves a slug-keyed artifact path; `--file` resolves a
  caller-known / date-stamped path. A kind that needs one fails with a clean
  usage error instead of probing a `null/` path.
- `--no-build` (kind=`site`) runs the static floor only — a fast mid-work
  re-check that skips the `npm run build` runtime floor.

## Auto-fire at `agent:done`

These gates do not depend on each agent remembering to run its `## Done gate`
line. `aioson agent:done` resolves the calling agent to its artifact kind
(`src/artifact-kinds.js`) and runs the matching `verify:artifact --advisory`
itself — so the check fires at the one call every agent already makes at session
end (and rides on `agent:epilogue`, which wraps `agent:done`):

- **Self-resolving kinds** (`setup`→`project-context`, `discover`→`bootstrap`,
  `committer`→`commit-message`) run with no extra input — fully deterministic,
  no markdown dependency.
- **Locator-keyed kinds** run when the agent threads its locator into that same
  call (`--slug` / `--file` / `--dir`, which the agent's Observability line now
  carries); without it, `agent:done` surfaces a one-line hint naming the exact
  command, so the gate is visible rather than silently skipped.

Always advisory at this layer: a failed or skipped check is surfaced but never
flips the session-end result. The explicit per-agent `## Done gate` stays as the
agent-facing "check and FIX" step; this is the deterministic engine net beneath
it — the periphery analog of how `audit:code` auto-fires in `agent:epilogue`.

## `@squad` is gated separately

A squad ships through its own `aioson squad:validate` (structural: manifest
schema, required files, every declared executor file exists, no duplicate slugs,
canonical paths) plus its source-grounded multi-model **eval-gate** — both
promoted from opt-in into the default `validate` step. See `@squad`'s Done gate.

## Why this shape

Same philosophy as the `audit_code` gate in `verification-config.md`: build-free,
model-agnostic, deterministic, and cheap enough to run at **every** agent's done
gate. It does not judge subjective quality (resonance, voice, persuasiveness) —
those stay with each agent's own checklist. It proves the artifact is *there*,
*structured*, and *not a placeholder*, which is exactly what self-asserted "done"
was silently skipping.
