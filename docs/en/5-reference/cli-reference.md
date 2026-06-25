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
- `SMALL`: `@setup → @product → @analyst → @scope-check → @architect → @dev → @qa`
- `MEDIUM`: `@setup → @product → @analyst → @architect → @ux-ui → @pm → @orchestrator → @scope-check → @dev → @qa`

**Feature development workflow (after initial setup):**

Once the project is set up, each new feature follows a shorter sequence — no `@setup` required:

```
/aioson:agent:product → @analyst → @scope-check → @dev → @qa
```

`@product` creates a feature-scoped `prd-{slug}.md` and registers the feature in `features.md`. `@analyst` produces `requirements-{slug}.md` and `spec-{slug}.md`. `@scope-check` compares intent against the planned implementation before coding. `@dev` reads the feature spec. `@qa` closes the feature by running `feature:close --verdict=PASS`, which updates `spec-{slug}.md` with a QA sign-off, marks it `done` in `features.md`, and automatically archives all feature artefacts to `.aioson/context/done/{slug}/`.

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
aioson ac:test-audit . --feature=checkout --json
```

**What it does:** extracts `AC-*` IDs from `requirements-{slug}.md`, `prd-{slug}.md`, and `conformance-{slug}.yaml`, then checks whether each ID appears in a test file or an executable harness criterion. Gate D treats missing evidence as blocking when ACs are declared.

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

The **content** sibling of `artifact:validate` (which checks chain **presence** — unchanged). Runs deterministic cross-artifact consistency checks before the execution gate. Persists `spec-analyze-{slug}.json`.

```bash
# Analyze cross-artifact consistency for a feature
aioson spec:analyze . --feature=checkout

# JSON output for gate scripting (errors → exit 1)
aioson spec:analyze . --feature=checkout --json
```

**Options:**
- `--feature=<slug>` — **required**. Feature slug.
- `--json` — structured output; `error` findings flip `ok: false` (exit 1).

**What it does:** runs five deterministic checks across the feature's artifacts:
1. **REQ/AC ID traceability** — declared-but-unreferenced IDs = coverage-gap warning; referenced-but-undeclared IDs = orphan/drift warning (noise-guarded for prose plans).
2. **Staleness** — an upstream artifact modified after a downstream one = warning (60s tolerance; the project-global `architecture.md` is excluded).
3. **Readiness** — `blocked` = error; `ready_with_warnings` = info.
4. **Harness-contract sanity** — schema errors = error; executable-coverage = info.
5. **AC→contract linkage** = info.

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

