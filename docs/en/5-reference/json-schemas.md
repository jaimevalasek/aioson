# JSON Schemas

AIOSON exposes machine-readable JSON output on selected commands.

This folder provides formal schemas for automation:
- `docs/en/schemas/index.json`
- `docs/en/schemas/*.schema.json`

## Commands covered
- `aioson init <project-name> --json`
- `aioson install [path] --json`
- `aioson update [path] --json`
- `aioson info --json`
- `aioson agents [path] --json`
- `aioson agent:prompt <agent> [path] --json`
- `aioson locale:apply [path] --json`
- `aioson setup:context [path] --defaults --json`
- `aioson i18n:add <locale> --dry-run --json`
- `aioson doctor --json`
- `aioson context:validate --json`
- `aioson test:smoke --json`
- `aioson mcp:init --json`
- `aioson mcp:doctor --json`
- `aioson test:package --json`
- `aioson workflow:plan --json`
- `aioson parallel:init --json`
- `aioson parallel:assign --json`
- `aioson parallel:status --json`
- `aioson parallel:doctor --json`
- Generic CLI JSON errors (`unknown_command`, `command_error`)

## Compatibility policy
- Keys listed in each schema `required` array are stable for automation.
- New optional keys may be added in future releases.
- Removing or renaming required keys is a breaking change and must be called out in release notes.

## Suggested validation flow
1. Load schema from `docs/en/schemas/index.json`.
2. Validate command output against the corresponding schema.
3. Treat missing required keys as contract breakage.
4. Ignore unknown keys unless your integration explicitly disallows them.
