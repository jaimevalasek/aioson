---
feature: dev-state-producer
status: in_progress
classification: MICRO
started: 2026-05-17
---

# PRD — Dev State Producer

## Vision
Restaurar a fluidez agente→agente prometida pela feature `agent-chain-continuity` (2026-05-07) fazendo com que os agentes upstream do `@dev` produzam `dev-state.md` nativamente no fim de suas sessões.

## Problem
O contrato de `dev-state.md` (definido em `.aioson/agents/dev.md:42-49`) existe como **consumidor sem produtor**: o `@dev` é instruído a ler o arquivo como input canônico em cold-start, mas nenhum agente upstream foi instruído a escrevê-lo. Em 2026-05-16, na feature `lay-user-agent-mode` shipada nesta mesma sessão, o `@dev` caiu em cold-start após `@briefing → @product → @sheldon → @analyst → /clear` exatamente por causa desse gap. O workaround foi o `@product` escrever `dev-state.md` a mão antes de ativar o `@dev` — sustentável uma vez, insustentável como pattern.

## Users
- **Desenvolvedor usando AIOSON via CLI**: ativa `@dev` numa sessão limpa esperando que o agente arranque sozinho no `next_step` em vez de pedir "qual feature?".
- **AIOSON em modo inception** (este próprio repo): cada nova feature interna depende dessa fluidez pra não regredir em produtividade a cada sessão.

## MVP scope

### Must-have 🔴

- **Comando `aioson dev:state:write`** (alias funcional de `aioson state:save` existente) com a mesma semântica: `--feature=<slug>`, `--next="<next step>"`, `--phase=<N>`, `--context=<comma-separated file types>`, `--plan=<path-or-null>`. Reusa `src/commands/state-save.js` por baixo dos panos — implementação é cosmética + um alias.
- **`@analyst` invoca o comando** ao final da sessão como parte do contrato de handoff. Adicionar instrução em "Observability" ou seção equivalente do kernel: "After finishing requirements work, run `aioson dev:state:write . --feature={slug} --next=\"<concrete next step for @dev>\" --context=spec,requirements`".
- **`@product` invoca o comando** ao final da sessão quando classificação for MICRO (next agent será `@dev` diretamente).
- **Schema `--context` aceita lista canônica de tipos**: `spec`, `requirements`, `impl-plan`, `architecture`, `design-doc`, `prd`. O comando expande cada token para o path correto baseado no `--feature` (ex: `spec` → `spec-{slug}.md`). Limite hard: 4 entries.
- **Fix do truncation bug no `state:save`**: o `next_step` atualmente é truncado em ~250 chars em algum ponto da pipeline (descoberto em 2026-05-16 na feature lay-user-agent-mode quando tentamos salvar a Phase 2 description). Ampliar para 2000+ chars ou remover o cap. Determinístico via teste.
- **Idempotência**: invocar o comando duas vezes seguidas com os mesmos args não duplica nem reverte estado. `dev-state.md` é re-escrito determinístico.

### Should-have 🟡

- **`@sheldon` e `@architect` também invocam** — cobrem SMALL+Sheldon e MEDIUM. Mesma instrução de kernel, mesma semântica de `--context`. Trabalho mecânico (~+1 linha em cada kernel).
- **Banner explícito no output**: quando o comando roda com sucesso, log "✓ dev-state.md written: next_step=<truncated 80 chars>… — @dev will auto-resume on cold start" para o agente saber que cumpriu o contrato (e o user ver no terminal).

## Out of scope

- **`@ux-ui` invocando** — fica V2. UI-to-dev handoffs são minoria do uso atual; espera-se que tenham conteúdo diferente (ui-spec.md em vez de requirements).
- **`last-handoff.json`** producer — escopo separado, mecanicamente independente de dev-state.md. Briefing original mencionava ambos mas dev-state.md é o consumido pelo `@dev` em cold-start; last-handoff.json é enrichment.
- **Hook automático em `agent:done`** — opção B da conversa (mecanismo magic). Descartada para preservar explicitness e testabilidade.
- **Side-effect em `workflow:next --complete`** — opção C da conversa. Escopo da feature `agent-chain-continuity-delivery-fix` (Trilhas B+C unificadas), grande demais pra esta MICRO.
- **CLI publish bump v1.10.0** — Trilha A do briefing original. Bug independente, escopo separado.
- **Doctor check pra "agente terminou sem produzir dev-state.md quando next é @dev"** — V2 quando tivermos dados de adoção.
- **Migração de projetos existentes com `dev-state.md` stale** — comando é re-writable; usuário pode rodar manualmente.

## User flows

### Fluxo principal — handoff @analyst → @dev numa feature SMALL

1. Usuário ativa `/analyst` para mapear requirements de uma feature SMALL.
2. `@analyst` lê PRD, escreve `requirements-{slug}.md`, atualiza `spec-{slug}.md`.
3. **No fim da sessão (Observability section)**, `@analyst` invoca:
   ```
   aioson dev:state:write . --feature={slug} --phase=1 \
     --next="Implement Phase 1 of {slug}: <concrete first slice>" \
     --context=spec,requirements
   ```
4. Comando escreve `.aioson/context/dev-state.md` com `active_feature`, `active_phase`, `next_step`, `context_package` (resolved paths).
5. `@analyst` emite handoff: "Activate `/dev` to consume dev-state.md and start implementation."
6. Usuário roda `/clear` (opcional) e ativa `/dev`.
7. `@dev` lê `dev-state.md` no preflight, carrega apenas os 2-4 arquivos listados em `context_package`, arranca direto no `next_step`. **Sem cold-start, sem perguntas.**

### Fluxo MICRO — handoff @product → @dev direto

1. Usuário ativa `/product` para feature MICRO simples.
2. `@product` escreve `prd-{slug}.md`, registra em `features.md`.
3. No fim, invoca:
   ```
   aioson dev:state:write . --feature={slug} \
     --next="Implement MVP per prd-{slug}.md must-have section" \
     --context=prd
   ```
4. Handoff: "Activate `/dev`."
5. `@dev` arranca lendo `prd-{slug}.md` + `project.context.md`.

### Fluxo de recuperação — agente upstream esqueceu

1. Usuário ativa `/dev` mas `dev-state.md` não existe (agente upstream falhou em invocar o comando).
2. `@dev` cai em cold-start padrão (já documentado em `dev.md:49-55`): lê `features.md`, identifica `in_progress`, pergunta ao usuário.
3. Quando o usuário escolhe a feature, `@dev` pode invocar `aioson dev:state:write` ele mesmo pra registrar o estado descoberto — assim na próxima `/clear`, o contrato é honrado mesmo que retroativamente.

## Success metrics

- **Métrica primária (verificável):** test synthetic E2E rodando `@product → @dev` num projeto MICRO greenfield assertando que `@dev` lê `dev-state.md` e identifica `next_step` sem fazer perguntas ao usuário. Auditável em CI.
- **Métrica secundária:** próxima feature MICRO real shipada após este MVP é a acceptance fixture (similar a `AC-LUM-15`). Critério: `@dev` arranca sem pedir esclarecimento sobre qual feature implementar.
- **Métrica de adoção (V2, fora do MVP):** % de sessões `@dev` que arrancam em modo auto-resume (lendo dev-state.md) vs cold-start. Requer telemetria via `agent_events` que ainda não está discriminada por modo de arranque.

## Open questions

Questões que ficam para @dev decidir durante implementação:

1. `[dev]` — Renomear `state:save` para `dev:state:write` (alias canônico) ou criar um wrapper novo? Recomendação: alias de comando — preservar `state:save` por backward-compat, registrar `dev:state:write` em KNOWN_COMMANDS apontando pra mesma função. Custom: 5-10 linhas em `src/cli.js`.

2. `[dev]` — Quando o `--context` flag receber um tipo de arquivo que não existe no disco (ex: `--context=requirements` mas `requirements-{slug}.md` ainda não foi escrito), comportamento: **silenciosamente ignorar** o entry, **warn no stdout**, ou **falhar com exit 1**? Recomendação: warn + skip — agente upstream pode invocar antes de todos os arquivos estarem prontos.

3. `[dev]` — Definir o cap atual do truncation. Olhar `src/commands/state-save.js` linhas 70-100 (área onde se monta o frontmatter) e localizar onde a string é cortada. Pode ser regex que matcha apenas a primeira frase, ou um slice hardcoded, ou um buffer limit. Fix proporcional à causa.

4. `[dev]` — `--phase` obrigatório ou opcional? Em features SMALL/MEDIUM com plano Sheldon, o phase faz sentido. Em MICRO direto, não há phase. Recomendação: opcional, default null. `@dev` lida com ausência (já lida, vide protocolo cold-start).

5. `[dev]` — Que tipos devo aceitar em `--context`? Lista canônica recomendada: `spec`, `requirements`, `impl-plan`, `architecture`, `design-doc`, `prd`, `dossier`. Aliases curtos pra cada tipo. Documentar em `--help` e em `dev.md`.

## Visual identity

Não aplicável. Feature é um comando CLI + instruções em prompts de agente. Sem UI, sem componentes visuais, sem design skill.
