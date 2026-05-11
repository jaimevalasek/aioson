---
description: "Autonomy Contract: 3-tier permission model that drives native harness permissions and the `aioson notify` UX. Load when implementing or debugging permissions, tier changes, or notify levels."
---

# Autonomy Contract — 3-tier permission model

> Living Memory uses **tiers** to declare *how* an action is allowed, not just whether. Each tool/harness derives its native allow-list from the tier(s) it can opt into.

Canonical config: `.aioson/config/autonomy-protocol.json` (schema v1.1+).
Generator: `src/permissions-generator.js`.
Visual notifier: `aioson notify --level=info|warn|block`.

## The three tiers

| Tier | Intent | UX | Examples |
|---|---|---|---|
| `tier1_silent`   | Read-only and telemetry. Auto-execute, no notification.                | none           | `git status`, `aioson preflight`, `aioson context:health`, `agent:done` |
| `tier2_notified` | Mutates AIOSON memory (`bootstrap/`, `features/`, `runtime/`). Auto-execute with **inline notify** (ℹ).         | `ℹ [topic] msg` | `memory:reflect-prepare`, `memory:reflect-commit`, `workflow:next`, `dossier:*` |
| `tier3_blocking` | Irreversible or external (publish, push, npm registry). **Never** auto-executed; the CLI returns exit 2 and waits for a human. | `⛔ [topic] msg` | `git push *`, `npm publish *`, `cloud:publish:*`, `genome:publish` |

A tool opts into tiers via `derived_from_tiers`:

```json
"claude": {
  "mode": "trusted",
  "derived_from_tiers": ["tier1_silent", "tier2_notified"],
  "requires_tty": false
}
```

**Hard invariant:** `tier3_blocking` is *never* materialized into a tool's native allow-list, even when listed in `derived_from_tiers`. Tier3 always requires explicit human action.

## How the four harnesses receive it

`aioson update` (or `aioson setup`) calls `permissions-generator` after copying the template. It reads the protocol and writes:

| Harness | File | Format | Merge behaviour |
|---|---|---|---|
| Claude Code | `.claude/settings.json` | JSON (`permissions.allow[]`) | Merges with existing user entries (preserves customizations) |
| Codex CLI | `.codex/permissions.json` | JSON | Overwrites (with backup) |
| Gemini CLI | `.gemini/permissions.toml` | TOML | Overwrites (with backup) |
| OpenCode | `.opencode/permissions.yaml` | YAML | Overwrites (with backup) |

Previous versions are backed up under `.aioson/backups/{timestamp}/permissions/`.

## How agents use `notify`

Three levels, three prefixes, two exit codes:

```bash
aioson notify . --level=info  --topic=memory   --message="Updating bootstrap after src/routes/* change"
aioson notify . --level=warn  --topic=bootstrap --message="Bootstrap stale 35 days — recommend /discover"
aioson notify . --level=block --topic=git      --message="Push manual: git push origin main"
```

Internally `notify` calls `runtime:emit` (records in SQLite as event_type `notify_<level>`) and prints the prefixed line. `--level=block` sets `process.exitCode = 2` — callers can detect a halt without parsing output.

## Where each piece lives

- Engine that decides if reflection should fire: `src/memory-reflect-engine.js`
- Notify renderer (pure): `src/notify-renderer.js`
- Notify command: `src/commands/notify.js`
- Generator: `src/permissions-generator.js`
- Hook into install/update: `src/installer.js#installTemplate` (best-effort)
- Hook into completion: `src/commands/workflow-next.js` (after `--complete=<agent>`)
- Hook into direct mode: `src/commands/runtime.js#runAgentDone`

## Backward compatibility

- Projects with `autonomy-protocol.json` v1.0 continue to work — generator falls back to legacy `shell_whitelist` / `aioson_whitelist`.
- Projects without `.aioson/context/bootstrap/` get a warning at agent Step 0 but are never blocked.
- Tools without `derived_from_tiers` (legacy) use their per-tool whitelist directly.

## Adding a new command to a tier

1. Edit `template/.aioson/config/autonomy-protocol.json` and add the command under the appropriate `tiers.{tier}.aioson_commands`.
2. Run `aioson update .` in any consuming project — generator regenerates the four native files.
3. Update tests in `tests/permissions-generator.test.js` if the command should appear in / be excluded from the generated output.

Never add to `tier3_blocking` for "convenience" — that tier is the safety boundary. If a command needs to be auto-approved, it belongs in tier1 or tier2.
