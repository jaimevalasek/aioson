# Deyvin Sub-Task Scout — guia em português

> **Sub-task scout** é a primitiva de diagnóstico estruturado do `@deyvin`. Quando uma pergunta exige inspecionar mais de 5 arquivos ou rastrear um fluxo de runtime, o agente não lê tudo inline (queimando contexto) — ele despacha um scout. O scout roda em contexto isolado, inspeciona o escopo, e devolve um JSON com findings, confiança e recomendação. O agente lê o relatório (~500 tokens) em vez dos arquivos (~10k+ tokens).

Esta pasta documenta a feature completa — 3 fases, 3 verbos CLI, 1 check advisory no doctor.

---

## Para que serve

- **Preservar o contexto do agente pai** — surveys de >5 arquivos entram no contexto como relatório compacto, não como conteúdo bruto.
- **Rastreabilidade de diagnóstico** — scouts são persistidos em `.aioson/runtime/scouts/` e (após `feature:close`) arquivados em `.aioson/context/features/{slug}/scouts/`.
- **Fallback sem CLI** — `deyvin.md` carrega uma versão manual do scout para ambientes sem o binário `aioson` instalado.
- **Cap discipline** — limites configuráveis impedem explosão de sub-tarefas: `max_scouts_per_session=3`, `max_files_in_scope=20`.

---

## Pré-requisitos

- AIOSON instalado (versão que incluiu esta feature)
- Harness com suporte a sub-agentes: Claude Code (Agent tool) ou Codex (MultiAgentV2)
- `.aioson/config/scout-engine.json` no projeto (copiado automaticamente pelo installer como `{}`, defaults ativos)

> **OpenCode:** emitem `harness_unsupported` e caem automaticamente para o fluxo CLI-less inline do `deyvin.md`. Paridade de harness completa é V2.

---

## Roteiro de leitura

### Quero entender o que mudou no @deyvin (10 min)
1. [O que é o sub-task scout](./sub-task-scout.md) — o problema, as 3 fases, o ciclo de vida completo
2. [Diagramas](./diagramas.md) — fluxo ASCII do despacho: `scout:prep` → sub-agente → `scout:validate` → `scout:commit`

### Quero ver o @deyvin usando um scout
3. [Como usar](./como-usar.md) — fluxo happy-path, recuperação de JSON inválido, cap exceeded

### Quero configurar ou entender os limites
4. [Referência CLI](./comandos-cli.md) — flags completos dos 3 verbos (`scout:prep`, `scout:validate`, `scout:commit`)

### Algo deu errado / quero ajustar os limites
5. [Troubleshooting](./troubleshooting.md) — cap exceeded, JSON malformado, harness sem sub-agente, scouts órfãos

---

## Comandos canônicos

| Comando | O que faz | Tier | Doc |
|---|---|---|---|
| `aioson scout:prep --question="..." --scope-paths="..." --parent-agent=deyvin --parent-session-id=<id>` | Valida inputs, aplica caps, gera prompt padronizado para o sub-agente | tier-1 silencioso | [Referência CLI](./comandos-cli.md) |
| `aioson scout:validate --input=<path>` | Valida o JSON retornado pelo sub-agente contra o output schema | tier-1 silencioso | [Referência CLI](./comandos-cli.md) |
| `aioson scout:commit --input=<path>` | Persiste o relatório validado, emite telemetria, decrementa cap | tier-1 silencioso | [Referência CLI](./comandos-cli.md) |
| `aioson doctor .` | Inclui o advisory `scouts_directory_pruning` (scouts órfãos >90d) | tier-1 silencioso | [Troubleshooting](./troubleshooting.md) |

---

## Onde os artefatos vivem

| Caminho | Papel |
|---|---|
| `.aioson/runtime/scouts/{id}.json` | Scout report ativo (ephemeral; poda pelo doctor após 90d se órfão) |
| `.aioson/runtime/scouts/.state.json` | Estado de caps por session_id; lock em `.state.json.lock` |
| `.aioson/config/scout-engine.json` | Configuração por projeto (override de defaults) |
| `.aioson/context/features/{slug}/scouts/{id}.json` | Scout arquivado após `feature:close --verdict=PASS` |
| `.aioson/context/features/{slug}/dossier.md` → `## Sub-task scouts` | Bullets de scouts arquivados (append-only, idempotente) |
| `agent_events` (SQLite) | Telemetria: `event_type='sub_task'`, `action ∈ {prepared, validation_failed, retry_exhausted, committed, slow_completion, cap_exceeded}` |

---

## Configuração

`.aioson/config/scout-engine.json` é copiado como `{}` no primeiro install — todos os defaults se aplicam:

| Campo | Default | O que controla |
|---|---|---|
| `max_scouts_per_session` | 3 | Scouts por `parent_session_id` |
| `max_files_in_scope` | 20 | Arquivos na soma de `scope_paths` |
| `max_retries_on_malformed_json` | 1 | Re-validações antes de `retry_exhausted` |
| `max_depth` | 2 | Profundidade de scouts aninhados (1 sub-scout por scout) |
| `prune_unattached_after_days` | 90 | Dias para poda de scouts sem `feature_slug` pelo `doctor --fix` |
| `slow_completion_warn_seconds` | 300 | Threshold para emissão de `slow_completion` |

Exemplo de override:

```json
{
  "max_scouts_per_session": 5,
  "max_files_in_scope": 30
}
```

> Chaves desconhecidas são **rejeitadas** (validação estrita). Use apenas os campos acima.

---

## Status

A feature `deyvin-subtask-scout` foi entregue em 3 fases:

| Fase | Slug | Entrega | Status |
|---|---|---|---|
| 1 | `core-engine` | `src/sub-task-engine.js` + schemas + validador hand-rolled | PASS |
| 2 | `cli-verbs` | `scout:prep` + `scout:validate` + `scout:commit` + estado com file-lock | PASS |
| 3 | `wiring-and-lifecycle` | `deyvin.md` atualizado (CLI + CLI-less), archival no `feature:close`, `memory:summary` row, doctor advisory | PASS |

80 testes determinísticos passando. QA aprovado.

Artefatos de especificação (arquivados):
- [PRD](../../.aioson/context/done/deyvin-subtask-scout/prd-deyvin-subtask-scout.md)
- [Spec](../../.aioson/context/done/deyvin-subtask-scout/spec-deyvin-subtask-scout.md)
