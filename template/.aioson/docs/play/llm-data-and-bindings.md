---
description: "How AIOSON Play apps should consume LLM connections, app-owned databases, Data Bindings, Global Connectors, MCPI, REST connectors, MCP tools, and ProductBridge."
scope: "global"
agents: [dev, deyvin, architect, analyst, qa, tester]
task_types: [aioson-play-app, data-integration, llm-integration]
triggers: [LLM connections, DATABASE_URL, data_bindings, Global Connectors, MCPI, MCP tools, ProductBridge]
---

# LLM, Data, And Bindings

## Three separate surfaces

Do not mix these:

| Surface | Owner | App does |
|---|---|---|
| LLM connections | AIOSON Play Settings | Reads injected env vars or metadata and lazy-inits clients |
| Operational app DB | The app | Reads `DATABASE_URL`, runs migrations, owns data |
| External/domain data | Play Global Connectors | Declares `data_bindings`, binds aliases, calls ProductBridge |

## LLM connections

Play manages global LLM connections in Settings:

- one API key per provider
- models validated by operation
- fallback order by operation
- capabilities such as vision/audio inferred from validated models

Apps should not store Play LLM secrets in repository files or frontend code.

Env vars Play injects at spawn (one per configured connection, since 2026-07-02):

| Play LLM connection | Injected env var |
|---|---|
| OpenAI | `OPENAI_API_KEY` |
| Claude (Anthropic) | `ANTHROPIC_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |
| Google Gemini | `GEMINI_API_KEY` |
| DeepSeek | `DEEPSEEK_API_KEY` |
| xAI | `XAI_API_KEY` |

Alongside the keys, Play injects **`AIOSON_LLM_CHAIN`** (since 2026-07-02): a
JSON string WITHOUT keys carrying the validated model per operation and the
fallback order the user arranged in Play Settings:

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
      "priority": 1
    }
  ]
}
```

Expected app behavior:

- Prefer app-local explicit config only when the app intentionally lets the user override provider settings.
- Otherwise read the provider API keys injected by Play during spawn (table above).
- **Do not hardcode models.** For each operation the app needs (`text_generation`, `image_understanding`, `speech_to_text`, ...), pick the first `configs[]` entry for that operation (sorted by `priority`) whose provider has its `*_API_KEY` present, and use that entry's `model` and `baseUrl`. Fall back to app defaults only when `AIOSON_LLM_CHAIN` is absent or has no entry for the operation.
- Gemini, DeepSeek and xAI are OpenAI-compatible — reuse an OpenAI-compatible client pointed at the entry's `baseUrl`.
- Lazy-initialize LLM clients. Do not instantiate SDK clients at module load, because missing keys can crash the backend before the app can render a degraded state.
- Treat `AIOSON_LLM_CHAIN` as metadata/order only. It never contains API keys.
- Treat `aioson-models.json` or `llm-chain.json` in the app cwd as optional/legacy for installed apps, not the primary credential contract.

Injection lifecycle — env vars only exist at spawn time:

- Play injects on UI-driven spawn of an installed app AND on draft preview (`spawn_draft`), so an app under development tests with the same contract it will have once installed.
- Supervisor auto-respawn preserves the keys from the original spawn.
- A process that is already running does NOT pick up a key configured afterwards. After adding or changing a Play LLM connection, stop and reopen the app (or the draft preview).
- A backend started by hand outside Play (`npm run dev` in a terminal or agent session) receives nothing — set the key in that shell env or use app-local config for that scenario.

Troubleshooting "provider not configured" in the app UI while the Play connection exists: (1) the app process started before the key was configured — close and reopen the app; (2) the backend is running outside Play; (3) the app expects a provider the user did not configure — Play injects only the keys that exist, one env var per provider.

Recommended lazy pattern:

```ts
let client: OpenAI | null = null;

function getOpenAiClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  client ??= new OpenAI({ apiKey });
  return client;
}
```

Supported operation names in current Play docs include:

- `text_generation`
- `code_generation`
- `image_understanding`
- `image_generation`
- `video_understanding`
- `video_generation`
- `speech_to_text`
- `text_to_speech`
- `audio_understanding`
- `realtime_voice`

## Operational database of the app

The app owns its own operational database. Play does not provide a shared app database.

Default recommendation:

- SQLite with WAL mode for most local-first apps.
- Read `DATABASE_URL` from env with fallback to `app-config.yaml`.
- Declare supported drivers from day 1 even if only SQLite is used.

`app-config.yaml` pattern:

```yaml
database:
  default_url: "sqlite://./data/app.db?mode=rwc"
  supported_drivers: ["sqlite", "postgres"]
  sqlite_pragmas:
    journal_mode: "WAL"
    synchronous: "NORMAL"
    busy_timeout: 5000
```

App code pattern:

```ts
const url = process.env.DATABASE_URL ?? config.database.default_url;
const driver = url.startsWith("postgres://") ? "postgres" : "sqlite";
const db = await connect(url, driver);

if (driver === "sqlite") {
  await db.exec("PRAGMA journal_mode=WAL");
  await db.exec("PRAGMA synchronous=NORMAL");
  await db.exec("PRAGMA busy_timeout=5000");
}
```

Only move beyond SQLite when there is an objective need, such as:

- persistent `SQLITE_BUSY` after WAL and `busy_timeout`
- `pgvector`
- serious JSONB indexing
- full-text ranking beyond SQLite FTS5
- multiple app processes writing to the same database
- pre-existing customer Postgres infrastructure
- multi-device sync or online-first architecture

## External data through Data Bindings

External domain data belongs to Play Global Connectors, not to app-specific connection UIs.

The app declares slots in `app-config.yaml`:

```yaml
data_bindings:
  - id: "busca-produtos"
    description: "Busca produtos no catalogo por nome ou principio ativo"
    accepted_types: ["mcpi", "api", "mcp"]
    required_params:
      - "search"

  - id: "webhook-pedido"
    description: "Notifica sistema externo quando um pedido e confirmado"
    accepted_types: ["api"]
    required_params:
      - "pedido_json"
```

Fields:

| Field | Meaning |
|---|---|
| `id` | Slot slug. Also the binding alias. Prefer kebab-case. |
| `description` | Human-readable text for the app/admin UI. |
| `accepted_types` | Canonical array: `mcpi`, `api`, `mcp`. |
| `required_params` | Placeholder names expected by the connector. |

`expected_type` is legacy. Prefer `accepted_types` in new apps.

## What Play owns

Play Settings owns:

- Database Connections
- Data Connectors
- credential/keyring storage for connector auth
- connector validation status
- global admin view of App Data Sources

For MCPI connectors, only validated Database Connections should be selectable when the driver supports validation.

## What the app owns

The app should expose a "Fontes de Dados" or equivalent in-app view when it has `data_bindings`.

The app consumes ProductBridge:

```ts
const PLAY_BASE = import.meta.env.VITE_AIOSON_PLAY_URL || "http://localhost:5180";
const APP_SLUG = import.meta.env.VITE_AIOSON_APP_SLUG || "meu-app";

const connectors = await fetch(`${PLAY_BASE}/api/connectors?type=mcpi`).then(r => r.json());
const bindings = await fetch(`${PLAY_BASE}/api/bindings/${APP_SLUG}`).then(r => r.json());

await fetch(`${PLAY_BASE}/api/bindings/${APP_SLUG}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    connector_id: "<uuid-do-connector>",
    alias: "busca-produtos"
  })
});
```

## Executing connectors

After binding, execute through ProductBridge by alias. The SAME endpoint runs
all three connector types (`mcpi`, `api`, `mcp`) — Play routes by the
connector's type (since 2026-07-02):

```http
POST http://localhost:5180/api/mcp/execute
Content-Type: application/json

{
  "alias": "busca-produtos",
  "params": {
    "search": "dipirona"
  },
  "tool": "tool-name"
}
```

`tool` is optional and only used for `mcp` connectors that expose more than
one tool (a server with exactly one tool needs no `tool` field).

Response shape is the same for all types:
`{ "data": <json>, "error": null | "message", "duration_ms": <n> }`.

What each type does:

- `mcpi` — runs the query template on the TARGET database of the Play
  Database Connection (credentials from Play's keyring), `{{param}}` becomes a
  prepared-statement bind. Drivers: postgresql, mysql, sqlite.
- `api` — HTTP request to the connector URL: `{{param}}` interpolated into the
  URL (percent-encoded); leftover params become query string (GET/DELETE) or a
  JSON body (POST/PUT); auth headers from Play's keyring are applied.
- `mcp` — LOCAL stdio MCP server: Play spawns the connector command, performs
  the JSON-RPC handshake (initialize → tools/list → tools/call) and returns
  the tool result. Spawn per call, 60s timeout.

MCP scope today: local stdio servers only (auth via the command's own
env/args — no OAuth involved). REMOTE MCP servers over HTTP, which use OAuth
2.1 per the MCP spec, are NOT supported yet — do not fake them with manual
headers; treat that binding as unavailable and degrade.

## Degraded state

If a declared binding is absent:

- Do not crash.
- Show a clear degraded state.
- Link the user to the app's data-source binding UI when possible.
- For non-optional connectors, block only the affected workflow, not the whole app unless the app cannot function.

Boot check:

```ts
async function getMissingBindings(appSlug: string) {
  const playBase = import.meta.env.VITE_AIOSON_PLAY_URL || "http://localhost:5180";
  const bindings = await fetch(`${playBase}/api/bindings/${appSlug}`).then(r => r.json());
  const activeAliases = new Set(bindings.map((b: { alias: string }) => b.alias));
  return declaredBindings.filter(binding => !activeAliases.has(binding.id));
}
```

## LLM tool injection

Global Connectors are only useful to the LLM after they are bound to the app. Play can generate tool metadata from bindings, and the sidecar/orchestrator can use it in LLM payloads.

Agent rule:

- Keep connector names and descriptions accurate.
- Do not advertise tools/endpoints that are not implemented.
- Use prepared statements or connector-side parameterization for MCPI. The LLM must not assemble raw SQL.

## Source docs

Canonical sources:

- `app-data-bindings.md`
- `app-database-choice.md`
- `integration-manual.md`
- `ai-app-integration.md`
- `platform-architecture.md`
