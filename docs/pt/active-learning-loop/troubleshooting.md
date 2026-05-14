# Troubleshooting — Active Learning Loop

> Cada seção: **sintoma** → **diagnóstico** → **fix**. Comece sempre por `aioson doctor .` — ele detecta a maioria dos problemas.

---

## 1. Lock de destilação preso (`lock_held`)

**Sintoma:** `feature:close` retorna com notify "distillation already in progress" em toda chamada subsequente para a mesma feature, mesmo sem outro processo rodando. Ou a destilação ficou presa num estado em que `end_at` nunca foi setado.

**Diagnóstico:** o AIOSON crashou (SIGKILL, queda de energia, kill manual do processo) durante a destilação. O row de lock em `evolution_log` ficou com `end_at=NULL`, sinalizando "em progresso", mas não há processo ativo.

Confirme:

```bash
sqlite3 .aioson/runtime/aios.sqlite \
  "SELECT rowid, feature_slug, event_type, start_at, end_at, payload_json
   FROM evolution_log
   WHERE event_type IN ('auto_distillation', 'distillation_failed')
     AND end_at IS NULL;"
```

Se o `start_at` é do passado distante e não há processo ativo, é um lock preso.

**Fix (V1 — manual):**

```bash
sqlite3 .aioson/runtime/aios.sqlite \
  "UPDATE evolution_log
   SET end_at=datetime('now'), payload_json=json_patch(payload_json, '{\"state\":\"unlocked_manually\"}')
   WHERE feature_slug='<slug>'
     AND event_type='auto_distillation'
     AND end_at IS NULL;"
```

Substitua `<slug>` pelo slug da feature com o lock preso.

Depois verifique:

```bash
sqlite3 .aioson/runtime/aios.sqlite \
  "SELECT feature_slug, end_at FROM evolution_log
   WHERE event_type='auto_distillation' AND end_at IS NULL;"
# deve retornar 0 linhas
```

Agora você pode rodar `feature:close` novamente.

**Trajetória V2:** o comando `aioson memory:unlock --feature=<slug>` vai automatizar esse unlock. Até lá, o fix manual acima é o caminho.

---

## 2. Projetos MICRO — destilação e checks do doctor ausentes

**Sintoma:** `feature:close --verdict=PASS` completa sem nenhuma linha de "distillation: N promoted". `aioson doctor .` não mostra os três checks de curadoria.

**Diagnóstico:** o projeto está classificado como MICRO. Essa é a configuração esperada — projetos MICRO optam para fora do loop inteiro:

```json
// .aioson/config/learning-loop.json
{
  "skip_on_classification": ["MICRO"]
}
```

Também se aplica a features individuais classificadas como MICRO no frontmatter do PRD:

```yaml
# .aioson/context/prd-minha-feature.md
---
classification: MICRO
---
```

**Como verificar:**

```bash
# Verificar classificação do projeto
grep -r "classification:" .aioson/context/project.context.md
# ou
aioson doctor . --json | grep classification

# Verificar feature específica
head -10 .aioson/context/prd-minha-feature.md
```

**Se você quer habilitar o loop mesmo em MICRO:**

Edite `.aioson/config/learning-loop.json` e remova `"MICRO"` de `skip_on_classification`:

```json
{
  "skip_on_classification": []
}
```

Não recomendado — projetos MICRO geralmente não têm features suficientes para o loop ser útil. O threshold mínimo de 5 features para os checks do doctor provavelmente não será alcançado de qualquer forma.

---

## 3. `pattern:detect` não está rodando — `merge_candidate_count` sempre 0

**Sintoma:** o notify de destilação sempre mostra `0 merge candidates`, mesmo tendo muitos learnings promovidos com conteúdo similar.

**Diagnóstico:** este é um comportamento esperado em V1. O hook de `feature:close` roda `learning:auto-promote` mas **não** roda `pattern:detect`. O `pattern:detect` existente é scoped para squads e é incompatível com o escopo de feature. `merge_candidate_count` é sempre 0 em V1.

Esta limitação está rastreada para um follow-up. Não há workaround direto.

**O que você pode fazer enquanto isso:**

Se quiser detectar padrões manualmente entre learnings promovidos:

```bash
aioson memory:search "seu-termo" --surface=learnings
```

E archive learnings que são claramente duplicados:

```bash
aioson memory:archive --id=learning:learning-duplicado --reason="conteúdo idêntico a learning:learning-principal"
```

---

## 4. `aioson update` sobrescreve `learning-loop.json`

**Sintoma:** você customizou `.aioson/config/learning-loop.json` (mudou `timeout_ms`, `auto_promote_threshold`, etc.) e depois rodou `aioson update`. Suas customizações foram perdidas.

**Diagnóstico:** esta é a política atual do installer — `aioson update` sobrescreve `learning-loop.json` com os valores do template. É um comportamento documentado a ser corrigido em uma próxima versão.

**Workaround:**

Antes de rodar `aioson update`, faça backup manual:

```bash
cp .aioson/config/learning-loop.json .aioson/config/learning-loop.json.bak
```

Depois de `aioson update`, restaure suas customizações:

```bash
# Comparar o que mudou
diff .aioson/config/learning-loop.json .aioson/config/learning-loop.json.bak

# Restaurar campos customizados manualmente
# Edite .aioson/config/learning-loop.json com as suas preferências
```

**Trajetória:** o installer passará a fazer merge-aware copy para este arquivo, preservando customizações do usuário. Até lá, o backup manual antes de `aioson update` é necessário se você tem customizações.

---

## 5. Destilação falhando silenciosamente

**Sintoma:** `feature:close` roda e retorna 0, mas sem o notify de destilação, e o `doctor` reporta `distillation_lag`.

**Diagnóstico:** o hook de destilação falhou mas engoliu o erro (comportamento correto — a destilação é best-effort). O erro foi gravado em `evolution_log`.

**Investigar:**

```bash
sqlite3 .aioson/runtime/aios.sqlite \
  "SELECT feature_slug, start_at, payload_json
   FROM evolution_log
   WHERE event_type='distillation_failed'
   ORDER BY start_at DESC LIMIT 5;"
```

O `payload_json` contém `error_phase` e `error_message`:

```json
{
  "state": "failed",
  "error_phase": "auto-promote",
  "error_message": "SQLITE_LOCKED: database is locked"
}
```

Causas comuns por `error_phase`:

| Fase | Causa típica |
|---|---|
| `auto-promote` | DB locked, `project_learnings` com schema inválido |
| `timeout` | Distilação levou mais de `timeout_ms` (default: 5000) |
| `lock-acquire` | Falha no INSERT do lock — concorrência ou DB corrompido |

**Fixes comuns:**

- `SQLITE_LOCKED`: outro processo tem o DB aberto. Feche outros terminais com AIOSON rodando.
- `timeout`: aumente `timeout_ms` em `learning-loop.json` (ex: `10000`).
- DB corrompido: `sqlite3 .aioson/runtime/aios.sqlite "PRAGMA integrity_check;"`.

---

## 6. `memory:archive` recusado — `AIOSON_RUNTIME_HOOK=1`

**Sintoma:**

```
Error: memory:archive is a tier-2 human-only operation.
  Cannot run with AIOSON_RUNTIME_HOOK=1 (automated hook context).
```

**Diagnóstico:** você está tentando rodar `memory:archive` (ou `memory:restore`) de dentro de um hook automatizado — um script que seta `AIOSON_RUNTIME_HOOK=1`. Esses comandos são intencionalmente restritos ao humano.

**Fix:** rode o comando manualmente no terminal, fora do contexto de hook:

```bash
# Sem AIOSON_RUNTIME_HOOK=1 no ambiente
aioson memory:archive --id=rule:minha-regra --reason="..."
```

Se você precisa que um script automatizado arquive itens, considere que esse é um design problem — o arquivamento com motivo deliberado é uma operação semântica que deve ser humano-aprovada.

---

## 7. `memory:search` retorna `query_unparseable`

**Sintoma:**

```json
{ "ok": false, "reason": "query_unparseable" }
```

**Diagnóstico:** após remover todos os caracteres de operador FTS5 (`* ( ) ^ : + - "`), a query ficou vazia ou só espaços.

Exemplos de queries problemáticas:

```bash
aioson memory:search "***"        # todos os chars são operadores
aioson memory:search "+"          # operador puro
aioson memory:search "(NOT)"      # parênteses + NOT removidos → vazio
```

**Fix:** use palavras comuns:

```bash
aioson memory:search "autenticação"
aioson memory:search "jwt refresh token"
```

---

## 8. FTS5 desincronizado — busca não retorna resultados recentes

**Sintoma:** `memory:search` não encontra um learning que você sabe que existe e está ativo.

**Diagnóstico:** os triggers FTS5 podem ter falhado durante uma escrita anterior (ex: crash durante INSERT em `project_learnings`). O índice FTS5 ficou fora de sync com a tabela base.

**Diagnóstico:**

```bash
sqlite3 .aioson/runtime/aios.sqlite \
  "SELECT COUNT(*) FROM project_learnings WHERE status != 'archived';"
# vs
sqlite3 .aioson/runtime/aios.sqlite \
  "SELECT COUNT(*) FROM project_learnings_fts;"
```

Se os counts divergem, o índice está desincronizado.

**Fix — recriar o índice:**

```bash
sqlite3 .aioson/runtime/aios.sqlite \
  "INSERT INTO project_learnings_fts(project_learnings_fts) VALUES('rebuild');"
```

O `rebuild` é uma operação segura e idempotente do FTS5 — reconstrói o índice a partir da tabela base.

---

## Comandos de diagnóstico rápido

| Objetivo | Comando |
|---|---|
| Ver todos os checks | `aioson doctor .` |
| Ver locks de distilação ativos | `sqlite3 .aioson/runtime/aios.sqlite "SELECT * FROM evolution_log WHERE end_at IS NULL;"` |
| Ver últimas distilações | `sqlite3 .aioson/runtime/aios.sqlite "SELECT feature_slug, event_type, start_at, end_at FROM evolution_log WHERE event_type LIKE '%distillation%' ORDER BY start_at DESC LIMIT 10;"` |
| Ver falhas de destilação | `sqlite3 .aioson/runtime/aios.sqlite "SELECT feature_slug, payload_json FROM evolution_log WHERE event_type='distillation_failed';"` |
| Verificar sync do FTS5 | `sqlite3 .aioson/runtime/aios.sqlite "SELECT COUNT(*) FROM project_learnings; SELECT COUNT(*) FROM project_learnings_fts;"` |
| Reconstruir FTS5 | `sqlite3 .aioson/runtime/aios.sqlite "INSERT INTO project_learnings_fts(project_learnings_fts) VALUES('rebuild');"` |
| Verificar integridade do DB | `sqlite3 .aioson/runtime/aios.sqlite "PRAGMA integrity_check;"` |
