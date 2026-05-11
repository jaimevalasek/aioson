# Reflect prompt — `bootstrap/what-it-does.md`

The session touched product contracts (PRDs, features.md, requirements). Refresh `bootstrap/what-it-does.md` so the list of features and business rules is current.

## What to do
1. Read the current content of `.aioson/context/bootstrap/what-it-does.md` (also in `current_bootstrap_snapshot["what-it-does.md"]`).
2. Inspect `changed_files` for `prd-*.md`, `features.md`, `requirements-*.md`.
3. Update the file:
   - **Add** newly accepted features and business rules.
   - **Remove** items now marked `done` and superseded, or features dropped from scope.
   - **Reword** only when a rule's meaning materially changed.
   - **Preserve** frontmatter; bump `generated_at`.
4. Keep entries action-oriented and verifiable. One bullet per feature.

## What NOT to do
- Do not mix in implementation details (those belong in `how-it-works.md`).
- Do not edit files outside `validation_rules.allowed_paths`.
- Do not invent features that are not in the diff or already in the file.

## How to commit
Same protocol as the other reflect prompts: emit `{ "files": { ... } }` to `aioson memory:reflect-commit`.
