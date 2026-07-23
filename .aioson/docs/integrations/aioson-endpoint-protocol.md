# AIOSON Play — Protocolo de Endpoints: `/api/aioson-play`

Este manual descreve como implementar o protocolo de declaração de capacidades do AIOSON Play em seu app. Ao implementar este protocolo, seu app se torna integrável automaticamente pelo sistema de Bridge Apps e pelo LLM orquestrador.

## O que é o protocolo `/api/aioson-play`?

É um endpoint REST que seu app deve expor para declarar:

- **Quem você é**: nome, slug, versão
- **O que você faz**: endpoints disponíveis, métodos, descrições
- **Como se autenticar**: tipo de autenticação, quando necessário
- **Quais eventos emite**: tópicos AMP publicados pelo app

O AIOSON Play chama este endpoint automaticamente ao descobrir seu app e cacheia as informações para uso pelo LLM e pelas Bridge Apps.

### Porta dinâmica: como funciona?

Apps com API (`has_api: true`) não devem assumir uma porta fixa. O fluxo é:

1. **Publicação**: seu `manifest.json` define `api_base_url` como fallback (ex: `http://localhost:3301`)
2. **Instalação**: o Play aloca uma porta única do range 3300+ e **reescreve** o `api_base_url` no manifest instalado
3. **Execução**: o Play inicia o processo do app injetando `PORT={porta_alocada}`
4. **Descoberta**: o Play chama `GET {api_base_url}/api/aioson-play` para obter as capacidades

Seu código deve sempre priorizar `process.env.PORT`:

```typescript
const PORT = process.env.PORT || 3301;
```

## Formato da resposta

### Endpoint: `GET /api/aioson-play`

**Content-Type**: `application/json`

```json
{
  "name": "Farmácia Inteligente",
  "slug": "farmacia-inteligente",
  "version": "1.0.0",
  "api_base_url": "http://localhost:3301",
  "endpoints": [
    {
      "path": "/api/products",
      "method": "GET",
      "description": "Busca produtos no catálogo por nome ou princípio ativo",
      "params": [
        {
          "name": "search",
          "type": "string",
          "required": true,
          "description": "Nome ou parte do nome do produto"
        },
        {
          "name": "category",
          "type": "string",
          "required": false,
          "description": "Filtro por categoria"
        }
      ],
      "auth": false
    },
    {
      "path": "/api/orders",
      "method": "POST",
      "description": "Cria um novo pedido",
      "body": {
        "type": "object",
        "required": true,
        "description": "Dados do pedido",
        "schema": {
          "customer_id": "number",
          "items": "array",
          "payment_method": "string"
        }
      },
      "auth": true,
      "auth_type": "bearer",
      "response_type": "object"
    }
  ],
  "events": [
    {
      "topic": "order.created",
      "description": "Emitido quando um pedido é criado com sucesso",
      "payload_schema": {
        "order_id": "number",
        "customer_id": "number",
        "total": "number",
        "items": "array"
      }
    },
    {
      "topic": "order.status_changed",
      "description": "Emitido quando o status do pedido muda",
      "payload_schema": {
        "order_id": "number",
        "old_status": "string",
        "new_status": "string"
      }
    }
  ],
  "auth": {
    "type": "bearer",
    "description": "Use Bearer token configurado no AIOSON Play"
  }
}
```

### Campos explicados

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `name` | string | Sim | Nome legível do app |
| `slug` | string | Sim | Identificador único (slug amigável) |
| `version` | string | Sim | Versão do app (semver recomendado) |
| `api_base_url` | string | Sim | URL base para chamadas de API (ex: `http://localhost:3301`) |
| `endpoints` | array | Sim | Lista de endpoints disponíveis |
| `events` | array | Não | Lista de eventos AMP publicados |
| `auth` | object | Não | Metadados globais de autenticação |
| `subscribes_to` | array | Não | Lista de tópicos AMP que este app pode assinar |

#### Endpoint Object

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `path` | string | Sim | Caminho do endpoint (ex: `/api/products`) |
| `method` | string | Sim | Método HTTP: `GET`, `POST`, `PUT`, `DELETE`, `PATCH` |
| `description` | string | Sim | Descrição do que o endpoint faz |
| `params` | array | Não | Parâmetros de query ou path |
| `body` | object | Não | Esquema do corpo da requisição (POST/PUT/PATCH) |
| `auth` | boolean | Sim | Requer autenticação? |
| `auth_type` | string | Não | Tipo de autenticação: `bearer`, `api_key`, `basic`, `oauth2` |
| `response_type` | string | Não | Tipo de retorno esperado |

#### Param Object

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `name` | string | Sim | Nome do parâmetro |
| `type` | string | Sim | Tipo: `string`, `number`, `boolean`, `array`, `object` |
| `required` | boolean | Sim | Obrigatório? |
| `description` | string | Não | Descrição do parâmetro |

#### Event Object

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `topic` | string | Sim | Nome do tópico AMP (ex: `order.created`) |
| `description` | string | Sim | Descrição do evento |
| `payload_schema` | object | Não | Esquema do payload do evento |

## Exemplo de implementação em Node.js/Express

### 1. Adicione a dependência (se necessário)

```bash
npm install express
```

### 2. Crie o endpoint no seu servidor Express

```javascript
const express = require('express');
const app = express();

// Middleware para JSON
app.use(express.json());

// GET /api/aioson-play — Declaração de capacidades
app.get('/api/aioson-play', (req, res) => {
  const manifest = {
    name: 'Farmácia Inteligente',
    slug: 'farmacia-inteligente',
    version: '1.0.0',
    api_base_url: 'http://localhost:3301',
    endpoints: [
      {
        path: '/api/products',
        method: 'GET',
        description: 'Busca produtos no catálogo por nome ou princípio ativo',
        params: [
          {
            name: 'search',
            type: 'string',
            required: true,
            description: 'Nome ou parte do nome do produto'
          },
          {
            name: 'category',
            type: 'string',
            required: false,
            description: 'Filtro por categoria'
          }
        ],
        auth: false
      },
      {
        path: '/api/orders',
        method: 'POST',
        description: 'Cria um novo pedido',
        body: {
          type: 'object',
          required: true,
          description: 'Dados do pedido',
          schema: {
            customer_id: 'number',
            items: 'array',
            payment_method: 'string'
          }
        },
        auth: true,
        auth_type: 'bearer',
        response_type: 'object'
      },
      {
        path: '/api/orders/:id',
        method: 'GET',
        description: 'Busca um pedido pelo ID',
        params: [
          {
            name: 'id',
            type: 'number',
            required: true,
            description: 'ID do pedido'
          }
        ],
        auth: true,
        auth_type: 'bearer',
        response_type: 'object'
      }
    ],
    events: [
      {
        topic: 'order.created',
        description: 'Emitido quando um pedido é criado com sucesso',
        payload_schema: {
          order_id: 'number',
          customer_id: 'number',
          total: 'number',
          items: 'array'
        }
      },
      {
        topic: 'order.status_changed',
        description: 'Emitido quando o status do pedido muda',
        payload_schema: {
          order_id: 'number',
          old_status: 'string',
          new_status: 'string'
        }
      }
    ],
    auth: {
      type: 'bearer',
      description: 'Use Bearer token configurado no AIOSON Play'
    }
  };

  res.json(manifest);
});

// POST /api/aioson-test — Endpoint de teste (opcional)
app.post('/api/aioson-test', (req, res) => {
  const { endpoint } = req.body;

  // Retorna um resultado de teste sem efeitos colaterais
  // Use apenas para validar que o endpoint existe e entende a requisição
  res.json({
    endpoint,
    success: true,
    message: 'Endpoint recebido com sucesso',
    timestamp: new Date().toISOString()
  });
});

// Iniciar servidor
const PORT = process.env.PORT || 3301;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
```

## Configuração no manifest.json

Para que o AIOSON Play saiba que seu app tem API, adicione os campos abaixo ao `manifest.json`:

```json
{
  "name": "Farmácia Inteligente",
  "slug": "farmacia-inteligente",
  "version": "1.0.0",
  "description": "Sistema de gestão de farmácia com integração AMP",
  "has_api": true,
  "api_base_url": "http://localhost:3301"
}
```

## Autenticação

### Tokens de acesso

O AIOSON Play armazena tokens de acesso no keyring do sistema operacional. Para usar autenticação:

1. No AIOSON Play, configure o token do app via comando:
   - Chame `set_app_token(app_slug, token)` para armazenar o token
   - O Bridge App recupera o token via `get_app_token(app_slug)` ao chamar seu endpoint

2. No seu endpoint, valide o token conforme o tipo:

#### Bearer Token (HTTP Authorization header)

```javascript
function validateBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  const token = authHeader.substring(7); // Remove 'Bearer '
  // Validar token contra sua fonte de verdade
  return validateToken(token);
}
```

#### API Key (query ou header)

```javascript
function validateApiKey(req) {
  const apiKey = req.query.api_key || req.headers['x-api-key'];
  return validateApiKey(apiKey);
}
```

### Tipos de autenticação suportados

| Tipo | Descrição | Como é passado |
|------|-----------|----------------|
| `bearer` | Token JWT ou Bearer padrão | Header: `Authorization: Bearer <token>` |
| `api_key` | Chave de API | Query `?api_key=` ou Header `X-API-Key` |
| `basic` | Autenticação HTTP Basic | Header: `Authorization: Basic <base64>` |
| `oauth2` | OAuth 2.0 | Header: `Authorization: Bearer <token>` |
| `none` | Sem autenticação | — |

## Endpoint de teste: `/api/aioson-test` (Opcional)

Este endpoint permite que o AIOSON Play teste sua API sem causar efeitos colaterais.

### Requisição

```json
POST /api/aioson-test
Content-Type: application/json

{
  "endpoint": "/api/products",
  "method": "GET",
  "params": {
    "search": "paracetamol"
  }
}
```

### Resposta esperada

```json
{
  "endpoint": "/api/products",
  "success": true,
  "message": "Endpoint testado com sucesso",
  "timestamp": "2026-04-15T10:00:00Z"
}
```

**Importante**: Este endpoint NÃO deve executar a lógica real. Deve apenas validar que a requisição seria aceita.

## Integração com Bridge Apps

Quando você implementa o `/api/aioson-play`:

1. O AIOSON Play descobre seus endpoints automaticamente
2. O LLM recebe a descrição dos seus endpoints no contexto
3. Bridge Apps podem chamar seus endpoints via HTTP
4. Seus eventos AMP (se declarados) podem ser assinados por bridges

## Boas práticas

1. **Descrições claras**: Escreva descrições que um LLM entenda
2. **Tipos corretos**: Declare o tipo correto de cada parâmetro
3. **Consistência**: Mantenha o `api_base_url` sincronizado com seu manifesto
4. **Versionamento**: Atualize a versão ao mudar endpoints
5. **Erros informativos**: Retorne códigos HTTP apropriados e mensagens claras

## Troubleshooting

### "App não possui endpoint de declaração"

- Verifique se `has_api: true` está no `manifest.json`
- Verifique se `api_base_url` está correto
- Certifique-se que seu servidor está rodando na porta especificada
- Verifique se o endpoint `/api/aioson-play` está acessível (teste com `curl`)

```bash
# Testar o endpoint manualmente
curl http://localhost:3301/api/aioson-play
```

### "Timeout ao chamar endpoint"

- O AIOSON Play espera resposta em até 5 segundos
- Otimize seu endpoint para responder rapidamente
- Se necessário, considere caching no lado do app

### "Token inválido"

- Verifique se o token foi configurado no AIOSON Play
- Valide o formato do token conforme o tipo (`bearer`, `api_key`, etc.)
- Verifique se a validação do token está correta no seu código

## Exemplo completo: App de CRM

Veja o app `farmacia-inteligente` no código do AIOSON Play para um exemplo completo de implementação.

## Suporte

Para dúvidas sobre a integração, consulte:
- `docs/aioson-app-developer-guide.md` — Guia completo para desenvolvedores
- `docs/integration-manual.md` — Manual de integração com o AIOSON Play
