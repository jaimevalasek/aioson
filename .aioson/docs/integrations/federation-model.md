# Federação — modelo master-como-servidor

> **Decisão do dono (2026-07-02, pós-auditoria):** o modelo oficial da
> Federação é **master-como-servidor** — satélites usam o aioson-auth do
> MASTER via rede pra tudo (login de operador, unlock, refresh, apps).
> O desenho alternativo "banco compartilhado" ficou meio-construído no
> aioson-auth e é **vestigial** (vide § 5). Dossiê completo da auditoria:
> `.aioson/context/simple-plans/federation-audit.md`.

---

## 1. Papéis

| Papel | O que é | Autoridade |
|---|---|---|
| **Master** | O Play principal da empresa. Roda o aioson-auth que TODOS usam. | Operadores, roles, permissões, revogação — tudo mora no SQLite do aioson-auth do master. |
| **Satélite** | Play nos outros computadores, pareado ao workspace (Project) da empresa no aioson.com. | Cliente magro: não guarda operadores; fala com o `master_auth_url` pela rede local. |
| **aioson.com** | Descoberta + autorização de pareamento + licenças. | `Project`/`ProjectMember` (workspace), `AiosonPlayInstallation` (master/satélite), quota. |

## 2. Fluxos (estado 2026-07-02, pós-fixes)

**Ativação (master):** `federation_activate` → cria/REUSA workspace
(`GET /api/me/workspaces` primeiro — retry não duplica Project) → `PATCH
/api/aioson-play/installations/by-id/:id` `{project_id, installation_role:
"master"}` → test-connection → **grava connection string no keyring** →
`POST aioson-auth /admin/federation/activate` (o auth LÊ a string do keyring
via bridge; falha → rollback do keyring) → `enable_as_master` local.

**Pareamento (satélite):** `federation_pair_with_workspace` → `POST
/api/projects/:id/installations/pair` (exige **plano pago do dono** do
workspace — 402 `subscription_required`) → `enable_as_satellite` local com
`master_auth_url`.

**Login/unlock de operador:** o Rust resolve a URL sozinho
(`resolve_shell_auth_url`: satélite → `master_auth_url`; senão → service
local pela porta real). O frontend NÃO passa URL (era oráculo de senha).

**Permissões de operador (shell):** claim `permissions[]` do JWT emitido
pelo aioson-auth no login de shell (binding especial `"shell"`). Pra dar
poderes a um operador no Play: painel do aioson-auth → roles/permissões no
binding `shell` (permissões `play:*`, vide `shell/policy.rs::PlayAction`).

**Revalidação (worker 60s, `shell::session_revalidator`):** `GET /me` com o
access token; 401 → tenta `POST /refresh` (rotaciona tokens no keyring —
renovação automática do TTL de 15min); refresh negado = revogado → logout
forçado do shell (**revogação derruba o satélite em ≤60s** quando online).
Rede fora = fail-open (máquina não bricka; as APIs é que negam).

**Apps em satélite:** `spawn_app` injeta `VITE_AIOSON_AUTH_URL` apontando
pro auth do MASTER (mesma resolução do shell) + tokens SSO do operador.

**Desativar/desparear:** `federation_unpair` (satélite) e
`federation_deactivate` (master) — aioson-com primeiro (`DELETE
/api/projects/:id/installations/:aioson_play_id`; master é recusado com 409
enquanto houver satélites), depois passos locais best-effort (aioson-auth
`/deactivate` real, keyring, `disable_federation`). Remoção de tech_admin:
`DELETE /api/projects/:id/members/:user_id` (só o dono).

## 3. Exige do ambiente

- aioson-auth rodando no master (autostart) e alcançável pelos satélites
  (rede local/VPN) — satélite sem master online não loga operador (owner tem
  fallback de senha local; operador não).
- Assinatura ativa (plano pago) do dono pra parear satélites.

## 4. Licenças de app pago × federação

Licença é por **conta + dispositivos** (padrão 3 assentos por compra;
trial = 1). O satélite valida com a sessão aioson.com do DONO na máquina.
`seat_limit` → banner do app lista os dispositivos e libera um na hora
(`POST /api/licenses/release-seat`). Federação NÃO distribui pacotes nem
licenças (inventário de apps é só visibilidade de dashboard).

## 5. Vestigial — NÃO construir em cima

No aioson-auth: `mainPrisma`/`reloadMainPrismaFromConfig`,
`revocation_poller` + `revocation-cache` (cache sem leitor de produção) e
as colunas `aioson_play_origin_id` (nunca populadas) são resto do desenho
"banco compartilhado" que nunca foi ligado ponta a ponta (findings
AU-C1/C2/C3 + G-1 do dossiê). O deactivate os desliga; o activate ainda os
inicia por compat. Antes de qualquer feature de "sync entre Plays", decidir:
religar de verdade (muito trabalho) ou remover.

## 6. Endurecimento aplicado (Fase 4, 2026-07-02)

- Tentativas de senha do lock persistem em SQLite (reiniciar o Play não
  zera o 3-strikes).
- Sessão bloqueada NÃO injeta tokens SSO em app (re)spawnado.
- ProductBridge escuta só `127.0.0.1:5180` (antes `0.0.0.0` expunha todas
  as rotas sem auth pra LAN inteira).
- Token do bridge com chmod 0600 em Unix; no Windows a proteção é a ACL
  per-user do %LOCALAPPDATA%.
- aioson-auth: `JWT_SECRET` sem env cai num segredo aleatório persistido
  por instalação (`prisma/.jwt-secret`, gitignorado) — o default fixo
  'dev-secret-change-in-production' morreu.

## 7. Pendências conhecidas

- Instalar apps do master nos satélites (decisão de produto — inventário
  hoje é só visibilidade de dashboard).
- Remover ou religar de vez a maquinaria vestigial do § 5.
- Rotação de connection string (AU-G3): caminho suportado hoje =
  Desativar Federação → Ativar de novo com a string nova.
- Config morta de idle-lock (PL-G2): plumbing sem UI, inofensiva.
