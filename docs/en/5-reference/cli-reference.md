# CLI Reference

Complete reference for all `aioson` commands.

---

## init

Create a new project directory and install AIOSON inside it. In interactive terminals, an **install wizard** runs first so you choose which AI tools and modes to install.

```bash
aioson init <project-name>
aioson init my-app --lang=pt-BR
aioson init my-app --tool=codex
aioson init my-app --no-interactive
```

**Options:**
- `--lang=en|pt-BR|es|fr` — sets `conversation_language` in the generated context and applies the matching agent locale pack. Default: `en`.
- `--tool=codex|claude|opencode` — configures the primary AI client. Affects which gateway file is used. Default: `codex`.
- `--no-interactive` — skip the wizard and install all files (CI / automation).
- `--json` — prints structured JSON result instead of human-readable output.

**What it does:**
1. Creates `<project-name>/` directory.
2. Runs the install wizard (tools + mode selection).
3. Copies only the files matching your profile.
4. Shows the AIOSON reveal animation and install summary.
5. Applies the selected locale pack.

---

## install

Install AIOSON in an existing directory (or the current directory). Runs the same wizard as `init` when in a TTY.

```bash
aioson install
aioson install ./my-project
aioson install --lang=pt-BR --tool=claude
aioson install --reconfigure
aioson install --no-interactive
```

**Options:**
- `--lang=en|pt-BR|es|fr` — sets locale pack.
- `--tool=codex|claude|opencode` — configures AI client.
- `--reconfigure` — re-run the wizard even if a profile already exists (e.g. to add another supported tool later).
- `--no-interactive` — skip the wizard and install all files.
- `--force` — overwrite existing files.
- `--dry-run` — preview without writing.
- `--json` — prints structured JSON result.

**Use this when:**
- The project already exists (legacy codebase, existing repo).
- You want to add AIOSON to a monorepo package.

---

## update

Update managed files to the latest template version. Respects the saved install profile — only updates files that were originally installed.

```bash
aioson update
aioson update ./my-project
aioson update --lang=pt-BR
```

**Options:**
- `--lang=en|pt-BR|es|fr` — re-applies the locale pack after updating. If omitted, re-applies whatever locale is currently active.
- `--json` — prints structured JSON result.

**What it updates:** all files in the `MANAGED_FILES` list that match your install profile (agents, config, gateway files, skills). Does not touch `project.context.md`, `discovery.md`, `architecture.md`, or other context files you created.

**Output:** on completion, prints `Template version applied: <version>` (and `(<sha>, <date>)` when the install is a git checkout — e.g. an `npm link`ed dogfood setup) so you can tell exactly which template landed.

---

## info

Show CLI version, installation status, and detected framework for a directory.

```bash
aioson info
aioson info ./my-project
aioson info --json
```

**Output:**
```
aioson v0.1.25
Directory: /path/to/my-project
Installed here: yes
Framework detected: Laravel
Evidence: composer.json, artisan
```

**With `--json`:**
```json
{
  "ok": true,
  "version": "0.1.25",
  "targetDir": "/path/to/my-project",
  "installed": true,
  "detection": {
    "framework": "Laravel",
    "evidence": "composer.json, artisan"
  }
}
```

---

## doctor

Verify that all managed files are present and valid. Use `--fix` to restore any missing files.

```bash
aioson doctor
aioson doctor ./my-project
aioson doctor --fix
aioson doctor --fix --dry-run
aioson doctor --json
```

**Options:**
- `--fix` — copies missing managed files from the template. Does not overwrite existing files.
- `--dry-run` — shows what `--fix` would do without making changes.
- `--json` — structured JSON output with per-check results.

**Checks performed:**
- All files in `MANAGED_FILES` exist.
- Gateway files (`CLAUDE.md`, `AGENTS.md`, `OPENCODE.md`, `OPENCODE.md`) are present.
- `.aioson/agents/` directory is populated.
- `.aioson/context/` directory exists.

**Typical workflow after an update:**
```bash
aioson update
aioson doctor --fix
```

---

## setup:context

Interactive wizard that creates `.aioson/context/project.context.md`. This is the main context file that all agents read.

```bash
# Interactive mode
aioson setup:context

# Non-interactive (CI / scripted)
aioson setup:context --defaults
aioson setup:context --defaults --framework="Laravel" --backend="PHP" --database="MySQL"
aioson setup:context --defaults --framework="Next.js" --frontend="React" --lang=pt-BR
```

**Non-interactive flags:**
- `--defaults` — skips all prompts, uses detected or provided values.
- `--framework=<name>` — e.g. `"Laravel"`, `"Next.js"`, `"Django"`, `"Hardhat"`. Any free-text value accepted.
- `--backend=<name>` — e.g. `"PHP"`, `"Python"`, `"Node.js"`.
- `--frontend=<name>` — e.g. `"React"`, `"Vue"`, `"Livewire"`.
- `--database=<name>` — e.g. `"PostgreSQL"`, `"MySQL"`, `"SQLite"`.
- `--auth=<name>` — e.g. `"Laravel Breeze"`, `"JWT"`, `"None"`.
- `--uiux=<name>` — e.g. `"Tailwind CSS"`, `"shadcn/ui"`.
- `--classification=MICRO|SMALL|MEDIUM` — override the auto-calculated score.
- `--profile=developer|beginner|team` — sets the AI interaction style.
- `--lang=en|pt-BR|es|fr` — sets `conversation_language`.
- `--json` — structured JSON output.

**Web3 flags:**
- `--web3-enabled=true|false`
- `--web3-networks=ethereum,solana`
- `--contract-framework=Hardhat`
- `--wallet-provider=wagmi`
- `--indexer="The Graph"`
- `--rpc-provider=Alchemy`

**Brownfield / legacy project example:**
```bash
aioson install .
aioson setup:context --defaults --framework="CodeIgniter 3" --backend="PHP" --database="MySQL"
```

---

## context:validate

Validate the existing `project.context.md` file — checks YAML frontmatter structure, required fields, and allowed values.

```bash
aioson context:validate
aioson context:validate ./my-project
aioson context:validate --json
```

**What it validates:**
- File exists at `.aioson/context/project.context.md`.
- YAML frontmatter is parseable.
- All required fields are present: `project_name`, `project_type`, `profile`, `framework`, `framework_installed`, `classification`, `conversation_language`, `aioson_version`.
- `project_type` is one of: `web_app`, `api`, `site`, `script`, `dapp`.
- `classification` is one of: `MICRO`, `SMALL`, `MEDIUM`.
- `profile` is one of: `developer`, `beginner`, `team`.

**Typical use:** run after manually editing `project.context.md` to confirm it's still valid.

```bash
# edit project.context.md
aioson context:validate
# ✓ project.context.md is valid
```

---

## agents

List all registered agents with their paths, dependencies, and outputs.

```bash
aioson agents
aioson agents ./my-project
aioson agents --json
```

**Output example:**
```
Agents (locale: en):
/aioson:agent:setup (setup)
  Path: .aioson/locales/en/agents/setup.md
  Active: .aioson/agents/setup.md
  Depends on: none
  Output: .aioson/context/project.context.md

/aioson:agent:product (product)
  Path: .aioson/locales/en/agents/product.md
  Active: .aioson/agents/product.md
  Depends on: none
  Output: .aioson/context/prd.md
...
```

The locale shown reflects the active agent locale pack (from `project.context.md` or the `--lang` flag).

---

## agent:prompt

Print the activation prompt for a specific agent, ready to paste into any AI CLI that does not support slash commands.

```bash
aioson agent:prompt setup
aioson agent:prompt setup --tool=codex
aioson agent:prompt ux-ui --tool=claude
aioson agent:prompt dev --tool=opencode --json
```

**Arguments:**
- `<agent>` — agent id: `setup`, `product`, `analyst`, `scope-check`, `architect`, `ux-ui`, `pm`, `dev`, `qa`, `orchestrator`.

**Options:**
- `--tool=codex|claude|opencode` — formats the prompt for the target CLI. Default: `codex`.
- `--json` — returns structured JSON with the prompt string.

**When to use:** if you're using an AI CLI that doesn't support `/aioson:agent:setup` slash commands, run this to get the exact text to paste into the chat.

```bash
# Copy the prompt for @analyst in OpenCode
aioson agent:prompt analyst --tool=opencode
# → paste the output into OpenCode
```

---

## workflow:plan

Show the recommended agent sequence for the current project. `classification` controls proportional depth and budget; it does not change the canonical stage chain.

```bash
aioson workflow:plan
aioson workflow:plan ./my-project
aioson workflow:plan --classification=SMALL
aioson workflow:plan --json
```

**Options:**
- `--classification=MICRO|SMALL|MEDIUM` — override the value from `project.context.md`.
- `--json` — structured JSON with `sequence`, `commands`, and `notes` arrays.

**Output example:**
```
Workflow plan — SMALL:
  @setup
  @product
  @planner
  @dev
  @qa

Notes:
  — Framework not installed: agents will include installation steps.
```

**Canonical sequence at every classification:**

`@setup → @product → @sheldon → @planner → @dev → @qa`

Briefing and Refiner precede Product when raw sources need framing; visual scope must leave an approved owned prototype. Sheldon always enriches and hash-bind approves the PRD between Product and Planner.

Consultants (`@analyst`, `@architect`, `@pm`, `@ux-ui`, `@scope-check`, `@discovery-design-doc`, `@orchestrator`) are explicitly requested and never inserted by classification. Tester, Pentester, and Validator are disabled by default.

**Feature development workflow (after initial setup):**

Once the project is set up, each new feature follows a shorter sequence — no `@setup` required:

`/aioson:agent:product → @sheldon → @planner → @dev → @qa`

`@product` creates the single feature-scoped `prd-{slug}.md`. Mandatory `@sheldon` independently reviews that same PRD and seals a current hash-bound PASS. `@planner` creates the single `implementation-plan-{slug}.md`. `@dev` implements and integrates the plan. `@qa` proves every required CAP/AC through the normal production path and writes `qa-report-{slug}.md`. Close/archive remains a separate human-authorized action.

The `SMALL` and `MEDIUM` outputs include a note reminding you of this sequence.

---

## rule:new

Scaffold a project-authored rule under `.aioson/rules/`. Rules are how a project extends agent behavior without adding an agent: `context:select` scores them by `agents`, `paths`, `triggers`, `task_types`, `priority`, and `load_tier`, so a well-formed rule reaches every agent that touches matching work.

```bash
aioson rule:new . --name=visual-quality-contract \
  --description="Our design system outranks generic visual guidance" \
  --agents=dev,qa,refiner \
  --paths="src/**,resources/**" \
  --triggers="layout,UI,component"
```

- `--name` must be kebab-case; it becomes the filename and the frontmatter `name`.
- Declare at least one of `--agents`, `--paths`, `--triggers`, or `--task-types`, or the rule is rarely selected (it warns when you don't).
- `--priority` defaults to `50`, above the framework's own 5–10 band, so a project rule outranks shipped guidance.
- `--load-tier=always` loads the rule on every activation; the default `trigger` loads it only on a match.
- It never overwrites an existing rule without `--force` — a rule on disk is project-authored content.

The generated file carries a `## Precedence` section stating that the rule outranks framework defaults, design-skill guidance, and `.aioson/brains/` nodes. Fill in the placeholder statements, then verify it:

```bash
aioson verify:artifact . --kind=rule --file=.aioson/rules/visual-quality-contract.md
```

That check proves the frontmatter routes and that the scaffold placeholders were replaced with concrete, checkable requirements.

---

## verify:artifact --kind=visual

Static visual telemetry: it reads the HTML/CSS that was actually written and returns numbers instead of opinion. No browser, no build, no toolchain — identical behavior on any host or model.

```bash
aioson verify:artifact . --kind=visual --slug=orders --advisory      # the feature-owned prototype
aioson verify:artifact . --kind=visual --file=app/index.html --json
aioson verify:artifact . --kind=visual --dir=src/ui --advisory
```

Locator precedence: `--file` → `--dir` → `--slug` (resolves `.aioson/briefings/{slug}/prototype.html`).

**Metrics** (the JSON `metrics` field): token adherence (%), spacing values off the 4px grid, active depth strategies, font families, animation count and whether `prefers-reduced-motion` is handled, state coverage, maximum card nesting, media elements.

**Blocking findings** — only what is provable from the text: a decorative blob (one rule that is simultaneously absolutely positioned, fully rounded, and blurred); animation with no `prefers-reduced-motion` block; card containers nested three deep. **Warnings** — thresholds that need judgment: token adherence below 60%, five or more off-grid spacing values, three simultaneous depth strategies, more than three font families, an interactive surface with no state marker.

Heuristics that would need a DOM, a rendered layout, or taste are excluded by construction — a gate that cries wolf gets switched off within a week. Utility-class markup (Tailwind and friends) expresses tokens in HTML, so it returns `applicable: false` rather than inventing a verdict.

### `--runtime` (opt-in)

```bash
aioson verify:artifact . --kind=visual --slug=orders --runtime --advisory
```

Adds what only exists after layout, at 1280px and 360px: horizontal overflow, clipped text, elements pushed off-screen, tap targets under 44px, and real computed WCAG contrast (translucent foregrounds composited against the nearest opaque ancestor). Playwright is an optional dependency, exactly as for `qa:run`; when it is absent the run reports that it did not happen instead of degrading into a pass.

`--screenshots` stores a first-fold capture per route and width under `.aioson/context/features/{slug}/visual-screenshots/` (`--screenshots=full` keeps whole pages; `--screenshot-dir=<dir>` names another folder, which is never cleared). Nothing in the default folder is removed before the browser has measured; then a `--slug` run over the whole matrix removes the captures it did not produce, while a run narrowed by `--route`/`--routes` (and every slug-less run) replaces only its own. A `--no-persist` run writes no capture there (pass `--screenshot-dir` for a diagnostic one). The evidence records what the folder holds (`metrics.runtime.screenshot_capture`: dir, mode, count, bytes), and a fold finding names the capture that shows it. Captures are regenerable diagnostics, not evidence: the installer's gitignore policy keeps them out of the repository, `feature:archive` drops them when the feature closes, and `evidence:prune` removes them. A later static measurement of the same bytes (the `agent:done` auto-fire included) carries the `runtime` section forward instead of erasing it; a changed prototype gets `runtime evidence dropped` and needs `--runtime` again.

`prototype:check` runs the same telemetry automatically whenever it resolves an owned prototype, always as an advisory block — it never changes the binding verdict.

---

## briefing:sources

Discover heterogeneous source packs under `plans/{slug}/` without requiring a manifest or changing the user's physical organization.

```bash
aioson briefing:sources . --json
aioson briefing:sources . --slug=legacy-system --json
```

- Without `--slug`, it lists selectable directories and backward-compatible loose files under `plans/` without loading content.
- Conventional archive roots such as `plans/done/` are excluded from new-pack candidates and reported in `ignored_directories`.
- With `--slug`, it fingerprints and classifies every source, builds logical groups, and orders detectable SQL migrations.
- Packs may mix Markdown, SQL, contracts, source code, examples, and references in any physical layout.
- It never moves, renames, or executes sources; credentials, binary databases, large files, and row-bearing dumps receive restrictive load policies.
- `load_modules` tells `@briefing` which specialized modules are justified for that selected pack.

---

## briefing:migrate-lineage

Preview or migrate a registered legacy briefing to the canonical `Source Inventory` and `Source Promise Map` schemas.

```bash
aioson briefing:migrate-lineage . --slug=legacy-feature
aioson briefing:migrate-lineage . --slug=legacy-feature --dry-run --json
aioson briefing:migrate-lineage . --slug=legacy-feature --write
```

- Preview is the default and changes no files; `--dry-run` makes that intent explicit.
- `--write` is mutually exclusive with `--dry-run`. It uses the analyzed briefing hash as a compare-and-swap precondition.
- Draft, approved, and approved-with-generated-PRD registry entries are supported.
- Only lineage sections in `briefings.md` are rewritten. Registry, PRD, implementation plan, prototype, and historical review files remain unchanged.
- Real source-pack files under `plans/` receive canonical IDs and SHA-256 fingerprints. Research, code, URLs, conversations, and unavailable post-PRD prework remain complementary non-canonical evidence.
- Successful writes create a content-addressed backup and immutable JSON audit report under `.aioson/briefings/{slug}/lineage-migration/`.
- Repeating `--write` on a canonical briefing changes no bytes and creates no new backup or report.
- Invalid/traversing slugs, real-path escapes, ambiguous promises, incomplete generated-PRD coverage, concurrent edits, and conflicting write flags fail before destructive mutation.

Run the relevant `review:prepare` flow only for agents listed in `affected_reviews`, then rerun the normal artifact/gate validation.

---

## Visual exploration commands

These commands manage non-canonical design candidates under `.aioson/explorations/{slug}/`:

| Command | Purpose |
|---|---|
| `exploration:init` | Create frozen task/intake scaffolding and choose single, sequential, or arena policy. |
| `exploration:configure` | Change open exploration defaults; use it to grow `single` into `sequential` without overwriting the first run. |
| `exploration:references` | Copy and fingerprint supplied screenshots/reference files. |
| `exploration:intake` | Validate and persist the confirmed understanding and screenshot coverage. |
| `exploration:scan` | Produce a bounded current-front-end source inventory (`none`, `targeted`, or `full`). |
| `exploration:add-run` | Allocate one immutable variant for manual/native generation. |
| `exploration:record` | Validate and record a completed or failed variant with exact model provenance. |
| `exploration:run` | Run explicitly bound `host:model` variants through read-only external adapters. |
| `exploration:validate` / `exploration:status` | Check intake, artifacts, and current structured state. |
| `exploration:review` | Generate the blind/labeled browser comparison and feedback JSON. |
| `exploration:select` | Apply exported feedback or select a completed variant. |
| `exploration:promote` | Create a fingerprinted `plans/{briefing-slug}/visual-exploration.md` source pack. |

See [Visual exploration and multi-model arena](../3-recipes/visual-exploration-arena.md) for the end-to-end flow. Selection is not Briefing approval.

---

## workflow:next

Advance the active workflow, complete the current stage, trigger a controlled detour, or skip ahead until `@dev`.

```bash
aioson workflow:next
aioson workflow:next ./my-project --tool=codex
aioson workflow:next ./my-project --complete
aioson workflow:next ./my-project --agent=ux-ui
aioson workflow:next ./my-project --skip=dev
```

**What it does:**
- initializes `.aioson/context/workflow.state.json` if it does not exist
- infers the current project stage from canonical artifacts such as `project.context.md`, `prd-{slug}.md`, `implementation-plan-{slug}.md`, and `qa-report-{slug}.md`
- follows the canonical sequence; classification adjusts proportional work inside a stage rather than changing stage order
- supports detours such as `--agent=ux-ui`, then returns to the saved next stage automatically
- allows skipping ahead only until `@dev`; it never allows skipping past `@dev`

**Notes:**
- `workflow:next` is the canonical command
- `agent:next` is an alias for compatibility
- `workflow.config.json` and `workflow.state.json` live under `.aioson/context/`, so normal framework updates preserve them
- **the binding follows the feature registry.** `workflow.state.json` is bound to the feature `project-pulse.md` names as `active_feature` (the single source of truth `feature:current` answers from) when that feature is `in_progress` in `features.md`; the last handoff and the last feature in progress are the fallbacks. When the registry moves (`aioson pulse:update . --feature=<slug>` — `--feature` alone, without `--agent`, moves only `active_feature`; a feature not `in_progress` in `features.md` does not bind the workflow, and the command says so), the next `workflow:next` or `workflow:status` moves the binding with it: the previous feature's progress is archived at `.aioson/context/features/<slug>/workflow.state.json` (never discarded) and restored when the registry returns to it; a `binding_moved` event is appended to `workflow.events.jsonl` (also on the `--expect-feature` path and when `workflow:execute --feature=<slug>` moves the binding, which archives and restores the same way). A slug outside the canonical feature-slug rule has no archive: the move warns and skips it. The QA→Dev cycle budget is per feature — another feature's cycle file is parked under `.aioson/runtime/review-cycles/<slug>/`, never reset or overwritten. The state file is derived — edit the registry, never the JSON. `--expect-feature=<slug>` still guards explicit continuation, and its mismatch message names where the binding comes from (the registry, or the fallback it fell back to).

### workflow:execute --seed (full-feature autopilot)

`aioson workflow:execute . --feature=<slug> --seed --tool=<tool>` seeds the agentic scheme (`.aioson/context/workflow-execute.json` with `agentic_policy.enabled: true`) without advancing a stage. Product, Sheldon, or Planner may seed the canonical chain described in [Autopilot handoff](./autopilot-handoff.md). Add `--step` to seed it disarmed. A stale `workflow.state.json` left by a closed/abandoned feature is discarded and reseeded automatically; a genuinely different active feature returns `different_active_feature`.

New `agent-execution-{slug}.json` manifests use schema v2 and default to `orchestration.mode: autopilot`. `workflow:execute` uses `orchestration.max_checkpoints` (10 by default) rather than the legacy one-transition default. The mode also accepts `inherit` or `step_by_step`; create-once manifests are never rewritten by resume/reseed and explicit `--step` still wins.

---

## feature:close

Close a feature after QA sign-off, updating the spec, features registry, and project pulse — and automatically archive all feature artefacts on PASS. When feature completeness applies, PASS also requires a fresh successful `harness:check` result mapped to every required CAP/AC; ledger status strings alone are not proof.

```bash
aioson feature:close . --feature=checkout --verdict=PASS --residual="none"
aioson feature:close . --feature=checkout --verdict=FAIL --notes="critical auth bug"
aioson feature:close . --feature=checkout --verdict=PASS --no-archive
```

**Options:**
- `--feature=<slug>` — feature identifier (required).
- `--verdict=PASS|FAIL` — QA result (required).
- `--residual="..."` — residual risks or open notes for PASS (optional).
- `--notes="..."` — failure reason for FAIL (optional).
- `--no-archive` — skip automatic archival (useful for idempotent re-runs).
- `--json` — structured JSON output.

**What it does:**
1. Appends a `## QA sign-off` section to `spec-{slug}.md`.
2. Updates `features.md` with the new status (`done` or `qa_failed`) and completed date.
3. Clears active work from `project-pulse.md`.
4. If `verdict=PASS` and `--no-archive` is not set, calls `feature:archive` automatically to move all artefacts to `.aioson/context/done/{slug}/`.

**When to use:** after reviewing QA's verdict, when the user explicitly authorizes close/archive. QA and autopilot never run it automatically.

---

## evidence:prune

Remove the regenerable binaries the visual and browser gates leave beside their reports — runtime captures under `visual-screenshots/` and per-step snapshots and screenshots under `browser/{script}/` — never the reports themselves.

```bash
aioson evidence:prune . --dry-run
aioson evidence:prune . --slug=checkout
aioson evidence:prune . --all
```

- Default scope: orphans — files the latest report no longer references (a failure snapshot of a step that passes now, a capture of a route since renamed).
- `--all` removes every capture and snapshot; each report carries the line that regenerates its folder (`Replay:` in a walkthrough report, `verify:artifact --kind=visual --runtime --screenshots` for captures).
- `--slug=<feature>` narrows to one owner (feature, briefing, or archived feature); `--dry-run` counts without deleting; `--json` returns the per-folder table.

`hygiene:scan` lists the same folders under `heavy_evidence_artifacts` when they are orphaned or above 1 MB, and `feature:archive` drops them (instead of moving them into `done/`) unless `--keep-diagnostics` is passed.

---

## feature:archive

Move feature artefacts to the archive directory and maintain a manifest for lightweight historical lookup.

```bash
aioson feature:archive . --feature=checkout
aioson feature:archive . --feature=checkout --dry-run
aioson feature:archive . --feature=checkout --restore
aioson feature:archive . --feature=checkout --restore --dry-run
aioson feature:archive . --feature=checkout --force
```

**Options:**
- `--feature=<slug>` — feature identifier (required).
- `--dry-run` — preview what would be moved or restored without making changes.
- `--keep-diagnostics` — archive the regenerable browser evidence (`visual-screenshots/`, `browser/{script}/`) instead of dropping it; by default the reports travel and the binaries are removed, with the count and bytes in the output.
- `--restore` — move artefacts back from `.aioson/context/done/{slug}/` to the context root.
- `--force` — archive even if the feature is not registered in `features.md` or is still `in_progress`.
- `--json` — structured JSON output with `moved`, `skipped`, `archiveDir`, and `manifestEntry`.

**What it moves:** any file in the root of `.aioson/context/` whose name contains the feature slug: `prd-{slug}.md`, `spec-{slug}.md`, `requirements-{slug}.md`, `sheldon-enrichment-{slug}.md`, `qa-report-{slug}.md`, `conformance-{slug}.yaml`, etc.

**What it never moves:** global files (`project.context.md`, `project-pulse.md`, `features.md`, `discovery.md`, etc.) and subdirectories (`bootstrap/`, `forensics/`, `parallel/`, `done/`).

**Manifest:** after each archive run, `.aioson/context/done/MANIFEST.md` is updated with a row summarizing the feature. Agents like `@briefing`, `@neo`, `@discover`, and `@sheldon` read this manifest instead of loading full archived files.

---

## feature:export

**Copy** all artefacts of a feature into a clean output directory, leaving the source tree untouched. Sibling of `feature:archive`, but a non-destructive copy to an arbitrary `--out` — turns AIOSON's markdown output into a portable deliverable. Use it to analyse a feature's specs outside the project, hand them to a client, or use AIOSON purely as a spec generator.

```bash
aioson feature:export . --feature=checkout
aioson feature:export . --feature=checkout --out=../checkout-specs
aioson feature:export . --feature=checkout --flatten
aioson feature:export . --feature=checkout --no-index
aioson feature:export . --feature=checkout --dry-run --json
```

**Options:**
- `--feature=<slug>` — feature identifier (required).
- `--out=<dir>` — destination directory. Default: `<target>/{slug}-export`.
- `--flatten` — collapse the mirrored structure into a single level; nested files become `label-...-file.ext` (collision-free). Default: mirrored (`dossier/`, `plans/`, `briefings/`, `done/`).
- `--no-index` — skip the generated `INDEX.md`. Default: an `INDEX.md` manifest is written listing every exported file and its source.
- `--dry-run` — preview what would be copied without writing anything.
- `--json` — structured JSON output with `outDir`, `count`, `copied`, and `index`.

**What it copies:** the same surface `feature:archive` enumerates — root `*-{slug}.{md,yaml,yml,json}` files (minus global files), the per-slug `dossier/`, `plans/`, and `briefings/` directories, plus `context/done/{slug}/` when the feature is already archived. The slug-collision guard is honoured, so a sibling slug (`checkout-v2`) never leaks into a `checkout` export.

**Non-destructive:** the source artefacts are never moved or deleted. Re-running overwrites files in the out dir but does not remove stale ones. Unlike `feature:archive`, there is no `features.md` status guard — you can export an in-progress feature.

---

## test:smoke

End-to-end integration test that installs AIOSON in a temporary directory, runs all major commands, and verifies the output. Used for CI and release validation.

```bash
aioson test:smoke
aioson test:smoke --lang=pt-BR
aioson test:smoke --web3=ethereum
aioson test:smoke --web3=solana
aioson test:smoke --web3=cardano
aioson test:smoke --profile=mixed
aioson test:smoke --profile=parallel
aioson test:smoke --keep
aioson test:smoke --json
```

**Options:**
- `--lang=en|pt-BR|es|fr` — runs the test with the given locale active.
- `--web3=ethereum|solana|cardano` — seeds a Web3 project structure and tests Web3 context generation.
- `--profile=standard|mixed|parallel` — `standard` runs the default flow; `mixed` runs a combined locale+web3 test; `parallel` includes `parallel:init` and `parallel:assign`.
- `--keep` — preserves the temporary directory after the test for inspection.
- `--json` — structured JSON output with per-step results.

**What the standard profile tests:**
1. `install` in temp dir
2. `setup:context --defaults`
3. `locale:apply`
4. `agents` list
5. `agent:prompt setup`
6. `context:validate`
7. `doctor`
8. `update`
9. `workflow:plan`

**Note:** this command is intended for contributors and CI pipelines, not for daily project use.

---

## test:package

Simulate `npm pack` in a temporary directory to verify what would be published and that the package installs correctly.

```bash
aioson test:package
aioson test:package ./path/to/source
aioson test:package --keep
aioson test:package --dry-run
aioson test:package --json
```

**Options:**
- `--keep` — preserves the temp directory after the test.
- `--dry-run` — checks prerequisites without actually running `npm pack`.
- `--json` — structured JSON output.

**What it does:**
1. Runs `npm pack` on the source directory.
2. Extracts the `.tgz` in a temporary directory.
3. Verifies the key files are present in the package.
4. Reports pass/fail.

**Note:** requires Node.js and npm to be available. Intended for release validation.

---

## context:load

Record that an agent loaded a rule or brain. Writes a `rule_loaded` or `brain_loaded` event to `execution_events`. Used by the Active Learning Loop to detect stale rules.

**Tier:** 1 (silent — no output by default)

```bash
aioson context:load --target=rule:authn-rules --agent=dev
aioson context:load --target=brain:sheldon-005 --agent=sheldon --feature=auth-flow --verbose
aioson context:load --target=rule:authn-rules --agent=dev --batch="jwt-patterns,session-mgmt" --json
```

**Options:**
- `--target=<rule|brain>:<slug>` — **required**. Type and identifier. E.g. `rule:authn-rules`, `brain:sheldon-005`.
- `--agent=<name>` — **required**. Agent name loading the rule/brain.
- `--batch="a,b,c"` — additional slugs to register in one transaction (same type and agent).
- `--feature=<slug>` — associate with an active feature (stored in payload).
- `--verbose` — print a confirmation line per event.
- `--json` — structured JSON output `{ ok, event, target, agent }`.

**Behavior:** creates a row in `execution_events` with `event_type='rule_loaded'` or `'brain_loaded'`. No filesystem validation — pure telemetry. Payload capped at 4KB; paths normalized to forward-slash cross-platform.

See [Active Learning Loop — CLI reference](../active-learning-loop/cli-commands.md) for full details.

---

## Neural Chain impact queue

Neural Chain stores causal follow-up work in `chain_work_items` inside `.aioson/runtime/aios.sqlite`. Files under `.aioson/context/noises/` are stable, human-readable projections; they are no longer the authoritative queue.

```bash
aioson chain:list . --feature=checkout --json
aioson chain:claim . --id=NC-12 --agent=dev --json
aioson chain:resolve . --id=NC-12 --agent=dev --token=<claim-token> \
  --outcome=verified-no-change --evidence="target inspected; focused tests passed"
aioson chain:release . --id=NC-12 --agent=dev --token=<claim-token>
aioson chain:reconcile . --json
```

- `chain:list` lists actionable work; add `--include-resolved` for history.
- `chain:claim` atomically leases one or more items so parallel DEV runs do not duplicate work. Expired leases reopen automatically.
- `chain:resolve` requires a claim token and concrete evidence. Supported outcomes are `fixed`, `verified-no-change`, `false-positive`, and `obsolete`.
- `chain:release` returns unfinished work to the queue.
- `chain:reconcile` imports legacy timestamped noise files, applies manually checked projection items, releases expired claims, and regenerates projections.

An item is evidence that a relationship should be inspected, not proof that its target needs an edit. Repeated false positives reduce confidence and eventually retire the relation. Weak one-off co-edit correlations are not materialized unless stronger test or repeated evidence exists.

---

## memory:search

BM25 full-text search over `project_learnings` (title + evidence) via SQLite FTS5.

**Tier:** 1 (silent — no notify emitted)

```bash
aioson memory:search "authentication JWT"
aioson memory:search "rate limiting" --surface=rules --limit=10 --json
aioson memory:search "session" --include-archived
```

**Options:**
- `"<query>"` — **required**. Search text, max 500 chars.
- `[path]` — project root directory (default: `.`).
- `--limit=N` — max results (default: 5).
- `--surface=<value>` — where to search: `rules`, `learnings` (default), or `all`.
- `--include-archived` — include entries with status `archived`.
- `--json` — structured JSON output `{ ok, query, results[], total }`.

**Query sanitization:** each whitespace-separated token is wrapped in phrase quotes and AND-ed. FTS5 operator characters are stripped before conversion.

See [Active Learning Loop — CLI reference](../active-learning-loop/cli-commands.md) for full details.

---

## memory:archive

Archive a rule, learning, or brain: moves the file to `_archived/YYYY-MM-DD/` and records history in `evolution_log`.

**Tier:** 2 (notified — emits `notify --level=warn` before mutation). **Human-only:** refuses when `AIOSON_RUNTIME_HOOK=1`.

```bash
aioson memory:archive --id=rule:legacy-session-cookies --reason="replaced by JWT auth" --dry-run
aioson memory:archive --id=rule:legacy-session-cookies --reason="replaced by JWT auth"
aioson memory:archive --id=learning:jwt-draft-1 --reason="superseded" --feature=auth-flow --json
```

**Options:**
- `--id=<rule|learning|brain>:<slug>` — **required**. Type and slug.
- `--reason="<text>"` — **required**. Archival reason (stored in `evolution_log`).
- `--feature=<slug>` — associate with a feature for traceability.
- `--dry-run` — simulate with zero side effects.
- `--json` — structured JSON output.

**Behavior:** atomic (BEGIN TRANSACTION → move file → INSERT evolution_log → COMMIT). Idempotent: re-archive of already-archived target returns `already_archived`. Cross-volume fallback via copy+unlink.

See [Active Learning Loop — CLI reference](../active-learning-loop/cli-commands.md) for full details.

---

## memory:restore

Restore an archived rule, learning, or brain to its original path. Records `event_type='restored'` in `evolution_log`.

**Tier:** 2 (notified). **Human-only:** refuses when `AIOSON_RUNTIME_HOOK=1`.

```bash
aioson memory:restore --id=rule:rate-limiting-rules --dry-run
aioson memory:restore --id=rule:rate-limiting-rules --reason="still needed — removal was premature"
```

**Options:**
- `--id=<rule|learning|brain>:<slug>` — **required**.
- `--reason="<text>"` — archival reason (optional but recommended).
- `--feature=<slug>` — associate with a feature.
- `--dry-run` — simulate with zero side effects.
- `--json` — structured JSON output.

See [Active Learning Loop — CLI reference](../active-learning-loop/cli-commands.md) for full details.

---

## scout:prep

Prepare a sub-task scout: validate inputs, check caps, and generate the standardized prompt for the harness sub-agent.

**Tier:** 1 (silent — use `--json`)

```bash
aioson scout:prep \
  --question="Why does workflow:next inherit stale completion records?" \
  --scope-paths="src/commands/workflow-next.js,src/handoff-contract.js" \
  --parent-agent=deyvin \
  --parent-session-id=sess-abc123 \
  --parent-session-excerpt="User reported state inheritance bug; inspect loadOrCreateState" \
  --feature-slug=current-feature \
  --json
```

**Options:**
- `--question="<text>"` — **required**. The question the sub-agent must answer.
- `--scope-paths="<paths>"` — **required**. Comma-separated files/dirs. Directories expand 1 level.
- `--parent-agent=<name>` — **required**. In V1, only `"deyvin"` accepted.
- `--parent-session-id=<id>` — **required**. Session ID for cap tracking.
- `--parent-session-excerpt="<text>"` — **required** (50-1000 chars). Why the scout was dispatched — cold-load comprehension field; blocked if absent.
- `--feature-slug=<slug>` — associate with feature for archival on `feature:close`.
- `--json` — structured output `{ ok, id, prompt, output_path, cap_remaining }`.

**Exit codes:** 0 = prepared; 2 = invalid arg, cap exceeded, scope too large, path outside root.

See [Sub-task Scout — CLI reference](../deyvin-subtask-scout/cli-commands.md) for full details.

---

## scout:validate

Validate the JSON returned by the sub-agent against the output schema. Tracks retries in the state file.

**Tier:** 1 (silent)

```bash
aioson scout:validate --input=.aioson/runtime/scouts/scout-2026-05-14-a3b7c1.json
aioson scout:validate --input=<path> --json
```

**Options:**
- `--input=<path>` — **required**. Path to the JSON file the sub-agent wrote.
- `--json` — structured output on failure: `{ ok, error: { code, details[] }, retry_remaining }`.

**Exit codes:** 0 = PASS; 2 = schema invalid, retry exhausted, file not found.

See [Sub-task Scout — CLI reference](../deyvin-subtask-scout/cli-commands.md) for full details.

---

## scout:commit

Persist the validated scout report, emit telemetry, and decrement the cap counter.

**Tier:** 1 (silent)

```bash
aioson scout:commit --input=.aioson/runtime/scouts/scout-2026-05-14-a3b7c1.json
aioson scout:commit --input=<path> --json
```

**Options:**
- `--input=<path>` — **required**. Path to the validated JSON.
- `--json` — structured output `{ ok, committed, id, path, cap_remaining }`.

**Behavior:** idempotent — re-commit of same id returns `{ committed: false, reason: "already_committed" }`. Emits `type=sub_task action=committed` to `agent_events`.

**Exit codes:** 0 = committed (or no-op); 1 = file not found, lock failure.

See [Sub-task Scout — CLI reference](../deyvin-subtask-scout/cli-commands.md) for full details.

---

## harness:check

Run the `criteria[].verification` shell commands from `harness-contract.json` deterministically — **outside** the self:loop and **read-only** over `progress.json`. Each criterion's command runs in the sandbox; exit code `0` = pass. Reuses the loop's `runCriteria`/`executeInSandbox` machinery (timeouts, process-tree kill, credential redaction, failure signatures). Persists `last-check-output.json` and emits `criteria_check_failed` telemetry on failure.

```bash
# Run every verifiable criterion of the active contract (auto-discovered)
aioson harness:check . --slug=checkout

# Run only a subset of criteria
aioson harness:check . --slug=checkout --criteria=C1,C3

# Custom timeout and JSON output (exit 0 = pass)
aioson harness:check . --slug=checkout --timeout=120000 --json

# Strict mode: binary criteria without verification block the result
aioson harness:check . --slug=checkout --strict
```

**Options:**
- `--slug=<feature>` — feature slug matching the harness contract. If omitted, the active contract is auto-discovered.
- `--criteria=C1,C2` — run only the listed criteria instead of all verifiable ones.
- `--timeout=<ms>` — per-criterion timeout override.
- `--strict` — fail when binary criteria lack executable `verification` or no executable criterion exists.
- `--json` — structured output; exit code propagated.

**What it does:** the `verification` field is authored per criterion by `@sheldon` for every mechanically-checkable `binary: true` criterion (prefer the project test runner; deterministic; cross-platform; exit 0 = pass). `harness:check` is the standalone deterministic verification of those criteria — it never touches the circuit-breaker state (that stays exclusive to `harness:validate`/`apply-validation`). Legacy contracts without `verification` remain valid; `validateContract` only emits an advisory **warning** for `binary: true` criteria lacking it. `@validator` runs `harness:check` first and copies the exit-code verdicts verbatim into `results[].passed`, LLM-judging only the criteria without `verification`.

See [Executable verification](./executable-verification.md) for the full theme.

---

## ac:test-audit

Map declared acceptance criteria to deterministic test evidence.

```bash
aioson ac:test-audit . --feature=checkout
aioson ac:test-audit . --feature=checkout --strict
aioson ac:test-audit . --feature=checkout --json
```

**What it does:** extracts `AC-*` IDs from `requirements-{slug}.md`, `prd-{slug}.md`, and `conformance-{slug}.yaml`, then maps each ID to an asserting test or a criterion proven by the latest successful `harness:check`. `--strict` rejects zero ACs plus skipped, todo, commented, string-only, or assertion-free pseudo-evidence. Gate D additionally requires the harness result to be newer than the traced feature artifacts and implementation files.

---

## sdd:benchmark

Generate a deterministic SDD quality snapshot for a feature.

```bash
aioson sdd:benchmark . --feature=checkout
aioson sdd:benchmark . --feature=checkout --strict --json
```

**What it does:** combines artifact presence, `spec:analyze`, and `ac:test-audit` into a reproducible score and writes `.aioson/context/retro/sdd-benchmark-{slug}.md`.

---

## harness:validate

Generate the `validator-prompt.txt` for the binary success contract and append a self-contained **review payload** so the validator can judge in a fresh, isolated context. Consumes the verdict back through the circuit breaker.

```bash
# Generate the validator prompt with review payload
aioson harness:validate . --slug=checkout

# Resolve the diff against an explicit base
aioson harness:validate . --slug=checkout --base=main

# Skip the diff (review payload still includes check results + changed files)
aioson harness:validate . --slug=checkout --no-diff

# Cap the embedded diff size
aioson harness:validate . --slug=checkout --max-diff-bytes=200000
```

**Options:**
- `--slug=<feature>` — **required**. Feature slug matching the harness contract.
- `--base=<ref>` — git ref to diff against. Resolution order: `--base` > `baseline.json` head > merge-base with `main`/`master` > `HEAD`.
- `--no-diff` — pure boolean flag; omit the unified diff from the review payload.
- `--max-diff-bytes=<n>` — cap the embedded diff (default `200000`); truncation happens on a line boundary.

**What it does:** the review payload (built by `src/harness/review-payload.js`) contains (a) the `harness:check` results, (b) the changed-file list (untracked files included, `.aioson/**` framework state filtered out), and (c) a unified diff against the resolved base. It degrades gracefully outside a git repo. The protocol is that `@validator` runs in a **fresh, isolated context** (a subagent / Task tool, or a separate session) — never inline in the implementing session, because implementation history biases the verdict. Typical flow: `harness:check` → `harness:validate` → isolated subagent run → re-run `harness:validate` to consume the verdict through the circuit breaker.

See [Executable verification](./executable-verification.md) for the full theme.

---

## harness:approve

Approve a pending human gate in the self:loop (loop guardrails). Persists the decision (who, when) to `.aioson/plans/{slug}/gates/{id}.json` and resumes the loop.

```bash
aioson harness:approve . --slug=<feature> --gate=<gate-id>
aioson harness:approve . --slug=checkout --gate=database_destructive_change-1
```

**Options:**
- `--slug=<feature>` — **required**. Feature slug matching the harness contract.
- `--gate=<id>` — **required**. Gate id shown in `harness:status` output.
- `--by=<name>` — override the "decided by" field (defaults to `git config user.name`).

**Idempotent:** re-approving an already-decided gate is a no-op with a warning.

---

## harness:reject

Reject a pending human gate. Ends the current loop attempt with a summary. Requires `--reason`.

```bash
aioson harness:reject . --slug=<feature> --gate=<gate-id> --reason="needs revert"
```

**Options:**
- `--slug`, `--gate` — same as `harness:approve`.
- `--reason=<text>` — **required** on reject. Recorded in the gate decision file.

---

## harness:status

Human-readable view of the current loop state for a feature.

```bash
aioson harness:status . --slug=<feature>
aioson harness:status . --slug=checkout --json
```

**Shows:** circuit state (open/closed), current iteration / max, estimated token budget (used/ceiling), last-attempt checks (passed/failed), last failure signature, pending human gates, and recommended next action.

**Options:**
- `--slug=<feature>` — **required**.
- `--json` — structured output.

---

## harness:retro

Deterministically mine the failure trail of a feature and materialize a retrospective dossier at `.aioson/context/retro/{slug}.md`. LLM-free, network-free. Source files are never modified.

```bash
aioson harness:retro . --feature=<slug>
aioson harness:retro . --last=<N>          # last N features by PASS date
aioson harness:retro . --feature=checkout --json
```

**Options:**
- `--feature=<slug>` — mine a specific feature (mutually exclusive with `--last`).
- `--last=<N>` — mine the N most recently completed features.
- `--json` — structured output; exit codes are propagated.
- `--locale=<l>` — output locale (default: project `interaction_language`).

**Exit codes:** 0 = success (including empty dossier); 1 = unexpected I/O error; 12 = input error (invalid slug, conflicting flags, feature not found).

**Sources mined:** QA reports, implementation verification reports (non-confirming `Machine Report` findings only), correction plans, dossier FAIL→PASS cycles, execution events, attempt artifacts, failure signatures, devlogs. Raw auditor output, stderr, prompt packages, and finding evidence text are not mined.

---

## harness:preview

Display a truncated, UTF-8-safe preview of an artifact file. Used in self:loop criteria-fail feedback to avoid dumping full file contents into the agent context.

```bash
aioson harness:preview <file>
aioson harness:preview .aioson/context/retro/checkout.md
```

Read-only. Best-effort write for the preview artifact.

---

## spec:analyze

The deep-content sibling of `artifact:validate` (which checks chain presence plus the canonical feature-completeness sections). Runs deterministic cross-artifact consistency checks before the execution gate. Persists `spec-analyze-{slug}.json`.

```bash
# Analyze cross-artifact consistency for a feature
aioson spec:analyze . --feature=checkout

# JSON output for gate scripting (errors → exit 1)
aioson spec:analyze . --feature=checkout --json
aioson spec:analyze . --feature=checkout --strict --json
```

**Options:**
- `--feature=<slug>` — **required**. Feature slug.
- `--json` — structured output; `error` findings flip `ok: false` (exit 1).
- `--strict` — promotes advisory harness coverage/linkage findings to errors.

**What it does:** runs deterministic checks across the feature's artifacts:
1. **REQ/AC ID traceability** — declared-but-unreferenced IDs = coverage-gap warning; referenced-but-undeclared IDs = orphan/drift warning (noise-guarded for prose plans).
2. **Staleness** — an upstream artifact modified after a downstream one = warning (60s tolerance; the project-global `architecture.md` is excluded).
3. **Readiness** — `blocked` = error; `ready_with_warnings` = info.
4. **Harness-contract sanity** — schema errors = error; executable-coverage = info.
5. **AC→contract linkage** = info.
6. **Feature capability closure** — validates Product Capability Map → requirements lens matrix → repository leverage → delivery plan, including conditional operational decisions; any missing required link = error.
7. **Parallel-wave consistency** — same-wave phases that share Primary files = warning.

An `error` flips `ok: false` (exit 1 in `--json`). `@scope-check` runs `spec:analyze` in preflight: errors are blockers, warnings are pre-computed drift evidence. When the plan carries a `Wave` column, it also runs the `wave_file_overlap` check (same-wave phases sharing Primary files = warning; plans without a `Wave` column skip it).

See [Executable verification](./executable-verification.md) for the full theme.

---

## forge:compile

**Lane B.** Compile a MEDIUM feature's artifacts into `.aioson/plans/{slug}/forge-run.workflow.js` — an auditable, versionable Claude Code dynamic-workflow script that is committed alongside the spec. Opt-in entry point is the `@forge-run` agent.

```bash
# Compile the feature into a forge-run.workflow.js
aioson forge:compile . --feature=checkout

# JSON output (hard preflights may refuse compilation)
aioson forge:compile . --feature=checkout --json
```

**Options:**
- `--feature=<slug>` — **required**. Feature slug.
- `--json` — structured output; refusals are reported with the owning agent named.

**What it does:** the generated workflow mirrors the executable-verification roadmap:
- one `parallel()` per **Wave** (file-disjoint dev agents; blocked-wave early stop),
- a deterministic `harness:check` convergence loop bounded by the governor's `error_streak_limit` (sequential fixes — only waves prove disjointness) plus a token-budget guard,
- a 3-lens adversarial review (correctness / completeness / regression-risk; majority survives; refute-by-default) for binary criteria **without** `verification`,
- a fresh-context validator stage closing through `harness:validate` → `last-validator-output.json` → `apply-validation`.

**Hard preflights** refuse compilation and name the owning agent: invalid/missing contract, zero executable criteria, plan without a `Wave` column, `spec:analyze` errors, and `wave_file_overlap` (a *warning* in `spec:analyze`, an **error** here). Generated code is deterministic by construction: pure-literal metadata, plain JS, no `Date.now`/`Math.random`/`new Date`, artifact text via `JSON.stringify` (injection-safe). It **never** runs `feature:close`. New module: `src/harness/plan-waves.js`.

See [@forge-run](../4-agents/forge-run.md) and [Executable verification](./executable-verification.md).

---

## agent:execution

Feature-scoped sub-agent execution with a manifest, safe model resolution, bound reports, and resumable telemetry.

```bash
aioson agent:execution:init . --feature=checkout --host=codex
aioson agent:execution:validate . --feature=checkout --json
aioson agent:execution:show . --feature=checkout --json
aioson agent:execution:dispatch . --feature=checkout --agent=qa
aioson agent:execution:dispatch . --feature=checkout --lane=backend
aioson agent:execution:resume . --feature=checkout
aioson agent:execution:status . --feature=checkout --json
aioson agent:execution:events . --feature=checkout --run=<run_id> --json
```

The same resolver is used by `verification:plan`. Human-readable values such as `GPT 5.6 Terra` and short typos resolve to a local Codex slug only when the match is unique and numeric tokens agree. Ambiguous models, incompatible `reasoning_effort`, invalid catalogs, and unsafe paths fail closed.

The manifest enables DEV and QA by default. Development lanes and Tester/Pentester/Validator are opt-in. Schema v2 also carries `orchestration` and `chain_work_policy`; test/security work falls back to DEV unless the corresponding specialist is enabled. Existing v1 manifests remain valid. See [Agent execution, development lanes, and model resolution](./agent-execution.md).

---

## Operator memory commands

Identity-scoped decision memory is optional and local to `~/.aioson/operators/`.

```bash
aioson op:identity show --json
aioson op:capture --signal=authorization --quote="..." --proposal="..." --source-agent=dev
aioson op:list --include-archived
aioson op:show <slug> --json
aioson op:reinforce <slug> --json
aioson op:forget <slug>
```

`authorization`, `exclusion`, and `correction` promote on the first detection; `confirmation` requires two. Re-detection of an existing decision reinforces it in place and does not duplicate FTS rows or reset `promoted_at`. Enable automatic loading with `AIOSON_OPERATOR_MEMORY=true`.

See [Operator memory](./operator-memory.md).

---

## Review intelligence commands

These additive commands bind an agent review to an exact feature artifact and its current authorities. They provide auditability for the role-aware two-pass review; they do not run models, tests, web research, workflow transitions, or gates.

```bash
aioson review:prepare [path] --agent=<agent> --feature=<slug> [--artifact=<path>] [--json]
aioson review:check   [path] --agent=<agent> --feature=<slug> --report=<path> [--json]
aioson review:status  [path] --feature=<slug> [--json]
```

`review:prepare` selects the approved profile for the agent, hashes the artifact and known authorities, publishes an immutable `review-packet/v1`, and returns `draft_path`, a bound report template, and the exact next command. Omitting `--artifact` uses only the agent's declared default; a missing or ambiguous default fails without creating a packet. Repeating prepare with unchanged bytes returns the same packet ID and path.

The agent completes at most two evidence passes and writes a candidate report. `review:check` validates schema, paths, limits, packet bindings, current hashes, evidence, and state coherence before promoting the report immutably. Structurally valid actionable reports are retained; malformed, mismatched, unsafe, or stale reports are not promoted.

`review:status` reports the latest current result per agent. An empty review store is intentionally non-gating. Delivery assurance exposes five separate axes — specification fidelity, acceptance coverage, code health, runtime truth, and residual risk — with no aggregate score.

| Exit | Meaning |
|---|---|
| `0` | Operation succeeded and the current review is `pass`; empty status also returns `0` |
| `1` | A valid current report was stored with `blocked`, `decision_required`, or `unverified` |
| `2` | Invalid invocation/report, unsafe path, missing binding, limit violation, or stale artifact/authority |

Exit `1` is actionable evidence, not a schema failure. Exit `2` must not be ignored: correct the report or run prepare again after an artifact/authority change. Review results inform each agent's existing approval or QA contract but never change `phase_gates`, workflow state, or handoff state automatically. On older installations without the skill or commands, the participating agents use the same bounded review manually and preserve their previous workflow behavior.

## Commit guard boundaries

For a staged scan, `git:guard` reads `.aioson/git-guard.json` from the Git index. An unstaged or untracked allow rule therefore cannot authorize staged content. New exceptions should use path-and-rule-scoped `contentAllowRules`; whole-file `contentAllowPaths` remains legacy compatibility only.

`commit:prepare --agent-safe` accepts only `--mode=headless`. The interactive `guarded` and user-reviewed `trusted` modes are rejected in agent-safe execution; high-confidence guard errors always remain blocking.

`commit:prepare . <path...>` stages explicit operands (files or directories) without the picker and is valid in agent-safe/headless mode. Staging runs in two lanes — tracked paths through `git add -u --` (immune to `.gitignore` rules, stages deletions) and untracked paths through `git add --` — chunked under the command-line ceiling and retried on `index.lock` contention. A refusal surfaces `gitMessage` (git's own lines, EOL warnings stripped), `failedPaths`, `stagedBeforeFailure` and the exit status. `trackedIgnored` reports tracked files that the ignore policy covers (advisory; remedy `git rm -r --cached -- <paths>`); `aioson update` and `aioson setup` measure the same list.

The generic secret heuristic skips credential descriptors (`confirm_password_label`, `API_KEY_HEADER`, `TOKEN_TTL`), mask and label values (`••••••••`, `"Password"`), and suppresses — as visible notices — findings inside localization resources (`i18n/`, `locales/`, `lang/`, locale-named files such as `messages/pt-BR.json`, `.po/.arb/.xliff/.resx`) and word-shaped symbol names under `token` keys (lint/AST reports). Provider-key rules still apply everywhere.

## host:signature

```bash
aioson host:signature [path] --host=<claude|codex|grok|kimi|opencode|qwen> [--model=<id>|configured-default] [--effort=<level>] [--unattended-probe=false] [--ttl=<hours>] [--timeout=<ms>] [--json]
aioson host:signature [path] --host=<host> [--model=<id>] [--effort=<level>] --status [--json]
aioson host:signature [path] --list [--json]
```

Probes whether a `(host, model, effort)` combination actually works on this machine — CLI installed, login valid, model id accepted, effort supported — and records the result in `~/.aioson/hosts/signatures.json` (override: `AIOSON_HOST_SIGNATURES`) with a TTL (default 24h). The probe uses the exact non-interactive argv of the execution adapter in provider read-only mode, inside an empty temporary directory, with a one-word prompt; it never touches a project. Hosts come from the single registry behind `tool:capabilities` — Claude Code, Codex, Grok, Kimi Code, OpenCode and Qwen Code are dispatchable; interactive-only hosts (Muse, Antigravity `agy`) are refused with `unsupported_host_execution`, and a host without a registered read-only flag (OpenCode) is probed without that precaution (`probe.sandbox: none`) instead of being kept out of the lanes. After the read-only probe passes, an **unattended write probe** runs the exact unattended `workspace-write` argv a lane worker gets (the registry's flag — never the provider's own sandbox, which measured DONE-without-a-file on Codex) in another empty temporary directory and asks for one file: written → `verified`, exited without it → `unverified` (valid; the run's preflight warns), alive past the budget → `blocked`, refused → `failed` — the last two invalidate the signature with `host_not_unattended`. The result is kept under `unattended.yolo`; `--unattended-probe=false` skips the write probe and keeps what an earlier one proved.

The probe's exit code is the verdict (`ok` = signature valid; `reason` carries `executable_not_found` with the install command, `auth`, `invalid_model`, `capacity`, `timeout`, `crash`, `effort_unsupported_by_host`, `host_not_unattended`, `permission_mode_unsupported` for a host with no unattended flag). `--status` and `--list` are read-only and always exit 0; read the `state` field (`valid | expired | invalid | missing`). `aioson agent:execution:validate --feature=<slug> --strict` requires a valid signature for every enabled agent and lane of the manifest and warns on unsigned declared fallbacks; without `--strict` the manifest keeps its `validated_at_dispatch` contract.

## execution:offer

```bash
aioson execution:offer [path] [--feature=<slug>] [--json]
```

Answers whether the orchestrated execution path (compiled lanes as parallel external processes, one host/model per role) is available in this project on this machine: `.aioson/config/execution-roles.json` present, valid and enabled — the unlock file the planner seeds disabled (`execution:seed`) and a person or the supervising desktop client enables — every role still at the default model confirmed, **and** every declared role signed (`host:signature`) and unexpired. `available:false` carries `reason` (`roles_file_missing | roles_disabled | roles_invalid | defaults_unconfirmed | signature_missing | signature_expired | signature_invalid`), `pending_confirmation[]` for the defaults step, and, for signatures, the `missing[]` roles with their `host:signature` hint. It never leaves the caller without a next step: `onboarding` names the `state` and the one command or edit (`next`) that moves it, and `hosts` lists the registered execution hosts and the ones installed here. `--confirm-defaults` records the owner's "run with the default models" answer (`.aioson/config/execution-roles.confirmed.json`, bound to a digest of the role map) and re-evaluates the offer in the same call. With `--feature` it also describes the plan (`lanes_table`, `lanes[]`, `execution_sequence`, `execution_choice`), its measured `scale` (`files`, `create`, `modify`, `phases`, `waves`, `parallel_phases`, `areas[]`, `split_candidate` at the 12-file floor — `AIOSON_EXECUTION_SPLIT_MIN_FILES`), its measured `recommendation` (`{choice, reasons[]}` — `orchestrated` for a split candidate with a real cut, `single` otherwise; the roles file's lock state is never an input and never flips it, it only names the unlock step) and the compiled state (`compiled.exists`, `compiled.fresh`, `compiled.issues`). The answer also carries `execution` — `spawner_supported` (this engine accepts a client spawner) and the spawner in force (`configured`, `source` env|roles, `command`, `args`) plus `unit_timeout_ms` — so a client can feature-detect the seam before offering terminals per unit. Always exits 0 — it is a question, not a gate. See [Agent execution — Orchestrated execution](agent-execution.md#orchestrated-execution-roles-offer-compile).

## execution:seed

```bash
aioson execution:seed [path] --lanes=<lane-a,lane-b> [--feature=<slug>] [--json]
```

Writes `.aioson/config/execution-roles.json` for the lanes given — or, with `--feature` and no `--lanes`, for the plan's `## Development execution lanes` table, or, before that table exists, one lane per measured surface of a two-surface plan (`lanes_source: surfaces`) — **disabled**: one `{lane}_dev` role per lane plus `qa`, each on an execution host installed on this machine (the reviewer on a second host when there is one, `independent_review: false` otherwise), every model the harness default `configured-default`, `source` naming the planner and the feature. Never touches an existing file (`already_present`, with `missing_roles` the lanes need and the file lacks — exit 0). Refuses with the cause when no execution host is installed (`no_execution_host`, with the install command per registered host), when the write fails (`write_failed`), or when the lanes are missing or malformed (`lanes_required`, `lane_invalid`, `too_many_lanes`) — exit 1. Choosing the models, enabling the file and signing the hosts stay the owner's acts; the framework seeds, it never unlocks.

## execution:compile

```bash
aioson execution:compile [path] --feature=<slug> [--dry-run] [--json]
```

Compiles the planner's `## Development execution lanes` and `## Execution Sequence` tables, crossed with the roles file and the host signatures, into `.aioson/context/execution-plan-<slug>.json` (units = phase × lane or integration owned by dev, waves, per-unit capabilities/acceptance criteria/verification, roles per lane, source digests), one prompt per lane unit and per lane under `.aioson/context/execution-prompts/<slug>/` (the dev-lane profile derived from the installed `dev.md` + the unit contract + the PRD/plan rows of that unit's capabilities), and updates only `development_lanes` and `orchestration.execution` in `agent-execution-<slug>.json`. Refuses with named findings and writes nothing when the tables, ownership, waves, roles, signatures or the dev kernel are not right (`lanes_table_missing`, `no_wave_column`, `phase_mixed_ownership`, `wave_file_overlap`, `integration_before_lanes`, `lane_write_paths_overlap`, `lane_without_role`, `qa_role_missing`, `role_signature_missing|expired|invalid`, `dev_kernel_missing`, …); exit 1 on refusal. `--dry-run` computes the plan and findings without writing. The compiled plan is verified by `verify:artifact --kind=execution-plan --slug=<slug>` (digest-bound to the plan, the roles, the manifest lanes, the prompts and the signatures), which auto-fires at the planner's `agent:done` and stays silent for features that never compiled one.

## execution:run

```bash
aioson execution:run [path] --feature=<slug> [--preflight] [--resume] [--fresh] [--wave=<n>] [--unit-timeout=<ms>] [--json]
```

Runs the compiled plan: wave by wave, every lane unit as a `dev → qa` pipeline of ephemeral external processes (the lane's dev role implements the unit inside its files with the host's unattended flag from the registry — never the provider's own sandbox, measured to answer without writing — and a bound JSON report; the lane's qa role reviews and tests it with the qa-lane profile, may apply at most `qa.max_fix_files` measured corrections among the unit files, reports the rest as findings), up to `parallel.max_concurrent_lanes` pipelines at once. The deterministic preflight (`--preflight` stops there) is `verify:artifact kind=execution-plan` plus a valid manifest, every role host resolvable on PATH and registered with an unattended flag (`permission_mode_unsupported` otherwise; every registered host declares one today — OpenCode's is `run --auto`), and the host signature's unattended write probe not `blocked`/`failed` (`host_not_unattended`); a signature signed without the probe is a `preflight.warnings` line naming the re-sign command, never a block. The run holds the feature's dispatcher lease (a direct `agent:execution:dispatch` cannot interleave); a lease a killed run left behind is waited out (up to 35 s, announced on the live line — a live run renews its lease every 10 s, a dead one never does), and `run_lease_held` is answered only for a lease something is still renewing, with the lock path and the remaining time — never delete the lock by hand. The per-unit budget is `--unit-timeout=<ms>` for this invocation, else `execution.unit_timeout_ms` in the roles file, else 60 minutes; `0` means no limit (the worker runs until it finishes), and above 4 h (14400000 ms, the roles file's ceiling) `--unit-timeout` is refused with `unit_timeout_too_large` — Node clamps a larger timer to 1 ms. The budget is a property of the process, not of the compiled plan: editing it never makes the plan stale. The run writes `.aioson/context/execution-state-<slug>.json` after every transition. A unit that cannot run, times out, crashes, misses its bound report or reports `FAIL`/`BLOCKED` — or whose reviewer cannot run — leaves a `decision_required` (state + a `decision_required` event on the unit's execution telemetry); the wave finishes and the run pauses (exit 1, `decisions_pending[]` with hints). `--resume` continues idempotently after `execution:decide` (passed units are never re-run; `run_state_stale` when the plan or manifest changed since; `--fresh` discards the previous run). A state file that exists and cannot be read — the engine replaces it by rename as it beats, and a reader that opens it in that instant gets EPERM/EBUSY — refuses with `run_state_unreadable` and writes nothing, instead of being taken for "no run" and starting a second run over a paused one; one whose bytes never parse (a hand edit, merge-conflict markers, a truncated write) refuses with `run_state_corrupt` naming the way out, and `--fresh` moves it aside to `<file>.corrupt-<timestamp>` (never deleted; a `run_state_corrupt` finding names it) and starts over. Wave-level scope drift (`lane_scope_drift`, `unowned_change`), unit silence (`stalled`: no output and no change to the unit's own files for 5 min) and unit inactivity on the disk alone (`unproductive`: no change to the unit's own files for 15 min however talkative the process — the shape of a worker blocked on an approval prompt) are measured and reported, never guessed; a sibling unit writing in the same lane never counts, nothing under `.aioson/` counts, and a unit that declares no files is measured on the lane write paths, labelled so (`measured_on`). A `timeout` decision says what the disk saw — `still writing` (retry with a larger budget) or `never wrote` (fallback or abort) — in `pending_decision.detail`; a measurement that stopped at its entry cap says it could not tell (`measured: false`) instead of either. Live lines (`[execution] wave 1 · phase-2 · dev started kimi/kimi-k3`) go to stdout, or to stderr with `--json` so the JSON document stays the only stdout. The run also beats: every 15 s each running stage is measured from the disk — elapsed, the last of the unit's files written and when, files changed since the stage started, the stall/unproductive flags — into the state file (`units.<id>.<stage>.live`; `engine.{pid, heartbeat_at, heartbeat_ms}` on every write), and once a minute the same measurement is one live line (`[execution] wave 1 · phase-2 · dev: 12 min elapsed · last write 38 s ago (src/ui/Orders.tsx) · 7 file(s) · budget 1 h`); the start line names the follow command (`aioson execution:status . --feature=<slug> --watch`), so a run whose stdout a wrapper, a background task file or a `| head` swallowed is still visible from any terminal. A finished stage keeps `activity` (files changed, last write and file). Integration units (files outside every lane) are listed for the session DEV, never spawned.

## execution:decide

```bash
aioson execution:decide [path] --feature=<slug> --unit=<unit-id> --choice=retry|fallback:<host>/<model>[/<effort>]|skip|skip-qa|abort [--json]
```

Answers a pending decision of one unit, between runs (refuses `run_active` while the feature lease is held). `retry` re-queues the stage; `fallback:` re-queues it on another host/model — which must carry a valid host signature (`fallback_signature_missing` otherwise) and, for an effort, a host that accepts one; `skip` (dev stage) hands the unit to the integration owner and records `unit_skipped`; `skip-qa` (qa stage) keeps the implementation and records `qa_skipped`; `abort` cancels the run. The decision is recorded in the state (`decisions[]`) and as a `decision_applied` telemetry event; the answer carries the `resume_command`.

## execution:status

```bash
aioson execution:status [path] --feature=<slug> [--watch[=<seconds>]] [--format=full|line] [--json]
```

The consolidated ledger of the current run: summary (status, waves, unit counts, pending decisions), waves with their units, per-unit dev/qa status (host, model, verdict, reason, report path, findings, measured corrections, cap breaches, `started_at`/`finished_at`/`elapsed_ms`, the `live` block of a running stage and the `activity` of a finished one), all findings (dev, qa, run-level scope), decisions applied and pending, integration units and `resume_command`. Two things only the outside view can tell: `engine` — is the process behind the state alive? `alive` when the state's heartbeat is fresh (three intervals, at least 10 s), `missing` when the state says running but nobody has written it (a killed terminal, a shell timeout, a closed client; the message names the `--resume` that reclaims the interrupted units), `idle` when the run ended — and `running[]`, one entry per running stage with its live measurement (elapsed, last write and file among the unit's own files, files changed, budget, stall/unproductive flags, `measured_on`/`measured`), rendered as one `▶` line each in human mode. `--watch` re-reads every 5 s (`--watch=<seconds>` for another cadence) until the run leaves `running` — the second-terminal view of a run launched detached, the command the run itself prints at start; with `--json` every tick is one JSON line on stdout and the final document closes the stream. `--format=line` renders one line (feature, state, wave, counts, what runs now) for a status pane or a bar. Read-only; exit 0 even with no run (`compiled, not started` / `no execution plan compiled`). A state that exists and cannot be read reports `state_unreadable` with its cause — never "no run" — and a watch keeps watching through it; one whose bytes never parse reports `run_state_corrupt` (`state_corrupt`, exit 1) with the way out, and a watch ends there.

## execution:graph

```bash
aioson execution:graph [path] --feature=<slug> [--format=ascii|mermaid|json] [--json]
```

The compiled execution plan drawn as the graph it is: nodes are the units (lane units and the integration units the session DEV runs after the lanes), edges are the passage rules — the explicit `Depends on` edges (`after_dev` / `after_qa`) and, for units that declare none, the implicit wave-barrier edges from the previous wave. When a run state exists it is laid over the nodes (dev/qa status, host, verdict, pending decision) and over the waves. `ascii` is the terminal view, `mermaid` renders in any client that draws it, `json` is the structured document a supervising client consumes; `--json` wraps the document with `rendered`. Read-only; exit 1 only when no plan was compiled (`plan_not_compiled`) or the format is unknown.

