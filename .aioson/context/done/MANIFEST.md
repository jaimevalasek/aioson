# Archived Features Manifest

> Features whose artefacts were moved into `.aioson/context/done/{slug}/` after QA sign-off.
> Agents that need historical awareness (@briefing, @neo, @discover, @sheldon) read this file instead of globbing archived PRDs.

| slug | completed | files | summary |
|------|-----------|-------|---------|
| agent-orchestration-v2 | 2026-05-27 | 5 | Make AIOSON workflows resumable from any gate boundary and operator decisions queryable by feature — closing the two infrastructure gaps identified against Lang |
| operator-memory | 2026-05-21 | 7 | Uma camada de memória **por-operador** (não por-projeto, não por-harness) que persiste decisões padrão do dev entre sessões, harnesses e projetos — multi-dev sa |
| neural-chain | 2026-05-21 | 5 | Camada de awareness estrutural de código que mostra ligações implícitas (eventos, listeners, hooks, jobs, classes, testes) a cada edit, pra LLM agents pararem d |
| workflow-handoff-integrity | 2026-05-20 | 7 | Tornar a **auto-orquestração** da cadeia AIOSON estruturalmente confiável: o framework auto-roteia entre agentes com base em estado real em disco, não em "Next |
| workflow-hotfix-1-9-3 | 2026-05-19 | 6 | Completar a migração SDLC `981a8fd` (Apr 24, 2026) que ficou parcialmente implementada — restaurando o contrato canônico "**`@pm` é owner de `implementation-pla |
| release-page-1-9-0 | 2026-05-18 | 1 | Página HTML estática em `tutorials/releases/1-9-0/` que narra os 10 dias de evolução que culminaram no AIOSON v1.9.0, mais polish dos 4 tutoriais existentes pra |
| lay-user-agent-mode | 2026-05-17 | 4 | Habilitar pessoas tecnicamente curiosas mas não-desenvolvedoras a construírem sistemas complexos usando AIOSON, expondo os agentes em linguagem corrente com dec |
| dev-state-producer | 2026-05-17 | 2 | Restaurar a fluidez agente→agente prometida pela feature `agent-chain-continuity` (2026-05-07) fazendo com que os agentes upstream do `@dev` produzam `dev-state |
| deyvin-subtask-scout | 2026-05-14 | 5 | Give `@deyvin` a structured way to dispatch a context-isolated **scout** that surveys >5 files or traces a runtime flow and returns deterministic JSON findings |
| active-learning-loop | 2026-05-14 | 10 | Fechar o loop entre os primitivos de aprendizado que AIOSON já tem (`learning`, `pattern:detect`, brains, evolution_log) e o ciclo real de desenvolvimento de fe |
| deyvin-density | 2026-05-11 | 2 | Make `@deyvin` stop reasoning from stale context: enforce the Living Memory bootstrap gate on activation and give the agent a deterministic table for deciding w |
| living-memory | 2026-05-11 | 3 | — |
| harness-driven-aioson | 2026-05-08 | 7 | — |
| agent-chain-continuity | 2026-05-07 | 4 | Toda feature SMALL/MEDIUM nasce com um **dossier vivo auto-inicializado** que toda a cadeia de agentes (`@product → @sheldon → @analyst → @architect → @ux-ui → |
| secure-by-default | 2026-04-29 | 6 | Transformar o AIOSON de "framework que entrega rápido" em "framework que entrega rápido **e seguro por padrão**", embutindo postura adversarial (Zero Trust) no |
| feature-dossier | 2026-04-28 | 6 | Cada feature do AIOSON ganha um **dossier vivo** — único arquivo lido e enriquecido por toda a cadeia de agentes (`@product → @sheldon → @analyst → @architect → |
| sdlc-process-upgrade | 2026-04-24 | 7 | Transformar o workflow AIOSON em um pipeline de desenvolvimento previsivel, retomavel e verificavel, onde agentes, CLI, gates, artefatos e memorias compartilham |
| context-archive-done | 2026-04-24 | 1 | Manter o `.aioson/context/` enxuto automaticamente movendo os artefatos de features concluídas para uma pasta `done/` — sem o usuário precisar lembrar e sem que |
| pentester-agent | 2026-04-17 | 8 | Adicionar um agente oficial `@pentester` ao AIOSON para atuar com mentalidade adversarial e encontrar vulnerabilidades reais antes do fechamento de uma feature. |
| design-governance | 2026-04-12 | 3 | — |
| cypher-agent | 2026-04-10 | 2 | `@cypher` é a camada de pré-produção do AIOSON que transforma sketches brutos de `plans/` em briefings estruturados e aprovados — criando o espaço de discussão |
