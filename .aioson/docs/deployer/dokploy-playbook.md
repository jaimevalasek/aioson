---
description: "Staged Dokploy setup on a VPS — panel hardening, PostgreSQL and Redis services, git access with a read-only deploy key, application settings, domains and Let's Encrypt renewal, provider firewall, and the access gate before real data (Cloudflare proxy/Access, Origin CA certificates, closed origin)."
agents: [deployer]
task_types: [deployment, dokploy-setup]
triggers: [dokploy, dokploy panel, dokploy setup, deploy key, traefik certificate, vps firewall, cloudflare access, origin certificate]
---

# Deployer — Dokploy Playbook

UI paths match Dokploy **v0.30.x** (note the version in the diary: older releases
differ, e.g. the PostgreSQL mount path below v0.26). Placeholders: `<vps-ip>`,
`<panel-domain>`, `<app-domain>`, `<owner>/<repo>`, `<appName>` (the internal
name Dokploy shows under the service title, with a random suffix).

**Terminal of the VPS:** the provider's browser console or SSH, as root.
**Terminal of the app:** Dokploy → the application → Docker Terminal.

## Stage 1 — Panel hardening

1. Onboarding "Ship something": **SKIP ALL** (no sample app or templates).
2. **Settings → Profile → 2FA** on; backup codes into the password manager.
3. **One user per person** (Settings → Users → invite). Never share a login: the
   2FA code lives on the owner's phone, and a shared password travels in chat.
4. Chrome auto-translate breaks the Dokploy UI (a "500 — something went wrong"
   page right after "Please enter your 2FA code"; the server log stays empty).
   Translation icon → **Never translate this site**.
5. Create the DNS A record `<panel-domain>` → `<vps-ip>` (Cloudflare: grey cloud,
   "DNS only"), then **Settings → Web Server → Server Domain**: Domain
   `<panel-domain>`, **Let's Encrypt Email** a real address (the default
   `traefik.yml` ships `test@localhost.com`), HTTPS on, Certificate Provider
   Let's Encrypt, Save. Ignore the "update your GitHub Apps" warning when no
   GitHub App is used.
6. Only after `https://<panel-domain>` opens with a valid certificate, close the
   plain-HTTP panel port on the VPS terminal:

   ```bash
   docker service update --publish-rm "published=3000,target=3000,mode=host" dokploy
   ```

   Re-check `http://<vps-ip>:3000` after every Dokploy upgrade. Change the
   operator's password afterwards if it was ever typed over plain HTTP.

## Stage 2 — Services

**Projects → Create Project**, then inside it **Create Service → Database**.

**PostgreSQL**
- Image `postgres:18`; Database User as the migrations expect (often `postgres`);
  password from `openssl rand -hex 24` (URL-safe).
- Before the first deploy, **Advanced → Volumes**: the mount must be
  `/var/lib/postgresql/18/docker` or `/var/lib/postgresql`. `/var/lib/postgresql/data`
  (Dokploy < v0.26) makes the 18 image refuse to start.
- **External Port empty** — a published port bypasses any host firewall.
- **Internal Connection URL** (host = `<appName>`) becomes `DATABASE_URL`.

**Redis**
- Password from `openssl rand -hex 32`; image as suggested (`redis:8` on v0.30); External Port empty.
- **Advanced → Advanced Settings**: **Command empty** (the image entrypoint then
  prepends `redis-server` and drops root). **Args is a list — one token per box**
  (Add Argument): `--requirepass` · `<same password as General>` · `--appendonly` ·
  `yes` · `--maxmemory-policy` · `noeviction`. Everything in one box fails.
  Never save Command and Args both empty: Redis can start without a password.
- Logs must show `Creating AOF base file` and `Ready to accept connections`.
- `WARNING Memory overcommit must be enabled` → on the VPS terminal, then **Reload**:

  ```bash
  echo 'vm.overcommit_memory = 1' > /etc/sysctl.d/99-redis.conf
  sysctl --system | grep overcommit
  ```

- `REDIS_URL` = Internal Connection URL + `/0`.

## Stage 3 — Git access

- A GitHub App / git provider is installed by the **repository owner**. A
  collaborator cannot, and never sees the repo's Settings tab.
- Preferred: **read-only deploy key**. Dokploy **Settings → SSH Keys → Add SSH Key
  → Generate ED25519** (name it after the repo) → copy the **public** key.
- Send the public key to the owner **as a `.txt` attachment** — chat apps add
  quotes, drop the space after `ssh-ed25519`, or break the line. Validate first:
  `ssh-keygen -lf key.txt` prints the `SHA256:` fingerprint.
- Owner: `https://github.com/<owner>/<repo>/settings/keys` → **Add deploy key** →
  title, paste, **Allow write access unchecked** → **Add key** → confirm the
  password/2FA prompt. Success = the key listed as Read-only with the same fingerprint.

## Stage 4 — Application

**Create Service → Application** (Name, App Name auto-suffixed, description).

- **General → Provider → Git**: Repository URL `git@github.com:<owner>/<repo>.git`,
  SSH Key, Branch, Build Path `/`, **Watch Paths empty**, Enable Submodules off, Save.
- **Autodeploy off** — the toggle may come on; verify it is dark.
- **Build Type**: Dockerfile, Docker File `Dockerfile`, Docker Context Path `.`, Save.
- **Environment**: Environment Settings (runtime), Build-time Arguments,
  Build-time Secrets (empty unless needed), **Create Environment File off**, Save.
  Secrets are generated on the VPS (`openssl rand -hex 32`) and stored in the
  password manager before pasting.
- **Advanced** cards, top to bottom: Run Command · **Cluster Settings** (Replicas
  `1`; the **Swarm Settings** button lives here; ignore "configure a registry" on a
  single server) · Build Server · Resources · **Volumes** (Volume Mount, e.g. name
  → `/data`) · Networks · Redirects · Security · **Ports** ("No ports configured") · Traefik.
- **Swarm Settings → Update Config**: `{ "Parallelism": 1, "Order": "stop-first" }`
  so two copies of a worker never run together during a deploy.
- **Deploy**. Deployments shows clone → build → done; Logs shows migrations and the processes.

## Stage 5 — Domain and TLS

Dokploy's Traefik issues Let's Encrypt certificates with the **HTTP-01** challenge
on the `web` entryPoint (port 80). Certificates last **90 days**; Traefik renews
**30 days before expiry**, and every renewal needs the same challenge to reach
port 80 again.

1. DNS A record `<app-domain>` → `<vps-ip>` **before** adding the domain (grey
   cloud): the order starts the moment the domain is saved.
2. **Domains → Add Domain**: Host, Path `/`, Internal Path `/`, Strip Path off,
   Container Port (the app's), Custom Entrypoint off, HTTPS on, Certificate
   Provider Let's Encrypt, Middlewares empty.
3. Expect the certificate within about 20 s; check from outside with
   `openssl s_client` (troubleshooting.md §1). `TRAEFIK DEFAULT CERT` means the
   issuance failed, and Traefik does **not** retry a failed order on its own —
   troubleshooting.md §3 (logs, `docker restart dokploy-traefik` on transient
   EOF/timeout, confirm in `acme.json`).
4. The ACME e-mail in Dokploy's `traefik.yml` defaults to `test@localhost.com`.
   It does not make issuance fail (the account still registers), but set a real
   address in Settings → Web Server → Server Domain → Let's Encrypt Email.
5. Before turning on the Cloudflare proxy (orange cloud) or Cloudflare Access for
   this host, read Stage 7: both break this renewal path.

## Stage 6 — Provider firewall

Docker publishes ports past `ufw`, so the filter that counts is the provider's
network firewall (e.g. Hostinger → VPS → Firewall).
- Configurations can be account-wide and stay inactive until enabled per VPS; leave other servers' configurations alone.
- Accept rules: **SSH 22 first**, HTTP 80, HTTPS 443, UDP 443 (HTTP/3). Confirm the
  list ends with a drop-all rule before enabling (Hostinger adds "Drop Any Any").
- Takes ~2 minutes to apply. Then verify from outside: 22/80/443 answer; 2377, 7946,
  4789 (Swarm), 3000, database and cache ports do not. On the VPS, outbound still works
  (`curl -sS -o /dev/null -w "%{http_code}\n" https://github.com` → `200`).

## Stage 7 — Access gate before real data

Before personal or production data reaches the server:
- Rotate any secret that appeared in a screenshot, then redeploy.
- Restrict who can reach `<app-domain>` while it is a rehearsal (7a–7d below).
- Backups leave the VPS (encrypted) and one restore is tested before go-live.

### 7a. Choosing the gate

- **Traefik Basic Auth** (application → Security) uses the `Authorization`
  header. An app that sends `Authorization: Bearer …` on API calls gets 401 after
  login — check the client code first; usually it rules Basic Auth out.
- **Cloudflare Access** (Zero Trust → Access → Application, policy "team
  e-mails") works with WebSocket, but needs the orange cloud, a certificate
  renewal path (7b) and a closed origin (7c). Decide 7b and 7c **before** enabling it.
- **Cloudflare Tunnel** (no inbound 80/443 at all) or validating the Access JWT
  (`Cf-Access-Jwt-Assertion`) inside the app are the alternatives to 7c.

### 7b. Certificates behind the Cloudflare proxy

With the orange cloud and/or Access, the HTTP-01 challenge reaches the Access
login page (and "Always Use HTTPS" redirects it), so the Let's Encrypt renewal
fails ~30 days before expiry. Recommended path — **Cloudflare Origin CA**:

1. Cloudflare → SSL/TLS → **Origin Server → Create Certificate** (can cover
   `*.<apex-domain>` and `<apex-domain>`; validity up to 15 years; trusted only by
   Cloudflare). Copy the certificate PEM and the private key once — the key is
   shown only at creation and goes straight into Dokploy, never into chat.
2. Cloudflare SSL/TLS mode **Full (strict)**. Flexible loops with Traefik's
   http→https redirect.
3. Dokploy sidebar → **Certificates** → add (name, certificate, private key).
   Dokploy writes `chain.crt`/`privkey.key` and a Traefik dynamic
   `tls.certificates` file.
4. On each proxied domain keep **HTTPS on** and set Certificate Provider **None**:
   the router loses its `certResolver`, `websecure` still terminates TLS, and
   Traefik serves the matching certificate from its store by SNI.
5. While the current Let's Encrypt certificate is valid, it does not matter which
   one Traefik serves — Full (strict) accepts both. The Origin certificate only has
   to be in place before the Let's Encrypt one expires.
6. Verify at the origin: `openssl s_client -connect <vps-ip>:443 -servername <host>`
   → issuer is Cloudflare's Origin CA.

Alternative with more moving parts: the **DNS-01** challenge with a Cloudflare API
token (custom resolver in `traefik.yml` plus the token as environment on the
`dokploy-traefik` container).

### 7c. Close the origin, or Access is decoration

Access only protects traffic that goes **through** Cloudflare. While the VPS
answers 80/443 to the whole internet, anyone can skip Access with the right
Host/SNI: `curl --resolve <host>:443:<vps-ip> https://<host>/`.

- Restrict 80/443 in the provider firewall to Cloudflare's ranges
  (`https://www.cloudflare.com/ips-v4` and `/ips-v6`; refresh every few months).
- That requires **every** site on the VPS — the Dokploy panel domain included — to
  be proxied by Cloudflare, so grey-cloud HTTP-01 stops for all of them: give all
  of them the Origin certificate (7b) first.
- Keep SSH 22 open as before; only 80/443 narrow.

### 7d. Real client IPs, then the bypass test

Before switching to the orange cloud, add the Cloudflare ranges to the app's
trusted proxies (e.g. `TRUSTED_PROXIES`) and to Traefik
`forwardedHeaders.trustedIPs` on **both** `web` and `websecure` (Traefik File
System → `traefik.yml`, then Reload) — otherwise every user shares one rate-limit
bucket. After the setup, from outside: the `curl --resolve` above must **not**
reach the app, and the normal URL must show the Access login first.
