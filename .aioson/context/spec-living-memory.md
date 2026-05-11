---
feature: living-memory
classification: MEDIUM
gate_design: approved
phase_gates:
  design: approved
  plan: pending
  execution: completed
active_phase: 5
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

### Fase 1 — Reflexão In-Harness ✅ COMPLETA
**Concluída em:** 2026-05-11

- ✅ F1.1 — `src/memory-reflect-engine.js` (evaluate + buildPrompt + validate, ~310 linhas, sem LLM, sem rede)
- ✅ F1.2 — `src/commands/memory-reflect-prepare.js` (lê estado, escreve `.aioson/runtime/reflect-prompt.json`)
- ✅ F1.3 — `src/commands/memory-reflect-commit.js` (valida output, escreve bootstrap, consome manifest)
- ✅ F1.4 — `template/.aioson/templates/reflect-prompts/{current-state,how-it-works,what-it-does}.md`
- ✅ F1.5 — Roteador: re-export em `src/commands/memory.js` + registro em `src/cli.js` (allowedCommands + dispatcher)
- ✅ F1.6 — Testes: `tests/memory-reflect-engine.test.js` (8 cenários: relevant, skip, validate pass/fail, snapshot drift, missing bootstrap, end-to-end prepare+commit, hash stability) — todos passam
- ✅ Critério de aceite: `aioson memory:reflect-prepare . --agent=dev --git-range=HEAD~1..HEAD` gera reflect-prompt.json válido contra fixture
- ✅ Regressão: 2159/2162 testes passam; 3 falhas pré-existentes (kernel size budget, json schema metadata) confirmadas no spec da Fase 0

### Fase 2 — Autonomy Contract estendido ✅ COMPLETA
**Concluída em:** 2026-05-11

- ✅ F2.1 — `template/.aioson/config/autonomy-protocol.json` estendido para schema v1.1 com `tiers` (tier1_silent/tier2_notified/tier3_blocking), `derived_from_tiers` por tool; inception-sync para workspace
- ✅ F2.2 — `src/permissions-generator.js` (~250 linhas): lê protocol, deriva 4 arquivos nativos (`.claude/settings.json`, `.codex/permissions.json`, `.gemini/permissions.toml`, `.opencode/permissions.yaml`); idempotente; backup em `.aioson/backups/{ts}/permissions/`; tier3 hard-rejected mesmo se listado em `derived_from_tiers`; merge preserva entradas user em `.claude/settings.json`
- ✅ F2.3 — `src/notify-renderer.js` (pure, prefixos ℹ/⚠/⛔) + `src/commands/notify.js` (wrapper sobre `runtime:emit` via `logAgentEvent`; exit code 2 em level=block via `process.exitCode`)
- ✅ F2.4 — Hook em `src/installer.js#installTemplate`: chama `generatePermissions` após `ensureProjectRuntime`; best-effort (não bloqueia install em falha)
- ✅ F2.5 — Roteador: `notify` adicionado em `allowedCommands` + dispatcher em `src/cli.js`
- ✅ F2.6 — Testes: `tests/permissions-generator.test.js` (11 cenários) + `tests/notify-command.test.js` (8 cenários) — todos passam
- ✅ Critério de aceite: `aioson setup .` em projeto vazio gera `.claude/settings.json` com `Bash(aioson preflight:*)` e zero referências a `git push`/`cloud:publish` (tier3)
- ✅ Regressão: 2178/2181 testes passam; mesmas 3 falhas pré-existentes da Fase 1

### Fase 3 — Integração nos agentes ✅ COMPLETA
**Concluída em:** 2026-05-11

- ✅ F3.1 — Capability `reflect_memory` em `dev.manifest.json` e `qa.manifest.json` (category=transform, tier=tier2_notified, trigger=post_agent_done)
- ✅ F3.2 — `deyvin.manifest.json` criado (aliases=[pair], capability pair_programming + reflect_memory)
- ✅ F3.3 — Seção "Memory reflection (post-session)" em dev.md / qa.md / deyvin.md, trimmed para 1 parágrafo conciso apontando para `.aioson/docs/autonomy-protocol.md`
- ✅ F3.4 — Step 0 (dev) / Step 0.1 (qa) / Bootstrap gate (deyvin): se coverage < 4 ou stale > 30d → warning `⚠ [bootstrap] coverage <N>/4 (...)` sugerindo `/discover` ou `aioson memory:refresh` (advisório, não bloqueia)
- ✅ F3.5 — Hook em `src/commands/workflow-next.js`: após `finalizeCurrentStage`, chama `runMemoryReflectPrepare` (best-effort, try/catch silencioso); se reflect-prompt.json existe pós-activation, prepend instrução `ℹ [memory] reflect-prompt.json pending...` na activation.prompt. Hook em `src/commands/runtime.js#runAgentDone` em ambos branches (live_event + standalone)
- ✅ F3.6 — `template/.aioson/docs/autonomy-protocol.md`: doc on-demand com tabela de tiers, conversão por harness, exemplos de notify, contrato de backward-compat, guia "adicionar novo comando a um tier"
- ✅ F3.7 — Inception sync (manifests + 3 agents + autonomy-protocol.md copiados para workspace). Testes: `tests/memory-reflect-integration.test.js` (2 cenários: agent:done dispara prepare em diff relevante; bootstrap missing não gera manifest)
- ✅ Critério de aceite: `agent:done` em projeto com bootstrap + diff de `src/routes/` gera reflect-prompt.json válido com `verdict=relevant` e targets corretos (validado em fixture node:test)
- ✅ Regressão: 2180/2183 testes passam; mesmas 3 falhas pré-existentes; dev.md trimmed para minimizar impacto no size budget

### Fase 4 — Doctor expandido ✅ COMPLETA
**Concluída em:** 2026-05-11

- ✅ F4.1 — Mapeada estrutura de `src/doctor.js` (checks array, hintKey opcional, applyDoctorFixes que itera actions)
- ✅ F4.2 — 5 novos checks com `severity: 'warning'`: `bootstrap_coverage` (0-4), `features_dir_present`, `claude_commands_present` (4 slashes obrigatórios), `version_drift` (project.context aioson_version vs getCliVersion), `permissions_in_sync` (compara mtime do protocol vs arquivos gerados, restrito aos tools declarados)
- ✅ F4.3 — 5 ações em `applyDoctorFixes`: `claude_commands` (restaura do template), `features_dir` (mkdir), `permissions_in_sync` (chama `generatePermissions`), `bootstrap_coverage` + `version_drift` (advisory only, sem auto-fix)
- ✅ F4.4 — i18n hints + ações em en/pt-BR/es/fr (10 chaves por idioma × 4 idiomas)
- ✅ Severity model: novos checks são `warning` — falham individualmente mas não afetam `report.ok` (preserva backward-compat com testes existentes do doctor); novo campo `warningCount` separado de `errorCount`
- ✅ Testes: `tests/doctor-living-memory.test.js` (10 cenários) — bootstrap fail/pass, features dir fix end-to-end, claude commands report missing + restore, version drift detect + null context, permissions drift detect + regen, advisory actions sem auto-fix; **todos passam**
- ✅ Critério de aceite: `aioson doctor .` em projeto teste com bootstrap 0/4 + sem .claude/commands/aioson/agent/discover + sem features/ reporta exatamente esses 3 issues (validado via `/tmp/doctor-smoke`)
- ✅ Regressão: 2190/2193 testes passam; mesmas 3 falhas pré-existentes

### Fase 5 — Documentação pt-BR ✅ COMPLETA
**Concluída em:** 2026-05-11

- ✅ F5.1 — `docs/pt/living-memory/README.md` (~80 linhas): índice + comandos canônicos + status das fases + onde os artefatos vivem
- ✅ F5.2 — `docs/pt/living-memory/memoria-viva.md` (~140 linhas): conceito, 4 camadas (bootstrap/devlog/brain/runtime), ciclo de vida em 8 passos, heurística, integração com o AIOSON maior
- ✅ F5.3 — `docs/pt/living-memory/reflexao-in-harness.md` (~220 linhas): pipeline técnica com exemplos JSON reais, validation rules, exemplo end-to-end shell, telemetria
- ✅ F5.4 — `docs/pt/living-memory/autonomy-contract.md` (~205 linhas): 3 tiers, schema v1.1, conversão por harness (Claude/Codex/Gemini/OpenCode), backward-compat v1.0, adicionar comando
- ✅ F5.5 — `docs/pt/living-memory/notificacoes-info.md` (~140 linhas): sintaxe, 3 levels, exit codes, SQLite, dashboard, casos de uso, quando NÃO usar
- ✅ F5.6 — `docs/pt/living-memory/troubleshooting.md` (~285 linhas): 11 receitas práticas + tabela de comandos de emergência
- ✅ F5.7 — `docs/pt/living-memory/diagramas.md` (~365 linhas): 7 diagramas ASCII (sessão completa, hook workflow:next, geração permissões, ciclo doctor --fix, manifest, severity model, telemetria)
- ✅ Link adicionado em `docs/pt/README.md` na seção "Destaques de 5-referencia"
- ✅ Critério de aceite: leitor sem contexto, lendo `docs/pt/living-memory/README.md`, identifica qual doc ler para sua necessidade e roda comandos canônicos
- ✅ Pasta dedicada `docs/pt/living-memory/` (decisão: manter coeso em vez de espalhar pelos subdirs existentes — feature inteira em um lugar)

## Status final da feature

**Feature `living-memory` ENTREGUE em 5 fases, 2026-04 a 2026-05.**

Suite total: **2190/2193** testes passam (3 falhas pré-existentes confirmadas via git stash desde Fase 0: kernel size budget + 2 schemas).

Total de testes novos somados nas 5 fases: **39**
- Fase 1: 8 (engine + commands)
- Fase 2: 19 (permissions-generator + notify)
- Fase 3: 2 (integration)
- Fase 4: 10 (doctor checks + fixes)
- Fase 5: 0 (docs)

Total de linhas de produção: ~1100 linhas (engine, generator, notify, doctor extensions, hooks).
Total de linhas de doc: ~1440 linhas pt-BR.

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

✅ Feature `living-memory` completa. Próximos candidatos:
- Promover `autonomy-protocol.json` v1.1 como default em todos projetos consumidores via `aioson update --all` (caminho conhecido — sem novo dev).
- Telemetria de adoção: queries em SQLite para medir quantas reflexões dispararam / quantas foram skip / quantas falharam em diferentes projetos.
- Bug-fix do test #15 (dev.md kernel size > 15KB) — pré-existente desde antes da feature, mas piorou +1KB com Memory Reflection section. Caminho: extrair `## Built-in dev modules` para doc on-demand.
- Próximo feature: `harness-isolation` (deferred da Fase 4) — sandbox real de execução por tier, não só permissão.

## Arquivos tocados na Fase 1

```
A  src/memory-reflect-engine.js                                  (~310 linhas)
A  src/commands/memory-reflect-prepare.js                        (~95 linhas)
A  src/commands/memory-reflect-commit.js                         (~115 linhas)
A  template/.aioson/templates/reflect-prompts/current-state.md
A  template/.aioson/templates/reflect-prompts/how-it-works.md
A  template/.aioson/templates/reflect-prompts/what-it-does.md
A  tests/memory-reflect-engine.test.js                           (8 cenários)
M  src/commands/memory.js                                        (+10 linhas: re-export)
M  src/cli.js                                                    (+~12 linhas: require, allowedCommands, dispatcher)
```

## Arquivos tocados na Fase 2

```
A  src/permissions-generator.js                                  (~250 linhas)
A  src/notify-renderer.js                                        (~30 linhas)
A  src/commands/notify.js                                        (~70 linhas)
A  tests/permissions-generator.test.js                           (11 cenários)
A  tests/notify-command.test.js                                  (8 cenários)
M  template/.aioson/config/autonomy-protocol.json                (v1.0 → v1.1, +blocos tiers + derived_from_tiers)
M  .aioson/config/autonomy-protocol.json                         (inception sync)
M  src/installer.js                                              (+~13 linhas: require + hook + permissions no return)
M  src/cli.js                                                    (+~5 linhas: require, allowedCommands, dispatcher)
```

## Arquivos tocados na Fase 3

```
A  template/.aioson/agents/manifests/deyvin.manifest.json        (novo)
A  template/.aioson/docs/autonomy-protocol.md                    (~110 linhas, doc on-demand)
A  tests/memory-reflect-integration.test.js                      (2 cenários)
M  template/.aioson/agents/manifests/dev.manifest.json           (+capability reflect_memory)
M  template/.aioson/agents/manifests/qa.manifest.json            (+capability reflect_memory)
M  template/.aioson/agents/dev.md                                (+Step 0.1 bootstrap gate + Memory reflection section)
M  template/.aioson/agents/qa.md                                 (+bootstrap gate + Memory reflection section)
M  template/.aioson/agents/deyvin.md                             (+bootstrap gate + Memory reflection section)
M  src/commands/workflow-next.js                                 (+~25 linhas: require + 2 hooks)
M  src/commands/runtime.js                                       (+~15 linhas: require + hooks em ambos returns de runAgentDone)
M  .aioson/agents/{manifests,*.md}                               (inception sync)
M  .aioson/docs/autonomy-protocol.md                             (inception sync)
```

## Arquivos tocados na Fase 4

```
A  tests/doctor-living-memory.test.js                            (10 cenários)
M  src/doctor.js                                                 (+~150 linhas: 3 helpers + 5 checks + 5 fix actions; severity='warning' nos novos checks; livingMemory shape no return)
M  src/i18n/messages/en.js                                       (+15 chaves: 5 fix_action + 5 check labels + 5 hints)
M  src/i18n/messages/pt-BR.js                                    (idem, traduzido)
M  src/i18n/messages/es.js                                       (idem, traduzido)
M  src/i18n/messages/fr.js                                       (idem, traduzido)
```

## Arquivos tocados na Fase 5

```
A  docs/pt/living-memory/README.md                               (~80 linhas, índice)
A  docs/pt/living-memory/memoria-viva.md                         (~140 linhas, conceito)
A  docs/pt/living-memory/reflexao-in-harness.md                  (~220 linhas, pipeline)
A  docs/pt/living-memory/autonomy-contract.md                    (~205 linhas, 3 tiers)
A  docs/pt/living-memory/notificacoes-info.md                    (~140 linhas, notify)
A  docs/pt/living-memory/troubleshooting.md                      (~285 linhas, 11 receitas)
A  docs/pt/living-memory/diagramas.md                            (~365 linhas, 7 fluxos ASCII)
M  docs/pt/README.md                                             (+1 linha: link para living-memory)
```

## Decisões registradas na Fase 1

- D8 — Engine é pure module sem LLM/rede; eventos `memory_reflect_*` são emitidos pelas commands via `logAgentEvent`, não pela engine.
- D9 — Manifest carrega `snapshot_hash` (SHA-256 dos 4 arquivos de bootstrap) e `validation_rules.allowed_paths` — `reflect-commit` rejeita escrita fora desses paths e detecta concorrência via hash mismatch.
- D10 — Targets são derivados das signals: rotas/models → `how-it-works.md` + `current-state.md`; PRD/features → `what-it-does.md` + `current-state.md`; fallback → `current-state.md`.
- D11 — Manifest é consumido (deletado) após commit bem-sucedido para evitar reuso acidental.
- D12 — Range default `HEAD~3..HEAD`; falha silenciosa cai para `git diff HEAD` (working tree).

## Decisões registradas na Fase 2

- D13 — Tier3 é hard-rejected na `resolveToolSets`: mesmo que um tool liste `tier3_blocking` em `derived_from_tiers`, o generator filtra. Validado por teste dedicado.
- D14 — `.claude/settings.json` faz **merge** com entradas existentes (preserva customizações user). `.codex/.gemini/.opencode` são **sobrescritos** (com backup) — formato gerado é o único contrato esperado pelo harness.
- D15 — Conversão de patterns para Claude: `"<prefix> *"` → `Bash(<prefix>:*)`; exato → `Bash(<exact>)`; comandos aioson → `Bash(aioson <cmd>:*)`.
- D16 — Backward-compat v1.0: se protocol não tem `tiers` ou tool não tem `derived_from_tiers`, generator usa `shell_whitelist`/`aioson_whitelist` legados — projetos antigos continuam funcionando após update.
- D17 — Hook do installer é **best-effort**: falha em `generatePermissions` é capturada e reportada em `result.permissions.error`, mas não aborta a instalação.
- D18 — `notify --level=block` exit code 2 via `process.exitCode` (não `process.exit()` síncrono) — permite que o CLI driver complete o ciclo normal de logging/cleanup antes de encerrar.

## Decisões registradas na Fase 3

- D19 — Reflexão é **prompt-driven** (não tool-driven): o CLI escreve `.aioson/runtime/reflect-prompt.json`; o agente lê e age via sua seção "Memory reflection". Engine nunca é chamado de dentro do prompt do agente.
- D20 — Hook em `workflow-next.js` e `runAgentDone` é **best-effort silencioso** (try/catch sem log). Reflexão nunca pode bloquear handoff ou finalização de agente.
- D21 — `workflow-next.js` prependa instrução `ℹ [memory] reflect-prompt.json pending...` à `activation.prompt` quando manifest existe pós-completion. Em direct mode (runAgentDone), o agente seguinte detecta via Step 0 do seu próprio session protocol.
- D22 — Bootstrap gate é **advisório** (warning, não bloqueio). Razão: muitos projetos legados/greenfield ainda não rodaram `/discover` e seria muito agressivo bloquear todo o ciclo de dev/qa por isso.
- D23 — Seções "Memory reflection" em dev.md/qa.md/deyvin.md foram trimadas a 1 parágrafo (~500 bytes) apontando para `.aioson/docs/autonomy-protocol.md` para minimizar impacto no size budget (test #15 já é pré-existente, mas não queremos piorar mais).
- D24 — `deyvin.manifest.json` foi criado novo (sem manifest anterior) — primeiro manifest formal de um agente non-workflow (continuity-first).

## Decisões registradas na Fase 4

- D25 — Novos checks usam `severity: 'warning'` (vs default `'error'`). `report.ok` considera apenas errors → backward-compat com testes existentes do doctor que esperavam `ok=true` pós-install. `failedCount` continua somando ambos para o usuário ver o total.
- D26 — `assessPermissionsSync` só verifica tools declarados em `tools` do protocol — arquivos órfãos de installs anteriores (ex: `.gemini/permissions.toml` quando gemini foi removido do protocol) NÃO contam como drift.
- D27 — `bootstrap_coverage` e `version_drift` são **advisory only** no fix — não há auto-fix porque bootstrap é semântico (precisa LLM via `/discover`) e version drift requer decisão humana (atualizar CLI vs ajustar context). Ações marcadas com `advisory: true` para o renderer.
- D28 — i18n hints são **acionáveis**: cada hint nomeia o comando exato a rodar (`aioson doctor . --fix`, `/discover`, `npm i -g ...`) — usuário não precisa ler doc para corrigir.

## Decisões registradas na Fase 5

- D29 — Docs vivem em `docs/pt/living-memory/` (pasta dedicada) em vez de espalhar pelos subdirs existentes (`1-entender/`, `5-referencia/`, etc.). Razão: feature coesa em um lugar — leitor que entra no link consegue ler todos os 7 docs em sequência.
- D30 — `docs/pt/README.md` principal lista Memória Viva como destaque em `5-referencia` (não cria seção nova). Mantém o layout existente intacto.
- D31 — Docs em pt-BR (não en) porque o `interaction_language` do projeto AIOSON é pt-BR e a audiência principal são desenvolvedores brasileiros. Versões em outros idiomas ficam para feature futura `docs-i18n`.
- D32 — ASCII (não Mermaid) para os diagramas. Razão: renderiza em qualquer terminal, qualquer Markdown viewer e qualquer diff — não depende de plugin. Mermaid fica para quando o leitor precisa de cor.
- D33 — Troubleshooting tem **11 receitas** numeradas com sintoma/diagnóstico/fix consistentes. Cobre os 5 checks do doctor + 5 cenários de runtime + 1 catch-all de emergência. Cada fix nomeia o comando exato — leitor age sem ter que sair do doc.

## Decisões registradas durante QA (Gate D)

- D34 — Path containment em `validate()` é **fail-closed**: manifest sem `allowed_paths` (vazio ou ausente) é rejeitado upfront. Razão: H-01 encontrado durante QA — fail-open permitia escrita arbitrária se um manifest fosse corrompido. Mudança aplicada no review, 4 testes adicionados.
- D35 — `validate()` rejeita explicitamente paths absolutos e segmentos `..` antes do match contra `allowed_paths`. Razão: defense in depth — string match sozinho aceitaria `/etc/passwd` se a allowed_paths tivesse exatamente essa entrada (cenário de manifest comprometido).
- D36 — `reflect-commit.js` valida que toda `path.resolve(targetDir, relPath)` permanece sob `.aioson/context/bootstrap/` (segunda parede). Razão: caso futuro estenda `allowed_paths` para fora de bootstrap, a barreira em commit segura.

## QA sign-off

- **Date:** 2026-05-11
- **AC coverage:** 6/6 fully covered (Fases 0-5)
- **Verdict:** PASS
- **Findings:** 0 Critical, 1 High (H-01 path containment — **fixed during review**), 1 Medium (TOCTOU concorrente), 2 Low (unbounded reads), 4 Info
- **Residual risks:** TOCTOU race em commits concorrentes, unbounded read em manifest/stdin, doc drift sem auto-check, kernel size pré-existente em dev.md
- **Tests:** 2195/2198 pass (3 falhas pré-existentes confirmadas desde Fase 0)
- Relatório completo: `.aioson/context/qa-report-living-memory.md`
