# Como usar o Active Learning Loop

> Exemplos concretos. Cada seção resolve uma necessidade real do dia a dia.

---

## 1. Pesquisar um learning existente

Você quer saber se o projeto já tem algum learning sobre autenticação antes de criar uma regra nova:

```bash
aioson memory:search "autenticação"
```

Saída típica:

```
3 results for "autenticação" (BM25)

[1] authn-refresh-token-ttl  (promoted)
    Tokens de refresh devem ter TTL de 7 dias máximo conforme decisão em auth-flow feature.
    Evidence: 4 sessions

[2] jwt-audience-check  (for_review)
    Validar claim 'aud' em todos os endpoints. Encontrado em 2 sessões de security-audit.
    Evidence: 2 sessions

[3] oauth-state-param  (active)
    State parameter obrigatório em fluxo OAuth para prevenir CSRF.
    Evidence: 3 sessions
```

Filtrar só learnings promovidos:

```bash
aioson memory:search "autenticação" --surface=learnings --limit=10
```

Buscar em regras também:

```bash
aioson memory:search "autenticação" --surface=all
```

Incluir entradas já arquivadas (para auditoria histórica):

```bash
aioson memory:search "autenticação" --include-archived
```

Saída em JSON (para scripts):

```bash
aioson memory:search "autenticação" --json
```

```json
{
  "ok": true,
  "query": "autenticação",
  "results": [
    {
      "id": "authn-refresh-token-ttl",
      "title": "authn-refresh-token-ttl",
      "status": "promoted",
      "score": -2.14,
      "snippet": "Tokens de refresh devem ter TTL de 7 dias..."
    }
  ],
  "total": 3
}
```

**Nota sobre busca:** a query usa token-AND — cada palavra separada por espaço deve aparecer no documento. `"autenticação JWT"` encontra documentos que contêm ambas as palavras, não necessariamente a frase exata. Operadores como AND/OR/NOT são removidos — é busca por palavras-chave, não linguagem de query.

---

## 2. Declarar que um agente carregou uma regra

Quando você (ou um agente que você está escrevendo) carrega uma regra no início da sessão, declare isso para o sistema de telemetria:

```bash
aioson context:load --target=rule:authn-rules --agent=dev
```

Para carregar vários de uma vez (recomendado — minimiza overhead):

```bash
aioson context:load --target=rule:authn-rules --agent=dev --batch="jwt-patterns,oauth-state,session-management"
```

Associar ao carregamento de uma feature em andamento:

```bash
aioson context:load --target=brain:sheldon-005 --agent=sheldon --feature=authn-flow
```

O comando é tier-1 silencioso — não imprime nada por default. Use `--verbose` se quiser confirmar:

```bash
aioson context:load --target=rule:authn-rules --agent=dev --verbose
# rule_loaded: authn-rules (agent: dev)
```

Use `--json` para integrar em scripts:

```bash
aioson context:load --target=rule:authn-rules --agent=dev --json
# {"ok":true,"event":"rule_loaded","target":"authn-rules","agent":"dev"}
```

---

## 3. O que `feature:close` faz agora

O fluxo existente continua igual — a destilação é adicionada ao final:

```bash
aioson feature:close --slug=authn-flow --verdict=PASS
```

Saída esperada (além da saída normal do feature:close):

```
[existente] Gate validation: OK
[existente] Dossier finalized: .aioson/context/features/authn-flow/
[existente] features.md updated: authn-flow → PASS

ℹ [learning-loop] distillation: 2 promoted, 1 for review, 0 merge candidates
```

O que aconteceu nos bastidores:
1. Leu a classificação do PRD — SMALL, então prosseguiu.
2. Adquiriu o lock de distilação em `evolution_log`.
3. Rodou `learning:auto-promote --feature=authn-flow` — 2 learnings cruzaram o threshold e viraram regras.
4. 1 learning ficou em `for_review` — ainda não tem evidências suficientes.
5. Gravou o resultado em `evolution_log` e emitiu o notify.

**Desativar por chamada:**

```bash
aioson feature:close --slug=authn-flow --verdict=PASS --no-distill
```

**Projeto MICRO** — a destilação é pulada automaticamente, sem necessidade de `--no-distill`:

```
[existente] Gate validation: OK
...
ℹ [learning-loop] skipped: MICRO classification
```

---

## 4. Arquivar uma regra obsoleta

O `doctor` reportou staleness na regra `legacy-session-cookies`. Você quer arquivá-la:

```bash
# Simule primeiro para ver o que vai acontecer
aioson memory:archive --id=rule:legacy-session-cookies --reason="substituída por JWT-based auth (feature authn-flow)" --dry-run
```

Saída do dry-run:

```
[dry-run] would archive:
  source:  .aioson/rules/legacy-session-cookies.md
  dest:    .aioson/rules/_archived/2026-05-14/legacy-session-cookies.md
  reason:  substituída por JWT-based auth (feature authn-flow)
  evolution_log: 1 entry to close, 1 entry to insert
```

Se o dry-run está correto, execute:

```bash
aioson memory:archive --id=rule:legacy-session-cookies --reason="substituída por JWT-based auth (feature authn-flow)"
```

Saída:

```
⚠ [memory-archive] archiving rule:legacy-session-cookies — legacy-session-cookies.md
archived: .aioson/rules/_archived/2026-05-14/legacy-session-cookies.md
```

Associar ao fechamento de uma feature (opcional, mas recomendado para rastreabilidade):

```bash
aioson memory:archive --id=rule:legacy-session-cookies --reason="..." --feature=authn-flow
```

---

## 5. Arquivar um learning ou brain

O mesmo comando funciona para os três tipos — `rule`, `learning`, e `brain`:

```bash
# Arquivar um learning
aioson memory:archive --id=learning:jwt-draft-1 --reason="superado pela versão promovida em authn-flow"

# Arquivar um brain
aioson memory:archive --id=brain:sheldon-003 --reason="versão 003 foi substituída por sheldon-006"
```

---

## 6. Restaurar um item arquivado

Você arquivou a regra `rate-limiting-rules` mas percebeu que ainda é usada:

```bash
aioson memory:restore --id=rule:rate-limiting-rules
```

Saída:

```
⚠ [memory-restore] restoring rule:rate-limiting-rules
restored: .aioson/rules/rate-limiting-rules.md
```

Com motivo (recomendado para rastreabilidade):

```bash
aioson memory:restore --id=rule:rate-limiting-rules --reason="regra ainda necessária — removal foi precipitado"
```

Dry-run disponível também:

```bash
aioson memory:restore --id=rule:rate-limiting-rules --dry-run
```

---

## 7. Verificar o estado do loop via doctor

```bash
aioson doctor .
```

Se o loop está saudável:

```
[OK] living-memory:rule_staleness
[OK] living-memory:learning_orphans
[OK] living-memory:distillation_lag
```

Se há problemas:

```
[WARN] living-memory:rule_staleness (2 stale rules)
  Rule 'legacy-session-cookies' has 0 rule_loaded events in last 7 features.
  Rule 'old-rate-limit-policy' has 0 rule_loaded events in last 7 features.
  Hint: consider archiving:
    aioson memory:archive --id=rule:legacy-session-cookies --reason="..."
    aioson memory:archive --id=rule:old-rate-limit-policy --reason="..."

[WARN] living-memory:learning_orphans (1 orphan)
  Learning 'jwt-expiry-pattern' was promoted but its target rule had no rule_loaded after promotion.
  Hint: aioson memory:archive --id=learning:jwt-expiry-pattern --reason="..."

[WARN] living-memory:distillation_lag
  8 features closed, 5 auto_distillation events recorded.
  Hint: Run `aioson feature:close --slug=<slug> --verdict=PASS` on pending features,
        or check if distillation is failing silently (see evolution_log).
```

Veja [Doctor checks](./doctor-checks.md) para o que cada check significa e como agir.

---

## 8. Inspecionar o `evolution_log` diretamente

Para auditoria ou troubleshooting, consulte o SQLite diretamente:

```bash
sqlite3 .aioson/runtime/aios.sqlite \
  "SELECT target_type, target_id, event_type, start_at, end_at, reason
   FROM evolution_log
   ORDER BY start_at DESC
   LIMIT 10;"
```

Verificar o lock de distilação ativo:

```bash
sqlite3 .aioson/runtime/aios.sqlite \
  "SELECT feature_slug, start_at, payload_json
   FROM evolution_log
   WHERE event_type='auto_distillation' AND end_at IS NULL;"
```

Histórico de uma regra específica:

```bash
sqlite3 .aioson/runtime/aios.sqlite \
  "SELECT event_type, start_at, end_at, reason, actor
   FROM evolution_log
   WHERE target_type='rule' AND target_id='authn-rules'
   ORDER BY start_at;"
```

---

## Continue lendo

- [Referência CLI](./comandos-cli.md) — todos os flags documentados
- [Doctor checks](./doctor-checks.md) — o que os checks significam e como agir
- [Troubleshooting](./troubleshooting.md) — problemas conhecidos
