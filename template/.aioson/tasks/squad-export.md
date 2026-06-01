# Task: Squad Export

> Package a squad for reuse in another project.

## When To Use
- `@squad export <slug>`

## Process

1. Validate the squad.
2. If invalid, abort with a correction suggestion.
3. Collect all package files:
   - `.aioson/squads/<slug>/` (everything)
   - Do not include `output/`, `aioson-logs/`, or `media/`; these are session data.
4. Generate archive: `.aioson/squads/exports/<slug>.aios-squad.tar.gz`
5. Include `import-instructions.md` in the archive.

## Output
- Portable `.tar.gz` file
- Import instructions in chat
