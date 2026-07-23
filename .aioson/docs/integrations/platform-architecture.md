# AIOSON Platform — Arquitetura (vista de helicóptero)

> **Para IAs (Claude Code, Codex, Cursor) que vão fazer correções ou
> implementações cross-cutting** entre aioson-play, aioson-auth, apps e
> aioson.com. Este é o **mapa unificado** dos componentes e seus contratos —
> use pra saber **onde mexer** sem precisar reler 4+ docs detalhados.
>
> Atualizado: 2026-05-13.

---

## 0. TL;DR pra IA

```
Plataforma AIOSON tem 4 componentes principais. Cada um vive em um repo:

  aioson-play   (C:\dev\aioson-play)         desktop Tauri 2 — runtime local
  aioson-auth   (C:\dev\services\aioson-auth) Play Service — RBAC + login operadores
  apps/*        (C:\dev\apps\*)               apps instalados via Play
  aioson.com    (deploy remoto)               cloud — marketplace + billing + owner identity

E 1 pacote npm:
  @aioson/auth-sdk  (subpasta aioson-auth/sdk) — cliente canônico do aioson-auth

Contratos entre eles vivem em `.aioson/docs/integrations/`. Quando você precisa
fazer correção:

  1. Identifique a categoria do bug (seção 4 deste doc) → tabela "Onde mexer".
  2. Leia o doc canônico apontado.
  3. Inspecione o source no repo certo.
  4. Implemente seguindo o contrato — NUNCA quebre o contrato sem ADR.
```

---

## 1. Componentes

### 1.1 `aioson-play` (desktop Tauri 2)

**Localização:** `C:\dev\aioson-play`
**Stack:** Rust (backend Tauri) + React 18 + TypeScript + Vite + tauri-plugin-sql (SQLite)
**Identifier bundle:** `com.aioson.play`
**Roda como:** desktop app nativo (Windows/Mac/Linux)
**Data dirs (Windows):**
- `%LOCALAPPDATA%\com.aioson.play\` — apps, services, runtime data
- `%APPDATA%\com.aioson.play\` — Roaming (não usado hoje)

**Responsabilidades:**
- Spawnar apps instalados como processos filhos
- Spawnar Play Services como processos filhos
- Servir o ProductBridge HTTP em `127.0.0.1:5180`
- Gerenciar portas via `PortAllocator` (3300+ apps, 3001-3099 services, 3500-3999 drafts)
- Persistir identidade do owner via Bearer aioson.com
- Gerenciar Conexões LLM globais: uma credencial por provider, modelos validados por operação (`text_generation`, `code_generation`, `image_understanding`, `image_generation`, `video_understanding`, `video_generation`, `speech_to_text`, `text_to_speech`, `audio_understanding`, `realtime_voice`) e fallback automático por operação
- UI shell (HomePage, AppPage, Settings, etc.)
- Auto-start de services com `autostart: true` no boot (entregue 2026-05-13)

**Módulos Rust-chave:** `src-tauri/src/`
- `service_manager.rs` — Play Services lifecycle
- `app_process_manager.rs`, `process_manager.rs`, `draft_process.rs` — apps lifecycle
- `process_supervisor.rs`, `process_state_store.rs` — supervisão + portas persistentes
- `http_server.rs` — ProductBridge (:5180)
- `identity/` — installation_state, owner_check, auth_app_bindings
- `bridge.rs`, `bus.rs` — Bridge Apps e AMP

**Frontend:** `src/`
- `App.tsx` — roteamento (FirstRunPage → LoginPage → OwnershipRejectionPage → ShellRoot)
- `shell/` — dock, taskbar, AppPage, MaintenancePage
- `pages/` — HomePage, ServicesPage, Settings/*
- `services/` — clients TypeScript pros Tauri commands

### 1.2 `aioson-auth` (Play Service)

**Localização:** `C:\dev\services\aioson-auth`
**Stack:** Node.js Express + Prisma + SQLite + Vite (cliente)
**Roda como:** Play Service na porta fixa `3091`
**Dev-linked em:** `%LOCALAPPDATA%\com.aioson.play\services\aioson-auth` → symlink pro source

**Responsabilidades:**
- Autenticação de operadores (`GlobalUser`) — login email/senha + OAuth + 2FA
- RBAC — `Role` global × `BindingPermission` por-app × `UserRole`/`RolePermission` por-binding
- JWT carrega `binding_id` + `permissions[]` (Slice A, 2026-05-13)
- `TokenRevocation` pra revogação imediata
- UI admin separada (`/auth/dashboard`, `/auth/bindings`, etc.) com adminToken
- UI operador (`/auth/:bindingId`) — login/cadastro/recovery

**Routes:**
- `/api/auth/:bindingId/*` — auth de operadores per-binding
- `/api/auth/rbac/*` — gestão global de roles
- `/api/admin/*` — login admin do painel + ações privilegiadas
- `/api/auth/admin/bindings` — validate_owner_bearer middleware

**SDK relacionado:** `aioson-auth/sdk/` → pacote `@aioson/auth-sdk`

### 1.3 Apps instalados

**Localização canônica (instalados):** `%LOCALAPPDATA%\com.aioson.play\apps\<slug>\`
**Localização (dev-link):** symlink apontando pra `C:\dev\apps\<slug>\`
**Stack:** Qualquer (Node.js + qualquer framework). Tauri spawna `npm run dev` em dev e `npm start` em produção marketplace.
**Exemplo de referência:** `C:\dev\apps\aioson-atendimento`

**Responsabilidades:**
- Servir UI própria (geralmente Vite frontend embedado em webview do Play)
- Servir API HTTP própria (porta dinâmica alocada pelo Play)
- Expor `/api/aioson-play` declarando capabilities
- Consumir Global Connectors via `POST 127.0.0.1:5180/api/mcp/execute`
- (Opcional) Logar operadores via aioson-auth + `@aioson/auth-sdk`
- (Opcional) Validar trial/billing via aioson.com

### 1.4 `aioson.com` (cloud)

**Stack:** Next.js (deploy remoto), separado dos repos locais.
**Responsabilidades:**
- Marketplace de apps e Play Services (publish/install)
- Identidade do owner (`POST /api/app-auth/token` → Bearer)
- Trial/billing (`/api/apps/:slug/install`, `/status`)
- Telemetria via gateway AIOSON
- Registro `AiosonPlayInstallation` (S1A da feature aioson-play-identity)

**Como o Play fala:** HTTPS direto com Bearer salvo no OS keyring.

### 1.5 `@aioson/auth-sdk` (pacote npm)

**Localização:** `C:\dev\services\aioson-auth\sdk\`
**Stack:** TypeScript + tsup (dual ESM/CJS) + tipos completos
**Consumo:** `npm install file:../aioson-auth/sdk` (dev) ou `@aioson/auth-sdk` (futuro)

**3 entries:**
- `@aioson/auth-sdk` — core: `createAuthClient`, `AuthError`, types, storage helpers
- `@aioson/auth-sdk/react` — `<AuthProvider>`, `useAuth`, `usePermission`
- `@aioson/auth-sdk/express` — `requireAuth`, `requirePermission`

---

## 2. Contratos entre componentes

### 2.1 Quem fala com quem

```
                   ┌──────────────┐
                   │  aioson.com  │  (cloud)
                   │   marketplace│
                   │   billing    │
                   │   owner-id   │
                   └─────▲────────┘
                         │ HTTPS Bearer
                         │
                ┌────────┴────────────────────────┐
                │  aioson-play (desktop Tauri 2)  │
                │  ├ HTTP server :5180 (ProductBridge)
                │  ├ spawna Play Services        ─┐
                │  ├ spawna apps                 ─┤
                │  └ injeta env vars             ─┤
                └─────────────────────────────────┘
                         │                      │
        env vars         │ porta fixa 3091      │ porta dinâmica 3300+
        + spawn          ▼                      ▼
                ┌────────────────┐    ┌─────────────────────┐
                │ aioson-auth    │    │ App instalado       │
                │ (Play Service) │◄───┤ • npm run dev       │
                │ Express + Vite │  HTTP (via SDK)          │
                │ JWT + RBAC     │    │ • /api/aioson-play  │
                └────────────────┘    │ • lê env vars       │
                         ▲            └──────────┬──────────┘
                         │                       │
                         └───────────────────────┘
                          @aioson/auth-sdk
                          (npm peer)
```

### 2.2 Tabela de contratos

| De → Para | Canal | Contrato documentado em |
|---|---|---|
| Apps → Play | HTTP `127.0.0.1:5180/api/*` | `port-management.md`, `app-data-bindings.md` |
| Play → Apps | env vars no spawn + child webview nativa (`iframe` só como fallback) | `aioson-app-developer-guide.md` § 2, `app-runtime-integration-contract.md` |
| Apps → aioson-auth | HTTP `127.0.0.1:3091/api/auth/*` via `@aioson/auth-sdk` | `aioson-auth/docs/integration-manual.md` |
| Play → aioson-auth | spawn + (eventualmente) injeção de tokens | `play-service-protocol.md`, `auth-integration-gaps.md` § Slice F |
| Apps → aioson.com | HTTPS via backend proxy do app | `app-cloud-auth.md` |
| Play → aioson.com | HTTPS direto, token no OS keyring | `app-cloud-auth.md`, `architecture-aioson-play-identity.md` |
| Play → aioson.com | Feed de notificações `GET /api/notifications?after_id=<lastFetchedId>` com Bearer owner opcional | § 3.5 deste doc |
| LLM ↔ Apps | Conexões LLM validadas + política global de fallback exportável em `llm-chain.json` | `aioson-app-developer-guide.md` § 9 |

---

## 3. Fluxos importantes

### 3.1 Boot de um app instalado

```
1. Usuário clica no card do app na HomePage
2. AppPage carrega → invoca spawn_app (Rust)
3. Rust:
   a. Lê manifest.json → identifica has_api, processes (split?), requires_services
   b. PortAllocator atribui porta (ou reusa de manifest.api_base_url)
   c. Coleta env vars:
      - PORT, BACKEND_PORT (alocadas)
      - VITE_AIOSON_PLAY_URL, AIOSON_APP_SLUG, AIOSON_APP_DIR
      - VITE_AIOSON_AUTH_URL (se aioson-auth rodando)
      - VITE_AIOSON_AUTH_BINDING_ID (se app tem entry em auth_app_bindings)
      - AIOSON_COM_TOKEN (se owner logou no aioson.com)
   d. Spawn `npm run dev` (dev) ou `npm start` (marketplace)
4. App boota:
   a. Lê env vars
   b. Backend Express listen em process.env.PORT
   c. Frontend Vite (split-stack) listen em process.env.PORT diferente
5. Play poll `/api/aioson-play` em loop até receber 200 → cache capabilities
6. Child webview nativa do Play abre http://127.0.0.1:<webview_target_port>
```

A child webview é um contexto de navegação de nível superior dentro da janela
do Play. Por isso, headers anti-framing como `X-Frame-Options` e CSP
`frame-ancestors` continuam protegendo o app sem impedir sua abertura. O
`iframe` é apenas fallback quando a criação nativa falha ou quando o chrome DOM
do Assistente precisa permanecer sobre a superfície do app.

**Onde mexer:**
- Alocação de porta → `src-tauri/src/port_allocator.rs`
- Spawn em si → `src-tauri/src/app_process_manager.rs` (marketplace), `draft_process.rs` (dev-link)
- Env vars injetadas → `app_process_manager.rs:200-220` (busque `cmd.env`)

### 3.2 Login do owner (dono da licença)

```
1. Play boot → FirstRunPage (se installation_state ausente)
2. User digita email/senha aioson.com → POST /api/app-auth/token
3. Bearer guardado no OS keyring + installation_state criado
4. ShellRoot renderiza
5. Toda chamada subsequente pro aioson.com usa o Bearer
6. Toda chamada pro aioson-auth admin endpoints (/api/auth/admin/*)
   usa o Bearer + validate_owner_bearer middleware → owner-implicit
```

**Doc canônica:** `architecture-aioson-play-identity.md` + ADR-02
**Onde mexer:**
- `src-tauri/src/identity/` (Rust)
- `src/pages/FirstRunPage.tsx`, `LoginPage.tsx`, `OwnershipRejectionPage.tsx`

### 3.3 Login de operador (atual, sem SSO)

```
1. App abre no webview
2. App detecta env vars VITE_AIOSON_AUTH_URL + VITE_AIOSON_AUTH_BINDING_ID
3. App mostra tela de login PRÓPRIA (cada app tem a sua hoje)
4. User digita email/senha → SDK chama POST /api/auth/:bindingId/login
5. aioson-auth retorna { accessToken (JWT com permissions), refreshToken, user }
6. SDK persiste tokens em localStorage (ou memory) via TokenStorage
7. App usa auth.hasPermission(name) (síncrono, lê JWT) pra UI condicional
8. Backend valida via @aioson/auth-sdk/express requireAuth + requirePermission
```

**Doc canônica:** `auth-integration-gaps.md` (Slices A-E entregues)
**Onde mexer:**
- aioson-auth core: `src/actions/AuthAction.ts`, `RbacAction.ts`
- aioson-auth routes: `src/routes/auth.ts`, `rbac.ts`
- SDK: `aioson-auth/sdk/src/*`

### 3.4 Sessão de operador e bootstrap SSO (implementação interna)

```
1. Play guarda a sessão de operador no keyring e, quando desbloqueada, o spawn
   pode injetar os tokens SSO internos.
2. O SDK oferece `initialSession`, que valida o `binding_id` antes de persistir.
3. Login pelo SDK continua sendo o caminho público padrão: nenhum app deve ler
   tokens `VITE_*` diretamente sem revisão de exposição.
```

**Owner-implicit bypass (BR-15) continua valendo em paralelo** — qualquer rota
com Bearer aioson.com identifica como owner sem precisar de operator session.

### 3.5 Notificações do Play via aioson.com

```
1. Play lê cache local por usuário:
   - notifications[] com id/title/body/link/planType/createdAt/read/receivedAt
   - meta.lastFetchedId e meta.lastFetchedCreatedAt separados da lista
2. Play chama GET {AIOSON_COM_BASE}/api/notifications?after_id=<lastFetchedId>&after_created_at=<lastFetchedCreatedAt>&plan_type=<FREE|DEV|BUSINESS>
   com Authorization: Bearer <owner token> quando houver sessão local.
3. aioson.com calcula o plano real pelo usuário autenticado (não confia no
   plan_type do cliente), personaliza `title`/`body` com variáveis do usuário
   (`{ID}`, `{NAME}`, `{EMAIL}`, `{USERNAME}`) e retorna apenas notificações
   ativas desse plano.
4. aioson.com retorna lista de notificações novas:
   [{ id, title, body, link?, plan_type?, created_at? }]
   ou { notifications: [{ id, title, body, link?, plan_type?, created_at? }], cursor? }
5. Play salva novos itens localmente, preserva read/unread dos já existentes
   e atualiza meta.lastFetchedId/meta.lastFetchedCreatedAt pelo maior cursor
   recebido ou calculado localmente.
6. Se o usuário apagar uma ou todas as notificações, meta.lastFetchedId e
   meta.lastFetchedCreatedAt NÃO são resetados. Isso evita baixar novamente
   notificações antigas.
```

**Contrato do endpoint aioson.com:**
- `id`: inteiro positivo e monotônico.
- `title`: string não vazia.
- `body`: string não vazia.
- `link`: string opcional; o Play só abre `http://` ou `https://`.
- `plan_type`: `FREE`, `DEV` ou `BUSINESS`.
- `created_at`: ISO-8601 da criação.
- `title`/`body`: podem vir personalizados pela API quando o template salvo no
  admin usa `{ID}`, `{NAME}`, `{EMAIL}` ou `{USERNAME}`.
- Query suportada: `after_id`, `after_created_at`, `plan_type` e `limit`.
  O endpoint deve autenticar o Bearer aioson.com, derivar o plano via
  `userPlan(user.plan)`, limitar a resposta ao plano real do usuário e usar os
  cursores para retornar somente itens ainda não sincronizados.
- O sininho de notificações no Play é uma superfície owner-only: aparece apenas
  para sessão `owner_bearer` (conta aioson.com). Sessões de funcionário/
  operador (`operator_jwt`) não renderizam o botão nem fazem sync.

**Onde mexer no Play:**
- Cache/sync frontend: `src/services/notifications.ts`
- Entrada do dock: `src/shell/components/dock.tsx`
- Janela/lista: `src/shell/components/notifications-window.tsx`
- Wiring shell: `src/shell/shell-root.tsx`

---

## 4. Onde mexer pra cada categoria de bug

| Categoria | Sintoma | Onde investigar |
|---|---|---|
| **App não inicia** | Spawn falha / processo morre / connection refused | `service_manager.rs` (services) ou `app_process_manager.rs`/`draft_process.rs` (apps). **Atenção:** stdout/stderr são `Stdio::null()` — badge pode mentir |
| **App PAID não inicia / "LICENSE_DENIED"** | App pago não spawna; banner de licença na aba | Gate de licença (`src-tauri/src/licensing/`). Spawn nega com `LICENSE_DENIED:<status>:<reason>` quando `manifest.visibility=PAID` sem licença válida no cache (`aioson-play-licenses.db`). Verificação é ONLINE via `POST /api/licenses/validate` (Bearer owner; o Rust faz o HTTP). `reason`: `no_license` (sem cache → pede chave), `license_invalid`/`license_expired` (revalidar), `revalidation_required` (janela offline de 72h venceu). **Anistia PD-9:** apps instalados antes de 2026-06-16 (recibo `installed_at`) não gateiam. Se um app PAID **legítimo** não roda: confira sessão do owner logada, conta = `customer_email` da licença (D10), e que o aioson.com com `app_slug` em validate/activate está **deployado**. UI em `app-runtime-view.tsx`/`license-state-banner.tsx` |
| **Porta colidindo** | EADDRINUSE / app não acha porta | `port_allocator.rs` ranges, `port-management.md` |
| **Env var faltando** | App não recebe `VITE_AIOSON_*` | `app_process_manager.rs:200+` (busque `cmd.env`), `harness_security.rs:152` allowlist |
| **Login operador 401** | `/me` retorna 401 mesmo com token novo | `AuthAction.verifyAccessToken` checa `TokenRevocation` — confirme tabela não tem entry pro user. `auth-integration-gaps.md` § Slice A |
| **Permissions stale** | User perdeu role mas JWT ainda permite | Verificar `revokeUserTokens` é chamado em `deleteRole`/`removeUserRole`/`removePermissionFromRole` (sim, todos cobertos desde Slice A) |
| **CORS bloqueando** | App cloud bate em CORS quando chama aioson-auth | `ALLOWED_ORIGINS` env do aioson-auth (Slice C). `app.ts` na função `createApp` |
| **Webview branco** | `aioson-auth` ou app abre tela vazia no Play | Provavelmente cliente não buildado (`dist/client/` ausente). `aioson-auth/vite.config.ts` precisa `@tauri-apps/api/core` em external |
| **dotenv não carrega** | Servidor crasha com env var missing | Em ESM, `import 'dotenv/config'` precisa ser o **primeiro** import. Bug clássico — ver memória `esm-import-order-dotenv` |
| **Manifest mudou mas Play não viu** | Mudei `requires_services` e não pegou | Manifest é cached em memória. Parar/iniciar app no Play. Em prod, reinstalar |
| **Data binding não resolve** | Slot `busca-produtos` retorna erro | Admin precisou bind connector via `Settings → App Data Sources`. Para MCPI, a DbConnection precisa estar validada em `Settings → Database Connections`. Frontend e backend chamam o registry via `:5180/api/mcp/execute` |
| **LLM fallback não segue ordem esperada** | Geração usa provider errado ou não cai no próximo | `Settings → Conexões LLM`: o modelo da operação correta precisa estar validado. O fallback é automático por operação e referencia a mesma API key do provider; não cria API keys paralelas |
| **Auto-start não dispara** | Badge `0/1 SERVICES` mesmo com service instalado | `lib.rs::setup` chama `autostart_services`. Verifique `service.json` `autostart: true`. Logs em stderr com prefixo `[service_manager] autostart:` |
| **Apps cloud quebram CORS** | App em Vercel não chega no aioson-auth | Slice C: definir `ALLOWED_ORIGINS` no `.env` do aioson-auth |
| **Bootstrap SSO de operador** | Login único não hidrata o app | Confirme binding/token no SDK; o padrão seguro segue login pelo app até revisão de exposição |

---

## 5. ADRs ativos (decisões arquiteturais)

- **ADR-01** — Protocolo de Endpoints (`/api/aioson-play` schema). Doc: `aioson-endpoint-protocol.md`
- **ADR-02** — Owner identity via Bearer aioson.com. Doc: `architecture-aioson-play-identity.md`
- **ADR-05** — `installation_state` singleton (uma instalação = um aioson_play_id)
- **ADR-07** — `TokenRevocation` pra revogação imediata de JWTs antes do TTL
- **ADR-08** — Dev-link via symlink (apps + services). Doc: `dev-link-install.md`
- **ADR-09** — `auth_app_bindings` mapeia app slug → binding_id no aioson-auth
- **ADR-10** — `aioson_play_id` no `AppBinding` (forward-compat pra cloud multi-tenant)
- **BR-15** — Owner-implicit bypass (role `owner` reservado, nunca atribuído via API)

Para detalhes ADR-by-ADR: `architecture-aioson-play-identity.md`.

---

## 6. Trabalhos em andamento / decisões pendentes

| Item | Status | Doc |
|---|---|---|
| Auto-start de Play Services | ✅ entregue 2026-05-13 | `auth-integration-gaps.md` (sessão) |
| JWT com permissions + revoke holes | ✅ Slice A entregue | `auth-integration-gaps.md` § Slice A |
| CORS env-driven | ✅ Slice C entregue | § Slice C |
| Authorization Bearer header | ✅ Slice D entregue | § Slice D |
| `/me/permissions` endpoint | ✅ Slice E entregue | § Slice E |
| `@aioson/auth-sdk` MVP | ✅ Slice B entregue | § Slice B + `aioson-auth/sdk/README.md` |
| UX A1+A2 (auto-fill name + associar roles) | ✅ entregue | § "Atualizações" |
| **Injeção interna de SSO de operador** | ✅ entregue, consumo público sob revisão | `shell/sso_injection.rs` + §3.4 |
| **Logs/observabilidade dos Play Services** | 📝 **dívida conhecida** | memória `play-service-logs-suppressed` |
| Dogfooding completo do SDK no painel admin | ❌ não-candidato | painel admin usa `adminToken` separado |
| JWKS endpoint pra validação offline | 💭 ideia futura | § "Slice F roadmap" |
| CLI scaffold `aioson-auth bind` | 💭 ideia futura | § "Slice F roadmap" |

---

## 7. Quando IA não tem certeza

Pergunte ao humano antes de:

- Mudar contrato declarado em `manifest.json` campo (`stack`, `processes`, `requires_services`)
- Alterar shape do JWT payload (`binding_id`, `permissions`)
- Alterar shape do response `/api/aioson-play` (existem consumidores: Bridge App, LLM orquestrador)
- Trocar versão major de `@aioson/auth-sdk`
- Adicionar/remover env vars injetadas no spawn
- Renomear arquivo em `.aioson/docs/integrations/` (CLAUDE.md/AGENTS.md apontam por nome)
- Quebrar compat retroativo (`?token=` legacy, JWTs pré-Slice-A sem `permissions`)
- Modificar tabelas Prisma (migration → release coordenada)

OK fazer sem perguntar:

- Adicionar campos novos opcionais em qualquer schema
- Endpoint novo que não conflita com existente
- Refactor que mantém todos os contratos
- Bugfix dentro de função sem mudar assinatura
- Atualizar doc canônica neste diretório
- Estender SDK com método novo (mantendo backward compat)

---

## 8. Atualizações deste doc

- **2026-05-13** — Criação. Mapa baseado em sessão extensa que entregou Slices A-E. Exemplo `aioson-atendimento` em `C:\dev\apps\aioson-atendimento`.
- **2026-06-03** — Conexões LLM consolidadas: uma API key por provider, modelos por operação e fallback automático por operação dentro de `Settings → Conexões LLM`; removida a página paralela "LLM Fallback Chain" e a matriz manual de ordem de fallback da UI principal.
- **2026-06-03** — Database Connections agora persistem status de validação; MCPI/Data Connectors devem usar somente DbConnections validadas quando o driver tem teste suportado.

Atualizar sempre que: ADR novo emergir, componente novo for adicionado, fluxo
crítico mudar.
