# AIOSON Play — Protocolo de Play Services

> Como criar, publicar e instalar um Play Service no aioson-play.
>
> **Play Service** = processo Node.js que roda em background permanente no aioson-play,
> disponível para todos os apps instalados como se fosse parte da plataforma.
> Exemplo: `aioson-auth` — serviço de autenticação compartilhado entre apps.

---

## Diferença: App vs Play Service

| | App | Play Service |
|---|-----|-------------|
| **O que é** | App instalado pelo usuário | Serviço de infraestrutura da plataforma |
| **Arquivo manifest** | `manifest.json` | `service.json` |
| **Como instala** | Marketplace (ZIP + manifest.json) | Código de instalação (ZIP + service.json) |
| **UI** | AppPage + sistema em webview | Nenhuma (background) ou dashboard separado |
| **Ciclo de vida** | Iniciado pelo usuário | Autostart com o aioson-play |
| **Acesso de apps** | Portão dinâmica via api_base_url | Porta fixa declarada em service.json |
| **Publicação CLI** | `aioson app:publish` | `aioson service:publish` *(pendente)* |
| **Tipo no marketplace** | `MarketplaceItemType.app` | `MarketplaceItemType.play_service` *(pendente)* |

---

## 1 — Estrutura de um Play Service

```
meu-servico/
├── service.json         ← manifesto obrigatório
├── package.json
├── src/
│   └── server.ts        ← servidor Express/Fastify
├── dist/                ← build compilado (publicado)
└── prisma/              ← banco de dados (se necessário)
    └── schema.prisma
```

### 1.1 service.json (obrigatório)

```json
{
  "slug": "aioson-auth",
  "name": "AIOSON Auth",
  "version": "1.0.0",
  "description": "Serviço centralizado de autenticação para apps do AIOSON Play.",
  "port": 3091,
  "autostart": true,
  "dev_command": "node dist/server.js",
  "health_check": "/health"
}
```

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `slug` | string | ✅ | Identificador único kebab-case |
| `name` | string | ✅ | Nome legível |
| `version` | string | ✅ | Semver (ex: "1.0.0") |
| `description` | string | — | Descrição curta |
| `port` | number | ✅ | Porta fixa do serviço (evitar colisões: 3001+) |
| `autostart` | boolean | — | Se `true`, sobe com o aioson-play (padrão: `true`) |
| `dev_command` | string | ✅ | Comando para iniciar o serviço compilado |
| `health_check` | string | — | Path de health check (padrão: `/health`) |

> **Porta fixa:** Play Services usam porta fixa (diferente de apps, que recebem porta dinâmica). Isso permite que apps saibam sempre onde o serviço está. Escolha uma porta no range 3001–3099 e registre no protocolo para evitar colisões.

### 1.2 Portas reservadas

| Porta | Serviço |
|-------|---------|
| 3091 | `aioson-auth` |
| 5180 | ProductBridge (interno do play) |
| 5173 | Dev dashboard (sistemas em dev) |

---

## 2 — Servidor do serviço

### 2.1 Porta via env var

O aioson-play injeta `PORT` ao iniciar o serviço. **Sempre respeite:**

```typescript
const PORT = parseInt(process.env.PORT || '') || 3001;
app.listen(PORT, () => {
  console.log(`[aioson-auth] running on port ${PORT}`);
});
```

> Nota: Para Play Services com porta fixa declarada em `service.json`, o `PORT` injetado será o mesmo valor. Mesmo assim, use a env var para consistência.

### 2.2 Health check

O aioson-play verifica se o serviço está rodando via a porta declarada. Implemente um endpoint `/health` simples:

```typescript
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});
```

### 2.3 CORS

Os apps chamam o serviço de origens `localhost:{porta-dinamica}`. Configure CORS permissivo para localhost:

```typescript
import cors from 'cors';

app.use(cors({
  origin: (origin, callback) => {
    // Permitir requisições sem origin (curl, mobile) e localhost
    if (!origin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
}));
```

---

## 3 — Como apps consomem um Play Service

### 3.1 Declarar dependência no manifest do app

No `manifest.json` do app:

```json
{
  "slug": "meu-app",
  "name": "Meu App",
  "has_api": true,
  "api_base_url": "http://localhost:3301",
  "requires_services": ["aioson-auth"]
}
```

O aioson-play usa `requires_services` para:
1. Mostrar no **AppOnboarding step 1** quais serviços são necessários
2. Verificar se estão instalados e rodando antes de liberar o app
3. Sugerir instalação se algum serviço estiver faltando

### 3.2 Chamar o serviço no código do app

Apps autenticados usam o SDK e a configuração injetada pelo Play. Não há alias
sem `VITE_` e o app não deve conhecer a porta do serviço:

```typescript
import { verifyRemoteBearer } from '@aioson/auth-sdk';

const operator = await verifyRemoteBearer({
  baseUrl: process.env.VITE_AIOSON_AUTH_URL!,
  bindingId: process.env.VITE_AIOSON_AUTH_BINDING_ID!,
  authorization: request.header('authorization') ?? undefined,
  requestId: request.header('x-request-id') ?? undefined,
});
```

### 3.3 Injeção de env vars pelo aioson-play

O aioson-play injeta automaticamente env vars dos serviços instalados:

```
VITE_AIOSON_AUTH_URL=http://localhost:3091
VITE_AIOSON_AUTH_BINDING_ID=<uuid-do-vinculo>
```

> **Nota:** A injeção de BINDING_ID é gerada pelo aioson-play quando o app se vincula ao serviço (binding). O app recebe o ID como env var sem precisar conhecê-lo antecipadamente.

---

## 4 — Instalação pelo usuário

### 4.1 Fluxo de instalação

```
1. Usuário vai em Settings → Serviços → Instalar Serviço
2. Digita o código de instalação (ex: "AUTH-XXXXX")
3. aioson-play chama: GET https://api.aioson.com/v1/services/install/validate?code=AUTH-XXXXX
4. aioson-com retorna: { slug, name, version, download_url }
5. aioson-play baixa o ZIP do serviço
6. Extrai e valida service.json
7. Move para {localDataDir}/services/{slug}/
8. Inicia o serviço (se autostart: true)
9. Serviço aparece em Settings → Serviços com status "running"
```

### 4.2 Código de instalação

Cada Play Service publicado no aioson-com recebe um código único de instalação (ex: `AUTH-A1B2C3`). O usuário usa este código no aioson-play para instalar.

> **Nota:** O endpoint `GET /v1/services/install/validate` ainda não está implementado no aioson-com. Ver seção "Estado de implementação" abaixo.

---

## 5 — Publicação no aioson-com

### 5.1 Tipo de marketplace

Play Services são publicados no aioson-com com `type: "play_service"` no `MarketplaceItemType`.

> **Nota:** O valor `play_service` no enum `MarketplaceItemType` ainda precisa ser adicionado ao schema do Prisma do aioson-com.

### 5.2 Processo de publicação (planejado)

```bash
# Compilar o serviço
npm run build

# Publicar via CLI
aioson service:publish
# → empacota dist/ + service.json em ZIP
# → envia para https://api.aioson.com/v1/services/publish
# → recebe código de instalação
```

> **Nota:** O comando `aioson service:publish` ainda não existe. O fluxo atual é manual: empacotar em ZIP e registrar no aioson-com pelo admin.

---

## 6 — Estado de implementação (2026-04-28)

| Componente | Status | Onde implementar |
|-----------|--------|-----------------|
| Estrutura do Play Service (service.json) | ✅ Suportado no play | `services.ts` em aioson-play |
| Install pelo aioson-play (validateServiceCode + download) | ✅ Implementado no play | `src/services/services.ts` |
| `GET /v1/services/install/validate` no aioson-com | ⚠️ Falta implementar | `app/api/v1/services/install/validate/route.ts` |
| `MarketplaceItemType.play_service` no schema | ⚠️ Falta adicionar | `prisma/schema.prisma` no aioson-com |
| `aioson service:publish` CLI | ⚠️ Falta implementar | CLI do aioson |
| Injeção automática de `AIOSON_{SERVICE}_URL` para apps | ⚠️ Planejado | Rust backend do aioson-play |
| Vinculação app↔serviço (binding) e injeção de BINDING_ID | ⚠️ Planejado | Rust + frontend do aioson-play |

---

## 7 — aioson-auth: compatibilidade atual

O `aioson-auth` é o primeiro Play Service candidato. Estado atual:

| Requisito | Status | O que falta |
|-----------|--------|-------------|
| `service.json` | ❌ Ausente | Criar em `aioson-auth/service.json` |
| Porta via `process.env.PORT` | ❌ Hardcoded `3001` | `src/server.ts` linha 3 |
| Dependência `@tauri-apps/api` | ❌ Inadequada | Remover — Play Services não rodam em Tauri |
| Build compilado (dist/) | ⚠️ Existe mas não validado | Validar `npm run build` sem tauri |
| Health check `/health` | ⚠️ Verificar | Adicionar se ausente |
| CORS para localhost | ✅ Implementado | — |
| Protocolo de auth | ✅ Completo | Ver `docs/integration-manual.md` |

**Para tornar `aioson-auth` instalável no aioson-play:**

```json
// aioson-auth/service.json (criar)
{
  "slug": "aioson-auth",
  "name": "AIOSON Auth",
  "version": "1.0.0",
  "description": "Serviço centralizado de autenticação para apps do AIOSON Play.",
  "port": 3091,
  "autostart": true,
  "dev_command": "node dist/server.js",
  "health_check": "/health"
}
```

```typescript
// aioson-auth/src/server.ts — corrigir porta
const PORT = parseInt(process.env.PORT || '') || 3001;
```

E remover `@tauri-apps/api` das dependências (não é um app Tauri).

---

## 8 — Integração atendimento ↔ aioson-auth

Quando `aioson-auth` estiver instalável:

**1. Declarar no manifest do atendimento:**
```json
{
  "requires_services": ["aioson-auth"]
}
```

**2. No `manifest.json`, declarar permissões do app:**
```json
{
  "requires_services": ["aioson-auth"],
  "auth": {
    "version": 1,
    "permissions": [
      "orders:read", "orders:create", "orders:update",
      "settings:read", "settings:write",
      "analytics:read"
    ],
    "policies": [
      { "id": "page:orders", "kind": "route", "path": "/orders", "requires": ["orders:read"] }
    ]
  }
}
```

O Play sincroniza esse manifesto pelo inventário owner-only. O `aioson-auth`
registra as permissões no binding existente; o painel Auth aplica essas
permissões aos perfis globais.

**Compat legado:** apps antigos ainda podem registrar permissões no startup do backend:
```typescript
// Registrar permissões do atendimento no aioson-auth
const BINDING_ID = process.env.VITE_AIOSON_AUTH_BINDING_ID;
if (BINDING_ID) {
  await fetch(`${process.env.VITE_AIOSON_AUTH_URL}/api/auth/${BINDING_ID}/register-permissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      permissions: [
        'orders:read', 'orders:create', 'orders:update',
        'settings:read', 'settings:write',
        'analytics:read',
      ]
    })
  });
}
```

**3. Middleware de auth no dashboard React:**
```typescript
// dashboard/src/hooks/useAuth.ts
const AUTH_URL = import.meta.env.VITE_AIOSON_AUTH_URL;
const BINDING_ID = import.meta.env.VITE_AIOSON_AUTH_BINDING_ID;

// Valida token via aioson-auth
const res = await fetch(`${AUTH_URL}/api/auth/${BINDING_ID}/me?token=${token}`);
```

**Degradação segura:** Se a configuração de Auth estiver ausente, o app deve
bloquear endpoints protegidos e orientar o usuário a reiniciar o app pelo Play.

---

## 9 — Checklist: criar um Play Service do zero

- [ ] Criar `service.json` com `slug`, `name`, `version`, `port`, `autostart`, `dev_command`
- [ ] Usar `process.env.PORT` com fallback para a porta declarada
- [ ] Implementar `GET /health`
- [ ] Configurar CORS para localhost
- [ ] Remover dependências Tauri (Play Services são standalone)
- [ ] Compilar para `dist/` via `npm run build`
- [ ] Testar iniciando manualmente: `node dist/server.js`
- [ ] Publicar no aioson-com com `type: play_service` (manual por ora)
- [ ] Registrar no protocolo de portas (seção 1.2 deste doc)
