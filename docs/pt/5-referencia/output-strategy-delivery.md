# Output Strategy e Delivery de Conteúdo

> Guia completo sobre como configurar, automatizar e monitorar a entrega de conteúdo gerado pelas squads.

---

## Visão Geral

Toda squad gera **conteúdo** (HTMLs, arquivos JSON, markdown, etc). O **Output Strategy** define **onde** e **como** esse conteúdo é entregue:

- **Files**: Salva em `output/{squad-slug}/`
- **SQLite**: Indexa em tabela `content_items` do runtime
- **Hybrid**: Faz ambos
- **Webhooks**: Dispara requests HTTP automáticos para URLs externas
- **Cloud**: Publica no catálogo cloud do AIOSON

O **Delivery Runner** é o sistema que:
- Detecta conteúdo novo ou modificado
- Valida se deve disparar webhooks
- Executa retries automáticos (até 3 tentativas)
- Registra logs de cada entrega em `delivery_log`

---

## Configuração: Squad Manifest

Todo squad tem um arquivo `squad.manifest.json` que controla a estratégia:

### Informação importante: Método HTTP

⚠️ **Webhooks SEMPRE usam POST** com `Content-Type: application/json`

Seu servidor deve estar preparado para receber:
```
POST /seu-endpoint HTTP/1.1
Content-Type: application/json

{ payload JSON aqui }
```

### Estrutura básica

```json
{
  "schemaVersion": "1.0.0",
  "slug": "youtube-creator",
  "name": "YouTube Creator Squad",
  "mode": "content",
  "mission": "Criar roteiros e assets para YouTube",
  "goal": "Gerar conteúdos virais com retenção forte",

  "outputStrategy": {
    "mode": "hybrid",
    "fileOutput": {
      "enabled": true,
      "dir": "output/youtube-creator/",
      "formats": ["html", "md", "json"]
    },
    "dataOutput": {
      "enabled": true,
      "storage": "sqlite",
      "table": "content_items",
      "contentItems": true
    },
    "delivery": {
      "webhooks": [
        {
          "slug": "slack-notifier",
          "url": "https://hooks.slack.com/services/YOUR/HOOK/HERE",
          "trigger": "on-publish",
          "format": "json",
          "timeout": 10000
        },
        {
          "slug": "external-api",
          "url": "https://api.example.com/content?key={{ENV:API_KEY}}",
          "trigger": "on-new",
          "format": "json"
        }
      ],
      "cloudPublish": false,
      "autoPublish": true
    }
  },

  "rules": {
    "outputsDir": "output/youtube-creator/",
    "logsDir": "aioson-logs/youtube-creator/",
    "mediaDir": "media/youtube-creator/"
  }
}
```

### Campos de `outputStrategy`

#### `mode`
Define qual combinação de saídas usar:
- `"files"` — apenas salva em disco
- `"sqlite"` — apenas indexa em SQLite
- `"hybrid"` — ambos (recomendado)

#### `fileOutput`
```json
{
  "enabled": true,
  "dir": "output/{squad-slug}/",
  "formats": ["html", "md", "json"]
}
```
- `enabled`: true para ativar
- `dir`: onde salvar os arquivos
- `formats`: quais extensões importam (outras são ignoradas)

#### `dataOutput`
```json
{
  "enabled": true,
  "storage": "sqlite",
  "table": "content_items",
  "contentItems": true
}
```
- `storage`: sempre `"sqlite"` por enquanto
- `table`: qual tabela usar
- `contentItems`: true para rastrear conteúdo individual

#### `delivery.webhooks[]`
Array de webhooks que devem disparar:

```json
{
  "slug": "identificador-unico",
  "url": "https://api.example.com/webhook",
  "trigger": "on-publish",
  "format": "json",
  "timeout": 10000,
  "headers": {
    "Authorization": "Bearer {{ENV:WEBHOOK_TOKEN}}"
  }
}
```

**Campos obrigatórios:**
- `slug`: identificador único para este webhook
- `url`: destino HTTP (suporta `{{ENV:VAR}}` para variáveis de ambiente)
- `trigger`: quando disparar

**Campos opcionais:**
- `format`: `"json"` (padrão) ou `"form"`
- `timeout`: timeout em ms (padrão 10000)
- `headers`: headers HTTP customizados

**Triggers disponíveis:**
- `"on-new"` — quando conteúdo novo é criado
- `"on-publish"` — quando conteúdo é marcado como publicado
- `"on-update"` — quando conteúdo é atualizado
- `"always"` — em qualquer mudança

#### `delivery.cloudPublish`
```json
{
  "cloudPublish": true
}
```
Se `true`, publica o conteúdo no catálogo cloud do AIOSON.

#### `delivery.autoPublish`
```json
{
  "autoPublish": true
}
```
Se `true`, o delivery runner dispara webhooks automaticamente após content ingestion. Se `false`, apenas responde a comandos CLI.

---

## Payloads de Webhook

**Método HTTP:** Sempre `POST`
**Content-Type:** `application/json` (por padrão)

### Formato JSON (padrão)

Quando um webhook dispara, o payload é:

```json
{
  "event": "on-publish",
  "squadSlug": "youtube-creator",
  "contentKey": "episode-001",
  "timestamp": "2026-03-20T14:30:00Z",
  "content": {
    "jsonPath": "output/youtube-creator/episode-001.json",
    "htmlPath": "output/youtube-creator/episode-001.html",
    "data": {
      "title": "Top 10 YouTube Shorts Trends",
      "description": "...",
      "tags": ["shorts", "trends", "viral"]
    }
  },
  "attempt": 1,
  "retryCount": 0
}
```

**Campos:**
- `event`: qual trigger disparou ("on-new", "on-publish", etc)
- `squadSlug`: qual squad gerou o conteúdo
- `contentKey`: identificador único do conteúdo
- `timestamp`: ISO 8601
- `content.jsonPath`: caminho relativo ao JSON (se existir)
- `content.htmlPath`: caminho relativo ao HTML (se existir)
- `content.data`: conteúdo parseado como JSON
- `attempt`: número da tentativa (1-3)
- `retryCount`: quantas vezes foi retentado

### Formato Form (application/x-www-form-urlencoded)

Se `format: "form"`:

```
event=on-publish&squadSlug=youtube-creator&contentKey=episode-001&timestamp=2026-03-20T14%3A30%3A00Z&content=%7B%22jsonPath%22%3A...%7D
```

---

## Configurando Variáveis de Ambiente

Webhooks frequentemente precisam de tokens de autenticação. Use placeholders `{{ENV:VAR_NAME}}`:

```json
{
  "slug": "slack",
  "url": "https://hooks.slack.com/services/{{ENV:SLACK_WEBHOOK_ID}}",
  "headers": {
    "Authorization": "Bearer {{ENV:API_KEY}}"
  }
}
```

**No seu `.env` ou environment:**

```bash
SLACK_WEBHOOK_ID=T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX
API_KEY=sk_live_xxxxx
```

O delivery runner resolve esses placeholders antes de fazer a requisição HTTP.

**⚠️ Aviso:** Se uma variável de ambiente referenciada não existir:
- O webhook **não dispara**
- Um aviso aparece em `squad:doctor`
- O conteúdo é indexado mas não entregue

---

## Monitorando Delivery

### `squad:doctor` com output strategy

```bash
aioson squad:doctor --squad=youtube-creator
```

Mostra informações sobre output strategy:

```
Output strategy: mode=hybrid, webhooks=2, cloudPublish=false, autoPublish=true

✓ Output strategy: OK
✗ Webhook "slack": env var SLACK_WEBHOOK_ID not set
⚠ autoPublish is enabled but one webhook has unset env vars
```

### `delivery:log` (próximas versões)

Visualizar histórico de entregas:

```bash
aioson delivery:log --squad=youtube-creator --limit=20
```

Mostra cada tentativa, status code, resposta do servidor.

### Dashboard

No dashboard (`/squads/[slug]`), há uma aba **"Saída"** que mostra:
- Modo configurado (files/sqlite/hybrid)
- Webhooks registrados
- Status da entrega automática
- Log das últimas entregas com status

---

## Comandos CLI

### Exportar output strategy

Salva a estratégia de uma squad em um arquivo JSON:

```bash
aioson output-strategy:export --squad=youtube-creator
```

Resultado: `output-strategy-youtube-creator.json`

**Útil para:** documentar configuração, compartilhar com outro projeto.

### Importar output strategy

Copia a estratégia de um arquivo ou outra squad:

```bash
# De um arquivo
aioson output-strategy:import --squad=nova-squad --file=output-strategy-youtube-creator.json

# De outra squad no mesmo projeto
aioson output-strategy:import --squad=nova-squad --from=youtube-creator
```

**Útil para:** replicar configuração, copiar webhooks entre squads.

### Disparar delivery manual

Se `autoPublish: false`, ou para reenviar conteúdo falho:

```bash
aioson deliver --squad=youtube-creator --content-key=episode-001
```

Isso re-dispara todos os webhooks para esse conteúdo.

### Validar manifest

Verifica se a output strategy está correta antes de rodar:

```bash
aioson squad:validate --squad=youtube-creator
```

Valida:
- Schema do outputStrategy
- Modo vs configurações (ex: mode=files não pode ter dataOutput)
- Existência de arquivos de worker (se houver)
- Variáveis de ambiente referenciadas
- Triggers válidos

---

## Exemplos Práticos

### Exemplo 1: Squad com Slack + API customizada

```json
{
  "outputStrategy": {
    "mode": "hybrid",
    "fileOutput": { "enabled": true, "dir": "output/marketing/", "formats": ["html", "json"] },
    "dataOutput": { "enabled": true, "storage": "sqlite" },
    "delivery": {
      "webhooks": [
        {
          "slug": "slack-updates",
          "url": "https://hooks.slack.com/services/{{ENV:SLACK_WEBHOOK}}",
          "trigger": "on-publish",
          "format": "json"
        },
        {
          "slug": "marketing-api",
          "url": "https://api.marketing.internal/content/ingest",
          "trigger": "on-new",
          "format": "json",
          "headers": {
            "Authorization": "Bearer {{ENV:MARKETING_API_TOKEN}}",
            "X-Squad": "marketing"
          },
          "timeout": 15000
        }
      ],
      "autoPublish": true,
      "cloudPublish": false
    }
  }
}
```

**Variáveis de ambiente:**

```bash
SLACK_WEBHOOK=T1234567/B7654321/XXXXXXXXXXXX
MARKETING_API_TOKEN=sk_test_XXXXX
```

**Fluxo:**
1. Squad gera conteúdo em `output/marketing/`
2. Conteúdo é indexado em SQLite
3. Auto-delivery detecta novo conteúdo
4. Dispara POST para Slack (notificação)
5. Dispara POST para marketing API (ingestão)
6. Se qualquer um falhar (5xx ou timeout), retenta até 3 vezes com backoff

### Exemplo 2: Squad com Files Only (sem webhooks)

```json
{
  "outputStrategy": {
    "mode": "files",
    "fileOutput": {
      "enabled": true,
      "dir": "output/research/",
      "formats": ["md", "html", "json"]
    },
    "dataOutput": { "enabled": false },
    "delivery": {
      "webhooks": [],
      "autoPublish": false,
      "cloudPublish": false
    }
  }
}
```

**Use case:** Squad que gera documentação e pesquisa — conteúdo é salvo em disco mas não entregue automaticamente.

### Exemplo 3: Publicação Cloud

```json
{
  "outputStrategy": {
    "mode": "hybrid",
    "fileOutput": { "enabled": true },
    "dataOutput": { "enabled": true },
    "delivery": {
      "webhooks": [],
      "autoPublish": false,
      "cloudPublish": true
    }
  }
}
```

**Use case:** Squad publica conteúdo no catálogo cloud (para ser reusada por outros projetos).

---

## Retry Logic

O delivery runner implementa retry inteligente:

### Quando retenta
- Status **5xx** (erros do servidor)
- Status **429** (rate limit)
- Timeouts (conexão expirou)
- Erros de rede (DNS, conexão recusada)

### Quando NÃO retenta
- Status **4xx** (erro do cliente — algo está errado com o payload)
- Status **2xx/3xx** (sucesso)

### Tentativas e delays

```
Tentativa 1: falha
→ aguarda 1s
Tentativa 2: falha
→ aguarda 3s
Tentativa 3: falha
→ registra falha permanente em delivery_log
```

Se todas as 3 tentativas falharem:
- Conteúdo continua indexado em SQLite
- Webhook não foi entregue
- Log registra em `delivery_log` com status "failed"
- Dashboard mostra o erro

---

## Troubleshooting

### Webhook não dispara

**Verificar:**

```bash
aioson squad:doctor --squad=seu-squad
```

Procure por:
- ✗ "autoPublish is enabled but no delivery targets configured"
- ✗ "Webhook 'X' references unset env var: Y"
- ✗ "Mode mismatch: hybrid mode but dataOutput disabled"

**Soluções:**

1. **Env var não definida?**
   ```bash
   # Definir variável (substitua MINHA_VAR pelo nome real)
   export MINHA_VAR="<valor-aqui>"

   # Ou adicione ao .env
   # MINHA_VAR=<valor-aqui>
   ```

2. **Webhook mal formatado?**
   ```bash
   aioson squad:validate --squad=seu-squad
   ```
   Valida toda a estrutura do manifest.

3. **autoPublish desligado?**
   Disparar manualmente:
   ```bash
   aioson deliver --squad=seu-squad --content-key=seu-conteudo
   ```

4. **Conteúdo não foi gerado?**
   Verificar se o arquivo existe:
   ```bash
   ls -la output/seu-squad/
   ```

### Webhook retorna erro 4xx

Status 4xx significa erro do cliente (seu payload está errado).

**Debug:**

```bash
# Testar o webhook manualmente no dashboard
# Ou via CLI (próximas versões)
aioson webhook:test --squad=seu-squad --webhook=seu-webhook
```

Isso envia um payload de teste e mostra a resposta.

**Checklist:**

- [ ] URL é acessível? (`curl -I https://...`)
- [ ] ✅ Método é **sempre POST** (não configurável)
- [ ] ✅ Content-Type é **sempre JSON** (não configurável)
- [ ] Seu servidor está listening em POST na URL?
- [ ] Variáveis de ambiente foram resolvidas? (não há `{{ENV:X}}` no payload final)
- [ ] Token/auth está correto?

### Webhook retorna erro 5xx

Servidor dele está em problemas. O delivery runner vai retentar 2 mais vezes (delays: 3s, 8s).

**O que fazer:**

- [ ] Aguardar (servidor pode estar em manutenção)
- [ ] Conferir logs do servidor dele
- [ ] Disparar manualmente depois:
  ```bash
  aioson deliver --squad=seu-squad --content-key=seu-conteudo
  ```

### Conteúdo não aparece em SQLite

Se `dataOutput.enabled: true` mas o conteúdo não está em `content_items`:

```bash
aioson squad:doctor --squad=seu-squad
```

Procure por:
- ✗ "Content indexing: X pending"
- ✗ "Mode mismatch: SQLite disabled"

**Soluções:**

1. **Runtime DB não foi inicializado?**
   ```bash
   aioson runtime:init
   ```

2. **Conteúdo ainda não foi ingerido?**
   ```bash
   # Forçar ingestão
   aioson runtime:ingest output/seu-squad/
   ```

3. **Arquivo não tem extensão indexável?**
   Verifique `fileOutput.formats` — contém `.html`, `.json`, etc?

---

## Exemplos Avançados

### Worker scripts personalizados (próximas versões)

Para lógica de delivery muito customizada, você pode registrar um script Python:

```json
{
  "delivery": {
    "webhooks": [
      {
        "slug": "custom-processor",
        "worker": ".aioson/squads/seu-squad/workers/deliver.py",
        "trigger": "on-publish"
      }
    ]
  }
}
```

O script recebe conteúdo como stdin e pode fazer qualquer coisa (salvar em S3, chamar APIs complexas, etc).

### Integração com Zapier/Make (próximas versões)

Use um webhook para disparar automações em Zapier:

```json
{
  "slug": "zapier",
  "url": "https://hooks.zapier.com/hooks/catch/YOUR_WEBHOOK_ID/",
  "trigger": "on-publish",
  "format": "json"
}
```

Zapier receberá o payload e poderá disparar outras ações (enviar email, atualizar Notion, etc).

---

## Resumo: Fluxo Completo

```
Squad gera arquivo (output/squad/content.html)
        ↓
Runtime indexa em content_items (SQLite)
        ↓
Delivery runner detecta novo conteúdo
        ↓
Resolve {{ENV:VAR}} em URLs e headers
        ↓
Dispara POST para cada webhook
        ↓
Se 2xx/3xx → sucesso (log em delivery_log)
Se 5xx/429/timeout → retenta (até 3 tentativas)
Se 4xx → falha permanente (log em delivery_log)
        ↓
Dashboard mostra status de cada entrega
```

---

## Próximas Passos

- Ler [Squad e Genome](../4-agentes/squad.md) para entender estrutura geral
- Usar `aioson squad:validate` antes de rodar squads
- Monitorar em `/squads/[slug]` → aba "Saída"
- Debugar com `squad:doctor` se algo não funcionar
