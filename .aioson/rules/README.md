# Agent Rules

Rules in this directory are loaded by agents automatically.
Each rule file uses YAML frontmatter to declare which agents it applies to and when.
Rules may be grouped in nested domain folders; selection and `rules:lint` walk them recursively.

Rules **override** agent default conventions. Use them for project-specific standards that must be enforced consistently across all sessions.

---

## Frontmatter Format

```yaml
---
name: rule-name
description: One-line description of what this rule enforces
agents: [dev, planner]      # omit to apply to ALL agents
priority: 10               # optional: higher = loaded first (default: 0)
version: 1.0.0
modes: [planning, executing]              # optional: restrict to a context:select mode
task_types: [payment, billing]            # routing: matched against the current task
load_tier: trigger                        # trigger (default) | always | justified
triggers: [money, pricing, checkout]      # routing: keywords/phrases matched against the task
aliases: [workspace, project]             # routing: user/domain terms that may mean this rule
entities: [Workspace, Project]            # routing: domain objects, tables, services, modules
retrieval_intents: [database, memory]      # routing: why this file should be discovered
paths: [src/billing/**]                   # routing: matched against the files being touched
---
```

List fields read the same in the inline form (`agents: [dev, planner]`) and as a YAML block list (`agents:` followed by `- dev` lines); a trailing `# comment` is never part of a value, and a quoted item keeps its commas (`["criar pastas, subpastas"]`). `aioson rules:lint . --docs` names the declarations that silently change who receives a rule: an `agents:` key left without a value (it reaches every agent — write `agents: []` when that is the intent), an agent id that is a near-miss of a real one, a mode other than `planning`/`executing`, and an unknown `load_tier`.

---

## Field Reference

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes | Unique identifier for the rule |
| `description` | yes | What the rule enforces — used to decide relevance |
| `agents` | no | List of agent names. If absent → all agents load it |
| `priority` | no | Loading order after relevance is proven. Integer 0–100; higher = loaded first. Default: 0 |
| `version` | no | Semantic version for tracking changes |
| `modes` | no | `planning`, `executing`, or both. If declared, the rule is only eligible in those modes |
| `task_types` | no | Task categories matched against the `context:select` task description |
| `load_tier` | no | `trigger` (default, loads on match), `always` (loads on every select), `justified` (higher match bar) |
| `triggers` | no | Keywords or short verb phrases matched against the task (e.g. `creating files` matches "create a new file") |
| `aliases` | no | Alternate user/domain terms that should recall this rule, e.g. `workspace` when the code entity is `project` |
| `entities` | no | Domain objects, tables, services, modules, or concepts governed by the rule |
| `retrieval_intents` | no | Discovery intent labels such as `planning`, `implementation`, `database`, `memory`, `feature`, `security`, or `testing` |
| `paths` | no | Glob patterns matched against `--paths` (files about to be touched) |
| `enforcement` | no | Id of a deterministic checker that verifies compliance. Run by `aioson rules:check`; see below |

---

## Loading Behavior

- If `agents:` is absent → every agent loads the rule (universal rule)
- If `agents:` lists agent names → only those agents load it
- Loaded rules **override** the agent's built-in defaults
- Rules are loaded silently — agents do not announce which rules were loaded
- An agent named `dev` matches a rule with `agents: [dev]`
- `priority` orders rules only after they have proved relevance; it never makes an unrelated rule eligible

### On-demand routing via context:select

Agents load rules on demand through `aioson context:select`. A rule is selected when its
metadata and semantic relevance score above the load threshold for the current task:
`task_types`/`triggers` matches weigh most, `aliases`/`entities`/`retrieval_intents`
help connect user language to project language, `paths` matches add when the touched
files overlap, `description` adds a small boost, and semantic search over the rule body
can recover relevant rules when the task wording does not exactly match the metadata.

`aioson context:search` is the broad discovery layer. It indexes `.aioson/rules`,
`.aioson/docs`, skills, context/bootstrap files, feature dossiers, plans, PRDs, and
research summaries, then returns `must_read`, `should_read`, and `maybe` buckets. Its
`--agent`, `--mode`, `--intent`, and `--source` flags are ranking boosts, not strict
filters. Use `context:search` to discover candidates; use `context:select` as the final
strict context package before loading files into an agent prompt.

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

Lint proves the frontmatter is well-formed; it cannot prove the rule fires on
the tasks it was written for. That proof lives in `.aioson/evals/*.json`: add
at least one positive scenario when you create a rule, one `absent` check on a
neighbouring task it must stay quiet on (precision is measured only where a
negative exists), then run

```bash
aioson context:evals .
```

A failed scenario prints why the engine excluded the rule (agent/mode filter,
score vs. threshold) and a concrete frontmatter suggestion; the coverage
report names every routed rule, doc, and skill no scenario proves yet
(`--strict` for CI).

---

## Precedence

Rules are the top of the authority chain. A briefing, PRD acceptance criterion, implementation plan, prototype, or dossier decision may add detail on top of a rule, but may never override it, narrow it, or spend it as an accepted deviation — being more specific or more recent does not promote a feature artifact above a project rule.

When a feature artifact conflicts with a rule, the agent stops and reports the conflict. It does not choose. The only resolutions are a human editing the rule or a human changing the artifact.

This makes the rule file itself the single on/off switch, which is what keeps the override channel honest: a project that genuinely needs different behavior edits or removes the rule, in the open, once — instead of a feature quietly deciding it does not apply this time.

---

## Machine-checked compliance

Prose loses to model priors. A rule that no machine can verify degrades into a suggestion, so a rule may bind itself to a deterministic checker:

```yaml
enforcement: source-code-language
```

```bash
aioson rules:check .              # every enforceable rule, whole tree
aioson rules:check . --changed    # only what this session touched (cheap; run often)
aioson rules:check . --rule=source-code-language-convention --json
```

`rules:lint` asks whether the rules are well-formed; `rules:check` asks whether the code obeys them. It reports `HIGH` for a provable violation and `MED` for a signal worth a second look, and it lists every document that has no checker under `unenforced` — a green summary must never imply coverage that does not exist. A document naming a checker that does not exist (a typo in `enforcement:`) is called out separately: it would otherwise sit among the prose-only documents, believed to be enforced and quietly verifying nothing.

An all-clear always means files were read. `--changed` narrows the check to the diff, but a diff is empty in two ordinary situations — the project has no git yet, and the work was committed before the handoff — so an empty scope widens to the whole tree and the report says it did (`scope_fallback`). Scanning nothing and printing OK is the one outcome this command must never produce. Build output and vendored dependencies are never read: `target/`, `obj/`, `vendor/`, `node_modules/`, `Pods/`, `_build/`, `.dart_tool/` and generated filenames (`*.min.js`, `*.g.dart`, `*.pb.go`) are not the project's naming.

`.aioson/docs/` and `.aioson/skills/process/` can bind a checker the same way, but they do not carry the same weight, and the check does not pretend otherwise:

| Surface | What it is | A violation |
|---|---|---|
| `.aioson/rules/` | hard law on how to implement and act | **blocks** — `HIGH`, refuses the stage gate |
| `.aioson/docs/` | procedure — how the work is normally done | warns — `MED`, advisory |
| `.aioson/skills/process/` | craft — ability, technique, quality | warns — `MED`, advisory |

Breaking a rule is a contract violation; falling short of a skill is a competence gap worth surfacing, not a reason to refuse the handoff. When a rule and a skill declare the same checker, the rule's authority applies.

**At edit time.** With the session guard installed (`aioson hooks:install`), every checker that reads one file at a time (`source-code-language`, `no-native-dialogs`, `file-size`, `function-size`) also judges each pending write in memory. A NEW `HIGH` violation the edit introduces puts the document and the finding in front of the agent before the file lands, whatever the edit's wording. The product Markdown agents write under `.aioson/` (plans, specs, PRDs) is judged by the code it names — cited paths, requested identifiers, fenced code — so a plan that names a translated file hears the naming rule before anything is built. The document's `agents:` and `paths:` still apply, accepted baseline debt stays accepted, and Markdown outside `.aioson/` (docs, notes) and the governance files themselves are never judged: they talk about the product and quote counter-examples on purpose.

### A project that was already built against a different convention

New violations in a compliant tree are drift, and an agent fixes them on the spot. A codebase written against a different convention from its first commit is something else: the tree is not wrong by accident, and choosing between it and the rule is a decision about the whole project. `rules:check` measures the difference and refuses to decide for you — when most of the tree already breaks the rule, it says so and lays out the three real options:

```bash
aioson rules:check . --baseline
```

That accepts what exists as **counted debt**, written to `.aioson/context/rules-baseline.json` (commit it — it is a decision, not a generated report). Every pre-existing violation stays visible in every run, and every **new** violation still blocks. The alternatives are migrating the code, or editing the rule so it matches what the project actually is.

Debt is keyed by rule, file, and identifier — not by line — so it survives ordinary edits, and fixing the code clears the entry on its own. An agent may never write a baseline, edit a rule, or pick one of these options on the user's behalf.

The engine runs it automatically at DEV/QA completion and at the workflow stage gate, and agents re-run it during implementation. Removing the rule file removes its check with it; nothing else can switch it off.

---

## When to Create a Rule

Create a rule when:
- A convention must be enforced in every implementation session without re-stating it
- A @dev learning has appeared in 3+ sessions and should be promoted to permanent
- The team has decided on a project standard that differs from agent defaults

Three questions before any routed knowledge (rule, doc or skill) is written —
all three must be yes:
1. Repeated: you keep restating it, session after session.
2. Non-obvious: there is a "how" the model does not get right on its own.
3. Stable: it will still hold in weeks, not hours.
A no on any of them is a decision, a plan line or a chat message, not an
artifact. Models improve: a skill that taught "how" may later only need to
give context and format — re-run the evals after a model change and retire
what no longer earns its trigger (`status: deprecated` in the skill registry
and no routing frontmatter; `aioson context:usage .` shows what nothing
selects any more).

Do NOT create a rule for:
- One-time decisions (record them with `aioson decision:add` or in the plan's ADR section)
- Feature-scoped behavior (use `spec-{slug}.md` or `requirements-{slug}.md`)
- External API knowledge (use `docs/` instead)

---

## Example

See `example-monetary-values.md` in this directory for a working example.

---

## Squad Rules

Rules specific to squad behavior live in `rules/squad/`.
See `rules/squad/README.md` for the squad rules format.
