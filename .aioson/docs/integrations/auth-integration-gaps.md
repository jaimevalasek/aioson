# AIOSON Auth — Análise de Gaps e Plano de Integração

> Análise estrutural da prontidão do `aioson-auth` para servir apps **dentro e fora** do aioson-play, com foco em compatibilidade do modelo de perfis/permissões e gaps de DX. Inclui plano de slices priorizados.
>
> Última atualização: 2026-05-13

---

## TL;DR

**Vai dar certo.** O desenho conceitual é sólido (RBAC clássico multi-tenant via `bindingId`, permissions per-app, 2FA, OAuth) e a doc do `aioson-auth` bate 1:1 com o código (`src/routes/auth.ts` + `src/routes/rbac.ts`). Mas existem **3 gaps de gravidade alta** que pagam o preço a cada app novo:

1. **Permissions não estão no JWT** → N HTTP roundtrips por página
2. **CORS hardcoded em localhost** → quebra apps cloud
3. **Não existe SDK npm** → cada app reimplementa middleware Express + hook React

Slice **A** resolve (1), **C** resolve (2), **B** resolve (3). Recomendação: atacar nessa ordem.

---

## Sources consultadas para esta análise

| Source | O que validou |
|---|---|
| `C:\dev\services\aioson-auth\docs\integration-manual.md` (643 linhas) | Contrato declarado: endpoints, fluxo, exemplos de middleware/hook |
| `C:\dev\services\aioson-auth\src\routes\auth.ts` | Verificação cruzada doc × código de auth tradicional, OAuth, refresh, /me |
| `C:\dev\services\aioson-auth\src\routes\rbac.ts` | Verificação cruzada doc × código de RBAC, 2FA, register-permissions |
| `C:\dev\services\aioson-auth\prisma\schema.prisma` | Modelo de dados: `GlobalUser`, `AppBinding`, `Role`, `BindingPermission`, `RolePermission`, `UserRole`, `AuthSession`, `TokenRevocation` |
| `.aioson/docs/integrations/integration-manual.md` (do Play) | Como Play se conecta com sistemas externos via ProductBridge |
| `.aioson/docs/integrations/app-cloud-auth.md` | Auth contra aioson.com (cloud) — sistema **separado** do aioson-auth local |
| `.aioson/docs/integrations/aioson-endpoint-protocol.md` | Como apps declaram capacidades (`/api/aioson-play`) |
| `.aioson/docs/integrations/app-data-bindings.md` | Slots de dados (MCPI/REST) em apps |
| `.aioson/docs/integrations/aioson-app-developer-guide.md` | Modelos de app (sidecar, sistema, app com API), portas dinâmicas |
| `.aioson/docs/integrations/port-management.md` | Faixas reservadas, env-var `VITE_AIOSON_AUTH_URL` injetada automaticamente |

---

## 1. Apps fora do aioson-play conseguem usar aioson-auth?

### Sim — design já suporta

`aioson-auth` é puramente um serviço HTTP em `:3091`. Não há acoplamento a Tauri/IPC. Qualquer app (mobile, web cloud, backend, app standalone) pode integrar tendo:

- **URL** do aioson-auth (em apps dentro do Play, injetada via `VITE_AIOSON_AUTH_URL`; fora, manual)
- **`bindingId`** — UUID criado pelo admin no painel ao vincular o app

### Endpoints disponíveis (confirmados doc × código)

```
# Auth tradicional
POST   /api/auth/:bindingId/register
POST   /api/auth/:bindingId/login
POST   /api/auth/:bindingId/refresh
POST   /api/auth/:bindingId/logout
GET    /api/auth/:bindingId/me?token=<jwt>
POST   /api/auth/:bindingId/forgot-password
POST   /api/auth/:bindingId/reset-password
POST   /api/auth/:bindingId/oauth

# 2FA
POST   /api/auth/:bindingId/2fa/setup
POST   /api/auth/:bindingId/2fa/verify
POST   /api/auth/:bindingId/2fa/disable

# RBAC — manifesto e gestão
POST   /api/auth/:bindingId/register-permissions   ← merge idempotente
GET    /api/auth/:bindingId/rbac/roles
GET    /api/auth/:bindingId/rbac/permissions
GET    /api/auth/:bindingId/rbac/users
POST   /api/auth/rbac/roles                        ← role global
PATCH  /api/auth/rbac/roles/:roleId
DELETE /api/auth/rbac/roles/:roleId
POST   /api/auth/:bindingId/rbac/permissions
DELETE /api/auth/:bindingId/rbac/permissions/:permissionId
POST   /api/auth/rbac/roles/:roleId/permissions    ← per-binding
DELETE /api/auth/rbac/roles/:roleId/permissions/:permissionId
POST   /api/auth/:bindingId/rbac/users/:userId/roles
DELETE /api/auth/:bindingId/rbac/users/:userId/roles/:roleId

# Verificação runtime
GET    /api/auth/:bindingId/rbac/check?token=&permission=
```

> **Contrato de acesso RBAC (2026-07-11):** `binding_id` identifica o app, mas
> não concede acesso. Quando `AppBinding.enable_rbac=true`, `register` público é
> bloqueado e `login`/`refresh` somente emitem sessão para usuário com
> `UserRole` naquele binding. Operadores são geridos pelo owner via Play.

> **Revogação por corte temporal (2026-07-11):** uma revogação afeta somente
> access tokens do mesmo `user_id + binding_id` emitidos antes do corte. Tokens
> emitidos por login/refresh posterior permanecem válidos; tokens legados usam
> o claim padrão `iat` como fallback.

### Caveats para apps externos

| Caveat | Gravidade | Mitigação |
|---|---|---|
| Apps internos recebem `VITE_AIOSON_AUTH_URL` automaticamente; apps externos configuram à mão | 🟢 Baixa | Documentar em onboarding |
| `bindingId` é criado manualmente pelo admin — sem endpoint público de auto-bind | 🟡 Média | OK para B2B com instalações controladas; ruim para SaaS multi-tenant aberto |
| `/me` usa `?token=` (query) em vez de `Authorization: Bearer` (header) | 🟡 Média | Não-padrão RFC 6750; dificulta integração com fetch wrappers idiomáticos |
| CORS hardcoded em `localhost`/`127.0.0.1` (`src/app.ts:30-37`) | 🔴 Alta | Quebra apps cloud (Vercel, Netlify, custom domain). Fix: CORS configurável por binding |
| Rate limiting per-binding não documentado (mas `express-rate-limit` está em deps) | 🟡 Média | Confirmar se está plugado e expor configuração |

---

## 2. Modelo de perfil e permissões está no padrão?

### Pontos fortes

Esquema é o **RBAC clássico** da indústria, sem grandes desvios:

```
GlobalUser ──┐                                  ┌── Role ──┐
             └── UserRole ──────────────────────┤          └── RolePermission ── BindingPermission ── AppBinding
                                                │                                                       │
                                                └────────────── binding_id ─────────────────────────────┘
```

- **Perfis globais** reutilizáveis (`Admin`, `Atendente`, `Viewer` aparecem em todos os apps)
- **Permissões per-app** registradas pelo próprio app via `POST /register-permissions`. Operação é **merge idempotente** — apps podem versionar manifesto sem quebrar
- **Mapping Role↔Permission é per-binding** — o mesmo `Admin` tem permissões diferentes em apps diferentes
- **Formato `resource:action`** (`orders:create`, `users:delete`) — compatível com Casbin, OAuth scopes, Auth0
- **Soft-revocation via `TokenRevocation` (ADR-07)** — quando operador é removido, JWTs vivos são invalidados antes do TTL natural (7d) expirar. Cleanup job em 1h.
- **2FA TOTP** com QR code, opt-in per-binding (`AppBinding.enable_2fa`)

### Compatibilidade

✅ Compatível com: Auth0 scopes, Casbin RBAC, OAuth 2.0 scope mapping, NIST RBAC0/RBAC1
⚠️ Não cobre: ABAC, policy engines (OPA), conditions/expressions
✅ Cloud-ready: campo `aioson_play_id` no `AppBinding` (ADR-10) já prepara migração para cloud multi-tenant na Fase 3

### Onde foge do padrão / vai doer

| Problema | Gravidade | Detalhe |
|---|---|---|
| **Permissions não estão no JWT** | 🔴 Alta | Cada permission check é HTTP roundtrip. Página com 10 botões condicionais = 10 requests. Indústria embute `permissions: string[]` no JWT payload no login. |
| Sem cache em `/rbac/check` | 🟡 Média | Sem Redis/memcached visível. SQLite + Prisma vão sentir em carga real. |
| Falta `GET /me?include=permissions` ou `/me/permissions` | 🟡 Média | Apps fazem N `/rbac/check` para montar UI condicional. |
| **`Role.name` é unique global** | 🟡 Média | Dois `Admin` com semânticas distintas em apps diferentes compartilham o registro `Role`. Pode confundir no painel quando há muitos apps. |
| `AppBinding.auth_schema: String` declarado mas não usado | 🟢 Baixa | Dead code ou extensibility hook futuro — documentar ou remover |
| Sem **role hierarchy** (role herda de role) | 🟢 Baixa | Casbin-style RBAC2 ausente; apps implementam se precisar |
| ⚠️ **`TokenRevocation` precisa ser auditada** | 🔴 Alta (se quebrado) | Validação de `/me` precisa consultar a tabela em **toda** chamada. Não confirmei na lib — possível bug latente. Sem isso, revogação imediata não funciona. |
| Refresh/recovery via UUID (não JWT) | 🟢 Baixa | OK pra MVP; dificulta validação offline |

---

## 3. Pacotes / SDKs existentes

### O que **não** existe (gap)

- **`@aioson/auth-sdk`** no npm — não há pacote oficial
- **Middleware Express oficial** — exemplo copy-paste em `integration-manual.md §8`
- **Hook React oficial** — exemplo copy-paste em `§9`
- **TypeScript types canônicos** (`AccessToken`, `User`, `Permission`...) — cada app duplica
- **CLI scaffold** `aioson-auth bind` — não existe

**Este é o gap de DX mais sério.** Aumenta o custo marginal de cada app novo, multiplica chance de bugs (cada um valida JWT diferente, trata refresh diferente, etc.).

### Pacotes externos prontos para usar **AGORA** sem mudar nada no aioson-auth

| Pacote | Para que | Por quê |
|---|---|---|
| `jose` | Validar JWT localmente | Se aioson-auth expor JWKS, apps validam offline e param de chamar `/me` em cada request |
| `@tanstack/react-query` | Cachear `/me` e `/rbac/check` | Reduz dramaticamente os N requests por página |
| `axios-auth-refresh` | Refresh automático em 401 | Elimina boilerplate de interceptors |
| `@casl/react` ou `casl` | Camada local de policies | Combina permissions do aioson-auth com regras de UI |

### Como ficaria a integração **com SDK** (slice B abaixo)

```ts
// 90% do boilerplate sumiria:
import { createAuthClient, AuthProvider, useAuth, usePermission } from '@aioson/auth-sdk';

const auth = createAuthClient({
  baseUrl: import.meta.env.VITE_AIOSON_AUTH_URL,
  bindingId: import.meta.env.VITE_AIOSON_BINDING_ID,
});

function App() {
  return <AuthProvider client={auth}>{...}</AuthProvider>;
}

function DeleteButton() {
  const { allowed } = usePermission('orders:delete');
  return allowed ? <button>Apagar</button> : null;
}
```

```ts
// Express middleware:
import { requireAuth, requirePermission } from '@aioson/auth-sdk/express';

app.delete('/api/orders/:id',
  requireAuth(),
  requirePermission('orders:delete'),
  handler
);
```

---

## Gaps consolidados por gravidade

### 🔴 Alta — bloqueia escala ou tem bug latente

1. **Permissions não estão no JWT** — N requests por página
2. **CORS hardcoded em localhost** — quebra apps cloud
3. **Sem SDK npm** — cada app reimplementa
4. **`TokenRevocation` precisa de auditoria** — possível bug latente, revogação imediata pode não funcionar

### 🟡 Média — fricção real mas contornável

5. `/me` usa `?token=` em vez de `Authorization: Bearer`
6. Sem cache no `/rbac/check`
7. Falta `/me/permissions`
8. Roles globais com nome único conflitam semanticamente entre apps
9. Rate limiting não exposto/documentado por binding

### 🟢 Baixa — nice-to-have

10. JWKS endpoint para validação offline
11. Role hierarchy
12. ABAC / policy engine
13. CLI scaffold `aioson-auth bind`
14. `AppBinding.auth_schema` é dead code

---

## Plano de slices

Ordem recomendada: **A → C → D → E → B → F** (impacto / dependência).

> Slice B (SDK) por último propositalmente: implementar o SDK antes do JWT carregar permissions seria implementar o gargalo na biblioteca. Faz A primeiro, depois B colhe a vantagem. F depende de B (precisa do `auth.hydrate`).

### ✅ Slice A — Permissions no JWT + auditoria do TokenRevocation — ENTREGUE em 2026-05-13

**Repo:** `aioson-auth`
**Tamanho real:** ~1h30

**Implementado:**
- `login`, `oauthLogin` e `refresh` exigem binding em novas emissões e embedam `binding_id` + `permissions: string[]` no payload do JWT (agregação via `RbacAction.getUserPermissionsForBinding`).
- `/me`, `/me/permissions` e `/rbac/check` recusam token de outro binding com `binding_mismatch`; sessão legada sem binding exige reautenticação.
- `/rbac/check` continua existindo (defense-in-depth server-side) mas vira opcional para casos UI
- Helper `safeGetPermissionsForBinding` em `AuthAction.ts` tolera bindings sem RBAC habilitado (retorna `[]` sem quebrar login)
- **Revogação ampliada:** `deleteRole` e `removePermissionFromRole` em `RbacAction.ts` agora revogam todos os JWTs vivos de users afetados antes da mutação (fechando 2 holes que viravam bug real com JWT enriquecido)

**Auditoria de TokenRevocation:** ✅ JÁ ESTAVA CORRETO.
- `verifyAccessToken` em `AuthAction.ts:130-133` consulta `isUserRevoked(payload.sub)` antes de aceitar token
- `DELETE /:bindingId/rbac/users/:userId` (rbac.ts:114-127) chama `revokeUserTokens` antes do delete
- `DELETE /:bindingId/rbac/users/:userId/roles/:roleId` (rbac.ts:305-316) idem

**Smoke test:**
```bash
POST /api/auth/<bindingId>/login → {accessToken, refreshToken, user}

# JWT payload decoded:
{
  "sub": "9d66d429-...",
  "email": "smoke@test.local",
  "binding_id": "cmouhv55w00015rzuf97e0kq1",
  "permissions": ["tickets:write", "tickets:read"],
  "iat": ..., "exp": ...
}

GET /api/auth/<bindingId>/me?token=<jwt> → mesmo formato sem iat/exp
```

**Quebra de compat:** zero. Tokens antigos (sem `binding_id`/`permissions`) continuam válidos — campos são opcionais. Apps existentes não precisam atualizar.

**Arquivos tocados:**
- `src/actions/AuthAction.ts` — `TokenPayload` ganha `binding_id?`/`permissions?`; `createSession` agrega permissions; assinaturas de `login`/`oauthLogin`/`validateRefreshToken` aceitam `bindingId?`
- `src/routes/auth.ts` — handlers passam `bindingId` para `login`/`oauthLogin`/`validateRefreshToken`
- `src/actions/RbacAction.ts` — `deleteRole` e `removePermissionFromRole` revogam users afetados

### ✅ Slice C — CORS env-driven — ENTREGUE em 2026-05-13

**Repo:** `aioson-auth`
**Tamanho real:** ~15min (versão MVP env-driven; per-binding fica para depois)

**Implementado em `src/app.ts`:**
- Lê `process.env.ALLOWED_ORIGINS` na criação do app
- Formato:
  - **ausente** → fallback legado: aceita `http://localhost:*` e `http://127.0.0.1:*`
  - `*` → aceita qualquer origin (NÃO usar em produção)
  - CSV (`https://a.com,https://b.com`) → matching exato contra a lista
- Same-origin / requests sem header `Origin` (curl, server-to-server) sempre passam
- `.env` ganha linha comentada documentando a var

**Smoke test (5 cenários, todos passaram):**
1. Default + Origin localhost → `Access-Control-Allow-Origin: http://localhost:5173` ✅
2. Default + Origin vercel.app → bloqueado ✅
3. `ALLOWED_ORIGINS=https://vercel.app` + Origin vercel.app → permitido ✅
4. Lista específica + outro domínio → bloqueado ✅
5. Lista específica + localhost → bloqueado (fallback localhost desativa quando lista é explícita; comportamento intencional pra evitar surpresa em prod) ✅

**Não implementado neste slice (fica pendente como Slice C2 se houver demanda):**
- Coluna `allowed_origins` no `AppBinding` (per-binding CORS) — exige migration Prisma e UI no painel. Versão env-driven cobre 95% dos casos.
- Origem inválida retorna `403` estruturado com `cors_origin_not_allowed` e `requestId`; matching local usa parsing de URL, não prefixo textual.

### Slice D — Alias `Authorization: Bearer` em endpoints com `?token=`

### ✅ Slice D — Alias `Authorization: Bearer` — ENTREGUE em 2026-05-13

**Repo:** `aioson-auth`
**Tamanho real:** ~20min

**Implementado:**
- Helper `src/lib/extract-token.ts` (`extractAccessToken(req)`) — prioridade ao header `Authorization: Bearer <jwt>` (RFC 6750), fallback `?token=<jwt>` para retro-compat.
- Aplicado em 5 handlers: `auth.ts /me`, `rbac.ts /rbac/check`, `rbac.ts /2fa/setup|verify|disable`.
- Doc `integration-manual.md` atualizada — Bearer header é o caminho principal documentado.
- **SDK atualizado no mesmo commit batch:** `me`, `check`, `mePermissions` agora chamam com `Authorization: Bearer` (em vez de `?token=`). Servidor aceita ambos, mas SDK virou exemplo de cliente bem-comportado.

**Smoke (6/6 ✅):** Bearer header + ?token= legacy + sem token (401) + SDK usando Bearer + /me/permissions.

**Quebra de compat:** zero.

### Slice F — SSO de operadores per-binding via Tauri keyring (injeção interna entregue)

**Repos:** `aioson-play` (Rust + spawn) + `aioson-auth/sdk` (`initialSession`)
**Tamanho estimado:** ~3-4h (3 sub-fases)
**Status:** 📝 planejado, não implementado

**Goal:** o operador faz login no aioson-play uma vez **por binding** (ex.: 1× pro atendimento, 1× pra farmácia) e o aioson-play injeta os tokens em todo app que abrir contra aquele binding. App pula tela de login.

#### Estado atual já provido

- ✅ `VITE_AIOSON_AUTH_URL` injetado em todo spawn pelo `process_manager` quando o service `aioson-auth` está rodando.
- ✅ `VITE_AIOSON_AUTH_BINDING_ID` injetado pelo `app_process_manager::spawn_app` quando o app tem entry em `auth_app_bindings` (feature S1C.3-S1C.4).
- ✅ Owner-implicit bypass (BR-15) — qualquer rota com Bearer aioson.com identifica o user como owner do binding.

#### O que falta

1. **Storage de tokens de operador no aioson-play** — tabela leve mapeando `(binding_id) → keyring_entry_id` + metadados (`user_email`, `last_login_at`). Tokens vivem no **Tauri keyring** (OS-level, via `tauri-plugin-keyring` já presente nas deps).

2. **UI Settings → Auth → "Conectar como operador"** — modal por binding listando bindings em `auth_app_bindings`. Botão "Conectar" abre form de login. Submit chama `POST /api/auth/:bindingId/login` (via SDK), persiste tokens via Tauri command `operator_session_store(binding_id, access, refresh)`. Tabela mostra "Conectado como x@y" / "Não conectado" / "Sessão expirada" por binding.

3. **Injeção no spawn** — quando `spawn_app` detecta binding via `auth_app_bindings`, ler `operator_session_get(binding_id)` → injetar:
   - `VITE_AIOSON_AUTH_ACCESS_TOKEN`
   - `VITE_AIOSON_AUTH_REFRESH_TOKEN`
   - `VITE_AIOSON_AUTH_OPERATOR_EMAIL` (opt; útil pra UI)

4. **SDK ganha `auth.hydrate(tokens)`** — popula storage com tokens existentes sem fazer login. `useAuth` dispara `onSessionChange` como se viesse de login. App no boot:
   ```ts
   const access = import.meta.env.VITE_AIOSON_AUTH_ACCESS_TOKEN;
   const refresh = import.meta.env.VITE_AIOSON_AUTH_REFRESH_TOKEN;
   if (access && refresh) await auth.hydrate({ accessToken: access, refreshToken: refresh });
   ```

#### Arquitetura (Rust)

```rust
// src-tauri/src/identity/operator_sessions.rs (NOVO)
pub struct OperatorSessionStore { pool: SqlitePool }

// DDL
CREATE TABLE operator_sessions (
  binding_id   TEXT PRIMARY KEY,
  user_email   TEXT NOT NULL,
  keyring_id   TEXT NOT NULL,  -- ID lógico no keyring (ex: "aioson-auth:<binding>:tokens")
  expires_at   TEXT,            -- ISO; pra UI mostrar "Sessão expira em X"
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

// Tauri commands
operator_session_store(binding_id, access, refresh, email, expires_at)
  → escreve JSON `{access, refresh}` no keyring sob `<binding_id>`, upsert na tabela

operator_session_get(binding_id) -> Option<{access, refresh, email, expires_at}>
  → lê do keyring + tabela

operator_session_delete(binding_id)
  → remove do keyring + tabela

operator_session_list() -> Vec<{binding_id, app_name, email, expires_at, connected}>
  → JOIN com auth_app_bindings pra UI
```

#### Sub-fases sugeridas

- **F1 — backend foundation (~1h):** criar `operator_sessions.rs`, migration, 4 Tauri commands acima, hookar com keyring plugin. Testes unit em Rust.
- **F2 — injeção no spawn (~30min):** estender `app_process_manager::spawn_app` para ler `operator_session_get(binding_id)` e injetar env vars. Smoke: spawnar app dummy e confirmar env presentes.
- **F3 — SDK hydrate (~30min):** `auth.hydrate({ accessToken, refreshToken, user? })` no SDK; popula cache + storage; emite `onSessionChange`. Test no smoke contra real.
- **F4 — UI Settings → Auth → Operator sessions (~1-1.5h):** card por binding em `auth_app_bindings` mostrando estado da sessão. Botão "Conectar" abre modal com login form (usa SDK), submit chama `operator_session_store`. Botão "Desconectar" chama `operator_session_delete`. Empty state quando nenhum app tem RBAC habilitado.
- **F5 — dogfooding (~30min):** depois de F1-F4, atualizar `AuthPage` (ou criar `OperatorBoot.tsx`) que tenta hydrate antes de mostrar form de login. Se hydrate funciona, vai direto pra estado logged.

#### Edge cases

- **Refresh expirado (>7d):** `auth.hydrate` tenta `me()` → recebe 401 → tenta `refresh()` → também 401 → emite `onSessionChange(null)`. App mostra form. UI no aioson-play mostra "Sessão expirada — reconectar".
- **TokenRevocation no servidor:** operador removido do binding → `revokeUserTokens` registrou → próximo `me()` retorna 401. Mesmo caminho do anterior.
- **Senha mudou no aioson-auth:** se `resetPassword` invalida todas as sessions (já invalida — `AuthAction.resetPassword` faz `prisma.authSession.deleteMany`), refresh para → mesmo caminho.
- **App rodando standalone (fora do Play):** env vars vazias → SDK não hydrata → flow tradicional. **Zero quebra de compat.**
- **Múltiplas sessões do mesmo user em apps diferentes:** OK, tokens são por binding. `auth_app_bindings` é único por binding. Operador pode estar logado como `joão@x.com` no atendimento e `maria@x.com` na farmácia simultaneamente.
- **Operador X owner:** se o owner abre app cujo binding tem `auth_app_bindings` ATIVO + tem operator_session salva, qual usar? **Decisão sugerida:** operator_session ganha (mais específico que owner-implicit). Owner bypass continua funcionando se a sessão estiver ausente/expirada.

#### Trade-offs e perguntas em aberto

- **Senha em texto via UI:** o login modal envia email/senha pro `POST /:bindingId/login` (mesmo flow padrão). HTTPS local OK; usuário do Play já confia no servidor.
- **Logout em cascata?** Se user clica "Desconectar" no Play, devemos chamar `POST /:bindingId/logout` pra revogar server-side, ou só apagar local? **Sugestão:** chamar `logout` por default; tem checkbox "Manter sessão server-side" pra casos onde o user logou em outro client.
- **Auto-refresh proativo:** o Play poderia agendar `auth.refresh()` periódico pra estender as sessões antes do TTL natural (7d) expirar. Útil pra dispositivos que ficam dias sem abrir o app específico. Pode ficar pra F6 opcional.
- **Multi-conta por binding:** F1-F5 assumem 1 operador por binding por instalação. Se quiser permitir switch entre operadores (ex.: shift change numa farmácia), expandir tabela com `(binding_id, slot_id)` PK. **Não recomendo no MVP.**

#### Quebra de compat

- ✅ Apps existentes que ignoram `VITE_AIOSON_AUTH_*` env vars continuam funcionando.
- ✅ Apps que usavam o SDK e mostravam tela de login continuam funcionando (hydrate é opcional).
- ⚠️ Apps que decidirem implementar hydrate precisam saber lidar com hydrate falhando (mostrar form). SDK pode expor `auth.tryHydrateFromEnv()` que automatiza tudo + retorna boolean — facilitar.

#### Estimativa total

~3-4h spread em 5 sub-fases F1-F5. Cabe em 1 sessão dedicada **ou** spread em 2 sessões (F1+F2+F3 backbone numa, F4+F5 UI/dogfooding noutra).

---

### ✅ Slice E — Endpoint `/me/permissions` — ENTREGUE em 2026-05-13

**Repo:** `aioson-auth`
**Tamanho real:** ~10min

**Implementado:**
- `GET /api/auth/:bindingId/me/permissions` retorna `{ permissions: string[] }` agregadas server-side. Aceita Bearer + ?token=.
- `RbacAction.getUserPermissionsForBinding` reusado — se RBAC desabilitado no binding, retorna `[]` sem propagar erro (`.catch(() => [])`).
- SDK ganhou `auth.mePermissions()`.

**Útil pra:** apps que validam JWT offline (futuro JWKS) e só precisam refresh das permissions sem refazer todo `/me`.

**Quebra de compat:** zero (endpoint novo).

### ✅ Slice B — SDK npm `@aioson/auth-sdk` — ENTREGUE (MVP enxuto) em 2026-05-13

**Localização:** `C:\dev\services\aioson-auth\sdk\` (subpasta do aioson-auth)
**Tamanho real:** ~2h30 (MVP enxuto, sem JWKS/tests automatizados/CLI scaffold)

**Implementado:**
- Pacote `@aioson/auth-sdk@0.1.0` com 3 entries: `.`, `./react`, `./express`
- Build dual ESM/CJS via tsup, com `.d.ts` para todos os entries
- Core (`@aioson/auth-sdk`): `createAuthClient`, `AuthError`, `decodeJwtPayload`, `memoryStorage`, `localStorageAdapter`, types canônicos
- `AuthClient` cobre: `login`, `loginOAuth`, `logout`, `refresh`, `me`, `check` (server-side), `hasPermission` (síncrono, lê JWT), `getPermissions`, `getAccessToken`, `getSession`, `onSessionChange`
- Auto-refresh em 401 com promise compartilhada (múltiplas requests caem em 1 refresh)
- React (`@aioson/auth-sdk/react`): `<AuthProvider>`, `useAuth`, `usePermission`
- Express (`@aioson/auth-sdk/express`): `requireAuth`, `requirePermission`. Aceita `Authorization: Bearer` E fallback `?token=`. Popula `req.auth: TokenPayload`. Validação server-side opcional (default on) consulta `/me` para checar `TokenRevocation`.

**Smoke test (8/8 ✅):**
1. login → tokens persistidos
2. payload do JWT inclui `binding_id` + `permissions`
3. `hasPermission()` síncrono retorna boolean correto
4. `getPermissions()` lista correta
5. `/me` carrega `binding_id` + `permissions`
6. `check()` server-side bate com hasPermission
7. `refresh()` rotaciona access + refresh tokens e re-agrega permissions
8. `logout()` limpa sessão server + client

**Não implementado (fica para iterações futuras se houver demanda):**
- Vitest cobrindo cada export (smoke contra real cobre o caminho feliz)
- JWKS endpoint no aioson-auth + validação offline com `jose` no SDK
- CLI scaffold `npx @aioson/auth-sdk init`
- Cache do `/me` com TTL configurável (parcialmente coberto pelo `hasPermission` síncrono)

**Como apps consomem:**

```bash
# Dentro do monorepo / dev local:
npm install file:../aioson-auth/sdk
```

Ver `aioson-auth/sdk/README.md` para API completa.

**API mínima:**

```ts
// Core
createAuthClient({ baseUrl, bindingId, storage? })
client.login(email, password) → { user, accessToken, refreshToken }
client.logout()
client.refresh()
client.me() → { sub, email, permissions }

// React
<AuthProvider client={client}>
useAuth() → { user, login, logout, loading }
usePermission(name) → { allowed, loading }
useRequireAuth() → redirect if not logged in

// Express
import { requireAuth, requirePermission } from '@aioson/auth-sdk/express';
```

**Stack:** TypeScript + tsup (dual ESM/CJS) + Vitest + Changesets para versionamento. Publica como `@aioson/auth-sdk@0.1.0`.

**Dependências:** apenas `jose` (validação JWT offline quando JWKS estiver disponível). Sem React/Express como deps — usar `peerDependencies`.

**Por que esperar slice A:** O `usePermission` ideal vem do JWT (`useAuth().user.permissions.includes(name)`) — sem N requests. Se implementar antes de A, o SDK vai bater em `/rbac/check` em loop, contornando o problema mas não resolvendo.

---

## Coexistência aioson-auth × aioson.com auth

Existem **dois sistemas de auth distintos** no ecossistema. Não confundir:

| | `aioson-auth` (local) | `aioson.com` (cloud) |
|---|---|---|
| Doc canônica | Este arquivo + `aioson-auth/docs/integration-manual.md` | `app-cloud-auth.md` |
| Propósito | Login + RBAC de **operadores** dos apps locais instalados no Play | Trial/billing/subscription contra `aioson.com` |
| Como o app recebe | `bindingId` + JWT via REST `:3091` | Env var `AIOSON_COM_TOKEN` injetada pelo Play |
| Token storage | `localStorage` no client / `AuthSession` no server | OS keyring (gerenciado pelo Play) |
| Identidade subjacente | `GlobalUser` no aioson-auth | Conta `aioson.com` do dono da licença |

**Quando um app precisa de cada:**
- Cadastro de operadores, login intra-app, controle de acesso por tela/ação → `aioson-auth`
- Validar trial/subscription, contar uso para billing, sync com marketplace → `aioson.com`

O SDK do slice B deve deixar essa separação explícita (`AuthClient` vs `CloudClient`) para apps novos não embaralharem.

---

## Atualizações deste doc

- **2026-05-13** — Criação. Análise em sessão `@deyvin`. Base de fontes: `aioson-auth@1.0.0` (dev-link em `C:\dev\services\aioson-auth\`).
- **2026-05-13** — ✅ Slice A entregue: JWT enriquecido com `binding_id` + `permissions`, revoke ampliado em `deleteRole`/`removePermissionFromRole`. Auditoria do TokenRevocation confirmou que validação `/me` já consulta a tabela corretamente (não era bug latente).
- **2026-05-13** — ✅ Slice C entregue: CORS env-driven via `ALLOWED_ORIGINS` (CSV, `*` ou ausente para legacy). Schema mudou? **Não.** Per-binding fica para Slice C2 quando houver demanda.
- **2026-05-13** — ✅ UX A1+A2 entregues no painel (RbacPermissionsPage): auto-fill do `name` da permissão a partir de `resource:action` (com flag de "touched" para não atropelar edição manual) + bloco "Associar a perfis" com checkboxes inline no card de criação, estilo Spatie Laravel-Permission. Roles `owner` filtradas (BR-15 reserved role).
- **2026-05-13** — ✅ Slice B entregue (MVP enxuto): pacote `@aioson/auth-sdk@0.1.0` em `aioson-auth/sdk/`, com 3 entries (core, react, express), build dual ESM/CJS, smoke 8/8 verde contra aioson-auth real. Apps consomem via `npm install file:../aioson-auth/sdk`. Tests automatizados + JWKS offline + CLI scaffold ficam para iterações futuras.
- **2026-05-13** — ✅ Dogfooding parcial: `AuthPage` do painel (rota `/auth/:bindingId`) migrada para usar o SDK. Validou que o pacote roda no client bundle do Vite, que `createAuthClient` mais `auth.login/register/forgotPassword` funcionam com `baseUrl=window.location.origin`, e que `auth.getPermissions()` lê permissions do JWT logo após o login. SDK ganhou `register`, `forgotPassword`, `resetPassword` para fechar o ciclo de auth básico (não cobertos no MVP inicial). Páginas administrativas (RbacRolesPage, RbacUsersPage etc.) usam fluxo admin separado (`adminToken` via `/api/admin/login`) e portanto não fazem parte do dogfooding do SDK.
- **2026-05-13** — ✅ Slice D + E entregues: helper `extractAccessToken` no aioson-auth aceita `Authorization: Bearer <jwt>` (preferido) ou `?token=<jwt>` (legacy) em `/me`, `/rbac/check`, `/2fa/*`. Novo endpoint `GET /me/permissions` retorna `{ permissions: string[] }` fresh do DB. SDK atualizado: `me`, `check`, `mePermissions` agora usam Bearer header; novo método `auth.mePermissions()`. Smoke 6/6 verde.
- **2026-07-10** — Auth/Play hardening: Play mantém injeção interna de SSO via keyring e o SDK ganhou `initialSession` com validação de binding. O consumo automático em frontend continua sob revisão de exposição; apps seguem usando a tela de login do SDK como contrato público. O Auth agora persiste binding na sessão, roda rotação transacional, devolve erro estruturado/request-id, rejeita CORS prefix-confusion e o backend de app usa `verifyRemoteBearer`.
- Atualizar este doc sempre que um slice acima for entregue (marcar com ✅), ou quando um novo gap for identificado.
