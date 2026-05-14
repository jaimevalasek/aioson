# Active Learning Loop — guia em português

> **Active Learning Loop** é o ciclo que fecha o arco entre as primitivas de aprendizado já existentes no AIOSON e o ciclo de vida de uma feature. Quando uma feature é fechada com `feature:close --verdict=PASS`, o framework dispara automaticamente a destilação: learnings são promovidos a regras, o `doctor` monitora lacunas de curadoria, e um fluxo de arquivo aprovado por humano mantém a memória do projeto organizada.

Esta pasta documenta a feature completa — 6 fases, 4 novos verbos CLI, 3 novos checks do doctor.

---

## Para que serve

- **Fechar o loop de aprendizado** — sem Active Learning Loop, learnings acumulam em `project_learnings` mas nunca chegam a regras usáveis. A feature liga os dois pontos: `feature:close` → destilação automática → regras prontas para o próximo agente.
- **Medir uso real de regras** — agentes declaram "carreguei esta regra" via `aioson context:load`. O doctor usa esse sinal para identificar regras que ninguém mais consulta.
- **Pesquisar memória rapidamente** — `aioson memory:search` oferece busca BM25 sobre learnings, direto do terminal.
- **Arquivar com rastreabilidade** — `aioson memory:archive` move regras/brains obsoletos para `_archived/` com log de evolução append-only; `memory:restore` desfaz se necessário.
- **Alertar sobre lacunas** — três checks novos no `doctor` (staleness de regras, learnings órfãos, lag de destilação) geram hints acionáveis com comandos prontos para copiar.

---

## Pré-requisitos

- AIOSON instalado (versão que incluiu esta feature)
- `.aioson/config/learning-loop.json` presente no projeto (copiado automaticamente pelo installer; veja [Configuração](#configuração))
- Projeto classificado como SMALL ou MEDIUM — projetos MICRO optam para fora automaticamente (sem destilação, sem checks do doctor)

---

## Roteiro de leitura

### Quero entender o que mudou no meu fluxo (10 min)
1. [O que é o Active Learning Loop](./ativo-learning-loop.md) — o problema, as 6 fases, o fluxo completo
2. [Diagramas](./diagramas.md) — fluxo ASCII do `feature:close` → destilação → `evolution_log` → `doctor`

### Quero usar na prática agora
3. [Como usar](./como-usar.md) — pesquisar um learning, arquivar uma regra obsoleta, o que `feature:close` faz agora
4. [Referência CLI](./comandos-cli.md) — todos os flags dos 4 novos verbos

### Algo aconteceu / quero entender o que o doctor está dizendo
5. [Doctor checks](./doctor-checks.md) — o que cada um dos 3 novos checks significa e como agir
6. [Troubleshooting](./troubleshooting.md) — lock preso, opt-out MICRO, `pattern:detect` adiado, `aioson update` sobrescreve config

---

## Comandos canônicos

| Comando | O que faz | Tier | Doc |
|---|---|---|---|
| `aioson context:load --target=rule:<slug> --agent=<nome>` | Registra que um agente carregou uma regra/brain | tier-1 silencioso | [Referência CLI](./comandos-cli.md) |
| `aioson memory:search "<query>"` | Busca BM25 em learnings por palavras-chave | tier-1 silencioso | [Referência CLI](./comandos-cli.md) |
| `aioson memory:archive --id=rule:<slug> --reason="<texto>"` | Arquiva regra/learning/brain com log de evolução | tier-2 notificado | [Referência CLI](./comandos-cli.md) |
| `aioson memory:restore --id=rule:<slug>` | Restaura item arquivado | tier-2 notificado | [Referência CLI](./comandos-cli.md) |
| `aioson feature:close --slug=X --verdict=PASS` | Fecha feature + dispara destilação automática (novo) | tier-2 notificado | [Como usar](./como-usar.md) |
| `aioson doctor .` | Diagnóstico, incluindo 3 novos checks de curadoria | tier-1 silencioso | [Doctor checks](./doctor-checks.md) |

---

## Onde os artefatos vivem

| Caminho | Papel |
|---|---|
| `.aioson/config/learning-loop.json` | Configuração do loop por projeto (thresholds, opt-out, timeout) |
| `.aioson/rules/_archived/YYYY-MM-DD/<slug>.md` | Regras arquivadas com data de arquivamento |
| `.aioson/brains/_archived/YYYY-MM-DD/<id>.brain.json` | Brains arquivados |
| `.aioson/context/_archived/YYYY-MM-DD/<slug>.json` | Learnings arquivados |
| `.aioson/runtime/aios.sqlite` → tabela `evolution_log` | Log append-only de toda mutação de memória |
| `.aioson/runtime/aios.sqlite` → tabela `execution_events` | Eventos `rule_loaded` / `brain_loaded` emitidos por `context:load` |
| `.aioson/runtime/aios.sqlite` → virtual table `project_learnings_fts` | Índice FTS5 sobre `project_learnings` (título + evidência) |

---

## Configuração

`.aioson/config/learning-loop.json` é copiado do template no primeiro install:

```json
{
  "$schema": "https://aioson.dev/schemas/learning-loop.v1.json",
  "enabled": true,
  "skip_on_classification": ["MICRO"],
  "execution_mode": "foreground",
  "lock_strategy": "sqlite-row",
  "auto_promote_threshold": 3,
  "staleness_window_features_min": 5,
  "timeout_ms": 5000
}
```

| Campo | O que controla |
|---|---|
| `enabled` | Liga/desliga o loop inteiro no projeto |
| `skip_on_classification` | Classificações que opt-out automaticamente (default: `["MICRO"]`) |
| `auto_promote_threshold` | Quantas evidências um learning precisa para ser promovido automaticamente |
| `staleness_window_features_min` | Mínimo de features fechadas para calcular janela de staleness |
| `timeout_ms` | Timeout da destilação em foreground (default: 5000ms) |

> **Aviso:** `aioson update` atualmente **sobrescreve** este arquivo (política do installer). Faça backup de customizações antes de rodar `aioson update`. Veja [Troubleshooting](./troubleshooting.md#aioson-update-sobrescreve-learning-loopjson).

---

## Status

A feature `active-learning-loop` foi entregue em 6 fases:

| Fase | Slug | Entrega | Status |
|---|---|---|---|
| 1 | `telemetry-foundation` | CLI `context:load` + eventos `rule_loaded`/`brain_loaded` | PASS |
| 2 | `memory-search-fts5` | CLI `memory:search` + índice FTS5 BM25 | PASS |
| 3 | `memory-archive-with-evolution-log` | CLI `memory:archive` + `memory:restore` + `evolution_log` | PASS |
| 4 | `doctor-curation-checks` | 3 novos checks: staleness, orphans, distillation lag | PASS |
| 5 | `feature-close-distillation-hook` | Hook em `feature:close` + destilação foreground | PASS |
| 6 | `inception-mirror-parity` | Validação de paridade `src/` ↔ `template/src/` | PASS |

112/112 testes determinísticos passando. QA aprovado.

Artefatos de especificação (arquivados):
- [PRD](../../.aioson/context/done/active-learning-loop/prd-active-learning-loop.md)
- [Spec](../../.aioson/context/done/active-learning-loop/spec-active-learning-loop.md)
- [Arquitetura](../../.aioson/context/done/active-learning-loop/architecture-active-learning-loop.md)
