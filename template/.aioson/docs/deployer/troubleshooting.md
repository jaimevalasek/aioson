---
description: "Dokploy deployment troubleshooting — symptom, cause and fix for clone, build, container, Redis, PostgreSQL, Traefik certificate, panel and firewall failures, plus the outside verification commands (DNS, TLS, HTTP health, TCP ports)."
agents: [deployer]
task_types: [deployment-troubleshooting, deployment-verification]
triggers: [dokploy error, traefik default cert, permission denied publickey, key is invalid, deploy failed, outside verification]
---

# Deployer — Troubleshooting and Outside Verification

Read the named log before proposing a fix. Placeholders: `<host>`, `<vps-ip>`,
`<appName>`, `<health-path>`.

## 1. Outside verification (run from the operator's or agent's machine)

```bash
# DNS — public resolvers and the authoritative name server
nslookup <host> 1.1.1.1
nslookup <host> 8.8.8.8
nslookup -type=NS <apex-domain> 1.1.1.1

# TLS — who issued the certificate and until when
echo | openssl s_client -connect <host>:443 -servername <host> 2>/dev/null | openssl x509 -noout -subject -issuer -dates

# HTTP — status and the health payload (uptime tells whether a redeploy happened)
curl -sS -o /dev/null -w "%{http_code}\n" https://<host>/
curl -sS https://<host>/<health-path>

# TCP ports — open or filtered
for p in 22 80 443 3000 2377 7946 5432 6379 8080; do
  timeout 4 bash -c "echo > /dev/tcp/<vps-ip>/$p" 2>/dev/null && echo "$p open" || echo "$p closed"
done
```

A grey-cloud record resolves to `<vps-ip>`; an orange-cloud record resolves to
Cloudflare addresses. `curl -k` only to read the payload while the certificate is
still the default one — never as proof of TLS.

Behind the Cloudflare proxy, also check the origin directly:

```bash
# Certificate the VPS itself serves for <host> (Origin CA after playbook Stage 7b)
echo | openssl s_client -connect <vps-ip>:443 -servername <host> 2>/dev/null | openssl x509 -noout -subject -issuer -dates

# Access bypass test — with Access on and the origin closed (Stage 7c) this must NOT reach the app
curl -sS -m 10 -o /dev/null -w "%{http_code}\n" --resolve <host>:443:<vps-ip> https://<host>/
```

## 2. Symptom → cause → fix

| Symptom | Cause | Fix |
|---|---|---|
| Deploy log: `Permission denied (publickey)` | Deploy key not saved in the repo (list empty), saved in another repo, or a different key | Owner opens `github.com/<owner>/<repo>/settings/keys`; compare `SHA256:` fingerprints; re-add from a `.txt` file |
| GitHub: `Key is invalid. You must supply a key in OpenSSH public key format` | Key deformed in chat (quotes, missing space after `ssh-ed25519`, line break) | Send as `.txt`; one line: type, space, base64, space, comment |
| GitHub: `Key is already in use` | Same key registered on another repo (deploy keys are unique) | Remove it there, or generate a new key per repo |
| Browser "not secure", issuer `TRAEFIK DEFAULT CERT` | Let's Encrypt order failed; Traefik does not retry on its own | See §3 |
| Domain returns 404 from Traefik | Domain not attached to the app yet, or wrong host | Domains tab; Host exactly as the DNS record |
| Domain returns 502 / 504 | App listens on `127.0.0.1`, wrong Container Port, or the container is down | Logs; listen on `0.0.0.0`; Container Port = app port |
| Build fails on memory during the front-end build | Not enough free RAM | Free ≥ 4 GB during builds or add swap |
| Container restarts in a loop after deploy | Wrong `DATABASE_URL`/`REDIS_URL`, or a migration failed before the process manager started | Logs; fix the variable; Deploy |
| Changed variable has no effect | Variables apply only on a new deploy | Deploy; confirm through the health uptime |
| PostgreSQL 18 does not start ("unused mount/volume") | Volume at `/var/lib/postgresql/data` | Mount at `/var/lib/postgresql` (see playbook Stage 2) |
| Migration: `role "postgres" does not exist` | Database created with another user | While still empty, recreate the service with the expected user |
| Redis without a password / auth errors | Command and Args saved empty, or Args password ≠ General password | Command empty + Args list; same password in both |
| Redis `Memory overcommit must be enabled` | `vm.overcommit_memory=0` on the host | sysctl file + Reload (playbook Stage 2) |
| Panel shows "500 — something went wrong" after the 2FA prompt, empty server log | Chrome auto-translate, or someone using another person's account | Never translate the site; one user per person |
| Many logins refused ("try later") for everyone | All clients share the proxy IP | Trusted proxies in the app and Traefik `trustedIPs` |
| Large upload fails on slow links | Traefik `readTimeout` 60 s | Raise `transport.respondingTimeouts.readTimeout` on `websecure`, Reload |
| API answers 401 right after login behind Basic Auth | Basic Auth and the app share the `Authorization` header | Use another access gate (playbook Stage 7a) |
| Certificate renewal fails ~30 days before expiry after enabling the orange cloud or Access | HTTP-01 reaches the Access login page or an "Always Use HTTPS" redirect | Cloudflare Origin CA + Full (strict) + Certificate Provider None (playbook Stage 7b), or DNS-01 |
| `ERR_TOO_MANY_REDIRECTS` behind Cloudflare | SSL/TLS mode Flexible against Traefik's http→https redirect | Full (strict) with a valid origin certificate |
| Origin answers with the Let's Encrypt certificate after installing the Origin CA one | Domain still on Certificate Provider Let's Encrypt, or the LE cert is the one picked by SNI | Set the domain's provider to None; harmless while LE is valid (Full strict accepts both) |
| `curl --resolve <host>:443:<vps-ip>` reaches the app with Access on | Origin open to the whole internet | Provider firewall: 80/443 only from Cloudflare ranges, every site proxied (playbook Stage 7c) |
| All users throttled together after switching to the orange cloud | Cloudflare ranges missing from trusted proxies | App trusted proxies + Traefik `forwardedHeaders.trustedIPs` on web and websecure (Stage 7d) |
| Ports 2377/7946 still open after enabling the firewall | Provider rules take ~2 minutes | Re-test after two minutes |

## 3. Certificate stuck on the default

Let's Encrypt via Traefik uses HTTP-01 on the `web` entryPoint; certificates last
90 days and renew 30 days before expiry. `TRAEFIK DEFAULT CERT` means the order
failed, and Traefik does **not** retry a failed order on its own. The default ACME
e-mail `test@localhost.com` is not the cause (the account still registers); set a
real one anyway (Settings → Web Server → Server Domain → Let's Encrypt Email).

On the VPS terminal:

```bash
docker logs dokploy-traefik --since 3h 2>&1 | grep -iE "acme|certif|<host>" | tail -20
grep -n "Host\|certResolver" /etc/dokploy/traefik/dynamic/<appName>.yml
grep -o '"main": *"[^"]*"' /etc/dokploy/traefik/dynamic/acme.json
grep -n "email" /etc/dokploy/traefik/traefik.yml
```

- No ERR line in the window: widen `--since`; the attempt happened when the domain was created.
- `EOF`, `timeout`, `connection reset` (transient): `docker restart dokploy-traefik`, wait a minute, re-check `acme.json` and the issuer.
- `NXDOMAIN` / `no valid A records`: DNS missing or still propagating — fix DNS first.
- `connection refused` on the challenge: port 80 blocked or proxied with HTTPS-only redirects.
- `invalidContact`: replace the e-mail via Settings → Web Server, then restart Traefik.
- `unauthorized` / the challenge body is an HTML login page: the host is behind the
  Cloudflare proxy or Access — move it to the Origin CA path (playbook Stage 7b).
- The router must carry `certResolver: letsencrypt`; the panel's own domain uses the
  same resolver. A domain with Certificate Provider None has no resolver on purpose
  (it is served from the stored certificate).
- Confirm success: `"main": "<host>"` appears in `acme.json`, and the outside
  `openssl s_client` shows a Let's Encrypt issuer with a 90-day window.
