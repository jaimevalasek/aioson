# MCP Guide

AIOSON provides lightweight MCP planning and validation for multi-tool usage.

## Commands

### `mcp:init`
Generate a local MCP plan and tool presets:

```bash
aioson mcp:init
aioson mcp:init --dry-run
aioson mcp:init --tool=codex
```

Outputs:
- `.aioson/mcp/servers.local.json`
- `.aioson/mcp/presets/<tool>.json`

Preset strategy:
- Context7 and Database presets are generated in a remote-endpoint mode using `mcp-remote`.
- This removes generic `<...>` placeholders and gives executable command templates.

### `mcp:doctor`
Validate MCP readiness:

```bash
aioson mcp:doctor
aioson mcp:doctor --strict-env
aioson mcp:doctor --json
```

Checks include:
- `servers.local.json` existence and JSON validity
- Core server baseline (`filesystem`, `context7`)
- Preset coverage (`claude`, `codex`, `gemini`, `opencode`)
- Required environment variables from enabled servers
- Context compatibility for database and Web3 (`chain-rpc`)

## Strict environment mode
- Default mode reports missing env vars as warnings.
- `--strict-env` upgrades missing env vars to failures.

Use strict mode in CI when you want runtime-ready MCP validation gates.

## Required environment variables (common)
- `CONTEXT7_MCP_URL` for Context7 endpoint
- `DATABASE_MCP_URL` when database MCP is enabled by project stack
- `RPC_URL`, `CHAIN_ID`, `PRIVATE_KEY` for Web3 `chain-rpc` profile

Example:

```bash
export CONTEXT7_MCP_URL="https://your-context7-endpoint"
export DATABASE_MCP_URL="https://your-database-mcp-endpoint"
```
