---
feature: living-memory
classification: MEDIUM
gate_design: approved
phase_gates:
  design: approved
  plan: pending
  execution: pending
active_phase: 0
last_updated: "2026-05-11"
language: pt-BR
---

# Spec — Living Memory

> Memória de feature: decisões já tomadas, dependências, estado do desenvolvimento.
> Arquitetura completa em `architecture-living-memory.md`.

## Decisões fechadas

| # | Decisão | Justificativa |
|---|---|---|
| D1 | Nome canônico da feature: `living-memory` | Consistente com `secure-by-default`, `harness-driven-aioson` |
| D2 | Estender `autonomy-protocol.json` v1.0 → v1.1 com `tiers` (não criar arquivo novo) | Source of truth única; backward compat via detecção de versão |
| D3 | Reusar manifests `*.manifest.json` existentes; adicionar capability `reflect_memory` em dev/qa/deyvin | Reusa schema canônico, evita mecanismo paralelo |
| D4 | Arquitetura em arquivo separado `architecture-living-memory.md` | `architecture.md` atual é da feature `secure-by-default` |
| D5 | `aioson notify` é wrapper visual sobre `runtime:emit` (não duplica lógica) | Reuso máximo da pipeline existente |
| D6 | Reflexão semântica acontece **dentro da sessão do harness** (Claude Code, Codex, Gemini, OpenCode) | Zero chamada LLM direta do CLI; harness-agnostic |
| D7 | Heurística **determinística** (sem LLM) decide se reflexão dispara | Sem custo, previsível, registrada em `runtime:emit` |

## Heurística de relevância (resumo)

Verdict `relevant` se qualquer:
- `routes/`, `controllers/`, `pages/api/`, `app/api/` tocados
- `models/`, `migrations/`, `prisma/schema.prisma`, `app/Models/` tocados
- `.aioson/context/prd-*.md`, `features.md`, `requirements-*.md` tocados
- `bootstrap/current-state.md` diff contém adição
- ≥10 arquivos E ≥200 linhas alteradas

Caso contrário: `skip`.

## Estado de implementação

### Fase 0 — Correções urgentes do template ✅ COMPLETA
**Concluída em:** 2026-05-11

- ✅ F0.1: `template/.claude/commands/aioson/agent/discover.md` criado
- ✅ F0.2a: `template/.gemini/commands/aios-discover.toml` criado
- ✅ F0.2b: `template/OPENCODE.md` atualizado com `discover` na lista de agentes
- ✅ F0.2c: Codex (AGENTS.md) já listava `@discover` — sem ação necessária
- ✅ F0.3: `src/constants.js` atualizado:
  - `MANAGED_FILES` ganhou `aios-discover.toml` e `agents/discover.md`
  - `REQUIRED_FILES` ganhou `aios-discover.toml`, `agents/discover.md` e 4 representantes de `.claude/commands/aioson/agent/*` (setup, discover, dev, qa)
  - `AGENT_DEFINITIONS` ganhou entrada para `discover`
- ✅ F0.4: Validação no atendimento:
  - `aioson update --all .` copiou 489 arquivos, 118 backups
  - Slash command `/discover` agora existe em `.claude/commands/` e `.gemini/commands/`
  - `aioson doctor .` no atendimento agora reporta apenas 1 issue pré-existente (`OPENCODE.md`)
- ✅ Testes: 2151/2154 passam. 3 falhas pré-existentes (confirmado via `git stash`).
- ✅ Inception sync: `.gemini/commands/aios-discover.toml` também copiado para a raiz do source (`/home/jaime/MyProjects/aioson/.gemini/commands/`).

### Fase 1 — Reflexão In-Harness ⏳ PENDENTE
Próxima a executar.

- F1.1 — `src/memory-reflect-engine.js` (heurística + builder + validator)
- F1.2 — `src/commands/memory-reflect-prepare.js`
- F1.3 — `src/commands/memory-reflect-commit.js`
- F1.4 — `template/.aioson/templates/reflect-prompts/*.md`
- F1.5 — Roteador em `src/commands/memory.js`
- F1.6 — Testes (6 cenários)

### Fase 2 — Autonomy Contract estendido ⏳ PENDENTE
Pode ir em paralelo com F1.

### Fase 3 — Integração nos agentes ⏳ PENDENTE
Depende de F1 + F2.

### Fase 4 — Doctor expandido ⏳ PENDENTE
Independente. Estende o que foi feito em F0.3.

### Fase 5 — Documentação pt-BR (`docs/pt/`) ⏳ PENDENTE
Por último.

## Arquivos tocados na Fase 0

```
A  template/.claude/commands/aioson/agent/discover.md
A  template/.gemini/commands/aios-discover.toml
A  .gemini/commands/aios-discover.toml  (inception sync)
M  template/OPENCODE.md                  (+1 linha: discover na lista)
M  src/constants.js                      (+11 linhas distribuídas)
```

## Dependências

- `.aioson/context/architecture-living-memory.md` — fonte canônica da arquitetura
- `.aioson/config/autonomy-protocol.json` v1.0 — será estendido em F2 (não tocado em F0)
- `src/installer.js` — será estendido em F2 (não tocado em F0)
- `src/commands/workflow-next.js` — será estendido em F3 (não tocado em F0)

## Não-decisões registradas (deferred)

- **Sandbox real de execução por tier** — fora de escopo, fica para feature `harness-isolation` futura
- **Chamada LLM direta do CLI** (`memory:refresh-llm`) — opt-in standalone, não automatizado
- **Reflexão cross-feature** — escopo limitado a estado do projeto, não consolida múltiplas features simultaneamente

## Próximo passo

Iniciar **Fase 1** (Reflexão In-Harness). Caminho crítico: criar `memory-reflect-engine.js` com heurística + buildPrompt + validate, depois os dois sub-comandos `memory:reflect-prepare/commit`. ~6 horas de trabalho.
