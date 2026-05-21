---
briefing_source: workflow-handoff-integrity-1-9-2
slug: workflow-handoff-integrity
classification: MEDIUM
created_by: product
created_at: 2026-05-19
sheldon_enriched: 2026-05-20
status: draft
gate_a: pending
gate_b: pending
gate_c: pending
gate_d: pending
depends_on: prd-workflow-hotfix-1-9-3.md
---

# PRD — Workflow Handoff Integrity

## Vision

Tornar a **auto-orquestração** da cadeia AIOSON estruturalmente confiável: o framework auto-roteia entre agentes com base em estado real em disco, não em "Next step" estático nos prompts; o `workflow:status` reflete o que está implementado; agentes futuros entram na cadeia sem que o autor tenha que lembrar de cada hard-constraint isolado.

Resultado esperado: usuário ativa o próximo agente sugerido pela CLI e ele simplesmente funciona — sem precisar auditar manualmente cada handoff, sem deadlocks, sem drift entre o ponteiro de workflow e o estado real.

## Problem

Mesmo após o hotfix v1.9.3 (`prd-workflow-hotfix-1-9-3.md`) resolver o deadlock pontual do `@pm`, **quatro gaps estruturais permanecem** na auto-orquestração — todos confirmados via investigação de código em 2026-05-19:

- **F1 (média):** `dev-state.md` per-project (correto) mas sem cleanup automático quando feature anterior terminou. `preflight.js:72` detecta stale mas só warning, não oferece reset. Usuário vê stale state apontando para outra feature/projeto e não sabe se age sobre.
- **F2 (alta, bloqueia auto-roteamento):** apenas 2 de 22+ agent files no template (`dev.md:259`, `qa.md:394, 401`) instruem `aioson workflow:next . --complete=<self>`. Os demais só chamam `agent:done`, que (`src/commands/runtime.js:1173-1250`) é puramente telemetria SQLite — **não avança o pointer**. Em qualquer cadeia que passa por agente sem a instrução, `workflow:status` trava onde o último agente "complete" estava.
- **F3 (média, não totalmente confirmado):** `/analyst` (e possivelmente outros) tem "Next step" estático no rodapé do prompt, sem checar se manifest do `/sheldon` deixou decisões pendentes (`pending-architect-decisions`). Resultado: agente roteia para o próximo errado, e o erro só aparece em `/dev` ou `/pm`.
- **T5 (alta — gap estrutural meta):** o `sync-agents-preflight.js` (introduzido em `ca15f55`) só checa `## Feature dossier` length. Não pega divergência semântica em outras seções. Qualquer migração futura pode repetir o padrão de `981a8fd` (workspace updated, template/test esquecidos) sem CI detectar.

E uma observação meta (T6): essas falhas só apareceram em **uso real pós-release**, não em teste interno. Sugere que o release process da v1.9.x não inclui smoke test ponta-a-ponta da cadeia em fixture greenfield.

## Users

- **Primário:** Developers AIOSON que confiam na sugestão "ative o próximo agente" do framework — incluindo a si mesmo via inception (qualquer feature MEDIUM rodada via cadeia completa).
- **Secundário:** Mantenedor (você) que precisa que mudanças futuras em prompts/contratos não introduzam drift estrutural.
- **Indireto:** Agentes futuros do AIOSON que herdarão os contratos. Quanto mais confiáveis os sinais, menor o boilerplate para criar/mudar agentes.

## MVP scope

### Must-have 🔴

- **F2 — `agent:done` avança o workflow pointer automaticamente:** modificar `src/commands/runtime.js:1173-1250` (função `runAgentDone`) para, ao detectar artefato canônico em disco do agente correspondente, chamar `workflow:next --complete=<agent>` internamente. Centraliza lógica em um lugar; não depende de cada prompt lembrar de incluir a instrução.
  - _(sheldon)_ **Backward-compat:** `agent:done` mantém output stdout idêntico em modo default. Novo comportamento (auto-emit `workflow:next --complete=<agent>`) é gated por: (i) presença de `.aioson/runtime/workflow.state.json` ativo, OU (ii) flag explícita `--auto-advance`. Comportamento legacy preservado para scripts/automations existentes que não esperam o segundo evento.
  - _(sheldon)_ **Telemetry impact:** ordem de emissão documentada — telemetry SQLite (`agent_events` row) primeiro, depois chamada interna a `runWorkflowNext`. Idempotência: re-execução de `agent:done` para mesmo `(agent, feature)` não duplica workflow event (gated por last_workflow_event_at no state). Dashboard + learning-loop consumers podem ler ambos sem dedup adicional.
- **F3 — Validação cruzada no CLI:** `aioson workflow:next --complete=analyst` (ou outro agente upstream) recusa avançar se o `sheldon manifest` (`.aioson/plans/{slug}/manifest.md`) tem `status: pending-*-decisions`. Mensagem de erro recomenda o agente correto. Defesa em camadas — não substitui correção dos prompts, mas previne erro mesmo com prompt errado.
  - _(sheldon)_ **Pending-state enumeration:** CLI guard faz regex `pending-.*-decisions` no campo `status` do manifest. Estados canônicos atuais: `pending-architect-decisions`, `pending-product-decisions`, `pending-pm-decisions`. Estados `pending-*` futuros pegam automaticamente sem precisar atualizar o CLI.
- **F1 — Stale `dev-state.md` cleanup interativo:** estender `preflight.js:72` (`detectStaleDevState`) para, quando detecta stale, oferecer `aioson state:reset` ou `aioson state:save --new-feature=<slug>` como sugestão direta ao usuário. Não é cleanup automático silencioso — é warning acionável.
- **T5 — Estender `sync-agents-preflight.js` para detectar divergência semântica:** além do check atual de `## Feature dossier` length, comparar todos os tokens estruturais entre `template/.aioson/agents/<agent>.md` e `.aioson/agents/<agent>.md`. Sinalizar (não bloquear) quando houver divergência em headers de seção ou em strings que aparecem em testes alignment. Permite CI ou release notes destacarem o gap antes de virar bug.
- **T6 — Smoke test ponta-a-ponta como CI gate antes de `npm publish`:** workflow CI que faz `npm pack` + `aioson setup` em fixture greenfield + executa cadeia `/briefing → /product → /sheldon → /architect → /pm → /dev` em feature MEDIUM mock + verifica que `workflow:status` chega em `[>] @dev` sem drift e sem Gate bloqueado.
  - _(sheldon)_ **Fixture maintenance:** fixture greenfield NÃO é pinada no repo — gerada fresh a cada CI run via `npm pack` (current source) + `aioson setup .` em diretório temporário do CI runner. Garante zero drift entre source canônico e fixture. Custo: ~30-60s overhead por release smoke run, aceitável dado que roda só em PR com label `release`.

### Should-have 🟡

- **F3 — Atualizar prompts dos agentes upstream** (especialmente `/analyst.md`) para conscientizar que devem checar manifest antes de propor próximo agente. Reforço do CLI guard com instrução no prompt — defesa em duas camadas.
- **Auditoria sistemática de outras migrações em `.aioson/plans/` e `.aioson/context/done/`** para identificar casos similares de implementação parcial. Output: relatório separado, não código.
- **F4 resíduo — Conferir `manifests/dev.manifest.json` `required: false`:** investigar se `required: false` para implementation-plan no manifest é inconsistente com Gate C, ou camadas separadas (manifest = o que `@dev` LÊ; gate = o que precisa EXISTIR). Documentar a resposta.

## Out of scope

- **Hotfix do `pm.md` template + test alignment + arquivos candidatos do plan.** Tratado integralmente em `prd-workflow-hotfix-1-9-3.md`. Este PRD depende daquele estar entregue (`depends_on: prd-workflow-hotfix-1-9-3.md`).
- **Refactor do state machine de workflow:** este PRD adiciona auto-emissão em `agent:done`, não redesenha a máquina de estados.
- **Migração para template-as-canonical via sync inverso `source → template`:** ficou parqueado quando entendemos que o problema raiz era migração incompleta, não direção de sync. Pode ser refactor SMALL/MEDIUM separado se decidido depois.
- **Reset automático silencioso de `dev-state.md`:** F1 fica como warning acionável, não cleanup silencioso. Decisão consciente — não queremos perder estado por automation surpresa.
- **Reescrita dos prompts dos 20+ agent files com workflow:next instrução literal:** centralizamos em `agent:done` (F2 must-have), tornando esse trabalho desnecessário.

## User flows

### Flow 1 — Cadeia MEDIUM ponta-a-ponta funciona sem auditoria

1. Usuário roda `/briefing` em projeto novo. Agente termina, chama `agent:done`. **Novo:** `agent:done` detecta `briefings.md` em disco e emite `workflow:next --complete=briefing` automaticamente.
2. Usuário roda `/product`. Mesma coisa — produz `prd-{slug}.md`, `agent:done` avança o pointer.
3. Cadeia continua: `/sheldon` (produz manifest), `/architect` (resolve DDs), `/pm` (produz implementation-plan), `/dev` (implementa).
4. Em qualquer ponto, `aioson workflow:status` mostra o ponteiro **coerente com o que está em disco**. Sem drift.

### Flow 2 — Tentativa de skip de agente é prevenida pelo CLI

1. `/sheldon` produz manifest com `status: pending-architect-decisions`.
2. `/analyst` (próximo na cadeia) termina seu trabalho, chama `agent:done`.
3. Cadeia tentaria avançar para `/dev` (next step do prompt antigo).
4. **Novo:** `workflow:next --complete=analyst` lê o manifest, detecta `pending-architect-decisions`, recusa avançar com erro: `"Gate B incompleto: @sheldon manifest tem decisões pendentes. Próximo agente recomendado: @architect."`
5. Usuário ativa `/architect`, resolve DDs, manifest fica `ready`, cadeia segue normalmente.

### Flow 3 — Stale dev-state detectado oferece ação ao usuário

1. Usuário ativa `/dev` em projeto onde feature anterior terminou (status=done em `features.md`).
2. Preflight detecta `dev-state.md` apontando para feature antiga.
3. **Novo:** preflight não passa silenciosamente nem só alerta — oferece comando direto: `"dev-state.md está stale (aponta para feature 'X' já concluída em DATE). Recomendo: aioson state:reset (limpa) OU aioson state:save --feature=<nova>. Continuar mesmo assim? [y/N]"`.

### Flow 4 — CI rejeita publish com drift estrutural

1. Mantenedor abre PR alterando algum agent file (workspace ou template).
2. Pipeline CI roda `sync-agents-preflight` estendido com check semântico.
3. **Novo:** se houver divergência em headers/tokens entre workspace e template, CI emite warning bloqueante ("Divergência semântica detectada em pm.md: workspace tem token X, template não. Confirme se é intencional ou propague.").
4. Mantenedor decide: ignorar (com flag explícito) ou ajustar antes do merge.

## Success metrics

- **Auto-roteamento confiável:** rodar `/briefing → /product → /sheldon → /architect → /pm → /dev` em fixture MEDIUM com decisões mock; `workflow:status` chega em `[>] @dev` ao fim sem drift; nenhum Gate bloqueado por sinal ausente.
- **CLI guard impede roteamento errado:** test que produz manifest com `pending-architect-decisions`, simula `workflow:next --complete=analyst`, verifica erro com mensagem recomendando `@architect`.
- **Stale cleanup:** test em fixture com `dev-state.md` referenciando feature `done`; preflight detecta + oferece comando; usuário simulado executa cleanup; segunda invocação do `/dev` não mostra warning.
- **CI guard detecta drift semântico:** test em fixture que modifica `template/.aioson/agents/pm.md` removendo um header presente no workspace; preflight estendido sinaliza.
- **Smoke test em CI passa antes de publish:** workflow CI executa cadeia ponta-a-ponta antes do `npm publish`; se falha, publish é bloqueado.
- **Zero regressão:** suite atual de testes (`npm test`) passa após implementação.
- _(sheldon)_ **Wiring audit pré-closure (brain sheldon-006 ★5):** antes de marcar feature `done` em `features.md`, auditar para CADA mudança implementada: (a) call sites que invocam o código novo confirmados via grep no codebase; (b) testes cobrem o caminho real chamado (não unit isolado de função pura); (c) smoke test em fixture greenfield exercita o caminho ponta-a-ponta. Documento de auditoria fica em `.aioson/context/wiring-audit-workflow-handoff-integrity.md`. Sem este audit, repete o padrão do `@validator` que ficou orfanado por semanas.

## Open questions

1. **[decision-required]** F2 — `agent:done` deve avançar pointer automático SEMPRE que detectar artefato canônico, ou apenas quando o agente passa `--auto-advance` (flag explícito)? Recomendação: sempre, com flag `--no-auto-advance` para opt-out em casos especiais. Pertence a `@architect`.
2. **[decision-required]** F3 — Validação no CLI deve recusar (erro hard) ou apenas avisar (warning soft) quando manifest está pending? Recomendação: erro hard com mensagem clara, porque silenciar leva ao deadlock observado. Pertence a `@architect`.
3. **[decision-required]** T5 — CI guard semântico deve falhar build (bloqueante) ou apenas warning? Recomendação: warning para mudanças locais; hard fail em pre-publish. Pertence a `@architect`.
4. **[decision-required]** T6 — Smoke test em CI deve rodar em **toda PR**, ou apenas em PR de release? Recomendação: apenas em PRs marcados como release (label) — caro demais para todo push. Pertence a `@architect`.
5. **[research-able]** Quais outros agent files têm padrão "Next step" estático que pode roteamento errado? (Audit `template/.aioson/agents/*.md` por bloco "▶ Next step" hardcoded.) Resolve em < 30min.
6. **[research-able]** Que comandos existem hoje em `src/commands/state*` que possam servir de base para o `aioson state:reset` recomendado em F1? Resolve em < 30min.
7. **[research-able]** O `manifests/dev.manifest.json` com `required: false` (G12 no briefing) é inconsistência real com Gate C, ou são camadas distintas? Confirmar antes de tratar como bug.
8. **[testable]** Repro completo para todas as 4 falhas estruturais: pode ser sintetizado em um único smoke test, ou exige cenários separados? Recomendação: cenários separados para diagnóstico melhor.
9. **[out-of-scope]** Auditoria de outras migrações em `.aioson/plans/` que tenham mesmo padrão de incompletude. Captura como briefing meta separado se confirmado em research.
10. _(sheldon)_ **[decision-required]** Estratégia de release: ship F1-T6 num único release MEDIUM (v1.10.0), ou progressivo fase-a-fase com release entre cada (v1.9.5, v1.9.6, ...)? **Recomendação:** progressivo na ordem `F2 → F3 → F1 → T5 → T6`. Razão: minimiza inception risk (usar a própria cadeia para implementar F2 enquanto F2 está broken na cadeia ativa), cada fase valida a estabilidade da próxima, e bisect fica trivial se aparecer regressão. Trade-off: 5 publishes em vez de 1. Pertence a `@architect`.

## Visual identity

N/A — change interna ao framework, sem UI.

## Dependencies

Este PRD **depende** do hotfix v1.9.3 (`prd-workflow-hotfix-1-9-3.md`) ter sido entregue primeiro, porque:

- O hotfix completa a migração `981a8fd` (template pm.md alinhado com workspace).
- Algumas das verificações nos arquivos candidatos do plan podem revelar gaps adicionais a tratar aqui.
- Este PRD assume que o contrato canônico (`@pm` owns implementation-plan) está vigente no template.

Sequência recomendada:
1. v1.9.3 hotfix sai → desbloqueia `aioson-com` + outros projetos 1.9.2.
2. Em paralelo, este PRD entra em `/sheldon` para enrichment.
3. Implementação aqui pode ser v1.10.0 (minor — features novas) ou v1.9.x series progressivamente.

## Notes for downstream agents

- **@sheldon:** o cluster é cross-cutting (CLI + agent prompts + tests). Pode precisar de DD-01 sobre arquitetura de "sinais de workflow" (declarativo vs imperativo). Auditoria de outras migrações é candidato natural para `## Research Index`.
- **@analyst:** as entidades implícitas são: workflow state machine (com pointer + gate status), agent contracts (templates do `template/`), feature manifests (`.aioson/plans/*/manifest.md`), dev-state file. Não há novas entidades de domínio.
- **@architect:** centralização em `agent:done` é a decisão técnica central. Trade-off: simplicidade vs flexibilidade — agentes que NÃO querem auto-avançar precisarão de uma flag explícita.
- **@pm:** este é MEDIUM. Per `pm.md:74`, você é owner do `implementation-plan-workflow-handoff-integrity.md`. Pre-condição: hotfix v1.9.3 entregue primeiro (você mesmo passou a poder escrever implementation-plan depois disso!).
