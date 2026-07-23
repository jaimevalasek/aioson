# AIOSON Play — Guia para Desenvolvedores de Apps

> Este documento responde às perguntas mais comuns de quem está construindo um app para rodar dentro do AIOSON Play.
> Leia antes de implementar — evita retrabalho de arquitetura.
>
> Antes de publicar um app, leia tambem: [Atualizacao e Compatibilidade de Apps](./software-update-compatibility.md).

---

## 1. Como seu app roda dentro do AIOSON Play

### NÃO é um web app rodando em porta própria

Quando você "executa" um app instalado no AIOSON Play, ele **NÃO** abre como um servidor web separado com UI própria. O fluxo é:

1. O usuário está na **AppPage** do app (interface React do AIOSON Play)
2. O usuário digita um input (prompt, dados, comando)
3. O AIOSON Play spawn o **aioson-sidecar** (binário Node.js embarcado) como processo filho
4. O sidecar executa seu app com as ferramentas LLM injetadas
5. O output é streamado de volta para a AppPage via eventos Tauri

```
┌─────────────────────────────────────────┐
│         AIOSON Play (Tauri 2)           │
│  ┌───────────────────────────────────┐  │
│  │      Frontend (React SPA)         │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │      AppPage                │  │  │
│  │  │  ┌───────────────────────┐  │  │  │
│  │  │  │  Input do usuário     │  │  │  │
│  │  │  │  Output streaming     │  │  │  │
│  │  │  └───────────────────────┘  │  │  │
│  │  └─────────────────────────────┘  │  │
│  │              │ invoke()            │  │
│  │  ┌───────────▼─────────────────┐  │  │
│  │  │      Rust Backend           │  │  │
│  │  │  execute_app()              │  │  │
│  │  └───────────┬─────────────────┘  │  │
│  └──────────────┼────────────────────┘  │
│                 │ spawn                 │
│  ┌──────────────▼─────────────────┐    │
│  │  aioson-sidecar (Node.js)      │    │
│  │  ┌──────────────────────────┐  │    │
│  │  │  Seu app ({app_dir}/)    │  │    │
│  │  │  tools.json (injetado)   │  │    │
│  │  │  app-config.yaml         │  │    │
│  │  └──────────────────────────┘  │    │
│  └────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

### Onde seu app fica no filesystem

```
~/.local/share/com.aioson.play/apps/{seu-app-slug}/
├── manifest.json          ← identidade, versão, packages, ícone/thumb
├── app-config.yaml        ← output config, data_bindings
├── tools.json             ← gerado antes de cada execução (LLM tools)
├── assets/                ← ícone e thumbnail (ver § 7)
│   ├── icon.svg           ← mostrado no dock e na taskbar
│   └── thumb.svg          ← background do card no marketplace/home
├── agents/                ← agentes do app
│   └── {agent-slug}.output.yaml
├── squads/                ← squads do app
│   └── {squad-slug}.output.yaml
└── ...seus arquivos de app...
```

---

## 2. Como seu app se comunica com o AIOSON Play

### Seu app NÃO chama `invoke()` diretamente

O `invoke()` do Tauri só funciona para código rodando **dentro do webview do AIOSON Play** (o frontend React). Seu app roda como um processo Node.js isolado — ele não tem acesso ao contexto Tauri.

### O canal de comunicação é via arquivos + sidecar

**Antes da execução:**
1. AIOSON Play gera `tools.json` no diretório do app
2. `tools.json` contém todas as ferramentas MCP disponíveis (conectores de banco, APIs, etc.)
3. O sidecar lê `tools.json` e injeta as ferramentas no payload do LLM

**Durante a execução:**
1. Seu app recebe via stdin: `--input`, `--tool`, `--model`, `--target`, `--format`
2. A API key é injetada como env var: `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, ou `OPENAI_API_KEY`
3. Seu app produz output em **NDJSON** no stdout:
   ```json
   {"type":"chunk","content":"Processando..."}
   {"type":"chunk","content":"Resultado parcial"}
   {"type":"done","duration_ms":1234}
   {"type":"error","message":"Algo deu errado"}
   ```
4. O Rust backend captura o stdout/stderr e streama de volta para o frontend via evento `execution_output`

**Após a execução:**
1. O output é entregue conforme `target` configurado em `app-config.yaml`:
   - `inline` → exibido na AppPage
   - `file` → gravado em arquivo
   - `webhook` → POST para URL externa
   - `database` → inserido em banco externo

### Configurações do app: como acessar

**NÃO há endpoint HTTP que expõe configurações do app.** A comunicação é via arquivos:

| Arquivo | Quem lê | Quem escreve | Conteúdo |
|---------|---------|--------------|----------|
| `manifest.json` | Seu app, sidecar | AIOSON Play (install) | Identidade, versão, packages |
| `app-config.yaml` | Seu app, sidecar | AIOSON Play / usuário | Output config, data_bindings |
| `tools.json` | Sidecar (antes de executar) | AIOSON Play (gerado) | Ferramentas LLM disponíveis |
| `db-connection.yaml` | Seu app | AIOSON Play / usuário | String de conexão para delivery |

**Para ler configurações no seu app:**
```typescript
// No seu app Node.js:
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

const appDir = process.argv.find(arg => arg.includes('--app-dir')) || process.cwd();

// Ler manifest.json
const manifest = JSON.parse(fs.readFileSync(path.join(appDir, 'manifest.json'), 'utf-8'));

// Ler app-config.yaml
const config = yaml.load(fs.readFileSync(path.join(appDir, 'app-config.yaml'), 'utf-8'));

// Ler tools.json (gerado pelo AIOSON Play)
const tools = JSON.parse(fs.readFileSync(path.join(appDir, 'tools.json'), 'utf-8'));

// Ler data_bindings
const bindings = config.data_bindings || [];
```

---

## 3. Sistemas vs Apps — não confunda

O AIOSON Play tem dois conceitos distintos:

| Conceito | Como roda | UI | Comunicação |
|----------|-----------|----|-------------|
| **App** | Processo sidecar Node.js | AppPage do AIOSON Play | Arquivos + NDJSON |
| **Sistema** | Vite dev server em porta própria (3100+) | `<webview>` na aba "Sistema" da AppPage | Env vars `VITE_AIOSON_*` |

**Se seu app tem uma UI interativa (dashboard, formulário, etc.), ele deve ser um SISTEMA, não um app.**

### Como sistemas funcionam

1. Sistema é instalado como parte do app (campo `systems` no `manifest.json`)
2. Quando o usuário clica "Iniciar" na AppPage, o AIOSON Play spawn `npm run dev` em uma porta única
3. Env vars são injetadas automaticamente:
   ```
   VITE_AIOSON_PORT=3101
   VITE_AIOSON_APP_SLUG=meu-app
   VITE_AIOSON_SYSTEM_SLUG=meu-dashboard
   VITE_AIOSON_DB_PATH=/path/to/db
   VITE_AIOSON_AUTH_URL=http://localhost:5180/api/...
   ```
4. O sistema é exibido em um `<webview>` na aba "Sistema" da AppPage
5. O sistema pode comunicar com o AIOSON Play via **HTTP API** na porta 5180

---

## 4. ProductBridge — como sistemas externos se comunicam

Se você tem um backend externo (como um ERP, sistema de farmácia, etc.) que precisa se comunicar com o AIOSON Play, use o **ProductBridge**:

### HTTP Server interno (porta 5180)

O AIOSON Play roda um servidor HTTP leve em `http://localhost:5180`:

```http
POST /api/mcp/execute
Content-Type: application/json

{
  "alias": "nome-do-conector",
  "params": {
    "search": "termo de busca"
  }
}

Response:
{
  "data": [{"id": 1, "name": "Produto A"}],
  "error": null,
  "duration_ms": 42
}
```

**Este endpoint permite que sistemas externos executem queries MCPI contra conectores configurados no AIOSON Play.**

### CORS

O servidor tem `Access-Control-Allow-Origin: *` — qualquer origem pode chamar.

### Quando usar ProductBridge

- Seu app tem um backend Node.js separado que precisa acessar dados do AIOSON Play
- Seu sistema externo precisa executar queries em bancos conectados ao AIOSON Play
- Integração com sistemas legados que não rodam dentro do AIOSON Play

### Quando NÃO usar ProductBridge

- Seu app roda dentro do AIOSON Play (use arquivos + sidecar)
- Seu app é um sistema (use env vars `VITE_AIOSON_*` + HTTP 5180)

---

## 5. Portas dinâmicas para apps com API

> **NUNCA hardcode uma porta fixa no `manifest.json` de um app publicável.**

O AIOSON Play aloca portas dinamicamente para cada app instalado que tenha `has_api: true`:

1. Na instalação, o Play detecta `has_api: true` e chama `allocate_app_port(appSlug)`
2. A porta alocada é automaticamente escrita no `manifest.json` do app instalado como `api_base_url: "http://localhost:{port}"`
3. O app é iniciado com a env var `PORT={port}` injetada
4. Seu código deve sempre usar `process.env.PORT` com fallback:

```typescript
const PORT = process.env.PORT || 3301;
```

**Ranges de portas gerenciados pelo AIOSON Play:**
- **Play Services:** `3001–3099` — porta fixa declarada em `service.json` (ex: `aioson-auth=3091`)
- **Sistemas:** `3100–3299` — alocadas dinamicamente
- **Apps com API:** `3300+` — alocadas dinamicamente na instalação, persistidas no `manifest.json`
- **ProductBridge:** `5180` — núcleo interno do Play (não usar)

A porta de um app sobrevive a reinicializações: o Play lê `api_base_url` do `manifest.json` para reusar a porta original.

Para descobrir portas de outros apps em runtime: `GET http://localhost:5180/api/registry`
Ver: [docs/port-management.md](port-management.md)

---

## 6. Checklist: como implementar seu app

### Perguntas que você precisa responder

#### 1. Seu app tem uma interface visual (dashboard, formulário, tabela)?

- **SIM** → Seu app precisa de um **Sistema**. Declare no `manifest.json`:
  ```json
  {
    "slug": "meu-app",
    "systems": [
      {
        "slug": "meu-dashboard",
        "name": "Dashboard da Farmácia",
        "description": "Interface visual para gerenciar farmácia"
      }
    ]
  }
  ```

- **NÃO** → Seu app é puramente CLI/LLM. Execute via AppPage normalmente.

#### 2. Seu app precisa acessar dados de bancos conectados ao AIOSON Play?

- **SIM** → Declare `data_bindings` em `app-config.yaml`:
  ```yaml
  data_bindings:
    - id: "busca-produtos"
      description: "Busca produtos no catálogo por termo"
      expected_type: "mcpi"
      required_params: ["search"]
  ```
  O administrador do AIOSON Play bind um `GlobalConnector` a este slot na UI (Settings -> App Data Sources).
  Seu app acessa via `tools.json` (gerado automaticamente) ou via ProductBridge HTTP.

- **NÃO** → Seu app não precisa de dados externos.

#### 3. Seu app precisa se comunicar com outros apps em tempo real?

- **SIM** → Use o **AMP Bus** (AIOSON Message Protocol):
  - Apps subscrevem quando a AppPage abre (`amp_subscribe`)
  - Mensagens são entregues via evento Tauri `amp_message:{slug}`
  - Suporta broadcast (`to_app = "*"`)
  - Mensagens offline são enfileiradas e entregues quando o app volta

- **NÃO** → Seu app é independente.

#### 4. Seu app já existe como um web app separado (Node.js, Express, Fastify, etc.)?

- **SIM** → Três opções:
  - **Opção A (recomendada):** Empacote como **App com API** do AIOSON Play. Defina `has_api: true` no `manifest.json`. O Play aloca uma porta dinamicamente (3300+) na instalação e injeta `PORT` ao iniciar o processo.
  - **Opção B:** Empacote como um **Sistema** do AIOSON Play. O sistema roda em webview com porta própria (3100+).
  - **Opção C:** Mantenha como app externo e use **ProductBridge** (HTTP 5180) para comunicar com o AIOSON Play.

- **NÃO** → Implemente como app nativo do AIOSON Play (sidecar ou webview).

---

## 7. Identidade visual do app — ícone e thumbnail

Todo app instalado tem um espaço próprio pra **ícone** (mostrado no dock e na
taskbar) e um **thumbnail** (background do card no marketplace e na home). Se
você não declarar nada, o aioson-play cai num fallback genérico (ícone `Bot` no
dock, fundo neutro no card) — é por isso que apps sem `icon` ficam todos com a
mesma cara.

### Como declarar

No `manifest.json` do app, adicione os campos `icon` e/ou `thumb` apontando
para arquivos relativos ao diretório do app:

```json
{
  "slug": "meu-app",
  "name": "Meu App",
  "version": "1.0.0",
  "icon": "assets/icon.svg",
  "thumb": "assets/thumb.svg"
}
```

E coloque os arquivos correspondentes no diretório do app:

```
meu-app/
├── manifest.json
└── assets/
    ├── icon.svg
    └── thumb.svg
```

Ambos os campos são **opcionais**. Pode declarar só `icon`, só `thumb`, ou
ambos. O caminho é livre — `assets/` é convenção, não obrigatório.

### Formatos aceitos

O resolver (`src/services/app-assets.ts`) detecta o mime pela extensão e aceita:

| Extensão | Mime | Quando usar |
|----------|------|-------------|
| `.svg` | `image/svg+xml` | **Recomendado** — vetorial, escala bem no dock (44px), taskbar (16px) e card (cobre 100% de largura) |
| `.png` | `image/png` | Ícones com sombra/textura. Exporte 256×256 ou maior pra ficar nítido em telas HiDPI |
| `.webp` | `image/webp` | Thumbnails grandes — melhor compressão que PNG |
| `.jpg` / `.jpeg` | `image/jpeg` | Fotos no thumbnail (não recomendado pra ícone) |
| `.gif` | `image/gif` | Suportado, mas raramente faz sentido |

### Onde cada um aparece

| Campo | Componente | Renderização |
|-------|------------|--------------|
| `icon` | `Dock` (`src/shell/components/dock.tsx`) | `<img>` 28×28 dentro de um quadrado 44×44 com `object-fit: contain` |
| `icon` | `Taskbar` (apps abertos) | Avatar pequeno na barra superior |
| `thumb` | `HomePage` (card do app) | Background do card com overlay escuro `linear-gradient(135deg, rgba(10,10,15,0.85), rgba(10,10,15,0.25))` para garantir contraste do texto |

### Recomendações práticas

- **Ícone:** SVG quadrado com viewBox `0 0 24 24` ou `0 0 32 32`, padding interno
  pra não tocar as bordas. Cores funcionam tanto em dark quanto light theme —
  evite branco puro ou preto puro.
- **Thumbnail:** SVG ou PNG/WebP largo (proporção ~16:9 ou 4:3), com elementos
  visuais que sobrevivam ao overlay escuro do card. Texto no thumb costuma
  ficar ilegível depois do gradient — prefira composições gráficas.
- **Cache:** o aioson-play cacheia o asset em memória após a primeira leitura.
  Trocar o arquivo durante dev-link exige reabrir o app para invalidar o cache
  (`clearAppAssetCache(slug)` é chamado no flow de update da store).

### Fallback atual

Se `icon` está ausente ou o arquivo não existe:

- Dock → ícone `Bot` da lucide-react (mesma silhueta para todos)
- Card → background neutro `var(--bg-surface)`

A leitura falha silenciosamente (sem erro no console) — útil pra apps mid-dev,
ruim pra produção porque você não percebe que o ícone sumiu.

---

## 8. Exemplo prático: Dashboard de Farmácia

### Cenário
Você tem um dashboard para gerenciar uma farmácia. Precisa:
- UI visual (tabela de produtos, formulários)
- Acessar banco de dados de produtos conectado ao AIOSON Play
- Rodar dentro do AIOSON Play quando instalado

> **Referência real:** O app `aioson-squads/farmacia` já está publicável e instalável no aioson-play. Ele implementa `has_api: true`, `/api/aioson-play`, `/api/aioson-test` e `app.manifest.json` completos. Consulte-o como modelo vivo.

### Arquitetura recomendada

```
┌──────────────────────────────────────────────────┐
│           AIOSON Play (AppPage)                  │
│  ┌────────────────────────────────────────────┐  │
│  │  Aba "App": execução CLI via sidecar       │  │
│  │  Aba "Sistema": webview do dashboard       │  │
│  └────────────────────────────────────────────┘  │
│                    │                              │
│  ┌─────────────────▼──────────────────────────┐  │
│  │  App com API: Dashboard Farmácia           │  │
│  │  Roda em http://localhost:{porta_dinamica} │  │
│  │  Env vars: VITE_AIOSON_* injetadas         │  │
│  │  Comunicação: HTTP para localhost:5180     │  │
│  └────────────────────────────────────────────┘  │
│                    │                              │
│  ┌─────────────────▼──────────────────────────┐  │
│  │  ProductBridge (porta 5180)                │  │
│  │  POST /api/mcp/execute                     │  │
│  │  → executa queries no conector de banco    │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

### Implementação

**1. manifest.json do app:**
```json
{
  "slug": "farmacia-gestao",
  "name": "Gestão de Farmácia",
  "version": "1.0.0",
  "icon": "assets/icon.svg",
  "thumb": "assets/thumb.svg",
  "has_api": true,
  "api_base_url": "http://localhost:3301",
  "systems": [
    {
      "slug": "dashboard",
      "name": "Dashboard",
      "description": "Dashboard visual para gerenciar produtos, estoque e vendas"
    }
  ]
}
```
> ⚠️ A `api_base_url` original pode ter fallback (ex: `:3301`). O Play **reescreve** essa URL com a porta dinâmica alocada durante a instalação. O app deve usar `process.env.PORT` para respeitar a porta real.

**2. app-config.yaml:**
```yaml
data_bindings:
  - id: "catalogo-produtos"
    description: "Acesso ao catálogo de produtos da farmácia"
    expected_type: "mcpi"
    required_params: ["search", "category"]
  - id: "estoque"
    description: "Consulta e atualização de estoque"
    expected_type: "mcpi"
    required_params: ["product_id", "quantity"]

output:
  target: inline
  format: markdown
```

**3. No código do sistema (dashboard React):**
```typescript
// O sistema é um app React com Vite
// Env vars injetadas automaticamente:
const AIOSON_PORT = import.meta.env.VITE_AIOSON_PORT;
const AIOSON_APP_SLUG = import.meta.env.VITE_AIOSON_APP_SLUG;
const AIOSON_AUTH_URL = import.meta.env.VITE_AIOSON_AUTH_URL;

// Para buscar produtos do banco conectado:
async function buscarProdutos(termo: string) {
  const response = await fetch('http://localhost:5180/api/mcp/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      alias: 'catalogo-produtos',
      params: { search: termo }
    })
  });
  const { data, error } = await response.json();
  if (error) throw new Error(error);
  return data;
}
```

**4. Estrutura de arquivos do sistema:**
```
~/.local/share/com.aioson.play/apps/farmacia-gestao/
├── manifest.json
├── app-config.yaml
├── assets/
│   ├── icon.svg
│   └── thumb.svg
├── systems/
│   └── dashboard/
│       ├── package.json
│       ├── vite.config.ts
│       ├── index.html
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           └── pages/
│               └── DashboardPage.tsx
```

---

## 9. LLM fallback, Vision e Audio capabilities — padrão atual

> **Decisão (2026-06-03):** LLM global do Play tem dois conceitos separados.
> **Conexão LLM** é provider + uma API Key + modelos por operação, cada modelo validado em `Settings → Conexões LLM`.
> **Política de fallback** é a ordem automática de tentativa por operação entre modelos já validados. A UI principal não expõe uma matriz manual de ordenação para manter a configuração simples.
> Não existe mais uma página/configuração paralela de "LLM Fallback Chain" com novas credenciais.

### Schema de `llm-chain.json`

O Play exporta a política global em `llm-chain.json`. O arquivo não deve ser a
fonte primária de credenciais; ele descreve a ordem, modelo e endpoint base que
o app deve tentar.

```json
{
  "exportedAt": "2026-06-03T00:00:00.000Z",
  "appScope": null,
  "configs": [
    {
      "provider": "openrouter",
      "operation": "text_generation",
      "model": "openrouter/auto",
      "baseUrl": "https://openrouter.ai/api/v1",
      "priority": 1,
      "capabilities": {
        "vision": true
      }
    },
    {
      "provider": "openai",
      "operation": "code_generation",
      "model": "gpt-4o-mini",
      "baseUrl": "https://api.openai.com/v1",
      "priority": 2
    },
    {
      "provider": "openai",
      "operation": "speech_to_text",
      "model": "whisper-1",
      "baseUrl": "https://api.openai.com/v1",
      "priority": 1,
      "capabilities": {
        "audio": true
      }
    }
  ]
}
```

Regras:

- A ordem é gerada automaticamente pelo Play e separada por `operation`.
- Só entram modelos que passaram na validação com a API Key do provider.
- `OpenRouter` é o gateway recomendado para modelos menos comuns.
- Conexões diretas devem ficar restritas a OpenAI, Claude/Anthropic, Google Gemini, DeepSeek e xAI.
- Se um provider falhar em runtime, o app deve tentar o próximo `configs[]` da mesma `operation`, por `priority`.

Operações canônicas:

- `text_generation` — texto entra, texto sai.
- `code_generation` — especialização de texto para código.
- `image_understanding` — imagem entra, texto/JSON sai.
- `image_generation` — texto/imagem entra, imagem sai.
- `video_understanding` — vídeo entra, texto/JSON sai.
- `video_generation` — texto/imagem entra, vídeo sai.
- `speech_to_text` — áudio entra, transcrição literal sai.
- `text_to_speech` — texto entra, áudio falado sai.
- `audio_understanding` — áudio entra, resposta textual conforme prompt sai.
- `realtime_voice` — áudio entra e áudio sai em conversa realtime.

Os campos `capabilities.vision` e `capabilities.audio` existem para seleção
conservadora de modelos. Atenção: modelos de áudio podem usar endpoints
especializados diferentes de chat completions; apps devem chamar o endpoint
correto do provider para transcrição, fala ou análise de áudio.

### Como apps consomem hoje

```typescript
// No app:
const chainFile = JSON.parse(fs.readFileSync('llm-chain.json', 'utf-8'));
const chain = [...chainFile.configs]
  .filter((entry) => entry.operation === 'image_understanding')
  .sort((a, b) => a.priority - b.priority);

for (const provider of chain) {
  try {
    return await callProvider(provider);
  } catch {
    continue;
  }
}
throw new Error('Nenhum provider LLM da chain funcionou.');
```

### Quando ativar a primitiva do harness

Quando dois ou mais apps instaláveis no aioson-play precisarem de vision ou audio, adicionar:

- `POST localhost:5180/api/harness/vision` — `{image, prompt}` → resolve internamente
- `POST localhost:5180/api/harness/audio` — `{audio, mimeType}` → resolve internamente

Apps consumiriam essas APIs em vez de carregar `llm-chain.json` e implementar localmente. Antes desse gatilho, **não implementar** — over-engineering para 1 consumidor.

---

## 10. Resumo rápido de decisões

| Sua necessidade | Use | Por quê |
|-----------------|-----|---------|
| App CLI/LLM puro | App (sidecar) | Simples, sem UI separada |
| Dashboard/visual | Sistema (webview) | UI interativa em porta própria |
| Backend externo | ProductBridge (HTTP 5180) | Comunicação cross-process |
| Dados de conectores | data_bindings + tools.json | Gerenciado pelo AIOSON Play |
| Tempo real entre apps | AMP Bus | Mensageria nativa |

## Atualizações deste doc

- **2026-06-03** — Conexões LLM consolidadas: uma API key por provider, modelos por operação e fallback automático por operação na própria página `Settings → Conexões LLM`, não uma configuração paralela com novas credenciais.
| Publicar no aioson.com | manifest.json + publish | Marketplace integration |

---

## 11. Publicar seu app no marketplace

Apps no aioson-play são modelados como **Systems** no aioson-com. 3 caminhos
para publicar:

### Via CLI `aioson system:publish`

```bash
# Privado para uma lista de emails
aioson system:publish ./meu-app --private --invite="cliente1@x.com,cliente2@x.com"

# Público (FREE)
aioson system:publish ./meu-app

# Pago (Jedi)
aioson system:publish ./meu-app --paid
```

Ou declare emails autorizados no `system.json`:
```json
{ "slug": "meu-app", "authorized_emails": ["cliente@x.com"] }
```

### Via UI do aioson-play (apps dev-link)

Menu kebab `⋯` da app aberta → **"↑ Publicar app…"** → modal com SemVer +
privacidade + textarea de emails. Backend usa `/v1/apps/publish` (proxy para
`storePublishSystem`).

### Via API direta

`POST /api/store/systems/publish` — JSON `{slug, version, files, manifest,
visibility, authorizedEmails}`. Doc: `aioson-com/docs/apps-publish-install-spec.md`.

### Como o cliente instala

Cliente com email autorizado abre o aioson-play, vê marketplace
(`HomePage → Loja`), o app aparece (filtrado por visibilidade + invitee), clica
para instalar. Backend valida email contra `SystemInvitee`, devolve
files+manifest, aioson-play extrai em `apps/{slug}/`.

---

## 12. Links úteis

- [Integration Manual](./integration-manual.md) — integração com sistemas externos
- [App Data Bindings](./app-data-bindings.md) — slots de dados (MCPI/REST) entre apps
- [Port Management](./port-management.md) — alocação de portas + apps split-stack
- [Dev Link Install](./dev-link-install.md) — install via symlink p/ desenvolvimento
- AIOSON Play source: `src-tauri/src/execution.rs` — como apps são executados
- AIOSON Play source: `src-tauri/src/http_server.rs` — ProductBridge HTTP server
- AIOSON Play source: `src-tauri/src/process_manager.rs` — como sistemas rodam
- AIOSON Play source: `src/services/marketplace.ts` — instalação de apps
- AIOSON Play source: `src/services/publish.ts` — publish via UI
- AIOSON Play source: `src/services/install-app.ts` — install via código
