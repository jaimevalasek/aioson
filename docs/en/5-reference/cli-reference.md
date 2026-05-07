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
- `--tool=codex|claude|gemini|opencode` — configures the primary AI client. Affects which gateway file is used. Default: `codex`.
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
- `--tool=codex|claude|gemini|opencode` — configures AI client.
- `--reconfigure` — re-run the wizard even if a profile already exists (e.g. to add Gemini later).
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
- Gateway files (`CLAUDE.md`, `AGENTS.md`, `OPENCODE.md`, `.gemini/GEMINI.md`) are present.
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
@setup (setup)
  Path: .aioson/locales/en/agents/setup.md
  Active: .aioson/agents/setup.md
  Depends on: none
  Output: .aioson/context/project.context.md

@product (product)
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
aioson agent:prompt dev --tool=gemini --json
```

**Arguments:**
- `<agent>` — agent id: `setup`, `product`, `analyst`, `architect`, `ux-ui`, `pm`, `dev`, `qa`, `orchestrator`.

**Options:**
- `--tool=codex|claude|gemini|opencode` — formats the prompt for the target CLI. Default: `codex`.
- `--json` — returns structured JSON with the prompt string.

**When to use:** if you're using an AI CLI that doesn't support `/setup` slash commands, run this to get the exact text to paste into the chat.

```bash
# Copy the prompt for @analyst in Gemini
aioson agent:prompt analyst --tool=gemini
# → paste the output into Gemini CLI
```

---

## workflow:plan

Show the recommended agent sequence for the current project based on its `classification`.

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
  @analyst
  @architect
  @dev
  @qa

Notes:
  — Framework not installed: agents will include installation steps.
```

**Sequences by classification:**
- `MICRO`: `@setup → @product (optional) → @dev`
- `SMALL`: `@setup → @product → @analyst → @architect → @dev → @qa`
- `MEDIUM`: `@setup → @product → @analyst → @architect → @ux-ui → @pm → @orchestrator → @dev → @qa`

**Feature development workflow (after initial setup):**

Once the project is set up, each new feature follows a shorter sequence — no `@setup` required:

```
@product → @analyst → @dev → @qa
```

`@product` creates a feature-scoped `prd-{slug}.md` and registers the feature in `features.md`. `@analyst` produces `requirements-{slug}.md` and `spec-{slug}.md`. `@dev` reads the feature spec. `@qa` closes the feature by running `feature:close --verdict=PASS`, which updates `spec-{slug}.md` with a QA sign-off, marks it `done` in `features.md`, and automatically archives all feature artefacts to `.aioson/context/done/{slug}/`.

The `SMALL` and MEDIUM outputs include a note reminding you of this sequence.

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
- infers the current project stage from existing artifacts like `project.context.md`, `prd.md`, `discovery.md`, and `architecture.md`
- follows the default sequence by classification, or a custom `.aioson/context/workflow.config.json` if the project defines one
- supports detours such as `--agent=ux-ui`, then returns to the saved next stage automatically
- allows skipping ahead only until `@dev`; it never allows skipping past `@dev`

**Notes:**
- `workflow:next` is the canonical command
- `agent:next` is an alias for compatibility
- `workflow.config.json` and `workflow.state.json` live under `.aioson/context/`, so normal framework updates preserve them

---

## feature:close

Close a feature after QA sign-off, updating the spec, features registry, and project pulse — and automatically archive all feature artefacts on PASS.

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

**When to use:** run by `@qa` automatically when QA is approved. Can also be run manually.

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
- `--restore` — move artefacts back from `.aioson/context/done/{slug}/` to the context root.
- `--force` — archive even if the feature is not registered in `features.md` or is still `in_progress`.
- `--json` — structured JSON output with `moved`, `skipped`, `archiveDir`, and `manifestEntry`.

**What it moves:** any file in the root of `.aioson/context/` whose name contains the feature slug: `prd-{slug}.md`, `spec-{slug}.md`, `requirements-{slug}.md`, `sheldon-enrichment-{slug}.md`, `qa-report-{slug}.md`, `conformance-{slug}.yaml`, etc.

**What it never moves:** global files (`project.context.md`, `project-pulse.md`, `features.md`, `discovery.md`, etc.) and subdirectories (`bootstrap/`, `forensics/`, `parallel/`, `done/`).

**Manifest:** after each archive run, `.aioson/context/done/MANIFEST.md` is updated with a row summarizing the feature. Agents like `@briefing`, `@neo`, `@discover`, and `@sheldon` read this manifest instead of loading full archived files.

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
