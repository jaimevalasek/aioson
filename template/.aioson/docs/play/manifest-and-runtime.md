---
description: "AIOSON Play app manifest, runtime, package manager, scripts, ports, endpoint declaration, split-stack, and compatibility contract."
scope: "global"
agents: [dev, deyvin, architect, qa, tester]
task_types: [aioson-play-app, runtime, manifest]
triggers: [manifest.json, Play runtime, PORT, pnpm, ProductBridge, /api/aioson-play, requires_services]
---

# Manifest And Runtime

## Manifest basics

`manifest.json` is the app identity and runtime contract for Play.

Minimum shape:

```json
{
  "slug": "meu-app",
  "name": "Meu App",
  "version": "0.1.0",
  "runtime": "vite",
  "has_api": true
}
```

Use stable lowercase slugs. The same slug is reused by Play registry, `VITE_AIOSON_APP_SLUG`, auth binding, cloud app status, package/update metadata, and data bindings.

## Runtime detection

Play can detect common Node stacks from `package.json`, but explicit manifest fields are allowed when autodetect is not enough.

Supported Node runtime families in current docs:

| Stack | Signal |
|---|---|
| Next.js | `next` dependency |
| Vite | `vite` dependency or devDependency |
| Generic Node | `scripts.dev` |

For Play drafts and AIOSON-authored app work, use `pnpm`:

- `pnpm install`
- `pnpm add <pkg>`
- `pnpm add -D <pkg>`
- canonical lockfile: `pnpm-lock.yaml`

Do not create or preserve `package-lock.json` or `yarn.lock` in Play draft work unless an existing non-Play app explicitly requires it.

## Scripts

`package.json` should provide a single Play entrypoint:

```json
{
  "scripts": {
    "dev": "node src/server.js",
    "start": "node dist/server.js"
  }
}
```

Rules:

- `dev` must work when Play injects `PORT`.
- `start` should work for published/build output when source is absent.
- Do not put fixed app ports in scripts.
- Do not run production build as the dev command.
- In Play drafts, do not fight the Play-injected cache env vars for Next/Vite/SWC.

## Ports

Reserved ranges:

| Range | Purpose |
|---|---|
| `3001-3099` | Play Services, fixed in `service.json` |
| `3100-3299` | Internal Play systems, do not use |
| `3300-3499` | Marketplace-installed apps |
| `3500-3999` | Draft/dev-link apps |
| `4000-4099` | External curated apps, compatibility range |
| `5173` | Vite dev default, not a Play app contract |
| `5180` | ProductBridge HTTP server |

Rule: the app reads its own port from env; it discovers other ports through ProductBridge or service env vars.

Generic Node server:

```js
const port = Number(process.env.PORT) || 3000;
app.listen(port, "0.0.0.0");
```

Split-stack backend:

```js
const port = Number(process.env.BACKEND_PORT) || 3301;
server.listen(port, "0.0.0.0");
```

## Split-stack apps

Use split-stack when the app has separate frontend and backend processes.

Manifest pattern:

```json
{
  "slug": "meu-app",
  "name": "Meu App",
  "version": "0.1.0",
  "stack": "split",
  "processes": {
    "frontend": { "port_env": "PORT", "framework": "vite" },
    "backend": { "port_env": "BACKEND_PORT", "framework": "node" }
  },
  "webview_target": "frontend"
}
```

Rules:

- `webview_target` must match a key under `processes`.
- The frontend port is for the Play webview.
- Browser code should call `/api` same-origin and let Vite/Next proxy to the backend.
- The backend should use `BACKEND_PORT`.
- Do not hardcode `BACKEND_PORT` in scripts.

## Next.js and Vite notes

For Next.js in Play drafts, include `allowedDevOrigins` with explicit loopback hosts. Next 16+ does not accept a wildcard for this case.

```ts
const nextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost", "::1", "0.0.0.0"]
};

export default nextConfig;
```

For Vite in Play drafts, prefer the current AIOSON Play draft convention: let Play pass the port through its spawn command and avoid declaring a fixed `server.port` unless the existing app contract explicitly uses env-driven split-stack config.

## ProductBridge

ProductBridge is fixed at:

```text
http://localhost:5180
```

In browser/frontend code:

```ts
const PLAY_URL = import.meta.env.VITE_AIOSON_PLAY_URL || "http://localhost:5180";
```

Useful endpoints:

| Endpoint | Purpose |
|---|---|
| `GET /api/registry` | Discover running apps and Play Services |
| `GET /api/connectors` | List Global Connectors |
| `GET /api/bindings/:app_slug` | List app bindings |
| `POST /api/bindings/:app_slug` | Bind connector to app slot |
| `POST /api/mcp/execute` | Execute connector by alias |

## Capability endpoint

If `has_api: true`, expose:

```text
GET /api/aioson-play
```

It declares identity, API base URL, endpoints, auth metadata, and events for Play, Bridge Apps, and LLM orchestration.

Minimum response shape:

```json
{
  "name": "Meu App",
  "slug": "meu-app",
  "version": "0.1.0",
  "api_base_url": "http://localhost:3399",
  "endpoints": [
    {
      "path": "/api/items",
      "method": "GET",
      "description": "Lista itens visiveis ao usuario",
      "params": [],
      "auth": false
    }
  ],
  "events": []
}
```

Only list endpoints that exist. The orchestrator may try to call what this endpoint advertises.

## Services dependency

When an app requires a Play Service:

```json
{
  "requires_services": ["aioson-auth"]
}
```

Play uses this to show onboarding requirements, check service install/runtime state, and block or degrade app launch when the required service is missing.

For apps that use `aioson-auth`, declare the RBAC catalog in the same manifest:

```json
{
  "requires_services": ["aioson-auth"],
  "auth": {
    "version": 1,
    "permissions": [
      "orders:read",
      { "name": "orders:create", "label": "Criar pedidos" }
    ],
    "policies": [
      { "id": "page:orders", "kind": "route", "path": "/orders", "requires": ["orders:read"] }
    ]
  }
}
```

`auth.permissions[]` is the source of truth for the permission catalog shown by
`aioson-auth`. The app still implements the actual route/API gates with the SDK;
the Auth dashboard assigns the declared permissions to global roles. Play/Auth do
not scan app source code to infer permissions.

## Publish compatibility

Publishable apps should declare compatibility:

```json
{
  "compatibility": {
    "min_play_version": "0.2.0",
    "min_runtime_version": "1.0.0",
    "max_runtime_version": "1.x",
    "sidecar_contract": "ndjson-v1",
    "schema_version": 1,
    "requires_migration": false
  }
}
```

If local data schema changes:

- Increment `schema_version`.
- Provide idempotent migrations where possible.
- Never delete user data as the default migration strategy.
- Use backup before destructive or risky migration.

## Source docs

Canonical sources:

- `ai-app-integration.md`
- `aioson-endpoint-protocol.md`
- `port-management.md`
- `software-update-compatibility.md`
- `.aioson/rules/aioson-play-conventions.md` in this repo
