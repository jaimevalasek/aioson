---
description: "Entry point for AIOSON agents implementing apps compatible with AIOSON Play runtime, integrations, data bindings, LLM connections, auth, services, ports, and local testing."
scope: "global"
agents: [dev, deyvin, architect, analyst, qa, tester, product, sheldon]
task_types: [aioson-play-app, app-compatibility, integration]
triggers: [AIOSON Play, Play runtime, app compatible with Play, Play integrations, data bindings, ProductBridge]
---

# AIOSON Play App Compatibility

Use this folder when the user says the app will run inside AIOSON Play, will be installed by AIOSON Play, is being built in a Play draft, or must consume Play integrations.

These docs are an AIOSON-side operational layer. They do not replace the canonical Play contracts in:

```text
C:\dev\aioson-play\.aioson\docs\integrations\
```

If that source repo exists and the task touches a precise Play contract, read the canonical doc listed in `source-map.md`. If it is not available, this folder is the stable fallback for agents.

## Installed Play docs are not a harness contract

Do not assume a harness working in a random app project can access docs embedded in a user's installed AIOSON Play. A desktop install may package resources differently, may not expose `.aioson/docs/integrations/` as a normal source path, and the harness may be running in another cwd.

For AIOSON agents, the stable contract is:

1. Load this folder when the task is Play-targeted.
2. Use `source-map.md` to know which canonical Play document owns each topic.
3. Only read `C:\dev\aioson-play\.aioson\docs\integrations\...` when the repo is locally available and exact contract detail matters.

## Loading order

For implementation:

1. `agent-usage-guide.md`
2. `app-compatibility-guide.md`
3. `manifest-and-runtime.md`
4. `llm-data-and-bindings.md` if the app touches LLM, app DB, external data, Global Connectors, MCPI, REST connectors, MCP tools, or `app-config.yaml`
5. `auth-services-and-testing.md` if the app touches auth, billing/trial, Play Services, dev-link, local installation, or smoke testing
6. `source-map.md` when a canonical source must be checked

For QA/review:

1. `app-compatibility-guide.md`
2. `manifest-and-runtime.md`
3. Topic-specific docs for touched surfaces

## Core rule

AIOSON can build any kind of app. Apply this Play compatibility layer only when the user explicitly or clearly targets AIOSON Play.

## Covered surfaces

- App identity and `manifest.json`
- Runtime selection, scripts, `pnpm`, Next.js, Vite, Node, split-stack processes
- Dynamic ports and ProductBridge at `http://localhost:5180`
- `GET /api/aioson-play` capability declaration
- LLM connections and fallback chain expectations
- App operational database via `DATABASE_URL`
- Data Bindings and Global Connectors via `app-config.yaml`
- MCPI/API/MCP connector execution through the Play registry
- Local operator auth via `aioson-auth` and `@aioson/auth-sdk`
- App-owned RBAC catalog via `manifest.json` `auth.permissions[]`
- Cloud owner/trial auth via `AIOSON_COM_TOKEN`
- Play Services via `service.json` and `requires_services`
- Dev-link and local smoke testing

## Non-goals

- Do not copy the whole Play integration directory into app projects.
- Do not make apps depend on source-repo-only files from `aioson-play`.
- Do not invent Play env vars, port ranges, manifest fields, or connector APIs.
- Do not infer app permissions by scanning source code; Play apps declare the catalog in `manifest.json` `auth.permissions[]`.
- Do not treat `llm-chain.json` or `aioson-models.json` in the app cwd as the primary credential contract for installed apps.
