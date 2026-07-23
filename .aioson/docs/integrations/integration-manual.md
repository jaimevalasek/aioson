# AIOSON Play — Manual de Integração para Desenvolvedores de Sistemas

## Visão Geral

O AIOSON Play é um runtime local que orquestra **apps instalados** e os expõe a um motor de IA generativa (LLM). Para que um sistema externo (banco de dados, API HTTP, ferramenta MCP) possa ser **invocado por um app** durante uma conversa com o LLM, ele precisa se registrar no AIOSON Play através de um **Global Connector**.

Este manual explica como um desenvolvedor de um sistema externo (ex: `meu-erp`, `sistema-legado`, `microservico`) deve expor seu sistema para que o AIOSON Play consiga invocá-lo como **tool** durante a execução de um app.

---

## Arquitetura de Integração

```
┌──────────────────────────────────────────────────────────────────────┐
│                         AIOSON Play (Runtime Local)                  │
│                                                                      │
│  ┌─────────────┐    ┌──────────────┐    ┌───────────────────────┐  │
│  │ App instalado│───▶│ Global Connectors │───▶│ Tool Injection       │  │
│  │ (manifest)   │    │ (metadata SQLite) │    │ (tools.json → LLM)   │  │
│  └─────────────┘    └──────────────┘    └───────────────────────┘  │
│                            │                                        │
│              ┌─────────────┼────────────────────────────────────┐  │
│              │             ▼                                    │  │
│              │  ┌─────────────────┐  ┌──────────────────────┐   │  │
│              │  │  MCPI (SQL)      │  │  API Connector (HTTP)│   │  │
│              │  │  Prepared Stmts  │  │  reqwest             │   │  │
│              │  └────────┬────────┘  └──────────┬───────────┘   │  │
│              │             │                       │               │  │
│              │  ┌──────────▼────────┐  ┌──────────▼───────────┐   │  │
│              │  │  API Connector    │  │  MCP (stdio)         │   │  │
│              │  │  (HTTP)          │  │  JSON-RPC proxy       │   │  │
│              │  └────────┬─────────┘  └──────────┬───────────┘   │  │
│              │           │                       │               │  │
└──────────────┼───────────┼───────────────────────┼───────────────┼──┘
                │           │                       │
                ▼           ▼                       ▼
          ┌──────────┐ ┌──────────┐          ┌──────────┐
          │ Postgres │ │  MySQL   │          │ Processo │
          │  SQLite  │ │  etc.    │          │  stdio  │
          └──────────┘ └──────────┘          └──────────┘
          Sistema do                              Sistema do
          desenvolvedor                           desenvolvedor
```

### Três Tipos de Conectores

| Tipo | Quando usar | Exemplo |
|------|------------|---------|
| **MCPI** (Multi-Connection Protocol Interface) | Seu sistema expõe um **banco de dados** (PostgreSQL, MySQL, SQLite, etc.) e você quer que o LLM execute queries. | `SELECT * FROM produtos WHERE nome ILIKE '%{{search}}%'` |
| **API** (HTTP) | Seu sistema expõe uma **API REST/HTTP** e você quer que o LLM faça chamadas HTTP. | `GET https://api.seu-sistema.com/clientes/{{id}}` |
| **MCP** (Model Context Protocol) | Seu sistema é uma **ferramenta com stdio** (nativa ou script) que segue o protocolo MCP JSON-RPC 2.0. | `my-tool --stdin` |

---

## Glossário

| Termo | Significado |
|-------|-------------|
| `GlobalConnector` | Registro no AIOSON Play que representa um sistema externo (tipo, URL/query, credenciais). |
| `AppBinding` | Vínculo entre um **app instalado** e um `GlobalConnector`, com um alias que nomeia a tool para o LLM. |
| `MCPI` | Multi-Connection Protocol Interface — protocolo de queries SQL parametrizadas via prepared statements. |
| `MCP` | Model Context Protocol — protocolo JSON-RPC 2.0 sobre stdio para ferramentas externas. |
| `tools.json` | Arquivo gerado pelo AIOSON Play com a lista de tools injetadas no payload LLM antes de cada chamada. |
| `data_bindings` | Bloco no `app-config.yaml` que declara quais conectores um app **requer** para funcionar. |

---

## 1 — Registro de Sistema Externo (Global Connector)

### 1.1 Via UI (AIOSON Play → Settings → Data Connectors)

O método mais comum: abra o AIOSON Play, vá em **Settings → Data Connectors** e clique em **Novo Connector**.

Preencha os campos conforme o tipo:

#### MCPI — Consulta de Banco de Dados

```
Nome:        Busca Produtos
Slug:        busca-produtos
Tipo:        MCPI (Consulta DB)
Conexão:     [selecione uma DbConnection já configurada]
Verbo HTTP:  GET
Query:
  SELECT * FROM produtos
  WHERE nome ILIKE '%{{search}}%'
  AND ativo = true
  LIMIT 50
```

**Validações:**
- Queries `GET` não podem conter DML (INSERT, UPDATE, DELETE, DROP, ALTER, etc.).
- Parâmetros usam a sintaxe `{{nome_variavel}}`.
- A conexão de banco deve estar previamente configurada e validada em **Settings → Database Connections**.
- Para MCPI, não use uma DbConnection pendente/falha: o Play deve bloquear a seleção no formulário e a execução pode retornar `GcError::ConnectionFailed`.

#### API — Chamada HTTP

```
Nome:           Buscar Cliente por ID
Slug:           buscar-cliente
Tipo:           API (HTTP)
Verbo HTTP:     GET
URL/Comando:
  https://api.seu-sistema.com/clientes/{{id}}
Headers (JSON):
  Authorization: Bearer {{api_token}}
  Content-Type: application/json
```

Campos `{{var}}` são substituídos na hora da invocação.

#### MCP — Ferramenta stdio

```
Nome:           Executor de Scripts
Slug:           executor-scripts
Tipo:           MCP (stdio)
Comando:
  /usr/local/bin/my-mcp-tool
```

O AIOSON Play faz spawn do processo e se comunica via JSON-RPC 2.0 sobre stdin/stdout.

---

### 1.2 Via API (Rust/Tauri)

```typescript
import { createGlobalConnector } from "@/services/globalConnectors";

const connector = await createGlobalConnector({
  name: "Busca Produtos",
  slug: "busca-produtos",
  connectorType: "mcpi",
  method: "GET",
  dbConnectionName: "farmacia-db",     // nome de uma DbConnection existente
  queryTemplate: "SELECT * FROM produtos WHERE nome ILIKE '%{{search}}%'",
  // authJson: JSON.stringify({ /* credenciais se precisar keyring */ }),
});
```

**Credenciais** (`authJson`) são armazenadas no keyring do SO, nunca em texto plano.

---

## 2 — Vínculo com App (App Binding)

Um `GlobalConnector` sozinho **não é injetado no LLM**. Ele precisa ser **vinculado a um app** através de um `AppBinding`.

### 2.1 Via UI (AIOSON Play → Settings → App Data Sources)

Abra **Settings → App Data Sources**. Aparecerão apenas os apps que **declararam** `data_bindings` no seu `app-config.yaml`.

Para cada slot do app, selecione o Global Connector que deseja vincular e defina um **alias** (nome da tool que o LLM verá).

### 2.2 Como um App Declara que Precisa de Conectores

No arquivo `{app_dir}/app-config.yaml` do seu app:

```yaml
output:
  type: file
  format: text
  destination: ""

database:
  connection: ""
  table: ""
  fields: {}

webhook:
  url: ""
  headers: {}

data_bindings:
  - id: "busca-produtos"
    description: "Busca produtos no catálogo por termo"
    expected_type: "mcpi"       # mcpi | api | mcp
    required_params:
      - "search"
```

**Campos do `DataBindingSlot`:**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | `string` | Identificador único do slot dentro do app |
| `description` | `string` | Descrição legível para o admin (não exposta ao LLM) |
| `expected_type` | `"mcpi" \| "api" \| "mcp"` | Tipo de conector esperado |
| `required_params` | `string[]` | Parâmetros que o template/query/API espera (`{{param}}`) |

> Se o app não declarar `data_bindings`, ele **não aparecerá** na tela de App Data Sources — a seção é completamente hidden para apps que não declaram slots.

### 2.3 Via API (Rust/Tauri)

```typescript
import { bindConnector } from "@/services/globalConnectors";

const binding = await bindConnector({
  appSlug: "squad-autonomo-sdr",
  connectorId: "conn-uuid-aqui",
  alias: "busca_produtos",
});
```

---

## 3 — Injeção de Tools no LLM (Como o LLM Descobre as Tools)

### 3.1 Fluxo completo

```
1. Usuário instala um app → app aparece no AIOSON Play
2. Admin vincula GlobalConnectors ao app via Settings → App Data Sources
3. Antes de cada execução de app, o AIOSON Play gera {app_dir}/tools.json
4. O motor AIOSON (sidecar) lê tools.json e injeta as tools no payload LLM
5. O LLM decide quais tools chamar → sidecar executa → resultado volta ao LLM
```

### 3.2 tools.json (formato)

```json
[
  {
    "name": "busca_produtos",
    "description": "Busca produtos no catálogo por termo",
    "input_schema": {
      "type": "object",
      "properties": {
        "search": {
          "type": "string",
          "description": "Termo de busca (parcial, case-insensitive)"
        }
      },
      "required": ["search"]
    },
    "connector_id": "conn-uuid-aqui",
    "type": "mcpi"
  }
]
```

> O `name` vem do **alias** definido no AppBinding, não do nome do GlobalConnector.
> O `input_schema` é gerado automaticamente a partir dos `{{param}}` do template.

### 3.3 Quem gera o tools.json

O **Tauri backend** (Rust) gera o arquivo:

```rust
// src-tauri/src/global_connectors.rs
pub async fn prepare_tools_json(
    app_dir: String,
    app_slug: String,
) -> Result<(), String> {
    // 1. Lista AppBindings para o app_slug
    // 2. Para cada binding, busca o GlobalConnector
    // 3. Gera o input_schema a partir dos required_params do data_binding
    // 4. Grava {app_dir}/tools.json
}
```

Esta função é chamada automaticamente por `executeApp()` antes de invocar o app.

---

## 4 — Execução de MCPI (Invocação Real)

Quando o LLM decide invocar a tool `busca_produtos`:

```
1. Sidecar recebe: { name: "busca_produtos", arguments: { search: "aspirina" } }
2. Sidecar detecta connector_id no tools.json → chama Rust backend
3. Rust busca GlobalConnector por ID
4. Rust interpola {{search}} com "aspirina" via prepared statements
5. Rust executa a query no banco da DbConnection vinculada
6. Rust retorna { data: [...rows], error: null, duration_ms: 42 }
7. Sidecar retorna para o LLM
```

### 4.1 Segurança: Prepared Statements

```sql
-- Template salvo:
SELECT * FROM produtos WHERE nome ILIKE $1 AND ativo = $2

-- Params: ["%aspirina%", "true"]
-- O LLM NÃO injeta SQL — bind vars ($1, $2) impedem SQL injection.
```

### 4.2 Erros Comuns

| Erro | Causa | Solução |
|------|-------|---------|
| `Db connection not found` | Nome de DbConnection inválido | Criar e validar a DbConnection em Settings → Database Connections |
| `Syntax error in query` | Query mal formada | Corrigir a query no editor de Global Connector |
| `Timeout` | Banco não respondeu em 30s | Reduzir o resultado (LIMIT), otimizar index |
| `Permission denied` | Usuário do banco sem acesso | Ajustar permissões no banco ou usar credenciais diferentes |

---

## 5 — App Externo Completo: Exemplo `meu-erp`

### 5.1 Estrutura de Diretórios

```
meu-erp/
├── manifest.json
├── app-config.yaml       ← declara data_bindings
├── genomes/
├── agents/
│   └── vendas.md
└── skills/
```

### 5.2 manifest.json

```json
{
  "name": "Meu ERP",
  "slug": "meu-erp",
  "version": "1.0.0",
  "description": "Consulta e manipula dados do ERP corporativo",
  "author_id": "user-001",
  "created_at": "2026-04-12T00:00:00Z",
  "packages": [],
  "systems": []
}
```

### 5.3 app-config.yaml

```yaml
output:
  type: file
  format: text
  destination: ""

database:
  connection: ""
  table: ""
  fields: {}

webhook:
  url: ""
  headers: {}

data_bindings:
  - id: "catalogo-produtos"
    description: "Busca produtos no catálogo do ERP"
    expected_type: "mcpi"
    required_params:
      - "search"

  - id: "dados-cliente"
    description: "Busca dados de cliente por CPF/CNPJ"
    expected_type: "mcpi"
    required_params:
      - "documento"

  - id: "webhook-venda"
    description: "Envia pedido de venda para o ERP via webhook"
    expected_type: "api"
    required_params:
      - "pedido_json"
```

### 5.4 Criando os GlobalConnectors (admin do AIOSON Play)

**Connector 1 — MCPI Busca Produtos:**
```
Nome:   Busca Produtos ERP
Slug:   erp-busca-produtos
Tipo:   MCPI
Conexão: Meu ERP (PostgreSQL)
Query:  SELECT id, nome, preco, estoque FROM produtos
        WHERE nome ILIKE '%{{search}}%'
        LIMIT 20
```

**Connector 2 — MCPI Dados Cliente:**
```
Nome:   Dados Cliente ERP
Slug:   erp-dados-cliente
Tipo:   MCPI
Conexão: Meu ERP (PostgreSQL)
Query:  SELECT nome, documento, telefone, email
        FROM clientes
        WHERE documento = '{{documento}}'
        LIMIT 1
```

**Connector 3 — API Webhook Venda:**
```
Nome:   Webhook Venda ERP
Slug:   erp-webhook-venda
Tipo:   API
Verbo:  POST
URL:    https://erp.minhaempresa.com.br/api/v2/vendas
```

### 5.5 Vinculando no AIOSON Play

1. Abra **Settings → App Data Sources**
2. Selecione o app `meu-erp`
3. Para `catalogo-produtos` → vincule o connector `erp-busca-produtos` com alias `busca_produtos_erp`
4. Para `dados-cliente` → vincule `erp-dados-cliente` com alias `dados_cliente_erp`
5. Para `webhook-venda` → vincule `erp-webhook-venda` com alias `enviar_venda_erp`

### 5.6 tools.json Gerado

```json
[
  {
    "name": "busca_produtos_erp",
    "description": "Busca produtos no catálogo do ERP",
    "input_schema": {
      "type": "object",
      "properties": {
        "search": { "type": "string" }
      },
      "required": ["search"]
    },
    "connector_id": "<uuid-erp-busca-produtos>",
    "type": "mcpi"
  },
  {
    "name": "dados_cliente_erp",
    "description": "Busca dados de cliente por CPF/CNPJ",
    "input_schema": {
      "type": "object",
      "properties": {
        "documento": { "type": "string" }
      },
      "required": ["documento"]
    },
    "connector_id": "<uuid-erp-dados-cliente>",
    "type": "mcpi"
  },
  {
    "name": "enviar_venda_erp",
    "description": "Envia pedido de venda para o ERP via webhook",
    "input_schema": {
      "type": "object",
      "properties": {
        "pedido_json": { "type": "string" }
      },
      "required": ["pedido_json"]
    },
    "connector_id": "<uuid-erp-webhook-venda>",
    "type": "api"
  }
]
```

### 5.7 Exemplo de Conversa com LLM

```
Usuário: Quero ver os produtos de aspirina do catálogo

LLM decide invocar:
{
  "name": "busca_produtos_erp",
  "arguments": { "search": "aspirina" }
}

Resultado:
{
  "data": [
    { "id": 1, "nome": "Aspirina 500mg", "preco": 12.90, "estoque": 150 },
    { "id": 2, "nome": "Aspirina Protect", "preco": 28.50, "estoque": 80 }
  ],
  "error": null,
  "duration_ms": 23
}

LLM responde: Aqui estão os produtos encontrados:
• Aspirina 500mg — R$ 12,90 (150 un)
• Aspirina Protect — R$ 28,50 (80 un)
```

---

## 6 — Criando uma DbConnection (Pré-requisito para MCPI)

Antes de criar um GlobalConnector tipo `mcpi`, o admin precisa ter uma **DbConnection** configurada em **Settings → Database Connections**.

### 6.1 Drivers Suportados

| Driver | Supportado | Teste de conexão |
|--------|-----------|-----------------|
| PostgreSQL | ✅ | ✅ |
| MySQL | ✅ | ✅ |
| MariaDB | ✅ | ✅ |
| SQLite | ✅ | ✅ |
| MS SQL Server | ✅ | ❌ |
| MongoDB | ✅ | ❌ |
| Oracle | ✅ | ❌ |
| Supabase | ✅ | ❌ |

### 6.2 Campos

```
Nome:        Meu ERP (Produção)
Driver:      PostgreSQL
Host:        db.minhaempresa.com.br
Porta:       5432
Database:     erp_corp
Usuário:     aioson_ro
Senha:       [armazenada em keyring]
SSL:         ✅
```

> A senha é armazenada no **keyring do SO** (Windows Credential Manager, macOS Keychain, Linux Secret Service), nunca em arquivo.

---

## 7 — Ferramentas MCP (Model Context Protocol)

### 7.1 O que é MCP

MCP é um protocolo JSON-RPC 2.0 sobre stdio. Se o seu sistema é uma **ferramenta executável** (binário nativo, script, container), você pode expô-lo como MCP para que o AIOSON Play o invoque.

### 7.2 Exemplo de Ferramenta MCP

```python
#!/usr/bin/env python3
# my-mcp-tool (executável, chmod +x)
import sys
import json

def main():
    for line in sys.stdin:
        try:
            msg = json.loads(line.strip())
        except:
            continue

        method = msg.get("method", "")
        msg_id = msg.get("id")

        if method == "tools/list":
            result = {
                "tools": [
                    {
                        "name": "calcula_desconto",
                        "description": "Calcula desconto comerciais",
                        "input_schema": {
                            "type": "object",
                            "properties": {
                                "preco_original": {"type": "number"},
                                "pct_desconto": {"type": "number"}
                            },
                            "required": ["preco_original", "pct_desconto"]
                        }
                    }
                ]
            }
            print(json.dumps({"jsonrpc": "2.0", "id": msg_id, "result": result}))

        elif method == "tools/call":
            args = msg.get("params", {}).get("arguments", {})
            nome = args.get("name")
            if nome == "calcula_desconto":
                resultado = args["preco_original"] * (1 - args["pct_desconto"] / 100)
                print(json.dumps({
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "result": {
                        "content": [{"type": "text", "text": str(resultado)}]
                    }
                }))
        sys.stdout.flush()

if __name__ == "__main__":
    main()
```

### 7.3 Registro no AIOSON Play

```
Nome:      Calculadora de Desconto
Slug:      calc-desconto
Tipo:      MCP (stdio)
Comando:   /usr/local/bin/my-mcp-tool
```

---

## 8 — Checklist de Integração

| # | Tarefa | Onde |
|---|--------|------|
| 1 | Criar a DbConnection do banco de dados do seu sistema | Settings → Database Connections |
| 2 | Criar o GlobalConnector (MCPI / API / MCP) | Settings → Data Connectors |
| 3 | Declarar `data_bindings` no `app-config.yaml` do seu app | Arquivo do app |
| 4 | Instalar o app no AIOSON Play | App Page → Install App |
| 5 | Vincular o GlobalConnector ao app com um alias | Settings → App Data Sources |
| 6 | Validar que `tools.json` foi gerado (debug) | `{app_dir}/tools.json` |
| 7 | Testar a tool chamando diretamente o execute_mcpi | Settings → Data Connectors → Testar |
| 8 | Executar o app e observar as tool calls no log |

---

## 9 — API Reference Rápida (Rust/Tauri)

```rust
// Listar conectores
invoke("list_global_connectors") → Vec<GlobalConnector>

// Criar conector
invoke("create_global_connector", {
  name, slug, connectorType, method,
  urlOrCommand, dbConnectionName, queryTemplate, authJson
}) → GlobalConnector

// Executar MCPI
invoke("execute_mcpi", { connectorId, params }) → McpiResult

// Listar bindings de um app
invoke("list_app_bindings", { appSlug }) → Vec<AppBinding>

// Vincular conector a app
invoke("bind_connector", { appSlug, connectorId, alias }) → AppBinding

// Preparar tools.json (chamado automaticamente antes de executeApp)
invoke("prepare_tools_json", { appDir, appSlug }) → ()

```

---

## 10 — Códigos de Erro

| Código | Significado |
|--------|-------------|
| `GcError::NotFound` | GlobalConnector ou DbConnection não encontrado |
| `GcError::InvalidQuery` | Query mal formada pelo banco |
| `GcError::ConnectionFailed` | Não conseguiu conectar ao banco |
| `GcError::Timeout` | Banco não respondeu em 30 segundos |
| `GcError::DmlNotAllowed` | Query GET contém comando DML (INSERT/UPDATE/DELETE) |
| `GcError::Unauthorized` | Credenciais inválidas ou insuficientes |
