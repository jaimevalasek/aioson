---
description: "AIOSON Play auth, cloud owner token, local operator auth, Play Services, requires_services, dev-link, symlink installs, and smoke testing."
scope: "global"
agents: [dev, deyvin, architect, qa, tester, pentester]
task_types: [aioson-play-app, auth, service-integration, testing]
triggers: [aioson-auth, AIOSON_COM_TOKEN, requires_services, service.json, dev-link, Play Services, smoke test]
---

# Auth, Services, And Testing

## Auth systems

AIOSON Play has two different auth surfaces:

| Surface | Purpose | App receives |
|---|---|---|
| `aioson.com` cloud auth | Owner identity, trial, billing, license/status | `AIOSON_COM_TOKEN` |
| `aioson-auth` Play Service | Local operators, login, RBAC, permissions | service URL and binding id |

Do not mix them.

Use `aioson.com` when the app needs subscription/trial/license state.
Use `aioson-auth` when the app needs operators, roles, permissions, 2FA, or local RBAC.

## Cloud owner/trial auth

When the owner is logged into AIOSON Play, Play can inject:

```text
AIOSON_COM_TOKEN=<bearer token>
```

The app should read it on backend startup and persist it in local settings if needed. If absent, the app should fall back to manual login or a disconnected state.

Do not call `https://aioson.com` directly from browser code with this token. Use backend proxy routes.

Recommended backend proxy routes:

| App route | Purpose |
|---|---|
| `GET /api/aioson/connection` | Check local token state |
| `GET /api/aioson/status?projectId={id}` | Proxy app subscription/trial status |
| `POST /api/aioson/login` | Manual cloud login fallback |
| `DELETE /api/aioson/logout` | Clear local token |

Cloud endpoints the backend may call:

| Endpoint | Purpose |
|---|---|
| `POST /api/app-auth/token` | Manual token acquisition |
| `POST /api/apps/{slug}/install` | Idempotent install/trial registration |
| `GET /api/apps/{slug}/status?projectId={id}` | Subscription/trial status |

## Local operator auth and RBAC

For operator login and RBAC, depend on `aioson-auth`:

```json
{
  "requires_services": ["aioson-auth"],
  "auth": {
    "version": 1,
    "permissions": ["orders:read", "orders:create"],
    "policies": [
      { "id": "page:orders", "kind": "route", "path": "/orders", "requires": ["orders:read"] }
    ]
  }
}
```

`auth.permissions[]` is the app-owned permission catalog. Play syncs it through
the owner-only app inventory; `aioson-auth` registers it on the existing binding
so the admin can assign permissions to global roles. Do not rely on Auth scanning
app source code.

Use `@aioson/auth-sdk` as the client layer when available. Avoid handwritten calls to auth endpoints unless the SDK cannot cover the specific case.

Env vars Play injects for auth (only these exist):

```text
VITE_AIOSON_AUTH_URL=http://localhost:3001
VITE_AIOSON_AUTH_BINDING_ID=<binding-id>
```

Play injects only the `VITE_`-prefixed auth vars. There is no `AIOSON_AUTH_URL` or `AIOSON_AUTH_BINDING_ID` without the prefix — do not read those, they will be `undefined`. Backend Node code reads the same injected vars through `process.env.VITE_AIOSON_AUTH_URL` and `process.env.VITE_AIOSON_AUTH_BINDING_ID`; the `VITE_` prefix does not stop Node from reading them at runtime. The app slug is the only auth-relevant value injected in both forms: `AIOSON_APP_SLUG` and `VITE_AIOSON_APP_SLUG`.

Bearer header is preferred for auth calls:

```http
Authorization: Bearer <jwt>
```

Legacy `?token=` may still work in older paths, but new app code should prefer Bearer.

Current implemented auth expectations from the Play docs:

- JWT can include `binding_id` and `permissions`.
- App permissions are declared in `manifest.json` `auth.permissions[]` and implemented by the app with SDK gates.
- `/me/permissions` exists in `aioson-auth`.
- `@aioson/auth-sdk` MVP exists.
- Operator SSO token injection from Play keyring is planned in docs, not safe to rely on unless the local code confirms it.

## Owner bypass

Some flows allow owner-implicit behavior through the owner cloud identity. Do not use that as a replacement for operator RBAC when the app has real multi-user operator roles.

## Play Services

A Play Service is infrastructure, not an app webview.

Service shape:

```text
service/
  service.json
  package.json
  dist/
```

`service.json`:

```json
{
  "slug": "aioson-auth",
  "name": "AIOSON Auth",
  "version": "1.0.0",
  "description": "Servico de autenticacao para apps do AIOSON Play.",
  "port": 3001,
  "autostart": true,
  "dev_command": "node dist/server.js",
  "health_check": "/health"
}
```

Rules:

- Use ports in `3001-3099`.
- Read `process.env.PORT` in the service.
- Implement `GET /health`.
- Configure CORS for localhost app origins.
- Do not depend on Tauri APIs inside a Play Service.
- Build to `dist/` before publishing or local symlink service testing.

## Dev-link install

Use dev-link for active app development:

```text
AIOSON Play -> Instalar App -> Linkar pasta (dev) -> select app folder with manifest.json
```

Dev-link creates a symlink from Play's app data directory to the source folder. It allows fast iteration, but it is not a production publish validation.

Windows note: symlink creation normally needs Developer Mode enabled or elevated privileges.

When `manifest.json` changes during dev-link, stop and reopen the app in Play to force manifest reload.

## Local symlink layout

Common Play data locations:

```text
Windows: %LOCALAPPDATA%\com.aioson.play\
Linux:   ~/.local/share/com.aioson.play/
```

Inside:

```text
apps/{slug}/
services/{slug}/
```

For manual local testing, symlink app or service folders there. Prefer the Play UI dev-link flow when available.

## Testing an app

Standalone smoke:

```bash
PORT=3399 pnpm dev
curl http://localhost:3399/api/health
curl http://localhost:3399/api/aioson-play
```

Play smoke:

```text
1. Start AIOSON Play.
2. Dev-link the app folder.
3. Open the app from the Play shell.
4. Confirm badge/running state.
5. Confirm webview renders.
6. Confirm ProductBridge calls to :5180 work.
7. Confirm missing auth/bindings show clear degraded states.
```

Data binding smoke:

```bash
curl http://localhost:5180/api/registry
curl http://localhost:5180/api/connectors
curl http://localhost:5180/api/bindings/meu-app
```

Service smoke:

```bash
curl http://localhost:3001/health
```

## QA checklist

- [ ] `requires_services` matches actual service use.
- [ ] Apps using `aioson-auth` declare `auth.permissions[]` in `manifest.json`.
- [ ] Frontend and backend gates use `@aioson/auth-sdk` or a Bearer-compatible server check for those permissions.
- [ ] Missing service does not produce a confusing crash.
- [ ] `AIOSON_COM_TOKEN` is never exposed to frontend code.
- [ ] Operator auth uses SDK or Bearer-compatible client.
- [ ] `VITE_AIOSON_AUTH_BINDING_ID` absence is handled.
- [ ] Service uses `process.env.PORT`.
- [ ] Service has `/health`.
- [ ] App dev-link reload was tested after manifest changes.
- [ ] ProductBridge `:5180` endpoints are called only when Play is running or with a fallback/degraded path.

## Source docs

Canonical sources:

- `app-cloud-auth.md`
- `auth-integration-gaps.md`
- `play-service-protocol.md`
- `dev-link-install.md`
- `local-dev-testing.md`
- `platform-architecture.md`
