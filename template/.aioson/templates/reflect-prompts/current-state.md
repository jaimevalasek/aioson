# Reflect prompt — `bootstrap/current-state.md`

You just finished a session that the memory engine marked as **relevant**. Refresh `bootstrap/current-state.md` so it reflects the project as it is *now*, not as it was at the last reflection.

## What to do
1. Read the current content of `.aioson/context/bootstrap/current-state.md` (it is also in `current_bootstrap_snapshot["current-state.md"]` of the manifest).
2. Read `diff_summary`, `changed_files`, and `heuristic_reasons` from the manifest.
3. Update the file in place:
   - **Add** new capabilities or modules the session shipped.
   - **Remove** entries that are no longer true (removed features, retired modules).
   - **Keep** untouched anything outside the changed scope.
   - **Preserve** the YAML frontmatter; only update the `generated_at` field to the current ISO 8601 timestamp.
4. Be terse. One line per capability. No marketing language.
5. Do not invent. If a fact is not present in the diff or already in the file, leave it alone.

## What NOT to do
- Do not edit any file outside `validation_rules.allowed_paths`.
- Do not rewrite the entire file when a small edit suffices.
- Do not remove the frontmatter or change `name`/`scope` fields.

## How to commit
Emit one JSON object to stdin of `aioson memory:reflect-commit`:

```json
{
  "files": {
    ".aioson/context/bootstrap/current-state.md": "<new full content>"
  }
}
```

Or write the JSON to a file and run:

```
aioson memory:reflect-commit . --agent=<your-agent> --output=<path-to-json>
```
