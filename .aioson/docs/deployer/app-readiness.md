---
description: "Readiness checklist an application must pass before its first Dokploy deploy — image shape, build-time vs runtime variables, listen address, ports, volumes, migrations, health route, process manager, client IP behind Traefik, secrets out of the image."
agents: [deployer, dev]
task_types: [deployment-readiness, dockerfile-review]
triggers: [dokploy, deploy to dokploy, dokploy readiness, dockerfile for dokploy, vps deploy readiness]
---

# Deployer — App Readiness for Dokploy

Run this before the first deploy of an application. Each item is a question the
repository answers; a "no" is a gap routed to `@dev` (Simple Plan) with the exact
file and expected behavior. `@deployer` never edits these files itself.

## 1. Image shape

| Question | Good answer |
|---|---|
| One image or several services? | A single `Dockerfile` at the root when the app is one deployable unit; `docker-compose.yml` only when services must ship together. Databases and caches run as Dokploy database services, not inside the app image. |
| Several processes in one container (API + worker + watchdog)? | Allowed when they talk over `127.0.0.1`; run them under a process manager (e.g. `pm2-runtime`) with `tini` (or equivalent) as PID 1 so SIGTERM reaches them. |
| Does the start command apply migrations? | Yes, idempotently (e.g. `prisma migrate deploy && exec <process manager>`): a deploy must never require a manual migration step. |
| Healthcheck in the image? | Optional. Leave it out when operators stop processes inside the container on purpose (a failing healthcheck would replace the container mid-operation). |
| Runs as non-root? | `USER` set after the build steps; data folders created and `chown`ed before switching. |

## 2. Variables: build time vs runtime

- **Build-time** values are baked into the bundle (front-end `VITE_*`, `NEXT_PUBLIC_*`, etc.). They are declared as `ARG` in the Dockerfile and go into Dokploy **Environment → Build-time Arguments**. They are public by nature; Docker warns `SecretsUsedInArgOrEnv` for any name containing `KEY` — harmless for public keys, a real problem for secrets.
- **Runtime** values (database URL, cache URL, signing secrets, master keys, SMTP, OAuth secrets) go into **Environment → Environment Settings**. They change only on the next deploy.
- **Create Environment File** off: when on, Dokploy writes a `.env` with every secret into the build context. The `.dockerignore` must exclude `.env`, `.env.*`, `*.env` regardless.
- `.env.example` documents every runtime variable with a comment; the image defaults (`HOST`, `PORT`, storage paths) are set with `ENV` in the Dockerfile so the operator does not have to.
- Variables that must never reach production (test database URLs, seed flags) are named in the readiness report so the operator never pastes them.

## 3. Network

- The server listens on `0.0.0.0` (Traefik reaches it from another container). A default of `127.0.0.1` makes the domain return 502.
- `EXPOSE` the internal port; **publish no ports** in Dokploy (Advanced → Ports stays "No ports configured"). Traefik routes the domain to the container port.
- **Client IP:** behind Traefik every request arrives from the Docker network. If the app rate-limits or audits by IP, it must trust `X-Forwarded-For` only from a configurable proxy list (e.g. `TRUSTED_PROXIES=10.0.0.0/8`, plus Cloudflare ranges when the orange-cloud proxy is on) and read the right-most untrusted hop. Without it, all users share one rate-limit bucket.
- **WebSocket** works through Traefik without extra configuration.
- **Request duration:** Traefik's default `readTimeout` is 60 s; large uploads on slow links need `transport.respondingTimeouts.readTimeout` raised on the `websecure` entryPoint.
- **Tokens in query strings** (WebSocket `?access_token=`, webhook `?k=`): never enable Traefik's access log ("Requests") — it records full URLs.

## 4. Data

- Every path the app writes and must keep (uploads, reports) lives under one folder mounted as a Dokploy **Volume Mount** (e.g. `/data`). Without it, files vanish on the next deploy.
- Database user expectations: if migrations grant to a specific role (e.g. `postgres`), the database service must be created with that user.
- PostgreSQL extensions the migrations need ship with the official image? List them.

## 5. Operations hooks

- A health route (e.g. `/api/health`) that reports database and cache status and the process uptime — the outside check for "did the redeploy happen?".
- Logs to stdout/stderr with a per-process prefix; Dokploy shows them in **Logs**.
- Alerts (watchdog, uptime monitor) configured by environment, with a test command.

## 6. Readiness report

Summarize in the diary as a table: item · status (ok / gap / n/a) · evidence (file:line) ·
route (`@dev` Simple Plan when a gap). Deploy only when no gap blocks the stage map.
