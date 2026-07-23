# AIOSON Play — Guia AI-First de Integração de Apps

> **Para IAs (Claude Code, Codex, Cursor, etc.) e desenvolvedores humanos** que vão
> construir um app destinado a rodar dentro do **aioson-play**. Este é o **ponto
> de entrada único** — leia este doc primeiro, depois vá para os detalhados.
>
> Atualizado: 2026-05-13. Exemplo de referência viva: `C:\dev\apps\aioson-atendimento`.

---

## 0. TL;DR pra IA — leia isto antes de criar arquivo nenhum

```
Você está criando/modificando um app que vai rodar dentro do aioson-play
(desktop Tauri 2). O app NÃO é um servidor web standalone — ele é um
processo filho gerenciado pelo Play. Antes de escrever código:

1. Responda 4 perguntas (seção 2 deste doc) — elas decidem o stack.
2. Crie OBRIGATÓRIO: `manifest.json` no root.
3. Crie OBRIGATÓRIO se tem UI: `app-config.yaml` declarando `data_bindings`.
4. Se tem API: implemente `GET /api/aioson-play` (capabilities) e use
   `process.env.PORT` — NUNCA hardcode porta.
5. Se precisa de login de operador: declare `requires_services: ["aioson-auth"]`,
   declare `auth.permissions[]` no manifest e use o `bindingId` injetado em
   `VITE_AIOSON_AUTH_BINDING_ID`.
6. Se vai chamar aioson.com (trial/billing): leia `app-cloud-auth.md`.
7. Se precisa de LLM/vision/audio: consuma a chain exportada pelo Play. A ordem
   é gerada automaticamente a partir dos modelos validados por operação
   (`text_generation`, `code_generation`, `image_understanding`,
   `image_generation`, `video_understanding`, `video_generation`,
   `speech_to_text`, `text_to_speech`, `audio_understanding`,
   `realtime_voice`) e referencia apenas modelos já validados;
   não crie API keys/configurações paralelas no app.

Validação final: rode checklist da seção 8 deste doc antes de declarar pronto.
```

---

## 1. Como apps rodam dentro do Play (panorama)

O aioson-play é um **runtime local** (desktop Tauri 2) que **spawna** seu app
como processo filho e o expõe ao usuário através de uma `AppPage` no shell. Seu
app **não é** um web app autônomo — ele é gerenciado:

```
┌──────────────────────────────────────────────────────┐
│            AIOSON Play (Tauri 2 desktop)             │
│  ┌────────────────────────────────────────────────┐  │
│  │             Frontend (React)                   │  │
│  │   AppPage → webview embedado do seu sistema    │  │
│  └─────────────────────┬──────────────────────────┘  │
│                        │                              │
│  ┌─────────────────────▼──────────────────────────┐  │
│  │   Rust Backend (process_manager, spawn)        │  │
│  │   Aloca porta, injeta env vars, supervisiona   │  │
│  └─────────────────────┬──────────────────────────┘  │
│                        │ spawn npm run dev / start    │
│                        ▼                              │
│  ┌────────────────────────────────────────────────┐  │
│  │   SEU APP (Node.js, processo filho)            │  │
│  │   • lê process.env.PORT                        │  │
│  │   • lê VITE_AIOSON_* injetadas                 │  │
│  │   • expõe /api/aioson-play                     │  │
│  │   • fala com http://localhost:5180 (Play)      │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

Quem **cuida da porta**? O Play, sempre. Você lê de `process.env.PORT`.

Quem **descobre seus endpoints**? O Play, via `GET /api/aioson-play` no boot.

Quem **autentica o operador**? O aioson-auth (Play Service separado). Seu app
pede login OU recebe a sessão pré-existente via env vars (Slice F, futuro).

---

## 2. 4 perguntas-decisão (faça antes de codar)

### Pergunta 1 — Seu app tem UI visual (dashboard, formulário, tabela)?

| Resposta | Implicação |
|---|---|
| **Sim** | Você precisa de um **Sistema** (UI em webview) — declare em `manifest.json` `systems[]` ou em `stack: "split"` |
| **Não** | App puramente CLI/LLM — executa via sidecar, output via NDJSON |

> No `aioson-atendimento`, a resposta é "sim" → tem `stack: "split"` com `frontend` (Vite) + `backend` (Express).

### Pergunta 2 — Seu app expõe uma API HTTP?

| Resposta | Implicação |
|---|---|
| **Sim** | `manifest.json` precisa de `has_api: true`. Play aloca porta dinâmica (3300+) e injeta `PORT` env. Você implementa `GET /api/aioson-play`. |
| **Não** | App apenas CLI. Pode ignorar `/api/aioson-play`. |

### Pergunta 3 — Seu app precisa de dados externos (banco do cliente, API externa)?

| Resposta | Implicação |
|---|---|
| **Sim** | Declare `data_bindings` em `app-config.yaml` (slots de dados que o admin do Play vai vincular a Global Connectors via Settings → App Data Sources). |
| **Não** | App self-contained, sem dependência externa. |

> No `aioson-atendimento`, há slots `busca-produtos`, `busca-preco`, `historico-pedidos`, `webhook-pedido` — todos resolvidos via Global Connectors MCPI/REST do Play.

### Pergunta 4 — Seu app precisa autenticar operadores/usuários?

| Resposta | Caminho |
|---|---|
| **Não** | App público dentro do Play (raro). Sem auth. |
| **Sim, operadores no aioson-auth** | App declara `requires_services: ["aioson-auth"]` + Play injeta `VITE_AIOSON_AUTH_URL` + `VITE_AIOSON_AUTH_BINDING_ID`. Use o SDK `@aioson/auth-sdk` (instale via `npm install file:../aioson-auth/sdk` em dev). |
| **Sim, trial/billing aioson.com** | Caminho diferente. Veja `app-cloud-auth.md`. Token injetado como `AIOSON_COM_TOKEN`. |
| **Ambos** | OK — `aioson-auth` para operadores locais, `aioson.com` para licença/trial. São independentes. |

---

## 3. Snippet pra adicionar ao `CLAUDE.md` / `AGENTS.md` do seu app

> Cole este bloco no `CLAUDE.md` (Claude Code) e `AGENTS.md` (Codex/Cursor) do **seu app** assim que criar o projeto. Isso ensina a IA a respeitar o contrato com o Play sem você precisar repetir em cada prompt.

```markdown
## AIOSON Play integration

Este app é destinado a rodar dentro do **aioson-play** (desktop Tauri 2).
O Play é um runtime local que spawna este processo filho.

### Regras invioláveis para qualquer mudança que toque runtime, ports, auth ou manifest:

1. **NUNCA hardcode porta.** Sempre `process.env.PORT || <fallback>`.
   Em split-stack, também `process.env.BACKEND_PORT` etc. Ver `manifest.json` `processes`.
2. **NUNCA crie tela própria de login de operador.** Use `@aioson/auth-sdk` e
   o `bindingId` vindo de `import.meta.env.VITE_AIOSON_AUTH_BINDING_ID`.
3. **NUNCA chame `https://aioson.com` direto do browser.** Faça proxy pelo
   backend Express seu. Ver `app-cloud-auth.md`.
4. **NUNCA invente env var.** Lista canônica:
   - `PORT`, `BACKEND_PORT` — alocadas pelo Play no spawn
   - `VITE_AIOSON_PLAY_URL` — sempre `http://localhost:5180`
   - `VITE_AIOSON_APP_SLUG` — slug deste app (= `manifest.json` slug)
   - `VITE_AIOSON_AUTH_URL` — URL do Play Service `aioson-auth` (se rodando)
   - `VITE_AIOSON_AUTH_BINDING_ID` — UUID do binding do app no aioson-auth (se vinculado)
   - `AIOSON_COM_TOKEN` — token cloud (se owner logou no aioson-play)
5. **MANIFEST é fonte de verdade.** Se mudar runtime/ports/processes, atualize
   `manifest.json` primeiro e justifique no commit.
6. **App-config.yaml `data_bindings` declaram slots de dados.** O admin do Play
   vincula a Global Connectors. Em runtime, use `POST http://localhost:5180/api/mcp/execute`
   com `alias` do slot. Ver `app-data-bindings.md`.
7. **Endpoints HTTP devem expor `GET /api/aioson-play`** retornando o schema de
   capabilities (`aioson-endpoint-protocol.md`). Sem isso, o Bridge App e o LLM
   orquestrador não enxergam suas rotas.

### Documentação canônica (no repo do aioson-play, em `.aioson/docs/integrations/`):

- `ai-app-integration.md` — guia AI-first (este referencia)
- `aioson-app-developer-guide.md` — guia detalhado, 609 linhas
- `aioson-endpoint-protocol.md` — protocolo `/api/aioson-play`
- `port-management.md` — alocação de portas, faixas, registry
- `app-data-bindings.md` — slots de dados via Global Connectors
- `app-cloud-auth.md` — auth contra aioson.com (cloud)
- `dev-link-install.md` — instalação via symlink em dev
- `local-dev-testing.md` — como rodar app no Play em modo dev

### Ao fazer qualquer commit que toque manifest, server, env vars ou auth:

- [ ] Atualizei `manifest.json` se mudou runtime/ports/processes/requires_services
- [ ] Atualizei `app-config.yaml` se mudou data_bindings
- [ ] Endpoints novos estão no `GET /api/aioson-play` capabilities
- [ ] Code não hardcoda porta nem URL
- [ ] Se mexi em auth: estou usando `@aioson/auth-sdk`, não fetch direto
```

---

## 4. Arquivos obrigatórios

### 4.1 `manifest.json` no root do app

**Mínimo (app fullstack sem split):**

```json
{
  "name": "Meu App",
  "slug": "meu-app",
  "version": "1.0.0",
  "description": "O que ele faz",
  "runtime": "node",
  "has_api": true,
  "api_base_url": "http://localhost:3301",
  "icon": "assets/icon.svg",
  "thumb": "assets/thumb.svg"
}
```

**Split-stack (backend + frontend separados, como o atendimento):**

```json
{
  "name": "Aioson Atendimento",
  "slug": "atendimento",
  "version": "1.0.0",
  "runtime": "node",
  "has_api": true,
  "stack": "split",
  "processes": {
    "frontend": { "port_env": "PORT",         "framework": "vite" },
    "backend":  { "port_env": "BACKEND_PORT", "framework": "node" }
  },
  "webview_target": "frontend",
  "api_base_url": "http://localhost:3301",
  "requires_services": ["aioson-auth"]
}
```

Campos relevantes:

| Campo | Quando incluir |
|---|---|
| `slug` | Sempre. Kebab-case, único, **estável** (não mude) |
| `version` | Sempre. SemVer |
| `runtime` | `"node"` é o suportado hoje |
| `has_api` | `true` se app expõe HTTP API |
| `api_base_url` | Fallback pra dev standalone — Play **reescreve** com a porta alocada na instalação |
| `stack` | `"split"` se backend e frontend são processos separados (concurrently) |
| `processes` | Só em split-stack — mapeia processo → env var de porta + framework |
| `webview_target` | Qual processo o Play vai embedar no webview (geralmente `"frontend"`) |
| `requires_services` | Lista de Play Services obrigatórios (ex: `["aioson-auth"]`). Play valida no install |
| `auth` | Manifesto de permissões/policies do app quando usa `aioson-auth`. Play sincroniza com o Auth |
| `icon`, `thumb` | Caminhos relativos ao app (SVG/PNG/WebP). Sem isso → fallback genérico |

Ver `aioson-app-developer-guide.md` § 7 pra detalhes de identidade visual.

### 4.2 `app-config.yaml` (se app precisa de dados externos)

```yaml
output:
  type: file
  format: text
  destination: ""

data_bindings:
  - id: "busca-produtos"
    description: "Busca produtos no catálogo da farmácia por nome ou princípio ativo"
    accepted_types: ["mcpi", "api", "mcp"]
    required_params: ["search"]

  - id: "webhook-pedido"
    description: "Notifica sistema externo quando um pedido é confirmado"
    accepted_types: ["api"]
    required_params: ["pedido_json"]
```

Cada `id` vira um **slot** que o admin do Play vincula a um Global Connector via
`Settings → App Data Sources`. Em runtime seu app chama:

```ts
const res = await fetch('http://localhost:5180/api/mcp/execute', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ alias: 'busca-produtos', params: { search: 'dipirona' } }),
});
const { data, error } = await res.json();
```

### 4.3 `package.json` — scripts esperados

Play spawna por padrão `npm run dev`. Se for split-stack, garanta que o `dev`
script orquestra ambos os processos (geralmente via `concurrently`):

```json
{
  "scripts": {
    "start": "ts-node src/server.ts",
    "dev": "concurrently --kill-others-on-fail --names backend,dashboard --prefix-colors blue,magenta \"npm:dev:server\" \"npm:dev:dashboard\"",
    "dev:server": "ts-node-dev --respawn --transpile-only --ignore-watch node_modules src/server.ts",
    "dev:dashboard": "cd dashboard && vite"
  }
}
```

> Padrão usado pelo `aioson-atendimento`. Em dev-link (symlink), Play roda `npm run dev`; em produção marketplace, Play roda `npm start` ou o `start_command` do `system` no manifest.

### 4.4 Endpoint `GET /api/aioson-play` (se `has_api: true`)

Sem isso, o Bridge App e o LLM orquestrador não descobrem seus endpoints. Schema
mínimo:

```ts
app.get('/api/aioson-play', (_req, res) => {
  res.json({
    name: 'Meu App',
    slug: 'meu-app',
    version: '1.0.0',
    api_base_url: `http://localhost:${process.env.PORT || 3301}`,
    endpoints: [
      {
        path: '/api/orders',
        method: 'POST',
        description: 'Cria um pedido novo',
        body: { type: 'object', required: true, schema: { customer_id: 'number', items: 'array' } },
        auth: true,
        auth_type: 'bearer'
      }
    ],
    events: [
      { topic: 'order.created', description: 'Pedido criado com sucesso',
        payload_schema: { order_id: 'number', total: 'number' } }
    ]
  });
});
```

Schema completo: `aioson-endpoint-protocol.md`.

---

## 5. Env vars injetadas (lista canônica)

Quando o Play spawna seu app, **estas** estão garantidas no `process.env`:

| Env var | Sempre? | Significado |
|---|---|---|
| `PORT` | Sim | Porta alocada para seu processo (frontend em split-stack) |
| `BACKEND_PORT` | Split-stack | Porta do processo backend |
| `AIOSON_APP_SLUG` | Sim | Slug do seu app (`manifest.json`) |
| `AIOSON_APP_DIR` | Sim | Path absoluto do diretório do app |
| `VITE_AIOSON_PLAY_URL` | Sim | `http://localhost:5180` — ProductBridge do Play |
| `VITE_AIOSON_APP_SLUG` | Sim | Mesmo que `AIOSON_APP_SLUG`, prefixado pra Vite |
| `VITE_AIOSON_AUTH_URL` | Se aioson-auth rodando | Ex.: `http://localhost:3091` |
| `VITE_AIOSON_AUTH_BINDING_ID` | Se app tem binding | UUID do `AppBinding` no aioson-auth |
| `AIOSON_COM_TOKEN` | Se owner logou no aioson.com | Bearer pra chamar `https://aioson.com/api/*` |

> Para frontend Vite, qualquer var prefixada `VITE_` aparece em `import.meta.env`. Para backend Node, use `process.env`.

---

## 6. Autenticação — 3 caminhos

### 6.1 Apenas owner (mínimo)

Se o app só precisa diferenciar "logado vs não logado" e o usuário é sempre o dono
da licença, use **owner-implicit bypass (BR-15)**: leia `VITE_AIOSON_AUTH_URL`
+ verifique se há `Authorization: Bearer <aioson-com-token>` quando o app é
chamado pelo Play. Para detalhes: `app-cloud-auth.md`.

### 6.2 Operadores via aioson-auth (RBAC completo)

Use `@aioson/auth-sdk`. Apresentação completa: `auth-integration-gaps.md` § Slice B.

Declare o catálogo de permissões no `manifest.json`. O Play lê esse bloco no
inventário e o `aioson-auth` registra as permissões no binding já existente para
o admin aplicar em perfis globais.

```json
{
  "requires_services": ["aioson-auth"],
  "auth": {
    "version": 1,
    "permissions": [
      "orders:read",
      { "name": "orders:create", "label": "Criar pedidos" },
      { "resource": "settings", "action": "write", "label": "Alterar configurações" }
    ],
    "policies": [
      { "id": "page:orders", "kind": "route", "path": "/orders", "requires": ["orders:read"] },
      { "id": "api:create-order", "kind": "api", "method": "POST", "path": "/api/orders", "requires": ["orders:create"] }
    ]
  }
}
```

Regra de responsabilidade:

- O app implementa os gates/policies no frontend/backend com o SDK.
- O manifest declara o catálogo que o Play/Auth conseguem descobrir.

### 6.3 Ativar o auth no Play (Settings → Auth → "Ativar")

Declarar o bloco `auth` no manifest **não liga o auth sozinho**. O operador precisa
**ativar** o app em `Settings → Auth` (botão "Ativar" na lista de apps). A ativação cria
o binding em aioson-auth e passa a injetar `VITE_AIOSON_AUTH_URL` + `VITE_AIOSON_AUTH_BINDING_ID`
no próximo spawn.

> **Injeção cobre os TRÊS caminhos de spawn** (desde 2026-07-08): draft/preview
> em desenvolvimento (`spawn_draft`), app instalado de runtime moderno —
> nextjs/vite/node (`do_spawn_app_runtime`) **e** o app Node legado via sidecar
> (`spawn_app`). Todos passam por `auth_app_bindings::resolve_auth_env(app, pool,
> slug)`, que resolve o binding ativo, a URL do aioson-auth (service local pela
> porta real, ou o master numa federação) e os tokens SSO de operador. Antes só
> o caminho legado injetava — apps modernos/drafts subiam sem a env e caíam na
> tela de config manual ("Conectar ao aioson-auth") **mesmo com o auth ativado**.
> Como a env é imutável pós-spawn, **feche e reabra o app** depois de ativar.
> Tokens SSO internos podem acompanhar esse spawn, mas não são uma API pública
> de frontend. O fluxo canônico continua sendo a tela de login dirigida pelo SDK.

**Não precisa** de flag `supports_auth`/`auth_supports` no manifest. O Play deriva
"ativável" de qualquer um destes (fonte: `auth_app_inventory.rs`, `supports_auth`):
`requires_services` contém `"aioson-auth"`, **ou** `accepted_roles` não-vazio, **ou** um
bloco `auth` com `permissions`/`policies`.

**Pré-requisitos pra "Ativar" funcionar** (se algum faltar, a ativação falha):

1. **O app precisa aparecer no inventário** de `Settings → Auth`. Só aparecem apps
   **instalados**, **dev-linkados** ou **drafts** no Play — uma pasta de código-fonte solta
   (ex.: `C:\dev\meu-app`) **não** aparece. Instale ou dev-linke primeiro
   (`Instalar App → Linkar pasta (dev)`). Manifest precisa de `slug` válido e sem warning
   bloqueante (`duplicate_app_slug`, `draft_not_bindable`, `invalid_app_slug`).
2. **Owner logado no aioson.com com token válido** — o Play usa o bearer do dono pra criar
   o admin binding. Sem login → `missing_aioson_com_bearer`. **Logado mas com token
   vencido** → `admin_bindings_http_401: invalid_or_expired_token` — o Play **não renova**
   o token do aioson.com (`refresh_token` sempre `""`, sem checagem de expiração), então a
   sessão guardada no keyring vence sozinha. **Correção: deslogar e logar de novo no
   aioson.com dentro do Play** e tentar "Ativar" outra vez.
3. **Play Service `aioson-auth` rodando** (`Settings → Services`). "Ativar" faz
   `POST {aioson-auth}/api/auth/admin/bindings`. Dois estados de "não subiu":
   - slug **ausente** do mapa de processos → `"aioson-auth não está rodando — inicie o Play
     Service"`.
   - slug **presente** mas processo morto (crashou pós-spawn; badge ainda diz "rodando")
     → `aioson_auth_offline: error sending request…`. **Correção: parar e iniciar o
     `aioson-auth` em `Settings → Services`** (ou reiniciar o Play). Detalhes em
     `.aioson/docs/play/auth-services-and-testing.md` § "aioson_auth_offline".

**"Cliquei em Ativar e não aconteceu nada":** builds do Play até 2026-07-07 engoliam o
erro do backend silenciosamente. Corrigido — a falha agora aparece como aviso na aba. Se
aparecer `admin_bindings_http_401: invalid_or_expired_token`, é o item 2 acima (sessão
aioson.com vencida — relogar). Detalhes/failure modes em
`.aioson/docs/play/auth-services-and-testing.md` § "Enabling auth".
- O Play sincroniza esse catálogo com o Auth quando o owner sincroniza o inventário.
- O Auth permite associar essas permissões aos perfis. Ele não deve varrer código do app nem criar permissões manuais para apps manifest-driven.

```bash
# Em dev (apps no monorepo local):
npm install file:../aioson-auth/sdk
```

O app **desenha a própria tela de login** (email+senha), mas **dirige tudo pelo
SDK** — nunca `fetch('/api/auth/*')` na mão nem um storage de token paralelo. O
Play injeta `VITE_AIOSON_AUTH_URL` + `VITE_AIOSON_AUTH_BINDING_ID` no spawn, então
o cliente já sabe contra quem logar — **não crie tela de "configurar URL/binding"**
(se você está vendo uma, é porque as env não chegaram — atualize o Play).

**Setup do cliente + provider (uma vez):**

```tsx
// dashboard/src/auth.ts
import { createAuthClient, localStorageAdapter } from '@aioson/auth-sdk';

export const auth = createAuthClient({
  baseUrl: import.meta.env.VITE_AIOSON_AUTH_URL,        // injetado pelo Play
  bindingId: import.meta.env.VITE_AIOSON_AUTH_BINDING_ID, // injetado pelo Play
  storage: localStorageAdapter(), // persiste a sessão → usuário segue logado no próximo boot
});
```

**Gate de sessão + tela de login** (é o "se não estiver logado, mostra login"):

```tsx
// dashboard/src/App.tsx
import { useState } from 'react';
import { AuthProvider, useAuth, usePermission } from '@aioson/auth-sdk/react';
import { auth } from './auth';

function App() {
  return (
    <AuthProvider client={auth}>
      <AuthGate><Dashboard /></AuthGate>
    </AuthProvider>
  );
}

// O gate: enquanto hidrata do storage → splash; sem sessão → login; com sessão → app.
function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <Splash />;          // AuthProvider está lendo o storage
  if (!session) return <LoginScreen />;    // não logado → formulário
  return <>{children}</>;                   // logado → app real
}

function LoginScreen() {
  const { login, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    // login() persiste os tokens e dispara onSessionChange → o AuthGate
    // re-renderiza sozinho e mostra o app. Não precisa navegar na mão.
    try { await login({ email, password }); }
    catch { /* `error` do useAuth já carrega a mensagem */ }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={onSubmit}>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" />
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Senha" />
      {error && <p role="alert">{error.message}</p>}
      <button disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
    </form>
  );
}
```

**Cadastro (opcional — somente em binding sem RBAC):** `auth.register({ email, password })`.
Bindings com RBAC são owner-managed: o operador deve ser criado no aioson-auth e
vinculado ao app em `Configurações → Auth` no Play. Nesses bindings, cadastro
público é rejeitado e login/refresh exigem uma `UserRole` ativa no binding.
cria a conta (no aioson-auth), depois `auth.login(...)`. ⚠️ Uma conta recém-criada
**não tem role no binding** — quem cadastra fica logado mas sem acesso até o dono
atribuir um role em `Settings → Auth` do Play. Se seu app checa permissão (o normal),
esse é o gate natural; se ele só checa "logado?", ofereça **só login** e deixe o dono
pré-criar os usuários.

**Logout e gate de permissão dentro do app:**

```tsx
function Header() {
  const { session, logout } = useAuth();
  return <button onClick={() => void logout()}>Sair ({session?.user.email})</button>;
}

function DeleteButton() {
  const { allowed } = usePermission('orders:delete'); // lê do JWT, sem network
  if (allowed === false) return null;
  return <button>Apagar</button>;
}
```

```ts
// src/server.ts (backend Express)
import { requireAuth, requirePermission } from '@aioson/auth-sdk/express';

const authOpts = {
  baseUrl: process.env.VITE_AIOSON_AUTH_URL,
  bindingId: process.env.VITE_AIOSON_AUTH_BINDING_ID!,
};

app.delete('/api/orders/:id',
  requireAuth(authOpts),
  requirePermission('orders:delete', authOpts),
  handler
);
```

Para um backend Node sem adapter Express, use o verificador server-safe e
propague `status`, `error.code` e `requestId` para a resposta do app:

```ts
import { verifyRemoteBearer } from '@aioson/auth-sdk';

const operator = await verifyRemoteBearer({
  baseUrl: process.env.VITE_AIOSON_AUTH_URL!,
  bindingId: process.env.VITE_AIOSON_AUTH_BINDING_ID!,
  authorization: request.header('authorization') ?? undefined,
  requestId: request.header('x-request-id') ?? undefined,
});
```

> Permissions vêm embutidas no JWT desde 2026-05-13 (Slice A) — `usePermission` lê do payload, sem network call por verificação. Defense-in-depth server-side é `auth.check(perm)`.

### 6.3 Cloud aioson.com (trial/subscription)

Use o caminho de `app-cloud-auth.md`. Backend lê `AIOSON_COM_TOKEN` no boot,
chama `/api/apps/{slug}/install` e poll `/status` periodicamente.

> Os 3 caminhos são **independentes**. Um app sofisticado pode usar todos.

---

## 7. Comunicação com o Play (ProductBridge)

`http://localhost:5180` é o servidor HTTP interno do Play, sempre disponível
quando o Play está rodando. CORS aberto (`*`). Endpoints úteis pro seu app:

| Endpoint | Para que |
|---|---|
| `GET /api/registry` | Descobrir portas de outros apps + Play Services |
| `POST /api/mcp/execute` | Executar Global Connector por alias (slots de dados) |
| `GET /api/connectors?type=mcpi` | Listar connectors compatíveis |
| `POST /api/bindings/:app_slug` | UI in-app pra vincular slot |
| `POST /amp/publish` | Publicar evento AMP pra outros apps |
| `POST /amp/subscribe` | Inscrever em tópicos AMP |
| `POST /api/tts/synthesize` + `GET /api/tts/audio/{id}` | Gerar/tocar áudio falado (voz local Kokoro, `en-US`) — ver [`local-tts-integration.md`](./local-tts-integration.md) |

Não use isso pra auth — use o `@aioson/auth-sdk`.

### 7.1 LLMs e fallback

O Play mantém dois conceitos separados:

| Conceito | O que é | Onde configurar |
|---|---|---|
| Conexão LLM | Provider + uma API Key + modelos por operação, obrigatoriamente validados antes de ativar | `Settings → Conexões LLM` |
| Política de fallback | Ordem automática de tentativa por operação entre modelos LLM já validados | Interna do Play, derivada das conexões validadas |

#### Quem é responsável por quê (regra canônica)

**O Play expõe; o app resolve.** O Play NÃO obriga o app a usar nada e NÃO é dono
da precedência — ele só disponibiliza a config geral que o usuário já cadastrou
uma vez. Cada app decide se usa a sua própria config ou a do Play.

Concretamente, a config geral chega ao app de **duas formas**, nesta ordem de
preferência que o **app** deve implementar:

1. **Config própria do app** (se existir). Ex.: `aioson-models.json` no diretório
   do app, ou uma tela de Configurações própria gravando a chave no banco do app.
   Se o app tem a sua, ele usa a sua — ponto.
2. **Config geral do Play** (fallback). Quando há chave cadastrada em
   `Settings → Conexões LLM`, o Play **injeta as chaves como variáveis de
   ambiente no spawn do app** (ver `apply_llm_env` em `draft_process.rs`).
   O app lê via `process.env.*`:

   | Conexão LLM (Settings) | Env var injetada |
   |---|---|
   | OpenAI | `OPENAI_API_KEY` |
   | Claude (Anthropic) | `ANTHROPIC_API_KEY` |
   | OpenRouter | `OPENROUTER_API_KEY` |
   | Google Gemini | `GEMINI_API_KEY` |
   | DeepSeek | `DEEPSEEK_API_KEY` |
   | xAI | `XAI_API_KEY` |

   Junto com as chaves, o Play injeta **`AIOSON_LLM_CHAIN`** (desde
   2026-07-02): um JSON **sem chaves** com os modelos validados por operação e
   a ordem de fallback que o usuário montou em `Settings → Conexões LLM`.
   Formato:

   ```json
   {
     "exportedAt": "2026-07-02T18:00:00.000Z",
     "appScope": null,
     "configs": [
       {
         "provider": "openrouter",
         "operation": "text_generation",
         "model": "deepseek/deepseek-chat",
         "baseUrl": "https://openrouter.ai/api/v1",
         "priority": 1,
         "capabilities": { "vision": false }
       }
     ]
   }
   ```

   Comportamento esperado do app: pra cada operação (`text_generation`,
   `image_understanding`, ...), escolha o primeiro `configs[]` daquela
   operação (ordenado por `priority`) cujo provider tem `*_API_KEY` presente,
   e use **o `model` e o `baseUrl` de lá** em vez de um modelo hardcoded.
   Sem `AIOSON_LLM_CHAIN` (ou sem entrada pra operação), caia nos defaults
   próprios do app. Override explícito do app (env própria tipo
   `MEUAPP_OPENAI_MODEL`) pode vencer a chain — documente a precedência.
   Implementação de referência: `src/lib/llm/chain.ts` + `provider.ts` do
   fluency-tube.

> Por que env var e não "o app puxa de um endpoint"? Para um host desktop que dá
> spawn em processos-filho, variável de ambiente é o contrato universal — sem
> descoberta de porta, sem arquivo pra sincronizar, sem segundo serviço. Isso
> **não** é "o Play decidindo pelo app": a precedência (própria → Play) é
> 100% do app. O Play só deixa a chave disponível pra quem quiser o fallback.

#### Ciclo de vida da injeção (quando a chave chega — e quando NÃO chega)

Env var só existe **no momento do spawn**. Regras práticas (desde 2026-07-02):

- **Onde injeta:** abertura de app instalado pela UI (`spawn_app_runtime`) **e**
  preview de draft / app em desenvolvimento (`spawn_draft`). O preview usa o
  mesmo contrato do app instalado — dá pra testar a integração LLM antes de
  instalar.
- **Auto-respawn preserva as chaves:** se o app crashar e o supervisor religar,
  as chaves do spawn original são reutilizadas.
- **Processo já rodando não ganha chave nova:** se o usuário cadastrar/alterar a
  Conexão LLM **com o app já aberto**, o processo continua com o ambiente
  antigo. É preciso **parar e abrir o app de novo** (ou parar o preview e rodar
  de novo) pra nova chave entrar.
- **Fora do Play não há injeção:** backend subido à mão num terminal
  (`npm run dev` numa sessão de agente, por exemplo) não recebe nada — configure
  a chave no ambiente do shell ou use a config própria do app nesse cenário.
- **Modo anônimo** (IDE anônima) não injeta chaves.

**Troubleshooting "não configurado":** se a UI do app diz que nenhum provedor
está disponível mas a Conexão LLM existe no Play, a causa quase sempre é uma
dessas: (1) o processo do app nasceu **antes** da chave ser cadastrada → feche e
abra o app; (2) o backend está rodando **fora do Play** (terminal/agente); (3) o
app procura um provider que o usuário não cadastrou — a injeção cobre os 6 da
tabela acima, um por vez, só os que têm chave.

#### Regras obrigatórias pro app

- **NUNCA peça uma segunda API key** para um provider que o Play já tem, se a
  intenção é usar a LLM global. Caia no fallback de env var.
- **NUNCA construa o cliente LLM (`new OpenAI(...)` etc.) no carregamento do
  módulo.** Faça **lazy-init**: construa no primeiro uso. Se você instanciar no
  boot e a chave não existir, o SDK lança no construtor e **derruba o backend
  inteiro** (e, com `--kill-others-on-fail`, o frontend junto). O app tem que
  **subir sem chave nenhuma** e só falhar — com mensagem clara — quando um
  recurso de IA for realmente acionado sem config.
- **Centralize a resolução** num único helper (ex.: `resolveOpenAIClientConfig()`)
  e use em todos os serviços (chat, embeddings, vision…). Não espalhe
  `process.env.OPENAI_API_KEY` cru pelo código.

#### `llm-chain.json` (ordenação/capabilities, SEM chaves)

Separado das chaves: o Play exporta a mesma chain como arquivo `llm-chain.json`
pra squads. Pra **apps**, o canal canônico dessa informação é a env var
`AIOSON_LLM_CHAIN` (mesmo conteúdo, injetada no spawn — ver acima); o arquivo
segue existindo pro caminho de squad. Use a chain só pra escolher qual
provider/model tentar e em que ordem; as chaves vêm sempre do mecanismo acima
(config própria → env var).

> ⚠️ Estado atual (2026-06-14): `saveChainToJsonFile()` grava `llm-chain.json` no
> `appDataDir` do **próprio Play**, não no cwd do app, e o Play **não** grava
> `aioson-models.json` para apps instalados. Ou seja, o caminho baseado em arquivo
> hoje é efetivamente um contrato de **squad/legacy**; para apps instalados o
> carregador de chaves canônico é a **env var injetada no spawn**. Se você
> depende de `llm-chain.json`/`aioson-models.json` no cwd, trate como opcional e
> tenha o fallback de env var.

---

## 8. Checklist final — "pronto pra Play"

Use isto como gate antes de declarar o app pronto:

- [ ] `manifest.json` no root com `slug`, `version`, `runtime`, `has_api` corretos
- [ ] Se split-stack: `processes` declara todos os portas via `port_env`
- [ ] `package.json` tem `dev` (e/ou `start`) que sobe o app corretamente
- [ ] Em **todo** lugar que precisa de porta, código lê `process.env.PORT` (frontend) ou `process.env.BACKEND_PORT` (backend split)
- [ ] Se app tem dados externos: `app-config.yaml` declara `data_bindings`
- [ ] Se `has_api: true`: implementou `GET /api/aioson-play` com schema válido
- [ ] Se usa aioson-auth: dependeu de `@aioson/auth-sdk`, **não** chamou `/api/auth/*` direto
- [ ] Se usa aioson.com: implementou proxy no backend, **não** chamou direto do browser
- [ ] Adicionou snippet da seção 3 ao `CLAUDE.md`/`AGENTS.md` do seu app
- [ ] Testou em dev-link: instalou via `Settings → Instalar App → Linkar pasta (dev)` e abriu — webview renderiza, badge fica verde

Smoke manual:
```bash
# 1. Subir Play em dev
cd C:/dev/aioson-play && npm run tauri dev

# 2. Em outro terminal, smoke do seu app standalone (sem Play)
cd C:/dev/apps/meu-app && PORT=3399 npm start
curl http://localhost:3399/api/aioson-play  # deve retornar schema

# 3. Linkar app no Play: AppPage → "Instalar App" → "Linkar pasta (dev)" → cole caminho
# 4. Verifique: badge no shell mostra app rodando, webview embeda dashboard
```

---

## 9. Quando consultar qual doc

| Você está... | Leia |
|---|---|
| Criando app do zero | Este doc + `aioson-app-developer-guide.md` |
| Mexendo em ports / split-stack | `port-management.md` |
| Adicionando data slots (banco/API) | `app-data-bindings.md` |
| Adicionando endpoint HTTP novo | `aioson-endpoint-protocol.md` |
| Adicionando login de operador | `auth-integration-gaps.md` + `@aioson/auth-sdk` README |
| Adicionando trial/billing aioson.com | `app-cloud-auth.md` |
| Fazendo o app falar (voz local, `en-US`) | `local-tts-integration.md` |
| Testando o app local sem publicar | `local-dev-testing.md` + `dev-link-install.md` |
| Publicando no marketplace aioson.com | `software-update-compatibility.md` |
| Vendo case real de implementação | `farmacia-implementation-review.md` |

---

## 10. Erros comuns que IA costuma cometer

1. **Hardcode `localhost:3001`** porque viu nos exemplos do `aioson-auth`. **Errado.** Use `import.meta.env.VITE_AIOSON_AUTH_URL`.
2. **Chamar `fetch('/api/auth/...')` direto** em vez de usar `@aioson/auth-sdk`. Funciona mas pula refresh automático, error normalization, header `Authorization: Bearer`.
3. **Esquecer de declarar `requires_services: ["aioson-auth"]`** — sem isso, Play não injeta `VITE_AIOSON_AUTH_BINDING_ID` e seu app não sabe contra qual binding logar.
4. **Misturar auth aioson.com (cloud) com aioson-auth (operadores)** — são sistemas diferentes. Veja seção 6 acima.
5. **Implementar `/api/aioson-play` com endpoints inventados** — só liste endpoints que **existem**. LLM orquestrador vai tentar usá-los.
6. **Esquecer do `concurrently` em split-stack** — sem isso, `npm run dev` sobe só um dos dois processos.
7. **Construir cliente LLM no carregamento do módulo** (`new OpenAI()` em campo de
   instância/singleton de topo). Sem `OPENAI_API_KEY` o SDK lança no construtor e
   derruba o backend no boot (e o frontend junto via `--kill-others-on-fail`).
   Use lazy-init — ver §7.1.
8. **Chamar binário de pacote aninhado com comando "pelado"** (ex.: split-stack com
   `dev:dashboard": "cd dashboard && vite"`). O `node_modules/.bin` do subpacote
   **não** entra no PATH (npm só põe o `.bin` do pacote que roda o script), então o
   `vite` pelado não acha a versão do dashboard. Em **dev**, o PATH ainda herda o
   `.bin` do próprio Play (Play roda via `npm run tauri dev`) e o app acaba rodando o
   **Vite do Play** — mismatch de versão → `Pre-transform error: Missing field
   moduleType`. Em **produção** (Play instalado, sem npm) o comando pelado
   simplesmente **não é encontrado**. Fix: invoque o binário do subpacote pelo npm
   dele — `cd dashboard && npm run dev` (ou `npx vite`) — pra resolver sempre o
   `node_modules/.bin` local. Vale pra `vite`, `next`, `tsc`, `prisma` etc.
9. **Cadastrar permissão só no painel do Auth e esquecer o manifest.** Para app
   com RBAC, a fonte de verdade é `manifest.json` `auth.permissions[]`; o painel
   aplica permissões aos perfis, não descobre regras por varredura de código.
10. **Depender de algo dentro de `.aioson/` que não viaja no pacote.** O
   `system:publish` (CLI) **exclui `.aioson/`** por ser tooling/dev — EXCETO o que
   o app declara como runtime:
   - **`.aioson/squads` é SEMPRE incluído** (obrigatório).
   - **O resto é OPT-IN** via **`.aioson/build-options.json`**:
     ```json
     { "include": ["docs", "skills/atendimento", "rules/foo.md"] }
     ```
     Cada entrada é relativa a `.aioson/` e pode ser **pasta** (`docs`),
     **subpasta** (`skills/atendimento`) ou **arquivo** (`docs/guia.md`).
   Sintoma se faltar: app sobe mas estoura `SQUAD_MANIFEST_INVALID` ou um agente
   não acha sua skill/doc. **Declare no `build-options.json` só o que o squad
   realmente referencia** — não mande peso à toa. Regra geral: **mantenha os
   dados de runtime no caminho original** (`.aioson/...`); não mova pra root (os
   agentes referenciam paths internos do `.aioson` e quebram).
11. **Commitar/publicar segredo ou config por-instalação.** O `system:publish`
    agora **respeita o `.gitignore` do app** (2026-06-15) e nunca publica
    `aioson-models.json` (SKIP_FILES). Mas tudo que NÃO está no `.gitignore` viaja
    — então **gitignore os arquivos locais**: chaves (`.env`, `aioson-models.json`),
    e **config gerada por-instalação** (ex.: `atendimento-config.json`, que gateia
    o onboarding de escolha de squad — se vier no pacote, o cliente herda a escolha
    do dev e pula o onboarding; o servidor local deve gerá-lo no 1º boot). Sintomas:
    onboarding sumido, ou a **chave de API do dev vazando** pra todos os clientes.
    ⚠️ `.gitignore` só protege publicações FUTURAS — versões já publicadas com o
    segredo continuam com ele: **rotacione a chave**.

---

## Assistente de Conteúdo por Squad (bloco `"assistant"` do manifest)

> Feature `squad-content-assistant` (2026-07-03). Permite que o CLIENTE FINAL
> gere conteúdo com as squads embarcadas no app, por um chat nativo do Play
> (painel lateral no AppPage) que roda o **Claude Code headless** com a
> assinatura do próprio cliente. O app não implementa chat nenhum.

### Como habilitar (dev do app)

1. Embarque a squad em `.aioson/squads/<slug>/` (o publish já inclui essa
   pasta obrigatoriamente no pacote). A squad é a personalidade/fluxo do
   assistente — prompts de domínio moram nela, nunca no Play.
2. Declare o bloco no `manifest.json`:

```json
"assistant": {
  "squad": "mef-core",
  "content_dir": "content",
  "title": "Assistente MEF"
}
```

| Campo | Regra |
|---|---|
| `squad` | slug de `.aioson/squads/<slug>/squad.manifest.json` no pacote. Squad ausente → assistente oculto + warn (nunca crash). |
| `content_dir` | pasta RELATIVA à raiz do app onde o conteúdo gerado cai. `..`, caminho absoluto ou prefixo de drive → declaração rejeitada. O Play cria a pasta se não existir. |
| `title` | opcional — rótulo do botão/painel (default i18n "Assistente"). |

Sem o bloco `"assistant"`, nada acontece — presença de squads no pacote NÃO
liga o assistente sozinha (squads de runtime tipo atendimento não ganham chat).

### Múltiplas squads no mesmo app

Se o app tem mais de uma squad de conteúdo, use `squads: [...]` em vez de
`squad`. O painel ganha um **seletor** e **cada squad é uma conversa própria**
(histórico e geração independentes; podem inclusive gerar em paralelo):

```json
"assistant": {
  "content_dir": "output",
  "squads": [
    { "squad": "posts",  "title": "Posts" },
    { "squad": "emails", "title": "E-mails", "content_dir": "output/emails" }
  ]
}
```

| Regra | Detalhe |
|---|---|
| `content_dir` de nível superior | saída **compartilhada** default de todas as squads (adicionar uma 2ª squad não move o conteúdo já existente). |
| `content_dir` por squad | opcional — sobrescreve a compartilhada quando você quer separar (ex.: `output/emails`). |
| Entrada inválida | uma squad ausente/errada é **ignorada** (só some do seletor) — um typo não esconde o app inteiro. Zero válidas → assistente oculto. |
| Isolamento por squad | o Play gera um settings por (app, squad): squad A não escreve na pasta da squad B. |

A forma legada `{"squad": "x", "content_dir": "output"}` continua valendo
(vira uma lista de 1) — não precisa migrar apps existentes.

### Contrato de conteúdo

- A squad escreve **um arquivo por item** dentro da `content_dir` (o system
  prompt driver do Play instrui isso e o settings de permissões do CLI nega
  escrita fora dela — `Write(<content_dir>/**)` allow + `Bash` deny).
- **Refletir o conteúdo na UI é responsabilidade do APP** (watcher próprio ou
  re-listagem por request, como o `examples/content-viewer` faz). O Play NÃO
  observa conteúdo de app instalado nem emite evento pro app — regra
  "cada app é dono dos seus dados".
- O turno roda com cwd na RAIZ do app instalado, env mínimo **sem nenhuma
  `*_API_KEY` do Play** — o CLI usa a conta do usuário (assinatura). Não
  confundir com o contrato de Conexões LLM do §7.1 (esse continua valendo
  pro backend do app).

### Pré-requisitos do cliente

Claude Code instalado + logado na máquina. O Play detecta a ausência e mostra
o guia (instalador oficial + login); erro de auth num turno leva o painel de
volta ao passo de login. Codex/opencode: fase futura.

### Onde o assistente aparece (instalado E preview de dev)

O botão "Assistente" (canto inferior direito → painel lateral) aparece em duas
superfícies:
- **App instalado** (`AppPage`) — o fluxo do cliente. Gate lê o manifest de
  `app_local_data/apps/<slug>`.
- **Preview de dev** (`DraftPreviewWindow`, ▶ num app aberto de `C:\dev\...`) —
  pra o dono iterar sem instalar. O gate resolve o manifest da **pasta-fonte**
  (mesma resolução do `spawn_draft`, via `DraftScope`); a conversa em dev é
  keyed pelo `draftUuid` (separada da instalada). A squad grava na `content_dir`
  da pasta-fonte, e o portal do app (rodando no preview) reflete na hora.
NÃO aparece em app **não** instalado e **não** aberto em preview (não há
superfície onde montar).

## Atualizações deste doc

- **2026-05-13** — Criação. Exemplos baseados em `aioson-atendimento`.
- **2026-06-03** — Documentado contrato de Conexões LLM + fallback automático: uma API key por provider, modelos por operação e chain como ordem entre modelos validados, não uma segunda configuração de credenciais.
- **2026-06-14** — Reescrita §7.1 com a regra canônica "Play expõe, app resolve": chaves chegam por **env var injetada no spawn** (`OPENAI_API_KEY`/`ANTHROPIC_API_KEY`/`OPENROUTER_API_KEY`, `draft_process.rs`), precedência (config própria → Play) é responsabilidade do app, e **lazy-init obrigatório** pra não derrubar o backend no boot. Flagado que `llm-chain.json`/`aioson-models.json` no cwd é hoje caminho squad/legacy, não o carregador de chaves de apps instalados.
- **2026-06-14** — Publish passa a incluir `.aioson/{squads,docs,skills,rules,genomes,agents}` no pacote (antes `.aioson` inteiro era excluído → `SQUAD_MANIFEST_INVALID`). Erro comum #9. Fix no `store-system.js` (CLI) — `AIOSON_RUNTIME_DIRS` + `.md/.mdx/.txt`. Uninstall de app agora mata órfãos por cwd+marker e faz retry do `remove_dir_all` (Windows não mata children no stop) — `systems.rs`; Marketplace "Meus Apps" passou a usar o uninstall symlink-safe (era `remove` fs cru).
- **2026-06-15** — Publish passa a **respeitar o `.gitignore`** do app (lib `ignore` no `store-system.js`) e nunca publica `aioson-models.json` (SKIP_FILES). Corrige vazamento da chave LLM do dev e config por-instalação (`atendimento-config.json`) viajando no pacote (quebrava onboarding). Erro comum #10. Filtro NÃO se aplica às pastas de runtime do `.aioson` (forceInclude). Update de app implementado (overlay não-destrutivo) — §10.1. Aba Settings → LLM do atendimento virou editável (radio Play/Local + provedor compatível-OpenAI).
- **2026-06-15** — **Build de produção / código minificado.** `aioson system:publish --build` roda o `build_command` do app, publica só o compilado **minificado** (terser) e **exclui o `src/`** (a fonte não viaja → cópia casual fica difícil; reversível com esforço, NÃO é criptografia). Saída do build (`dist/`, `dashboard/dist`) viaja mesmo gitignored (`BUILD_OUTPUT_DIRS`); sourcemaps `.map` ficam de fora (não revazam a fonte). Pra rodar sem a fonte, o app precisa de um `start` de produção (ex.: `node dist/.../server.js` + `vite preview`) e o **Play roda `start` quando não existe `src/`** (app buildado) e `dev` quando existe (fonte/dev-link) → zero regressão pros apps de fonte. Requer rebuild do Play (heurística em `draft_runtime.rs`).
- **2026-06-24** — Adicionado protocolo `manifest.json` `auth.version`, `auth.permissions[]` e `auth.policies[]` para apps com `aioson-auth`. Play sincroniza o catálogo pelo inventário owner-only; Auth registra permissões no binding existente e o painel aplica aos perfis globais.
- **2026-07-02** — §7.1 ganhou o **ciclo de vida da injeção** (caso fluency-tube: app dizia "provedor não configurado" com Conexão LLM válida no Play). Fixes no Play: (1) preview de draft (`spawn_draft`) agora injeta as mesmas env vars do app instalado; (2) auto-respawn do supervisor **preserva** as chaves do spawn original (antes voltava sem chave); (3) leitura do keyring aceita nomes atuais e legados (`api-key-anthropic` E `api-key-claude`, `gemini` E `google`); (4) cobertura ampliada pra 6 provedores (`GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, `XAI_API_KEY` novos). Regra que fica: processo já rodando não ganha chave nova — feche e abra o app após cadastrar a Conexão LLM.
- **2026-07-02 (b)** — **`AIOSON_LLM_CHAIN`**: o spawn passou a injetar também a chain de modelos por operação (JSON sem chaves, mesmo conteúdo do `llm-chain.json` de squads) — apps deixam de hardcodar modelo e passam a usar o modelo/ordem que o usuário validou em Settings → Conexões LLM. Contrato + formato documentados no §7.1; implementação de referência no fluency-tube (`src/lib/llm/chain.ts`, 6 provedores no picker).
- **2026-07-03** — **Assistente de Conteúdo por Squad** (`squad-content-assistant`): novo bloco `"assistant"` no manifest (squad + content_dir + title) liga o chat nativo do Play que roda a squad do app via Claude Code headless com a assinatura do cliente. Seção própria acima com o contrato de conteúdo (app observa a própria content_dir; Play não notifica) e isolamento (settings deny-first do CLI, env sem `*_API_KEY`).
- **2026-07-03 (c)** — **Assistente no preview de dev:** o botão/painel passou a aparecer também no `DraftPreviewWindow` (▶ de app aberto de pasta dev), não só no `AppPage` de app instalado. Comandos `assistant_status`/`assistant_send` aceitam `draftUuid` opcional → `resolve_app_dir` lê o manifest da pasta-fonte via `DraftScope::owner_existing` em vez de `apps/<slug>`. Conversa em dev keyed pelo draftUuid. Pra o dono iterar em apps de conteúdo sem instalar a cada teste.
- **2026-07-08** — **Auth env injetada em TODOS os caminhos de spawn** (era só o legado). Novo helper `auth_app_bindings::resolve_auth_env(app, pool, slug)` monta `VITE_AIOSON_AUTH_URL` + `VITE_AIOSON_AUTH_BINDING_ID` (+ SSO de operador) e é chamado de `spawn_draft` (slug lido do `manifest.json` do draft) e `do_spawn_app_runtime` (runtime moderno), além do `spawn_app` legado. Antes, apps Vite/Next (draft ou instalado moderno) subiam sem a env e caíam na tela "Conectar ao aioson-auth" mesmo com auth ativado. **Erro comum #1** ("hardcode localhost:3001") era na prática inevitável porque a env nunca chegava — agora chega. Fix relacionado no frontend: `listOperators` (`auth-app-users.ts`) lia o shape errado do `GET .../rbac/users/:userId` (esperava `{ roles: [] }`, o aioson-auth devolve `[{ role, permissions }]`), então operadores vinculados nunca apareciam na lista — o vínculo era gravado mas invisível.
- **2026-07-03 (b)** — **Multi-squad no assistente:** o bloco `assistant` passa a aceitar `squads: [{squad, title?, content_dir?}]` além da forma single `squad`. Painel ganha seletor; cada squad é uma conversa independente (chave DB `(app_slug, squad)`, settings por squad, podem gerar em paralelo). `content_dir` de nível superior = saída compartilhada default; por-squad sobrescreve. Forma legada segue válida (vira lista de 1). Seção "Múltiplas squads no mesmo app" acima.
- **2026-07-08 (b)** — **Receita da tela de login do app** (§6). O doc mostrava o SDK (`createAuthClient` + `usePermission`) mas pulava a peça central: o **gate de sessão + formulário de login**. Agora há a receita completa — `<AuthGate>` (loading→splash, sem sessão→`<LoginScreen>`, com sessão→app), `LoginScreen` com `useAuth().login({email,password})`, persistência via `localStorageAdapter()` (usuário segue logado no próximo boot), `logout()`, e a nota do cadastro self-service (conta nova = sem role até o dono atribuir em Settings → Auth). Regra #2 do contrato semeado (`play_app_contract.md`) reescrita: "desenhe SUA tela de login, mas dirija pelo SDK — não reinvente o protocolo, não crie tela de configurar URL/binding". Ancora no fix da injeção de env (2026-07-08 acima).
- **2026-07-02 (c)** — **Execução de Global Connectors virou real** (`connector_exec.rs`). Antes: `POST /api/mcp/execute` era stub (rodava a query no SQLite de metadados do Play, sem bindar params, e só aceitava MCPI; a senha da Database Connection era ignorada; `api` e `mcp` não tinham executor). Agora: `mcpi` roda no banco de DESTINO com senha do keyring + prepared statements; `api` executa REST com interpolação de URL, headers de auth do keyring e body JSON; `mcp` fala com servidor MCP **local via stdio** (initialize → tools/list → tools/call, campo `tool` opcional no request). MCP remoto (HTTP + OAuth 2.1) segue NÃO suportado — fase futura. Ver `app-data-bindings.md` §4.
