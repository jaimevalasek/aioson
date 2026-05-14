# O que é o Active Learning Loop

## O problema

O AIOSON já sabia aprender. Depois de cada sessão, `project_learnings` acumula observações: padrões detectados, erros corrigidos, decisões tomadas. Mas havia uma lacuna: esses learnings raramente viravam regras ativas. A destilação existia como comando manual que poucos rodavam. As regras existentes acumulavam sem que ninguém soubesse quais ainda eram consultadas.

O resultado prático: depois de N features, a memória do projeto estava cheia de aprendizados que nunca fecharam o ciclo — nem viraram regras usáveis, nem foram arquivados. O `doctor` não tinha visibilidade do problema. Os agentes continuavam lendo regras que ninguém validava há meses.

Active Learning Loop fecha esse arco.

## O que a feature faz

Quatro superfícies novas, interligadas:

**1. Telemetria de carregamento** — agentes declaram explicitamente "carreguei esta regra/brain" via `aioson context:load`. O CLI grava um evento `rule_loaded` ou `brain_loaded` em `execution_events`. Silencioso, tier-1. O doctor usa esse sinal depois.

**2. Busca em memória** — `aioson memory:search "autenticação JWT"` faz busca BM25 sobre o título e a evidência de todos os learnings ativos. Sem configuração, sem embeddings, sem chamada LLM — SQLite FTS5 nativo.

**3. Arquivo com rastreabilidade** — `aioson memory:archive --id=rule:minha-regra --reason="substituída por X"` move o arquivo físico para `.aioson/rules/_archived/YYYY-MM-DD/` e grava um par de linhas em `evolution_log`: o entry anterior recebe `end_at`, um novo entry documenta o motivo. Append-only — o histórico nunca muda. `memory:restore` desfaz o processo se necessário.

**4. Destilação automática no `feature:close`** — quando você fecha uma feature com `--verdict=PASS`, o CLI roda `runDistillation()` em foreground (timeout 5s), promove learnings que cruzaram o threshold, emite uma notificação com o resumo e grava o resultado em `evolution_log`. Se falhar por qualquer motivo, o código de saída do `feature:close` ainda é 0 — a destilação é best-effort.

## As 6 fases

### Fase 1 — telemetry-foundation

Novo verbo CLI: `aioson context:load`. Os agentes chamam esse comando quando carregam uma regra ou brain no início da sessão. O evento vai para `execution_events` como `rule_loaded` ou `brain_loaded`, com payload: slug, agente, feature associada (opcional).

O verbo suporta `--batch="regra-a,regra-b,regra-c"` para minimizar chamadas quando um agente carrega várias regras de uma vez.

Nenhuma mudança visível no comportamento dos agentes — é telemetria silenciosa. O valor aparece nas fases 4 e 5.

### Fase 2 — memory-search-fts5

Novo verbo: `aioson memory:search "<query>"`. Cria uma virtual table FTS5 (`project_learnings_fts`) sobre `project_learnings`, sincronizada via triggers SQL (INSERT/UPDATE/DELETE). Ranking BM25 por default.

Sanitização de query: cada token (separado por espaço) vira uma frase entre aspas ANDada com os outros. Caracteres de operador FTS5 (`*()^:+-"`) são removidos. Queries que resultam em string vazia retornam `{ ok: false, reason: 'query_unparseable' }` sem erro. Limite de 500 caracteres.

Entradas arquivadas são excluídas por default; `--include-archived` as inclui.

### Fase 3 — memory-archive-with-evolution-log

Dois novos verbos: `memory:archive` e `memory:restore`.

`memory:archive` é tier-2 (notified): emite `aioson notify --level=warn` antes da mutação, move o arquivo físico para `_archived/YYYY-MM-DD/`, e grava duas linhas em `evolution_log` — `end_at` no entry ativo anterior, novo entry com o motivo. A operação é atômica: se a escrita no DB falhar após o move físico, o arquivo é restaurado (rollback de FS).

`--dry-run` simula a operação inteira sem efeito colateral.

`memory:restore` inverte: move o arquivo de volta, grava `event_type='restored'` em `evolution_log`.

**Tier-2 humano-only**: tanto `memory:archive` quanto `memory:restore` recusam execução quando `AIOSON_RUNTIME_HOOK=1` está setado (ambiente de hook automatizado). Essas operações são intencionalmente restritas ao humano.

### Fase 4 — doctor-curation-checks

Três novos checks em `aioson doctor`, com `severity='warning'` (não bloqueiam `ok=true`, mas aparecem em `failedCount`):

1. **`living-memory:rule_staleness`** — regras que não tiveram nenhum evento `rule_loaded` nas últimas N features fechadas. N = max(5, ceil(média de dias entre as últimas 5 features ÷ 7)).
2. **`living-memory:learning_orphans`** — learnings com `status=promoted` cujo target rule não teve nenhum `rule_loaded` após a promoção. Indica que a regra gerada nunca foi usada.
3. **`living-memory:distillation_lag`** — 5+ features fechadas, mas menos eventos `auto_distillation` do que features fechadas. O loop não está rodando como esperado.

Projetos com classificação MICRO optam para fora de todos os três checks.

O hint de cada check inclui o comando pronto para copiar: `aioson memory:archive --id=rule:<slug> --reason="..."`.

### Fase 5 — feature-close-distillation-hook

`aioson feature:close --slug=X --verdict=PASS` agora chama `runDistillation(X)` depois do passo de finalização do dossier, antes de retornar.

O fluxo:
1. Lê a classificação do PRD da feature — se MICRO, emite notify e pula.
2. Verifica status da feature em `features.md` — se `abandoned`, pula.
3. Tenta adquirir o lock via INSERT em `evolution_log` (row com `end_at=NULL`). Se já existe uma row ativa para a feature, emite notify "already in progress" e sai com 0.
4. Roda `learning:auto-promote --feature=X` com timeout de 5s.
5. Ao final: UPDATE da row de lock com `end_at=now()` e `payload.state='complete'`.
6. Emite `aioson notify --level=info --topic=learning-loop --message="distillation: N promoted, M for review, K merge candidates"`.

Se `runDistillation` lança exceção, o catch grava `event_type='distillation_failed'` em `evolution_log` e engole o erro. O `feature:close` retorna 0 independentemente.

`--no-distill` desativa o hook para a chamada corrente.

### Fase 6 — inception-mirror-parity

Validação de infraestrutura — sem superfície nova para o usuário. Garante que um projeto criado com `aioson setup` herda o mesmo loop que o repositório AIOSON usa. `npm run sync:agents:preflight` foi estendido para detectar drift nos 10 novos arquivos, nas entradas do autonomy-protocol, e nos placeholders `_archived/`.

## Como as peças se conectam

```
Agente carrega regra
  └─ aioson context:load --target=rule:authn --agent=dev
        └─ grava execution_events (rule_loaded)

Agente trabalha, feature fecha
  └─ aioson feature:close --slug=authn-flow --verdict=PASS
        └─ runDistillation()
              ├─ learning:auto-promote → promove learnings maduros
              ├─ UPDATE evolution_log (distillation complete)
              └─ notify "N promoted, M for review"

Doctor verifica periodicamente
  └─ aioson doctor .
        ├─ rule_staleness: regra 'authn' sem rule_loaded em 8 features
        ├─ learning_orphans: learning 'jwt-expiry-pattern' promovido mas regra nunca carregada
        └─ distillation_lag: 7 features fechadas, 4 distillations registradas

Humano age nas hints
  └─ aioson memory:archive --id=rule:authn --reason="obsoleta após migração OAuth"
        ├─ notify --level=warn (antes da mutação)
        ├─ move físico: .aioson/rules/authn.md → .aioson/rules/_archived/2026-05-14/authn.md
        └─ evolution_log: end_at no entry anterior, novo entry com motivo
```

## Continue lendo

- [Diagramas](./diagramas.md) — fluxo ASCII detalhado
- [Como usar](./como-usar.md) — exemplos concretos
- [Referência CLI](./comandos-cli.md) — todos os flags
- [Doctor checks](./doctor-checks.md) — o que cada check significa
