# Task: Squad Repair

> Reconcile the manifest with the real filesystem structure. Fix inconsistencies.

## When To Use
- `@squad repair <slug>` — direct invocation
- When validation reports structural errors
- When the user manually edited files and broke consistency

## Process

### Step 0 - Legacy Squad Detection

If the slug exists as a directory at `.aioson/squads/<slug>/` but does not have `squad.manifest.json`:

1. Read `squad.md` if it exists.
2. Read `agents/agents.md` if it exists.
3. List files under `agents/` to discover executors.
4. Infer mode, mission, and goal from the discovered text.
5. Generate `squad.manifest.json` from the discovered data (`schemaVersion: "1.0.0"`).
6. Present the generated manifest for approval in the selected project language:
   ```
   Legacy squad detected: "<slug>"
   Inferred manifest:
     mode: content (inferred)
     mission: "..." (inferred from squad.md)
     executors: writer, editor (found in agents/)
     confidence: LOW — review before confirming

   Create squad.manifest.json with this data? [Y/n]
   ```
7. If approved, save it and run validation.
8. Mark readiness `contextReady` and `blueprintReady` as `partial`.

### Step 1 - Detect Inconsistencies

Compare manifest vs filesystem:

**Scenario A — File in manifest but not in filesystem:**
- Executor referenced but file missing
- Skill declared but directory/file missing
- Action: offer to regenerate the file or remove it from the manifest

**Scenario B — File in filesystem but not in manifest:**
- New executor `.md` under `agents/` not declared in the manifest
- Skill installed under `skills/` not declared
- Action: offer to register it in the manifest or report it as orphaned

**Scenario C — Inconsistent data:**
- Manifest slug differs from directory name
- Executor has wrong file path
- `CLAUDE.md`/`AGENTS.md` outdated
- Action: offer to fix it

### Step 2 - Show Full Diff

Before any repair, show exactly what will be done:
```
Repair plan for "<slug>":

  FIX: Executor "analyst" — file missing → regenerate agents/analyst.md
  FIX: Executor "ghost" — in manifest but no file → remove from manifest
  ADD: File "agents/reviewer.md" found → register in manifest
  FIX: CLAUDE.md — squad section outdated → update
  SKIP: readiness.md — missing but not critical

Apply repairs? [Y/n/select specific]
```

### Step 3 - Apply Selected Repairs

- Regenerate executor files using the role/skills from the manifest as input; follow Step 5 of `squad-create.md`.
- Update the manifest with newly found files.
- Fix paths and slugs.
- Update `CLAUDE.md` and `AGENTS.md`.

### Step 4 - Revalidate

Read and mentally execute `.aioson/tasks/squad-validate.md` after all repairs to confirm the package is consistent.

## Rules
- Never apply repairs without user approval.
- Always show the diff first.
- For regenerated executors, generate them using the instructions in `squad-create.md` Step 5.
- If the squad has no formal manifest, execute Step 0 first.
