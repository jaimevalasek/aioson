---
description: "How AIOSON agents should decide when and how to apply AIOSON Play app compatibility docs during product, architecture, implementation, QA, and review work."
scope: "global"
agents: [dev, deyvin, architect, analyst, qa, tester, product, sheldon]
task_types: [aioson-play-app, app-compatibility, integration]
triggers: [AIOSON Play, Play app, Play-compatible app, Play integrations, ProductBridge, data_bindings]
---

# Agent Usage Guide

## Trigger phrases

Load this folder when the user mentions:

- "AIOSON Play"
- "play"
- "draft"
- "app compativel com o Play"
- "runtime do Play"
- "instalar no Play"
- "marketplace do Play"
- "Global Connector"
- "Data Binding"
- "MCPI"
- "ProductBridge"
- `manifest.json` for Play apps
- `app-config.yaml`
- `requires_services`
- `auth.permissions`
- `/api/aioson-play`

Do not load it for generic web apps unless the user connects the app to Play.

## First decision

Before coding, classify the work:

| User intent | Agent behavior |
|---|---|
| New app for Play | Use all docs in this folder. Start from `app-compatibility-guide.md`. |
| Existing app should become Play-compatible | Audit `manifest.json`, scripts, port usage, `app-config.yaml`, auth and test path. |
| App only needs Play data connectors | Load `llm-data-and-bindings.md`; do not redesign auth/runtime. |
| App only needs Play auth | Load `auth-services-and-testing.md`; do not add data bindings unless needed. |
| App only runs as standalone | Do not apply Play constraints unless user asks. |
| Play runtime itself is being changed | Read canonical docs in `C:\dev\aioson-play\.aioson\docs\integrations\` if available. |

## Four questions before implementation

For a Play-targeted app, answer these before creating files:

1. Does the app have a visual UI?
   - Yes: it needs a webview-facing process, usually Vite/Next or split-stack.
   - No: it may be a CLI/sidecar-style app.

2. Does the app expose an HTTP API?
   - Yes: `manifest.json` needs `has_api: true`, the app must read `PORT`, and it should expose `GET /api/aioson-play`.
   - No: skip `/api/aioson-play` unless another Play feature requires endpoint discovery.

3. Does the app need external domain data?
   - Yes: declare `data_bindings` in `app-config.yaml` and consume Global Connectors through ProductBridge.
   - No: do not create connector UI or fake bindings.

4. Does the app need users/operators?
   - Owner/trial/billing: use `AIOSON_COM_TOKEN` and backend proxy routes.
   - Local operators/RBAC: use `aioson-auth` as Play Service, declare `manifest.json` `auth.permissions[]`, and use `@aioson/auth-sdk`.
   - No auth: do not add login just because it is a Play app.

## Source priority

Use this priority order:

1. Project rule `.aioson/rules/aioson-play-conventions.md` for AIOSON-authored Play drafts.
2. These `.aioson/docs/play/` docs for AIOSON agents implementing apps.
3. Canonical Play docs in `C:\dev\aioson-play\.aioson\docs\integrations\` for exact or current runtime contracts.
4. Existing app code patterns, only when they do not violate the above.

## What agents must not infer

- Do not infer fixed app ports.
- Do not invent env vars.
- Do not expose Database Connection creation inside the app UI.
- Do not put provider API keys in `llm-chain.json`, `tools.json`, manifest, app docs, or frontend code.
- Do not make browser code call `https://aioson.com` directly with a token.
- Do not treat `aioson-auth` and `aioson.com` auth as the same system.
- Do not create app permissions only in the Auth dashboard. For Play apps, the app declares the permission catalog in `manifest.json` `auth.permissions[]`; the dashboard assigns those permissions to roles.
- Do not ask Auth or Play to scan source code for policies/permissions.
- Do not add `@tauri-apps/api` to Play Services. Services are standalone background processes.
- Do not assume SSO operator token injection is implemented unless the canonical Play docs and code confirm it.

## Expected agent output

For implementation, produce or verify:

- `manifest.json`
- `package.json` scripts that work under Play spawn
- `app-config.yaml` when the app has database config or data bindings
- `/api/aioson-play` when `has_api: true`
- Lazy LLM client initialization when the app uses LLM providers
- Degraded state when required bindings are absent
- `manifest.json` `auth.permissions[]` when the app uses `aioson-auth`
- Frontend/backend permission gates implemented with `@aioson/auth-sdk`
- Local smoke steps through dev-link or standalone `PORT=...` run

For QA, verify:

- No hardcoded Play-managed port
- No invented `VITE_AIOSON_*` env var
- No secret in frontend or package artifact
- Data bindings use alias names that match `app-config.yaml`
- Auth path uses the right system: `aioson-auth` for operators, `aioson.com` for owner/trial
- Apps using `aioson-auth` declare permissions in `manifest.json`, and those declared permissions match implemented route/API gates.
- `manifest.compatibility` exists for publishable apps
