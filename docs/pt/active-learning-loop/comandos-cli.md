# Referência CLI — Active Learning Loop

> Quatro novos verbos. Cada seção cobre o contrato completo: flags, comportamento, exit codes, exemplos de saída.

---

## `aioson context:load`

Registra que um agente carregou uma regra ou brain. Grava um evento `rule_loaded` ou `brain_loaded` em `execution_events`.

**Tier:** 1 (silencioso — sem output por default)

```
aioson context:load [path] --target=<rule|brain>:<slug> --agent=<nome> [opções]
```

### Flags

| Flag | Obrigatório | Descrição |
|---|---|---|
| `--target=<tipo>:<slug>` | sim | Tipo (`rule` ou `brain`) e identificador do target. Ex: `rule:authn-rules`, `brain:sheldon-005` |
| `--agent=<nome>` | sim | Nome do agente que está carregando. Ex: `dev`, `qa`, `sheldon` |
| `--batch="a,b,c"` | não | Slugs adicionais para registrar em lote (mesmo tipo e agente). Separados por vírgula |
| `--feature=<slug>` | não | Feature associada ao carregamento (para rastreabilidade em `execution_events`) |
| `--verbose` | não | Imprime confirmação de cada evento registrado |
| `--json` | não | Output em JSON (`{ ok, event, target, agent }`) |

### Comportamento

- Cria um row em `execution_events` com `event_type='rule_loaded'` ou `event_type='brain_loaded'`, `payload_json` contendo `target_slug`, `agent`, `feature_slug` (se passado).
- `--batch="b,c"` registra eventos adicionais para os slugs `b` e `c` com o mesmo tipo do `--target` principal.
- Payload cap: 4KB por evento.
- Path normalization cross-platform: slugs são normalizados antes de gravar.
- Não valida se o arquivo da regra/brain existe — é telemetria pura.

### Exit codes

| Código | Quando |
|---|---|
| 0 | Evento(s) registrado(s) com sucesso |
| 1 | Erro de argumento (target mal formado, agent ausente) |

### Exemplos

```bash
# Básico
aioson context:load --target=rule:authn-rules --agent=dev

# Lote de 3 regras + verbose
aioson context:load --target=rule:authn-rules --agent=dev \
  --batch="jwt-patterns,session-management" --verbose

# Associado a feature + JSON
aioson context:load --target=brain:sheldon-006 --agent=sheldon \
  --feature=authn-flow --json
```

---

## `aioson memory:search`

Busca BM25 sobre `project_learnings` (título + evidência) via SQLite FTS5.

**Tier:** 1 (silencioso — não emite notify)

```
aioson memory:search "<query>" [path] [opções]
```

### Flags

| Flag | Default | Descrição |
|---|---|---|
| `"<query>"` | — (obrigatório) | Texto de busca. Máximo 500 caracteres |
| `path` | `.` | Diretório raiz do projeto |
| `--limit=N` | 5 | Número máximo de resultados |
| `--surface=<valor>` | `learnings` | Onde buscar: `rules`, `learnings`, ou `all` |
| `--include-archived` | false | Inclui entradas com status `archived` |
| `--json` | false | Output em JSON |

### Comportamento e sanitização de query

Cada token (separado por espaço) é convertido para uma frase entre aspas e ANDado com os outros:

```
"autenticação JWT"  →  '"autenticação" "JWT"'
```

Caracteres de operador FTS5 (`* ( ) ^ : + - "`) são removidos antes da conversão. Se após a sanitização a query resultar em string vazia, o comando retorna `{ ok: false, reason: 'query_unparseable' }` com exit code 0 (não é erro — é comportamento esperado).

Entradas arquivadas são excluídas por default; `--include-archived` as inclui.

Ranking: BM25 (menor score = mais relevante).

### Exit codes

| Código | Quando |
|---|---|
| 0 | Busca executada (mesmo que sem resultados) |
| 1 | Erro de argumento ou falha de DB |

### Exemplos de output

```bash
aioson memory:search "autenticação JWT"
```

```
2 results for "autenticação JWT"

[1] authn-refresh-token-ttl  (promoted)
    Tokens de refresh devem ter TTL de 7 dias máximo.
    Evidence: 4 sessions

[2] jwt-audience-check  (for_review)
    Validar claim 'aud' em todos os endpoints.
    Evidence: 2 sessions
```

Sem resultados:

```
0 results for "xyzzy"
```

Query não parseável:

```json
{ "ok": false, "reason": "query_unparseable" }
```

Output JSON completo:

```json
{
  "ok": true,
  "query": "autenticação JWT",
  "sanitized_query": "\"autenticação\" \"JWT\"",
  "results": [
    {
      "id": "authn-refresh-token-ttl",
      "title": "authn-refresh-token-ttl",
      "status": "promoted",
      "score": -2.14,
      "snippet": "Tokens de refresh devem ter TTL de 7 dias máximo."
    }
  ],
  "total": 2
}
```

---

## `aioson memory:archive`

Arquiva uma regra, learning ou brain: move o arquivo físico para `_archived/YYYY-MM-DD/` e grava o histórico em `evolution_log`.

**Tier:** 2 (notificado — emite `notify --level=warn` antes da mutação)

**Humano-only:** recusa quando `AIOSON_RUNTIME_HOOK=1` está setado.

```
aioson memory:archive [path] --id=<rule|learning|brain>:<slug> --reason="<texto>" [opções]
```

### Flags

| Flag | Obrigatório | Descrição |
|---|---|---|
| `--id=<tipo>:<slug>` | sim | Tipo e slug do target. Tipos: `rule`, `learning`, `brain` |
| `--reason="<texto>"` | sim | Motivo do arquivamento (gravado em `evolution_log`) |
| `--feature=<slug>` | não | Feature associada ao arquivamento (para rastreabilidade) |
| `--dry-run` | não | Simula sem efeito colateral — imprime o que aconteceria |
| `--json` | não | Output em JSON |

### Caminhos por tipo

| Tipo | Origem | Destino |
|---|---|---|
| `rule` | `.aioson/rules/<slug>.md` | `.aioson/rules/_archived/YYYY-MM-DD/<slug>.md` |
| `brain` | `.aioson/brains/<slug>.brain.json` | `.aioson/brains/_archived/YYYY-MM-DD/<slug>.brain.json` |
| `learning` | `.aioson/context/<slug>.json` | `.aioson/context/_archived/YYYY-MM-DD/<slug>.json` |

Colisão de nomes no destino: sufixo `-{seq}` é adicionado automaticamente (`-1`, `-2`, etc.).

### Comportamento

1. Verifica `AIOSON_RUNTIME_HOOK=1` — recusa se setado.
2. Resolve path do arquivo. Erro se não encontrado.
3. Noop idempotente se já arquivado.
4. Emite `notify --level=warn` antes de qualquer mutação.
5. Operação atômica: BEGIN TRANSACTION, move físico, INSERT/UPDATE em `evolution_log`, COMMIT. Se o COMMIT falhar, tenta reverter o move físico.
6. Registra `event_type='archived'` em `evolution_log` (entry ativo anterior recebe `end_at`).

### Exit codes

| Código | Quando |
|---|---|
| 0 | Arquivado com sucesso (ou noop se já arquivado) |
| 0 | `--dry-run` executado |
| 1 | Target não encontrado, AIOSON_RUNTIME_HOOK=1, falha de DB ou FS |

### Exemplos

```bash
# Dry-run primeiro
aioson memory:archive --id=rule:legacy-session-cookies \
  --reason="substituída por JWT auth (authn-flow)" --dry-run

# Execução real
aioson memory:archive --id=rule:legacy-session-cookies \
  --reason="substituída por JWT auth (authn-flow)"

# Com feature associada
aioson memory:archive --id=rule:legacy-session-cookies \
  --reason="substituída por JWT auth (authn-flow)" --feature=authn-flow

# JSON
aioson memory:archive --id=rule:legacy-session-cookies \
  --reason="obsoleta" --json
```

Output JSON:

```json
{
  "ok": true,
  "action": "archived",
  "type": "rule",
  "slug": "legacy-session-cookies",
  "source": ".aioson/rules/legacy-session-cookies.md",
  "dest": ".aioson/rules/_archived/2026-05-14/legacy-session-cookies.md",
  "evolution_log_rowid": 42
}
```

---

## `aioson memory:restore`

Restaura um item arquivado: move de volta para o path original e grava `event_type='restored'` em `evolution_log`.

**Tier:** 2 (notificado — emite `notify --level=warn` antes da mutação)

**Humano-only:** recusa quando `AIOSON_RUNTIME_HOOK=1` está setado.

```
aioson memory:restore [path] --id=<rule|learning|brain>:<slug> [opções]
```

### Flags

| Flag | Obrigatório | Descrição |
|---|---|---|
| `--id=<tipo>:<slug>` | sim | Tipo e slug do item a restaurar |
| `--reason="<texto>"` | não | Motivo da restauração (gravado em `evolution_log`) |
| `--feature=<slug>` | não | Feature associada (para rastreabilidade) |
| `--dry-run` | não | Simula sem efeito colateral |
| `--json` | não | Output em JSON |

### Comportamento

1. Localiza o arquivo mais recente em `_archived/*/` que corresponde ao slug.
2. Verifica se o path de destino original está disponível — erro se já existe um arquivo ativo com o mesmo nome.
3. Emite `notify --level=warn` antes de qualquer mutação.
4. Operação atômica: move físico + INSERT `event_type='restored'` + UPDATE `end_at` do entry `archived` ativo.

### Exit codes

| Código | Quando |
|---|---|
| 0 | Restaurado com sucesso |
| 0 | `--dry-run` executado |
| 1 | Item não encontrado em `_archived/`, path original já ocupado, AIOSON_RUNTIME_HOOK=1 |

### Exemplos

```bash
# Dry-run
aioson memory:restore --id=rule:rate-limiting-rules --dry-run

# Execução real com motivo
aioson memory:restore --id=rule:rate-limiting-rules \
  --reason="regra ainda necessária — remoção foi prematura"

# JSON
aioson memory:restore --id=rule:rate-limiting-rules --json
```

---

## `aioson feature:close` (modificado)

O comando existente `feature:close` ganhou um hook de destilação ao final. A sintaxe não mudou — apenas `--no-distill` foi adicionado.

```
aioson feature:close --slug=<slug> --verdict=<PASS|FAIL|ABANDONED> [--no-distill]
```

### Flag adicionada

| Flag | Descrição |
|---|---|
| `--no-distill` | Pula o hook de destilação para esta chamada (sem alterar o config permanente) |

### Comportamento do hook

- Só roda quando `--verdict=PASS` e classificação não é MICRO.
- Foreground com timeout de 5s (configurável em `learning-loop.json`).
- Exit code sempre 0, mesmo que a destilação falhe.
- Emite exatamente 1 notify `--level=info --topic=learning-loop` com o resumo.
- Grava resultado em `evolution_log` (`auto_distillation` ou `distillation_failed`).

---

## Continue lendo

- [Como usar](./como-usar.md) — exemplos end-to-end
- [Doctor checks](./doctor-checks.md) — o que os checks do doctor significam
- [Troubleshooting](./troubleshooting.md) — problemas conhecidos
