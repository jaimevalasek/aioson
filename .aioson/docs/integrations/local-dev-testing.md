# AIOSON Play — Testes Locais sem Marketplace

> Como instalar apps e Play Services diretamente no aioson-play durante desenvolvimento,
> sem passar pelo fluxo de publicação no aioson.com.
>
> Útil para: desenvolvimento de novos apps, testes de integração, simulação de instalação,
> debug de boot e autostart, validação de `service.json` e `manifest.json`.
>
> Atualizado: 2026-04-29

---

## Conceito: instalação por symlink

O aioson-play lê apps e serviços a partir de pastas no `appLocalDataDir`:

```
~/.local/share/com.aioson.play/
├── apps/
│   └── {slug}/          ← app instalado
└── services/
    └── {slug}/          ← Play Service instalado
```

Em vez de baixar um ZIP do marketplace, basta criar um **symlink** apontando para o projeto local. O aioson-play não distingue symlink de diretório real — lê o `manifest.json` ou `service.json` normalmente.

---

## 1 — Instalar um Play Service localmente

### 1.1 Pré-requisitos

O projeto precisa estar compilado:

```bash
cd /caminho/do/servico
npm run build:server   # gera dist/server/server.js (ou equivalente)
```

Confirme que `service.json` existe na raiz do projeto com os campos obrigatórios:

```json
{
  "slug": "meu-servico",
  "name": "Meu Serviço",
  "version": "1.0.0",
  "port": 3001,
  "autostart": true,
  "dev_command": "node dist/server/server.js",
  "health_check": "/health"
}
```

### 1.2 Criar o symlink

```bash
# Criar o diretório de serviços se ainda não existir
mkdir -p ~/.local/share/com.aioson.play/services

# Criar o symlink
ln -s /caminho/completo/do/projeto ~/.local/share/com.aioson.play/services/{slug}

# Verificar
ls -la ~/.local/share/com.aioson.play/services/
```

### 1.3 Verificar

```bash
cat ~/.local/share/com.aioson.play/services/{slug}/service.json
```

### 1.4 Ativar

Reinicie o aioson-play. Com `autostart: true`, o serviço sobe automaticamente no boot do Play. Caso precise iniciar manualmente: Settings → Serviços → iniciar.

---

## 2 — Instalar um App localmente

### 2.1 Pré-requisitos

O projeto precisa ter um `manifest.json` válido na raiz:

```json
{
  "slug": "meu-app",
  "name": "Meu App",
  "version": "1.0.0",
  "has_api": true,
  "api_base_url": "http://localhost:3301",
  "requires_services": []
}
```

Se o app tem backend Node.js, compile antes:

```bash
npm run build
```

### 2.2 Criar o symlink

```bash
mkdir -p ~/.local/share/com.aioson.play/apps

ln -s /caminho/completo/do/app ~/.local/share/com.aioson.play/apps/{slug}

ls -la ~/.local/share/com.aioson.play/apps/
```

### 2.3 Estrutura esperada pelo Play

```
apps/{slug}/
├── manifest.json     ← obrigatório
├── package.json
├── dist/             ← backend compilado (se has_api: true)
└── dashboard/        ← frontend (servido como webview)
    └── dist/
        └── index.html
```

---

## 3 — Exemplo real: aioson-auth

Este é o fluxo que foi usado para instalar o `aioson-auth` como Play Service durante o desenvolvimento:

```bash
# 1. Compilar o servidor
cd ~/aioson-projects/aioson-auth
npm run build:server
# → gera dist/server/server.js

# 2. Criar a pasta de serviços e o symlink
mkdir -p ~/.local/share/com.aioson.play/services
ln -s ~/aioson-projects/aioson-auth \
      ~/.local/share/com.aioson.play/services/aioson-auth

# 3. Verificar o service.json
cat ~/.local/share/com.aioson.play/services/aioson-auth/service.json
```

**service.json resultante:**
```json
{
  "slug": "aioson-auth",
  "name": "AIOSON Auth",
  "version": "1.0.0",
  "description": "Serviço centralizado de autenticação para apps do AIOSON Play.",
  "port": 3091,
  "autostart": true,
  "dev_command": "node dist/server/server.js",
  "health_check": "/health"
}
```

Após reiniciar o aioson-play, o serviço aparece em Settings → Serviços com status "running".

---

## 4 — Obter um BINDING_ID sem o fluxo de marketplace

Quando um Play Service usa o conceito de **binding** (vínculo app↔serviço), o fluxo normal gera o `BINDING_ID` automaticamente via aioson-play. No desenvolvimento local, o binding precisa ser criado manualmente:

### 4.1 Via admin UI do serviço (quando disponível)

Muitos serviços têm uma UI de admin acessível pela porta do serviço:

```
http://localhost:3091   ← admin do aioson-auth, por exemplo
```

Nessa UI: criar um novo binding → copiar o UUID gerado.

### 4.2 Via API direta

```bash
# Criar binding via cURL
curl -X POST http://localhost:3091/api/auth/bindings \
  -H "Content-Type: application/json" \
  -d '{
    "app_name": "atendimento",
    "connection_name": "atendimento-dev",
    "enable_2fa": false,
    "enable_rbac": false,
    "auth_schema": "email_password"
  }'

# Resposta:
# { "id": "uuid-do-binding", ... }
```

### 4.3 Usar o BINDING_ID no app gerenciado pelo Play

Com o UUID em mãos, ative o auth no inventário do Play e reinicie o preview.
O Play injeta a configuração no frontend e no backend Node com os mesmos nomes:

```env
# Variáveis canônicas. O Play injeta; não crie aliases sem VITE_.
VITE_AIOSON_AUTH_URL=http://localhost:3091
VITE_AIOSON_AUTH_BINDING_ID=<uuid-copiado>
```

> **Nota:** `3091` identifica o serviço local, não é fallback de app. Código de
> app deve ler `import.meta.env.VITE_AIOSON_AUTH_URL` ou
> `process.env.VITE_AIOSON_AUTH_URL`, sem hardcode. Para testar um app fora do
> Play, use uma fixture de ambiente isolada com esses mesmos nomes.

---

## 5 — Testar se um Play Service está rodando

```bash
# Health check
curl http://localhost:{porta}/health
# Resposta esperada: { "status": "ok" }

# Ver logs em tempo real (se rodando via aioson-play)
# O Play captura stdout do processo — verificar nos logs do Play.

# Ou iniciar manualmente para ver logs direto:
cd ~/.local/share/com.aioson.play/services/aioson-auth
node dist/server/server.js
```

---

## 6 — Remover um serviço ou app local

```bash
# Remover symlink (não apaga o projeto)
rm ~/.local/share/com.aioson.play/services/{slug}
rm ~/.local/share/com.aioson.play/apps/{slug}
```

Reinicie o aioson-play para que a remoção seja detectada.

---

## 7 — Rebuild após mudanças no código

O symlink aponta para o projeto ao vivo — basta recompilar e reiniciar o serviço:

```bash
cd /caminho/do/projeto
npm run build:server

# Reiniciar o serviço (se já estava rodando no Play):
# Settings → Serviços → parar → iniciar
# ou matar o processo Node manualmente e deixar o Play reiniciar

# Para desenvolvimento ativo, use o modo watch diretamente:
npm run dev:server   # tsx watch (não usa dist/, roda via ts-node)
```

> **Atenção:** `dev_command` no `service.json` aponta para `dist/`. Se quiser rodar no modo watch sem compilar, inicie o servidor manualmente em paralelo e use a porta fixa — o aioson-play detecta a porta ocupada e marca o serviço como "running" sem spawnar um novo processo.

---

## 8 — Simular `requires_services` sem o Play completo

Se o app declara `"requires_services": ["aioson-auth"]` no `manifest.json`, o aioson-play verifica se o serviço está instalado e rodando antes de liberar o app.

Para simular esse gate em dev:

1. O serviço precisa estar no symlink (seção 1) e rodando (porta aberta)
2. O app deve ser iniciado pelo Play, que injeta `VITE_AIOSON_AUTH_URL` + `VITE_AIOSON_AUTH_BINDING_ID` no spawn
3. Se as variáveis não estiverem definidas, endpoints protegidos devem permanecer bloqueados; corrija o binding e reinicie o preview

---

## 9 — Portas reservadas para dev local

Consulte `port-management.md` para a tabela completa. Resumo para desenvolvimento:

| Porta | Serviço | Tipo |
|-------|---------|------|
| 3091 | `aioson-auth` | Play Service — fixa |
| 3300+ | Apps instalados | App — dinâmica |
| 5173 | Dev dashboard (Vite) | Dev server |
| 5180 | ProductBridge (Rust) | Núcleo do Play — fixo |

---

## 10 — Checklist rápido (novo serviço ou app)

**Play Service:**
- [ ] `service.json` na raiz com `slug`, `name`, `version`, `port`, `dev_command`
- [ ] `PORT` via `process.env.PORT` com fallback para a porta declarada
- [ ] Endpoint `GET /health` retornando `{ status: "ok" }`
- [ ] CORS configurado para `http://localhost`
- [ ] Build compilado (`npm run build:server`)
- [ ] `.env` com variáveis mínimas (DATABASE_URL, secrets)
- [ ] Symlink criado em `~/.local/share/com.aioson.play/services/{slug}`

**App:**
- [ ] `manifest.json` na raiz com `slug`, `name`, `version`
- [ ] Backend compilado em `dist/` (se `has_api: true`)
- [ ] Frontend compilado em `dashboard/dist/` (se tem UI)
- [ ] Symlink criado em `~/.local/share/com.aioson.play/apps/{slug}`
- [ ] `.env` com BINDING_IDs dos serviços necessários
