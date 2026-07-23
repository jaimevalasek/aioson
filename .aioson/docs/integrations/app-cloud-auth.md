# App Cloud Auth — Developer Guide

Apps running inside **AIOSON Play** can receive an aioson.com API token
automatically at startup, without asking the user to log in again inside the app UI.

This document explains how to consume that token in your app.

---

## How it works

When the user has connected their aioson.com account in the AIOSON Play Settings,
the token is stored in the OS keyring. Every time an app is launched, AIOSON Play
injects the token as the environment variable:

```
AIOSON_COM_TOKEN=<bearer token>
```

Your app reads this at startup, stores it locally, and uses it to:
- Authenticate calls to `https://aioson.com/api/apps/{slug}/status`
- Register the installation (starts the 14-day free trial on first run)

---

## Reading the injected token (Node / Express)

Add this near the very top of your server startup, before routes are registered:

```typescript
import { settingRepository } from './repositories/SettingRepository';

async function applyInjectedCloudToken() {
  const injected = process.env.AIOSON_COM_TOKEN;
  if (!injected) return;
  const existing = await settingRepository.getValue('aioson_com_token');
  if (existing === injected) return;
  await settingRepository.setMany([
    { key: 'aioson_com_token', value: injected, category: 'aioson' },
  ]);
}

// Call inside startServer():
await applyInjectedCloudToken();
```

If `AIOSON_COM_TOKEN` is absent (user not logged in, or running outside AIOSON Play),
the function is a no-op and the app falls back to manual login via its own UI.

---

## Proxy pattern (recommended)

Do **not** call `https://aioson.com` directly from the browser — that triggers
CORS issues and exposes the token to the frontend.

Instead, expose proxy routes in your Express server:

| Route | Proxies to |
|-------|-----------|
| `GET /api/aioson/connection` | local — checks if token is stored |
| `GET /api/aioson/status?projectId={id}` | `https://aioson.com/api/apps/{slug}/status` |
| `POST /api/aioson/login` | `https://aioson.com/api/app-auth/token` |
| `DELETE /api/aioson/logout` | clears local token |

The `atendimento` app implements all four via `AiosonCloudController` —
see `src/api/controllers/AiosonCloudController.ts` as a reference implementation.

---

## aioson.com API endpoints your app will call

### `POST /api/app-auth/token`

Used for manual login (when `AIOSON_COM_TOKEN` is not injected).

```
Body:  { email, password, appSlug }
Reply: { ok: boolean, token?: string, userId?: string, error?: string }
```

CORS: `Access-Control-Allow-Origin: *` (safe to call from any localhost port).

### `POST /api/apps/{slug}/install`

Idempotent — registers the installation and starts the 14-day trial.
Call once after obtaining a token (login or injection).

```
Header: Authorization: Bearer <token>
Body:   { projectId }
Reply:  { ok: boolean }
```

### `GET /api/apps/{slug}/status?projectId={id}`

Poll this to know the subscription state.

```
Header: Authorization: Bearer <token>
Reply:
{
  status:            'not_installed' | 'trialing' | 'trial_expired' | 'active' | 'past_due' | 'canceled',
  trialEndsAt?:      string (ISO 8601),
  periodEnd?:        string (ISO 8601),
  daysLeft?:         number,
  cancelAtPeriodEnd?: boolean
}
```

A `401` response means the token has expired or been revoked — clear the local
token and show the login form.

---

## Token storage key

The local token is stored in your SQLite `settings` table with these values:

| key | category |
|-----|---------|
| `aioson_com_token` | `aioson` |

Read it with `settingRepository.getValue('aioson_com_token')`.

---

## Fallback: manual login UI

If no token is injected (running standalone, outside AIOSON Play, or user not
logged in), your AIOSON Play settings tab should render a login form that calls
`POST /api/aioson/login` with the user's credentials.

The `atendimento` dashboard implements this in `dashboard/src/App.tsx`
(search for `cloudConnected` state).

---

## Slug reference

Your app must use a stable, lowercase slug with no spaces. Register it in
aioson.com by creating a `ServiceApp` record. The `atendimento` slug is
`"atendimento"`.

Use the same slug in:
- `AIOSON_PLAY_SLUG` env var (exported from your app's manifest)
- `appSlug` field in `/api/app-auth/token` requests
- URL path segment in `/api/apps/{slug}/install` and `/api/apps/{slug}/status`
