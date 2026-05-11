# Reflect prompt — `bootstrap/how-it-works.md`

The session touched architecture, routes, models, or migrations. Refresh `bootstrap/how-it-works.md` so it stays faithful to the new shape of the system.

## What to do
1. Read the current content of `.aioson/context/bootstrap/how-it-works.md` (also in `current_bootstrap_snapshot["how-it-works.md"]`).
2. Inspect `changed_files` and the diff. Focus on:
   - new modules / handlers / controllers
   - new tables / models / migrations
   - data-flow changes implied by them
3. Update the file:
   - **Add** the new architectural piece in the appropriate section.
   - **Remove** entries that were superseded by the refactor.
   - **Preserve** frontmatter; bump `generated_at`.
4. Keep the writing concrete and short. Each line should be verifiable against code.

## What NOT to do
- Do not paraphrase the diff line by line. Summarize the *shape*, not the changes.
- Do not edit files outside `validation_rules.allowed_paths`.
- Do not drift into product talk — that belongs in `what-it-does.md`.

## How to commit
Same protocol as the other reflect prompts: emit `{ "files": { ... } }` to `aioson memory:reflect-commit`.
