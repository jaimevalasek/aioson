---
description: "Map from AIOSON Play app compatibility topics to canonical source docs in the aioson-play repository."
scope: "global"
agents: [dev, deyvin, architect, analyst, qa, tester, product, sheldon, pentester]
task_types: [aioson-play-app, source-map, integration]
triggers: [AIOSON Play source docs, canonical Play docs, integration docs, ProductBridge, data bindings]
---

# Source Map

Canonical source directory:

```text
C:\dev\aioson-play\.aioson\docs\integrations\
```

This AIOSON folder is a curated operational layer. When exact Play runtime behavior matters and the source repo is present, read the canonical file below.

## Entry points

| Need | Canonical doc |
|---|---|
| Build or modify a Play-compatible app | `ai-app-integration.md` |
| Cross-cutting Play/platform fix | `platform-architecture.md` |
| Auth roadmap/gaps and delivered slices | `auth-integration-gaps.md` |

## Topic map

| Topic | Canonical doc |
|---|---|
| App developer overview | `aioson-app-developer-guide.md` |
| `/api/aioson-play` capability endpoint | `aioson-endpoint-protocol.md` |
| ProductBridge and port registry | `port-management.md` |
| Play Services and `service.json` | `play-service-protocol.md` |
| Cloud owner/trial auth | `app-cloud-auth.md` |
| Data Bindings and Global Connectors | `app-data-bindings.md` |
| App operational database choice | `app-database-choice.md` |
| External systems, MCPI/API/MCP connector manual | `integration-manual.md` |
| Dev-link install | `dev-link-install.md` |
| Local symlink testing | `local-dev-testing.md` |
| App update and compatibility fields | `software-update-compatibility.md` |
| Atendimento reference integration | `atendimento-squad-integration.md` |
| Farmacia implementation review | `farmacia-implementation-review.md` |

## Current source docs observed

As of 2026-06-23, the Play integration source directory contains:

```text
ai-app-integration.md
aioson-app-developer-guide.md
aioson-endpoint-protocol.md
app-cloud-auth.md
app-data-bindings.md
app-database-choice.md
atendimento-squad-integration.md
auth-integration-gaps.md
dev-link-install.md
farmacia-implementation-review.md
integration-manual.md
local-dev-testing.md
platform-architecture.md
play-service-protocol.md
port-management.md
README.md
software-update-compatibility.md
```

## Embedded contract stamped into apps

Play stamps a canonical contract directly into each app, between
`AIOSON-PLAY-CONTRACT:START` / `AIOSON-PLAY-CONTRACT:END` markers. Source:

```text
C:\dev\aioson-play\src-tauri\src\resources\play_app_contract.md
```

This is the most authoritative single-file contract for an installed app. It carries:

- The closed whitelist of env vars Play injects at spawn, including `AIOSON_APP_DIR` (absolute app dir) and the auth vars in `VITE_`-only form.
- `.aioson/preview.json` — written by Play at runtime with `{ running, url, port }`; read it on demand to learn the live preview URL/port instead of guessing.
- The "ready-for-Play" gate the app must pass before being declared done.

When an app project already contains this stamped block, treat it as primary and do not contradict it. The docs in this folder are the AIOSON-side fallback when the stamped contract or the `aioson-play` repo is not available.

## Known priority notes

- `.aioson/rules/aioson-play-conventions.md` in this AIOSON repo overrides older examples when working inside Play drafts, especially package manager and draft runtime behavior.
- Older Play docs may show `npm` examples. In AIOSON-authored Play draft work, use `pnpm`.
- Some canonical docs describe planned behavior. Check wording before implementing: "planejado", "futuro", "pendente", or "nao implementado" means do not rely on it as shipped runtime behavior.
- If a canonical doc and local Play source code disagree, inspect code and update the canonical Play doc before relying on the changed behavior.

## Suggested human-facing Play Guide page

If AIOSON Play exposes a "Guia" tab for human users, it should not dump these agent docs. It should present a short human path:

1. Create an app folder with `manifest.json`.
2. Use `pnpm`.
3. Make the app read `PORT`.
4. Add `app-config.yaml` only when using database config or data sources.
5. Link the folder through "Instalar App -> Linkar pasta (dev)".
6. Test inside the Play webview.

The detailed implementation contract should remain here for AIOSON agents and in the canonical `aioson-play` integration docs.
