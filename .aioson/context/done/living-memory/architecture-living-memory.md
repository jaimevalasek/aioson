---
feature: living-memory
classification: MEDIUM
generated_by: architect
generated_at: "2026-05-11"
gate_b: pending
extends: architecture.md
language: pt-BR
---

# Architecture — Living Memory & Autonomy Contract

## 1. Architecture Overview

A feature `living-memory` introduz três capacidades coordenadas no motor AIOSON:
**(a) Reflexão semântica in-harness** — após cada sessão significativa, o agente atualiza `.aioson/context/bootstrap/*.md` comparando estado anterior vs mudanças, removendo o obsoleto;
**(b) Autonomy Contract com tiers** — estende `autonomy-protocol.json` declarando 3 tiers (auto-silencioso / auto-notificado / bloqueia-usuário) que se materializam em permissões nativas de cada harness;
**(c) Notificações inline** — wrapper visual sobre `runtime:emit` para transparência sem fricção.

A arquitetura **estende** primitivas existentes (`workflow:next`, `runtime:emit`, manifests, autonomy-protocol). Nenhum motor novo. Nenhum arquivo de memória novo — `bootstrap/` já é o destino canônico.

## 2. Non-Negotiable Constraints

Herdados do bootstrap (`how-it-works.md § Current architectural direction`):

- Estender `workflow:next` / `workflow:execute`; não criar segundo motor de orquestração.
- Manter `workflow.state.json` como única fonte de verdade de stage.
- `parallel:guard` continua como preflight contract (não vira sandbox enforcement).
- CLI/runtime é dono de transições determinísticas; prompts não rederivam estado mecânico.

Específicos desta feature:

- **Zero chamada LLM direta do CLI**. A reflexão semântica acontece dentro da sessão do harness (Claude Code, Codex, Gemini, OpenCode) usando o LLM que já está pago. Fallback determinístico cobre o resto.
- **Source of truth única**: `autonomy-protocol.json` é o canônico; permissões nativas por harness são **derivadas** dele.
- **Compat com projetos pré-feature**: ausência de `bootstrap/` não quebra agente — degrada com warning explícito (não silently).

## 3. Folder/Module Structure

Stack: Node.js CLI. Classification: MEDIUM. Reuso máximo dos módulos existentes.

### Novos módulos
```
src/
├── memory-reflect-engine.js         ← heurística + builder de prompt + validador
├── permissions-generator.js          ← deriva configs nativos por harness
├── notify-renderer.js                ← ícones + cores no terminal
└── commands/
    ├── memory-reflect-prepare.js     ← sub-comando: prepara reflect-prompt.md
    ├── memory-reflect-commit.js      ← sub-comando: valida output do agente
    └── notify.js                     ← wrapper visual sobre runtime:emit
```

### Módulos modificados (extensão pontual)
```
src/
├── commands/
│   ├── memory.js                     ← adiciona sub-comandos reflect-* ao roteador
│   ├── workflow-next.js              ← hook pós-completion → dispara reflect se heurística aprova
│   ├── agent.js                      ← agent:done consulta heurística
│   └── doctor.js                     ← novos checks: bootstrap coverage, features dir, .claude/commands
├── installer.js                      ← chama permissions-generator no update/setup
└── runtime-store.js                  ← novo event_type: 'memory_reflect'
```

### Novos templates e configs
```
template/
├── .aioson/
│   ├── config/
│   │   └── autonomy-protocol.json    ← estendido com schema de tiers
│   ├── templates/
│   │   └── reflect-prompts/
│   │       ├── current-state.md      ← prompt de reflexão para current-state.md
│   │       ├── how-it-works.md       ← prompt de reflexão para how-it-works.md
│   │       └── what-it-does.md       ← prompt de reflexão para what-it-does.md
│   ├── docs/
│   │   └── autonomy-protocol.md      ← doc on-demand para agentes
│   └── agents/
│       ├── manifests/
│       │   ├── dev.manifest.json     ← adiciona capability reflect_memory
│       │   ├── qa.manifest.json      ← idem
│       │   └── deyvin.manifest.json  ← novo manifest
│       └── deyvin.md                 ← +12 linhas: Step 0 gate + reflection protocol
│       └── dev.md                    ← idem
│       └── qa.md                     ← idem
└── .claude/commands/aioson/agent/
    └── discover.md                   ← faltava — bug fix da Fase 0
```

### Documentação (Fase 5)
```
docs/pt/
├── README.md                         ← índice + visão geral
├── memoria-viva.md                   ← conceito completo
├── reflexao-in-harness.md            ← pipeline técnica
├── autonomy-contract.md              ← 3 tiers, lista de comandos
├── notificacoes-info.md              ← sistema notify, levels
├── troubleshooting.md                ← diagnósticos comuns
└── diagramas.md                      ← fluxos ASCII/Mermaid
```

## 4. Models and Relationships

### 4.1 Schema estendido — `autonomy-protocol.json`

```json
{
  "version": "1.1",
  "global_mode": "guarded",
  "tiers": {
    "tier1_silent": {
      "description": "Read-only e telemetria interna. Auto-execute sem notificação.",
      "shell_patterns": ["git diff *", "git log *", "git status", "ls *", "cat *"],
      "aioson_commands": [
        "preflight", "preflight:context", "context:health", "context:validate",
        "memory:status", "memory:summary", "workflow:status",
        "runtime:emit", "agent:done", "brain:query", "doctor"
      ]
    },
    "tier2_notified": {
      "description": "Mudanças em memória do framework. Auto + notify inline.",
      "shell_patterns": [],
      "aioson_commands": [
        "memory:reflect-prepare", "memory:reflect-commit", "memory:refresh",
        "workflow:next", "workflow:heal", "live:handoff",
        "dossier:add-codemap", "dossier:add-finding", "dossier:link-rule"
      ],
      "write_paths": [
        ".aioson/context/bootstrap/**",
        ".aioson/context/features/**",
        ".aioson/runtime/**"
      ]
    },
    "tier3_blocking": {
      "description": "Operações irreversíveis ou externas. Bloqueia e pede ação.",
      "shell_patterns": [
        "git push *", "git reset --hard *", "rm -rf *",
        "npm publish *", "curl * | sh"
      ],
      "aioson_commands": [
        "cloud:publish:*", "genome:publish", "skill:publish", "squad:publish"
      ]
    }
  },
  "tools": {
    "claude": {
      "mode": "trusted",
      "derived_from_tiers": ["tier1_silent", "tier2_notified"],
      "fallback_mode": "guarded",
      "requires_tty": false,
      "max_auto_retries": 3
    },
    "codex":   { "mode": "trusted",  "derived_from_tiers": ["tier1_silent", "tier2_notified"], "requires_tty": false, "max_auto_retries": 3 },
    "gemini":  { "mode": "guarded",  "derived_from_tiers": ["tier1_silent"],                    "requires_tty": true,  "max_auto_retries": 1 },
    "opencode":{ "mode": "guarded",  "derived_from_tiers": ["tier1_silent"],                    "requires_tty": true,  "max_auto_retries": 0 }
  },
  "agents": {
    "committer": { "max_mode": "guarded" }
  }
}
```

**Backward compat:** versão `1.0` (sem `tiers`) continua válida. `permissions-generator` detecta versão; quando `1.1`, deriva whitelists dos tiers; quando `1.0`, lê whitelists diretas.

### 4.2 Reflect prompt manifest — `.aioson/runtime/reflect-prompt.json`

Gerado por `memory:reflect-prepare`, consumido pelo agente in-harness, validado por `memory:reflect-commit`.

```json
{
  "session_id": "dev-2026-05-11T14:30:00Z",
  "trigger_agent": "dev",
  "git_range": "HEAD~3..HEAD",
  "heuristic_verdict": "relevant",
  "heuristic_reasons": [
    "src/routes/*.js touched (3 files)",
    "features.md modified"
  ],
  "current_bootstrap_snapshot": {
    "what-is.md": "...",
    "how-it-works.md": "...",
    "what-it-does.md": "...",
    "current-state.md": "..."
  },
  "diff_summary": "...",
  "devlog_excerpts": [...],
  "instructions": "Edit current-state.md and what-it-does.md. Remove obsolete entries. Add new capabilities. Update generated_at.",
  "validation_rules": {
    "must_have_frontmatter": true,
    "must_update_generated_at": true,
    "must_diff_content": true
  }
}
```

### 4.3 Capability `reflect_memory` no manifest do agente

```json
{
  "id": "reflect_memory",
  "category": "transform",
  "description": "Update bootstrap/*.md based on session changes; remove obsolete entries.",
  "inputs": [
    { "type": "artifact", "path_pattern": ".aioson/runtime/reflect-prompt.json", "required": true },
    { "type": "artifact", "path_pattern": ".aioson/context/bootstrap/*.md", "required": false }
  ],
  "outputs": [
    { "type": "artifact", "path_pattern": ".aioson/context/bootstrap/current-state.md" },
    { "type": "artifact", "path_pattern": ".aioson/context/bootstrap/what-it-does.md" },
    { "type": "event",    "path_pattern": "runtime:memory_reflect" }
  ],
  "trigger": "post_agent_done",
  "tier": "tier2_notified"
}
```

## 5. Integration Architecture

### 5.1 Heurística de relevância (`memory-reflect-engine`)

Determinística, sem LLM. Roda em `agent:done` ou em `workflow:next --complete`.

**Verdict `relevant`** se qualquer um dos critérios bate:

| Critério | Detecção |
|---|---|
| Mudou rotas/handlers | `git diff --name-only` contém `routes/`, `controllers/`, `pages/api/`, `app/api/` |
| Mudou models/migrations | contém `models/`, `migrations/`, `prisma/schema.prisma`, `app/Models/` |
| Mudou contratos de domínio | contém `.aioson/context/prd-*.md`, `features.md`, `requirements-*.md` |
| Adicionou capacidade nova | diff de `bootstrap/current-state.md` da última reflexão contém adição |
| Volume significativo | ≥ 10 arquivos tocados E ≥ 200 linhas alteradas |

**Verdict `skip`** quando todos os critérios são falsos. Exemplos típicos: ajuste CSS, typo em README, refactor de testes sem mudança comportamental.

Saída: `{ verdict: "relevant" | "skip", reasons: string[] }`. Registrada em `runtime:emit` antes de qualquer ação.

### 5.2 Hook em `workflow:next --complete`

```
workflow:next --complete=<agent>
  ├─ valida handoff contract (existente)
  ├─ executa gates técnicos (existente)
  ├─ grava last-handoff.json + handoff-protocol.json (existente)
  ├─ [NOVO] memory-reflect-engine.evaluate(targetDir, agent)
  │   ├─ verdict=skip       → seguir fluxo normal
  │   └─ verdict=relevant   → gerar reflect-prompt.json + notify tier2
  │                          → injetar instrução no prompt do próximo turno
  │                            "Antes de qualquer outra ação, leia
  │                             .aioson/runtime/reflect-prompt.json e
  │                             atualize bootstrap/*.md conforme instruído.
  │                             Depois rode: aioson memory:reflect-commit ."
  └─ advance workflow state
```

A injeção da instrução acontece pelo mecanismo de prompt injection que `workflow:next` já usa para outras instruções (lifecycle, agent:done, etc.).

### 5.3 Sync de permissões nativas (`permissions-generator`)

Chamado por `aioson update` e `aioson setup` após instalar o template.

| Harness | Arquivo gerado | Estratégia |
|---|---|---|
| Claude Code | `.claude/settings.json` → `permissions.allow[]` | Concatena `shell_patterns` + `aioson_commands` dos tiers derivados |
| Codex CLI | `.codex/permissions.json` | Formato JSON nativo do Codex |
| Gemini CLI | `.gemini/permissions.toml` | TOML por capability |
| OpenCode | `.opencode/permissions.yaml` | YAML por capability |

Idempotente: regenera sempre baseado no canônico, com backup do anterior em `.aioson/backups/{ts}/permissions/`.

### 5.4 Sistema de notify

```bash
aioson notify --level=info  --topic=memory  --message="Atualizando bootstrap após mudanças em src/routes/"
aioson notify --level=warn  --topic=bootstrap --message="Bootstrap stale há 35 dias"
aioson notify --level=block --topic=git --message="Push manual necessário: git push origin main"
```

Internamente:
1. Chama `runtime:emit` (registra em SQLite)
2. Renderiza no stdout com prefixo visual:
   ```
   ℹ [memory]    Atualizando bootstrap após mudanças em src/routes/
   ⚠ [bootstrap] Bootstrap stale há 35 dias
   ⛔ [git]      Push manual necessário: git push origin main
   ```
3. Em `level=block`, retorna exit code 2 (sinaliza que sessão deve esperar humano).

## 6. Cross-Cutting Concerns

### Segurança
- `tier3_blocking` nunca pode ser bypassed via `derived_from_tiers`. Validado no permissions-generator.
- `reflect-commit` valida que o agente **não** sobrescreveu seções fora de `bootstrap/*.md`. Qualquer escrita fora é rejeitada com exit code 2.
- Diff hash de `current_bootstrap_snapshot` no reflect-prompt.json. Se o snapshot mudou entre prepare e commit (concorrência), abort.

### Observabilidade
- Novo `event_type` em `runtime_events`: `memory_reflect_prepared`, `memory_reflect_committed`, `memory_reflect_skipped`.
- Dashboard exibe linha do tempo de reflexões por feature.
- `aioson memory:status` ganha campo `last_reflect_at` e `reflects_count_30d`.

### Backward compatibility
- Projetos com `autonomy-protocol.json` v1.0 continuam funcionando. `permissions-generator` detecta versão e usa fallback.
- Projetos sem `bootstrap/` recebem warning (não erro) no Step 0 do agente. Sugere `/discover`.
- `aioson update --all` em projeto antigo: instala template novo + roda `permissions-generator` + sugere `/discover` se bootstrap 0/4.

### Tratamento de erros
- Se `memory:reflect-prepare` falhar (git não disponível, devlog ausente): emite warning, segue fluxo normal sem reflexão.
- Se `memory:reflect-commit` falhar validação: o agente recebe diagnóstico estruturado e tem 1 retry. Após 2 falhas, agent:done procede sem reflexão e registra `memory_reflect_failed`.
- Se harness não suporta tier2 (gemini/opencode default): notify roda mas execução fica em modo guarded.

## 7. Implementation Sequence for @dev

### Fase 0 — Correções urgentes do template (0.5 sessão)
**Dependências:** nenhuma.

- F0.1 — Criar `template/.claude/commands/aioson/agent/discover.md` (5 linhas, padrão dos outros slashes).
- F0.2 — Adicionar `discover.md` ao Codex/Gemini/OpenCode commands (formato nativo de cada).
- F0.3 — Em `src/doctor.js`, adicionar checks para `.claude/commands/aioson/agent/*` (hoje só checa `.gemini/`).
- F0.4 — Teste: `aioson update --all` em `/home/jaime/aioson-squads/atendimento` cria os slashes.

**Critério de aceite:** rodar `/discover` no atendimento abre o agente.

### Fase 1 — Reflexão In-Harness (2 sessões)
**Dependências:** F0 completa.

- F1.1 — `src/memory-reflect-engine.js`: `evaluate()`, `buildPrompt()`, `validate()`. ~300 linhas.
- F1.2 — `src/commands/memory-reflect-prepare.js`: roteia para engine, escreve `reflect-prompt.json`.
- F1.3 — `src/commands/memory-reflect-commit.js`: lê output do agente, valida, atualiza `bootstrap/*.md`, registra event.
- F1.4 — Templates de prompt em `template/.aioson/templates/reflect-prompts/`.
- F1.5 — Adicionar sub-comandos ao roteador de `src/commands/memory.js`.
- F1.6 — Tests: 6 cenários (verdict relevant/skip, validation pass/fail, concurrency, missing bootstrap).

**Critério de aceite:** `aioson memory:reflect-prepare . --agent=dev` gera reflect-prompt.json válido contra fixture de teste.

### Fase 2 — Autonomy Contract estendido (1.5 sessão)
**Dependências:** independente de F1; pode ir em paralelo.

- F2.1 — Estender `template/.aioson/config/autonomy-protocol.json` com `tiers` (schema v1.1).
- F2.2 — `src/permissions-generator.js`: lê protocol, gera 4 arquivos nativos.
- F2.3 — Hook em `src/installer.js` (final do `installTemplate`) chama generator.
- F2.4 — `src/notify-renderer.js` + `src/commands/notify.js`.
- F2.5 — Tests: snapshot de cada um dos 4 arquivos gerados; tier3 não-bypassable.

**Critério de aceite:** `aioson update .` em projeto teste regenera `.claude/settings.json` com tier1+tier2 commands no `permissions.allow[]`.

### Fase 3 — Integração nos agentes (1 sessão)
**Dependências:** F1 + F2 completas.

- F3.1 — Adicionar capability `reflect_memory` em `dev.manifest.json` e `qa.manifest.json`.
- F3.2 — Criar `deyvin.manifest.json`.
- F3.3 — Em `dev.md`, `qa.md`, `deyvin.md`: adicionar seção "Memory Reflection" (+12 linhas cada) com instrução determinística de como consumir reflect-prompt.json e rodar reflect-commit.
- F3.4 — Em `dev.md`, `qa.md`, `deyvin.md`: adicionar Step 0 gate (bloqueia se bootstrap coverage < 4 ou stale > 30d, sugere `/discover` ou `memory:refresh`).
- F3.5 — Hook em `src/commands/workflow-next.js`: após `--complete`, chamar engine; se relevant, injetar instrução no prompt do próximo agente.
- F3.6 — Hook em `src/commands/agent.js` (`agent:done`): em direct mode (sem workflow:next), mesma lógica.
- F3.7 — Criar doc on-demand `template/.aioson/docs/autonomy-protocol.md`.

**Critério de aceite:** sessão `/dev` que mudou `src/routes/` dispara reflexão automática e atualiza `bootstrap/current-state.md` sem intervenção humana.

### Fase 4 — Doctor expandido (1 sessão)
**Dependências:** F0 + F2 completas.

- F4.1 — Em `src/doctor.js`, adicionar checks:
  - `bootstrap_coverage` (0-4)
  - `features_dir_present`
  - `claude_commands_present` (`.claude/commands/aioson/agent/*`)
  - `version_drift` (aioson_version vs CLI)
  - `permissions_in_sync` (autonomy-protocol vs arquivos gerados)
- F4.2 — `doctor --fix` aplica auto-correções: regenera permissions, sugere `/discover`, cria slashes ausentes.
- F4.3 — Hint translations em `src/i18n/messages/{en,pt-BR,es,fr}/`.

**Critério de aceite:** `aioson doctor .` no atendimento (estado atual) reporta exatamente os 4 buracos identificados na análise (bootstrap 0/4, features/ ausente, .claude/commands/ ausente, version drift).

### Fase 5 — Documentação pt-BR (1.5 sessão)
**Dependências:** F1-F4 completas (para documentar comportamento real).

- F5.1 — `docs/pt/README.md` — visão geral + índice.
- F5.2 — `docs/pt/memoria-viva.md` — conceito, 4 camadas, ciclo de vida.
- F5.3 — `docs/pt/reflexao-in-harness.md` — pipeline, heurística, exemplos com commands reais.
- F5.4 — `docs/pt/autonomy-contract.md` — 3 tiers, comandos canônicos, como cada harness aplica.
- F5.5 — `docs/pt/notificacoes-info.md` — `aioson notify`, levels, dashboard integration.
- F5.6 — `docs/pt/troubleshooting.md` — receitas: bootstrap 0/4, agente parece burro, push bloqueado, etc.
- F5.7 — `docs/pt/diagramas.md` — fluxos ASCII (preferência) ou Mermaid.

**Critério de aceite:** leitor sem contexto consegue, lendo `docs/pt/README.md`, entender o que é Memória Viva e quais comandos rodar.

## 8. Explicit Non-Goals & Deferred Items

**Fora de escopo desta feature:**

- **Chamada LLM direta do CLI.** Comando `aioson memory:refresh-llm` (que abriria conexão SDK Anthropic) fica como item futuro, opt-in explícito, separado.
- **Reflection cross-feature.** A reflexão olha o estado do projeto, não consolida múltiplas features simultaneamente.
- **Memória conversacional persistente entre sessões.** Diferente de bootstrap (semântico) e devlog (episódico). Não construir agora.
- **Sandbox real de execução por tier.** Os tiers controlam *permissão*, não *isolamento*. Real sandbox fica para feature `harness-isolation`.
- **Auto-promoção de bootstrap para genome.** A pipeline atual `devlog:export-brains → learning:evolve` cobre patterns. Bootstrap fica em projeto.

**Deferred (com justificativa):**

- **UI dashboard para reflections** — depende de novos eventos em SQLite, espera Fase 4 (Doctor) para fechar contratos de telemetria.
- **`@deyvin.manifest.json` autonomy_modes=['trusted']** — manter `guarded` na primeira release; promover só após 30 dias de uso real.
- **Reflexão em outras línguas** — prompts em pt-BR e en. fr/es ficam após estabilizar.

## 9. Risk Register

| Risco | Prob | Impacto | Mitigação |
|---|---|---|---|
| Heurística marca relevant em sessão trivial (false positive) | M | Baixo (só atrasa 5s) | Threshold conservador, logs em `runtime:emit` permitem ajuste |
| Heurística marca skip em sessão importante (false negative) | M | Médio (memória desatualiza) | Doctor Fase 4 alerta quando stale > 30d, força refresh |
| Agente in-harness escreve fora de `bootstrap/` | B | Alto | Validação em `reflect-commit` rejeita escritas fora; backup pré-commit |
| Permissions gerados conflitam com edits manuais do usuário | B | Médio | Backup automático em `.aioson/backups/`; `doctor` detecta drift |
| Heurística falha em monorepos com paths não-padrão | M | Médio | `autonomy-protocol.json` permite override de `routes_patterns`, `models_patterns` por projeto (deferred) |

## 10. Handoff to @dev

**Pré-requisitos confirmados:**
- ✅ Bootstrap atualizado (4/4 confirmados via `aioson context:health`)
- ✅ Discovery existente (`discovery.md` em `.aioson/context/`)
- ✅ Design governance carregada (`.aioson/design-docs/*`, `.aioson/rules/*`)
- ✅ Manifests existentes lidos (`agents/manifests/*.manifest.json`)
- ✅ Constraints arquiteturais alinhadas com `bootstrap/how-it-works.md`

**Sequência sugerida para @dev:**
1. Começar pela **Fase 0** (correção mecânica de 30 min, destrava teste em projeto real).
2. Validar com `aioson update --all .` no atendimento e rodar `/discover` lá.
3. Após F0 verde, atacar **Fase 1** (reflexão) e **Fase 2** (autonomy contract) — podem ir em paralelo se houver dois devs.
4. **Fase 3** integra os dois — não começar antes de F1 + F2 verdes.
5. **Fases 4 e 5** podem ir em paralelo no final.

**Arquivos críticos para @dev consultar:**
- Este arquivo (`architecture-living-memory.md`)
- `.aioson/config/autonomy-protocol.json` (estado atual v1.0)
- `.aioson/agents/manifests/dev.manifest.json` (referência de schema)
- `.aioson/context/discovery.md` (módulos atuais)
- `.aioson/design-docs/folder-structure.md` (convenções de organização)
- `src/commands/workflow-next.js` (entry point para hook da Fase 3)

**Ordem de prioridade caso recursos sejam limitados:**
F0 > F1 > F4 > F2 > F3 > F5
(F4/doctor primeiro porque destrava diagnóstico do problema imediato no atendimento, mesmo sem reflexão completa.)

---

> **Gate B:** Architecture approved — @dev can proceed.
