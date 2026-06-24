---
description: "Operational checklist and implementation path for making an app compatible with AIOSON Play."
scope: "global"
agents: [dev, deyvin, architect, analyst, qa, tester, product, sheldon]
task_types: [aioson-play-app, app-compatibility, implementation]
triggers: [AIOSON Play, compatible app, app manifest, /api/aioson-play, Play draft, Play install]
---

# App Compatibility Guide

## Mental model

An AIOSON Play app is a child process managed by Play. It can be a frontend, backend, split-stack app, CLI/sidecar app, or app with Play Services. Play owns process launch, ports, registry, installed app lifecycle, and shared integration surfaces.

The app owns its domain behavior, UI, operational database, migrations, API routes, and degraded mode.

## Minimum app contract

Every Play-compatible app should have:

```text
app/
  manifest.json
  package.json
  app-config.yaml       # when it has database config or data bindings
```

If `has_api: true`, also expose:

```text
GET /api/aioson-play
GET /api/health         # strongly recommended for debug/loading states
```

If the app has a UI, the Play webview must be able to load the UI from the process selected by the manifest.

## Required behavior

- Read `process.env.PORT` for the main Play-managed process.
- In split-stack, read the configured env names such as `PORT` and `BACKEND_PORT`.
- Keep browser-facing calls same-origin where possible. For split Vite apps, proxy `/api` and websocket routes through the frontend dev server instead of calling the backend port directly from browser code.
- Use `http://localhost:5180` or `VITE_AIOSON_PLAY_URL` for ProductBridge calls.
- Use `GET /api/registry` when discovering other apps or services dynamically.
- Use `requires_services` for Play Service dependencies.
- If the app uses `aioson-auth`, declare the permission catalog in `manifest.json` `auth.permissions[]` and implement matching gates in the app with `@aioson/auth-sdk`.
- Keep app-local operational DB separate from Play Global Connectors.
- Fail clearly or degrade gracefully when optional Play integrations are absent.

## Do not do

- Do not hardcode app runtime ports.
- Do not assume `localhost:3000`, `5173`, `3301`, or any other port is stable for this app.
- Do not use `npm install` in Play drafts. Use `pnpm` per the AIOSON Play draft convention.
- Do not create a UI inside the app for creating global Database Connections or Data Connectors. Those live in Play Settings.
- Do not put LLM provider secrets in files shipped with the app.
- Do not call cloud APIs from browser code with `AIOSON_COM_TOKEN`.
- Do not rely on Auth/Play scanning source code to discover permissions.
- Do not create app permissions only in the Auth dashboard for manifest-driven Play apps.

## Implementation sequence

1. Add or audit `manifest.json`.
2. Add or audit `package.json` scripts.
3. Make every server listen on Play-injected env ports.
4. Add `GET /api/aioson-play` if the app exposes API capabilities.
5. Add `app-config.yaml` for operational DB defaults and/or `data_bindings`.
6. Add Play auth only if the app needs it; include `requires_services: ["aioson-auth"]`, `auth.permissions[]`, and SDK gates.
7. Add local smoke tests and dev-link run instructions.

## Ready-for-Play checklist

- [ ] `manifest.json` has stable `slug`, `name`, `version`.
- [ ] Runtime fields match actual stack.
- [ ] `has_api` matches reality.
- [ ] `package.json` has a Play-compatible `dev` script.
- [ ] No app code hardcodes a Play-managed port.
- [ ] `GET /api/aioson-play` returns existing endpoints only.
- [ ] `app-config.yaml` declares `data_bindings` if the app needs external domain data.
- [ ] `app-config.yaml` declares `database.default_url` and `supported_drivers` if the app owns an operational DB.
- [ ] App handles missing bindings with degraded UI or a clear blocking state.
- [ ] LLM clients are lazy-initialized and read credentials from app config or injected env vars.
- [ ] Auth uses the correct path: `aioson-auth` for operators/RBAC, `aioson.com` for owner/trial/billing.
- [ ] Apps using `aioson-auth` declare `manifest.json` `auth.permissions[]`.
- [ ] Declared permissions match frontend/backend gates implemented by the app.
- [ ] Publishable apps declare `manifest.compatibility`.
- [ ] Dev-link smoke was run inside Play or the app was manually started with a test `PORT`.

## Smoke commands

For an API app, run a standalone smoke before dev-link:

```bash
PORT=3399 pnpm dev
curl http://localhost:3399/api/aioson-play
curl http://localhost:3399/api/health
```

On Windows PowerShell:

```powershell
$env:PORT = "3399"
pnpm dev
```

Then install through Play:

```text
AIOSON Play -> Instalar App -> Linkar pasta (dev) -> select app folder
```

Validate:

- App appears with DEV badge.
- Webview renders.
- API endpoint responds.
- ProductBridge calls to `http://localhost:5180` work when Play is running.
- Missing connectors/auth produce clear degraded states.
