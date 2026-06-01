# Task: Squad Validate

> Lifecycle validation phase. Verifies package consistency.

## When To Use
- `@squad validate <slug>` — direct invocation
- Automatically after `@squad create`
- When CLI `aioson squad:validate <slug>` is executed

## Input
- Squad slug; it must exist under `.aioson/squads/<slug>/`

## Process

### Layer 1 - Schema Validation
1. Read `.aioson/squads/<slug>/squad.manifest.json`.
2. Validate against `.aioson/schemas/squad-manifest.schema.json`.
3. Required fields: schemaVersion, slug, name, mode, mission, goal.
4. If validation fails: emit ERROR with the missing field and a suggestion.

### Layer 2 - Structural Validation
Verify that these exist:
- `.aioson/squads/<slug>/squad.manifest.json` (required)
- `.aioson/squads/<slug>/agents/agents.md` (required)
- `.aioson/squads/<slug>/agents/orquestrador.md` (required)
- For each executor in `manifest.executors`: referenced file exists
- Directories: `output/<slug>/`, `aioson-logs/<slug>/`

### Layer 3 - Semantic Validation
- Manifest slug matches directory name.
- Executors in the manifest have corresponding files.
- There are no duplicate executors.
- **Executor depth:** for each executor of type `agent`/`clone`/`assistant`, does the `.md` file include a depth block in `## Quick context` (Variant A `persona`+`expertise` or Variant B `operational_breadth`; see `package-contract.md` § Executor depth block)? Standalone `role:` without the block = WARNING (basic executor). In `--strict`, it becomes ERROR.
- **Distilled sources:** if the manifest has `sourceDocs`/`analysis`, does at least one executor reference the vocabulary/frameworks from those sources? If none reference them = WARNING (sources became metadata only).

### Report
Classify each check as:
- PASS
- WARNING (does not block, but recommends correction)
- ERROR (blocks; invalid squad)

Output format:
```
═══ Squad Validation: <slug> ═══

Schema:     PASS
Structure:  PASS (7/7 files found)
Depth:      1 warning
  - executor "analyst": no depth block (basic executor) — run @squad refresh
Semantics:  1 warning
  - executor "analyst" has no skills declared

Result: VALID (2 warnings)
```

## Output
- Validation report (console)
- Status: VALID | VALID_WITH_WARNINGS | INVALID

## Rules
- Do not automatically fix problems; report only.
- Suggest the correction command when possible, for example: `run @squad extend to add skills`.
- `--strict`: converts WARNINGs into ERRORs, including basic executor warnings; useful in CI/delivery gates.
- Depth gaps (basic executor, undistilled sources) route to `@squad refresh <slug>`.
- This is the cheap always-on gate: structure + depth-block presence. For the deep source-grounded verdict (source rubric + multi-model jury), use `@squad eval <slug>` (`.aioson/tasks/squad-eval.md`).
