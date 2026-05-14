# Referência CLI — Sub-task Scout

> Três verbos. Cada seção cobre o contrato completo: flags, comportamento, exit codes, exemplos de saída.

---

## `aioson scout:prep`

Prepara um scout: valida inputs, verifica caps, gera o prompt padronizado para o sub-agente.

**Tier:** 1 (silencioso — sem output por default; use `--json`)

```
aioson scout:prep [path]
  --question="<texto>"
  --scope-paths="<caminho1>,<caminho2>"
  --parent-agent=<nome>
  --parent-session-id=<id>
  --parent-session-excerpt="<texto>"
  [--feature-slug=<slug>]
  [--json]
```

### Flags

| Flag | Obrigatório | Descrição |
|---|---|---|
| `--question="<texto>"` | sim | Pergunta que o sub-agente deve responder |
| `--scope-paths="<paths>"` | sim (ou `--scope-globs`¹) | Arquivos e diretórios a inspecionar, separados por vírgula. Diretórios expandem 1 nível |
| `--parent-agent=<nome>` | sim | Agente que despacha. Em V1, apenas `"deyvin"` é aceito |
| `--parent-session-id=<id>` | sim | ID da sessão pai — usado para rastrear caps por sessão |
| `--parent-session-excerpt="<texto>"` | sim | Por que o scout foi despachado (50-1000 chars). Bloqueado se ausente — é o campo de cold-load comprehension |
| `--feature-slug=<slug>` | não | Feature associada (para arquivamento automático no `feature:close`) |
| `--json` | não | Output em JSON (`{ ok, id, prompt, output_path, cap_remaining }`) |

¹ `--scope-globs` está adiado para V2 (Node 18-21 não tem `fs.glob` nativo). Se passado, retorna `error.code = "globs_not_implemented_v1"`.

### Comportamento

1. Valida todos os campos obrigatórios.
2. Resolve `scope_paths`: paths relativos → absolutos, verifica que ficam dentro do `rootDir`.
3. Verifica caps: `max_scouts_per_session` e `max_files_in_scope`.
4. Incrementa `scouts_in_session` no state file (com file-lock).
5. Gera prompt padronizado com question, scope, output schema, e tool whitelist (`[Read, Grep]` / `[Bash, Edit, Write]` proibidos).
6. Retorna `{ id, prompt, output_path, cap_remaining }`.

### Exit codes

| Código | Quando |
|---|---|
| 0 | Scout preparado com sucesso |
| 2 | Argumento inválido, cap excedido, escopo muito grande, path fora do root |

### Exemplos

```bash
# Básico com JSON
aioson scout:prep \
  --question="Onde o featureSlug anterior não é limpo no workflow:next?" \
  --scope-paths="src/commands/workflow-next.js,src/handoff-contract.js" \
  --parent-agent=deyvin \
  --parent-session-id=sess-abc123 \
  --parent-session-excerpt="Usuário perguntou sobre bug de herança de state; inspeção de loadOrCreateState necessária" \
  --json
```

```json
{
  "ok": true,
  "id": "scout-2026-05-14-a3b7c1",
  "prompt": "You are a read-only code survey sub-agent...",
  "output_path": ".aioson/runtime/scouts/scout-2026-05-14-a3b7c1.json",
  "cap_remaining": 2
}
```

Erro de cap:

```json
{
  "ok": false,
  "error": {
    "code": "cap_exceeded",
    "message": "max_scouts_per_session=3 reached for parent_session_id=sess-abc123",
    "remediation": "Override .aioson/config/scout-engine.json or open a new session"
  }
}
```

---

## `aioson scout:validate`

Valida o JSON retornado pelo sub-agente contra o output schema. Rastreia retries no state file.

**Tier:** 1 (silencioso)

```
aioson scout:validate [path] --input=<caminho-do-json> [--json]
```

### Flags

| Flag | Obrigatório | Descrição |
|---|---|---|
| `--input=<path>` | sim | Caminho para o JSON que o sub-agente escreveu |
| `--json` | não | Output em JSON |

### Comportamento

1. Lê o arquivo em `--input`.
2. Valida contra `OUTPUT_SCHEMA` (strict: `additionalProperties: false`).
3. Incrementa `retries_by_id[id]` no state file.
4. Se `retries_by_id[id] > max_retries_on_malformed_json` → retorna `retry_exhausted` sem testar o schema.

### Output schema resumido (o que o sub-agente deve gerar)

```json
{
  "id": "scout-{slug?}-{data}-{rand6}",
  "parent_agent": "deyvin",
  "parent_session_id": "sess-abc123",
  "parent_session_excerpt": "...",
  "feature_slug": null,
  "question": "...",
  "scope": { "paths": [...], "files_requested": [...] },
  "findings": [
    {
      "file": "src/commands/workflow-next.js",
      "line": 42,
      "evidence": "loadOrCreateState checks featureSlug but does not reset on feature transition",
      "relevance": "high",
      "explanation": "..."
    }
  ],
  "confidence": "high",
  "recommendation": "...",
  "files_inspected": [...],
  "status": "success",
  "completed_at": "2026-05-14T10:00:00.000Z"
}
```

### Exit codes

| Código | Quando |
|---|---|
| 0 | JSON válido contra o output schema |
| 2 | Schema inválido, retry exhausted, arquivo não encontrado |

### Exemplos

```bash
aioson scout:validate --input=.aioson/runtime/scouts/scout-2026-05-14-a3b7c1.json

# Com JSON detalhado em caso de falha:
aioson scout:validate --input=... --json
```

Saída em falha:

```json
{
  "ok": false,
  "error": {
    "code": "schema_invalid",
    "details": [
      { "field": "findings[0].evidence", "reason": "required field missing" },
      { "field": "confidence", "reason": "must be one of: high, medium, low" }
    ]
  },
  "retry_remaining": 1
}
```

---

## `aioson scout:commit`

Persiste o relatório validado, emite telemetria, decrementa o cap counter.

**Tier:** 1 (silencioso)

```
aioson scout:commit [path] --input=<caminho-do-json> [--json]
```

### Flags

| Flag | Obrigatório | Descrição |
|---|---|---|
| `--input=<path>` | sim | Caminho para o JSON validado |
| `--json` | não | Output em JSON |

### Comportamento

1. Lê o arquivo em `--input`.
2. Verifica se o `id` já foi commitado nesta sessão (idempotente — re-commit é no-op com `committed: false, reason: 'already_committed'`).
3. Copia o arquivo para `.aioson/runtime/scouts/{id}.json`.
4. Emite `runtime:emit type=sub_task action=committed` em `agent_events`.
5. Decrementa `scouts_in_session` no state file (clamped a 0).
6. Registra `committed_ids[id] = true` no state file.

> **Idempotência:** o sub-agente pode escrever o relatório em `output_path` antes do commit. O check de idempotência usa `committed_ids` no state (não presença de arquivo) — isso garante que o primeiro commit sempre processa corretamente.

### Exit codes

| Código | Quando |
|---|---|
| 0 | Commitado com sucesso (ou no-op se já commitado) |
| 1 | Arquivo não encontrado, falha de state lock, falha de telemetria |

### Exemplos

```bash
aioson scout:commit --input=.aioson/runtime/scouts/scout-2026-05-14-a3b7c1.json

# Com JSON:
aioson scout:commit --input=... --json
```

```json
{
  "ok": true,
  "committed": true,
  "id": "scout-2026-05-14-a3b7c1",
  "path": ".aioson/runtime/scouts/scout-2026-05-14-a3b7c1.json",
  "cap_remaining": 1
}
```

Re-commit (idempotente):

```json
{
  "ok": true,
  "committed": false,
  "reason": "already_committed"
}
```

---

## Continue lendo

- [Como usar](./como-usar.md) — fluxos concretos
- [Diagramas](./diagramas.md) — fluxo visual
- [Troubleshooting](./troubleshooting.md) — problemas conhecidos
