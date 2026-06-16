# Agent Rules

Rules in this directory are loaded by agents automatically.
Each rule file uses YAML frontmatter to declare which agents it applies to and when.

Rules **override** agent default conventions. Use them for project-specific standards that must be enforced consistently across all sessions.

---

## Frontmatter Format

```yaml
---
name: rule-name
description: One-line description of what this rule enforces
agents: [dev, architect]   # omit to apply to ALL agents
priority: 10               # optional: higher = loaded first (default: 0)
version: 1.0.0
modes: [planning, executing]              # optional: restrict to a context:select mode
task_types: [payment, billing]            # routing: matched against the current task
load_tier: trigger                        # trigger (default) | always | justified
triggers: [money, pricing, checkout]      # routing: keywords/phrases matched against the task
paths: [src/billing/**]                   # routing: matched against the files being touched
---
```

---

## Field Reference

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes | Unique identifier for the rule |
| `description` | yes | What the rule enforces — used to decide relevance |
| `agents` | no | List of agent names. If absent → all agents load it |
| `priority` | no | Loading order. Higher = loaded first. Default: 0 |
| `version` | no | Semantic version for tracking changes |
| `modes` | no | `planning`, `executing`, or both. If declared, the rule is only eligible in those modes |
| `task_types` | no | Task categories matched against the `context:select` task description |
| `load_tier` | no | `trigger` (default, loads on match), `always` (loads on every select), `justified` (higher match bar) |
| `triggers` | no | Keywords or short verb phrases matched against the task (e.g. `creating files` matches "create a new file") |
| `paths` | no | Glob patterns matched against `--paths` (files about to be touched) |

---

## Loading Behavior

- If `agents:` is absent → every agent loads the rule (universal rule)
- If `agents:` lists agent names → only those agents load it
- Loaded rules **override** the agent's built-in defaults
- Rules are loaded silently — agents do not announce which rules were loaded
- An agent named `dev` matches a rule with `agents: [dev]`

### On-demand routing via context:select

Agents load rules on demand through `aioson context:select`. A rule is selected when its
metadata and semantic relevance score above the load threshold for the current task:
`task_types`/`triggers` matches weigh most, `paths` matches add when the touched files
overlap, `description` adds a small boost, and semantic search over the rule body can
recover relevant rules when the task wording does not exactly match the metadata.

Semantic search is a recall aid, not a permission bypass. `agents`, `modes`,
activation-only boundaries, and path/feature constraints still apply before a rule can
be selected. A rule with only `agents` + `description` is still weakly routed and will be
flagged by lint; either give it routing metadata (`task_types`, `triggers`, `paths`) or
mark it `load_tier: always` when it is genuinely global (keep always-rules small).

Check the health of your rules with:

```bash
aioson rules:lint .
```

It flags rules that are selector-invisible or missing required fields.

---

## When to Create a Rule

Create a rule when:
- A convention must be enforced in every implementation session without re-stating it
- A @dev learning has appeared in 3+ sessions and should be promoted to permanent
- The team has decided on a project standard that differs from agent defaults

Do NOT create a rule for:
- One-time decisions (use `design-doc.md` decisions section instead)
- Feature-scoped behavior (use `spec-{slug}.md` or `requirements-{slug}.md`)
- External API knowledge (use `docs/` instead)

---

## Example

See `example-monetary-values.md` in this directory for a working example.

---

## Squad Rules

Rules specific to squad behavior live in `rules/squad/`.
See `rules/squad/README.md` for the squad rules format.
