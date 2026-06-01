# Task: Squad Extend

> Add components to an existing squad without rewriting the package.

## When To Use
- `@squad extend <slug>` — interactive mode
- `@squad extend <slug> --add executor --name <name>` — direct mode
- After `@squad analyze` recommends additions

## Input
- Existing squad slug
- Component type: executor | skill | template | blueprint | genome | mcp
- Component details (name, role, etc.)

## Process

### Step 1 - Read Current State
Read `squad.manifest.json` and inventory what already exists.

### Step 2 - In Interactive Mode, Ask What To Add
Ask in the selected project language:
```
What do you want to add to squad "<slug>"?
1. Executor — new specialist agent
2. Skill — new reusable capability
3. Content Blueprint — new deliverable type
4. Genome — apply an existing genome
5. MCP — new external integration
```

### Step 3 - Collect Component Details
Depending on type:
- **Executor:** slug, title, role, focus areas, skills. Generate the `.md` file.
- **Skill:** slug, title, description. Create it under `squads/<slug>/skills/`.
- **Content Blueprint:** slug, contentType, layoutType, sections.
- **Genome:** genome slug and scope (squad or specific executor).
- **MCP:** slug, required, purpose.

### Step 4 - Show Diff Before Persisting
Before saving, show exactly what will change:
```
Changes to apply:

  NEW FILE: .aioson/squads/<slug>/agents/<executor>.md
  UPDATED: .aioson/squads/<slug>/squad.manifest.json
    + executors[]: { slug: "<executor>", role: "...", file: "..." }
  UPDATED: .aioson/squads/<slug>/agents/agents.md
    + @<executor> — <role>
  UPDATED: CLAUDE.md
    + /<executor> -> .aioson/squads/<slug>/agents/<executor>.md
  UPDATED: AGENTS.md
    + @<executor> -> .aioson/squads/<slug>/agents/<executor>.md

Proceed? [Y/n]
```

### Step 5 - Persist Changes
- Create new file(s).
- Update `squad.manifest.json`.
- Update `agents.md`.
- Update `CLAUDE.md` and `AGENTS.md` when adding an executor.

### Step 6 - Validate
Mentally run `squad-validate` to confirm the package is consistent.

## Rules
- Always show a diff before persisting.
- Never delete existing components; `extend` is additive only.
- For removals, direct the user to manual editing or `repair`.
- **Idempotency:** when updating manifest/agents.md, add the entry only if it does not already exist.
- **No blind overwrite:** if the component file already exists, stop and ask for confirmation, or require `--force`; with `--force`, back up the file before overwriting.
- **Safe slug:** reject names with `/`, `\`, `..`, or outside kebab-case (`^[a-z0-9]+(-[a-z0-9]+)*$`) before creating any file.
- **Preserve existing content:** when touching manifest/agents.md/CLAUDE.md/AGENTS.md, edit only the new component section; do not rewrite or reorder the rest.
