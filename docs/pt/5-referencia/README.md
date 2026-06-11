# Referência técnica — AIOSON (PT)

> Esta pasta contém a documentação técnica detalhada.
> **Para começar do zero:** vá em [`2-comecar/`](../2-comecar/primeiro-projeto.md).
> **Para exemplos práticos prontos:** vá em [`3-receitas/`](../3-receitas/README.md).

---

## Novos em 2026 (sem doc PT anterior)

| Documento | Descrição |
|---|---|
| [loop-guardrails.md](./loop-guardrails.md) | Contrato verificável para o self:loop: scope guard, budget, human gates, criteria evaluation (v1.22.0) |
| [harness-retro.md](./harness-retro.md) | Minerar o histórico de falhas de uma feature sem LLM — dossiê retrospectivo + harness:preview (v1.23.0) |
| [autopilot-handoff.md](./autopilot-handoff.md) | Encadeamento automático de agentes pré-dev e pós-dev — opt-in via auto_handoff: true (v1.21.x–v1.22.0) |
| [feature-dossier.md](./feature-dossier.md) | Dossier de feature: ponto único de verdade (spec, plano, histórico, status) |
| [agent-chain-continuity.md](./agent-chain-continuity.md) | Sistema de continuidade entre sessões — Fases 1–8 (dev-resume, drift detection, handoff v2) |
| [sdd-framework.md](./sdd-framework.md) | Spec-Driven Development: Constitution, project-pulse, skill aioson-spec-driven, MICRO/SMALL/MEDIUM |
| [live-sessions.md](./live-sessions.md) | Live sessions rastreadas: tmux launcher, live:start/status/handoff/close, runtime:emit |
| [secure-by-default.md](./secure-by-default.md) | Baseline de segurança SEC-SBD-01..08, git:guard, pentester, controles por classificação |
| [aioson-com-store.md](./aioson-com-store.md) | AIOSON Store: auth, workspaces, system:package/publish (--invite), squad/genome/skill:publish |
| [../living-memory/README.md](../living-memory/README.md) | Memória Viva: bootstrap auto-atualizado, autonomy contract 3 tiers, notify (ℹ/⚠/⛔), doctor checks |
| [../active-learning-loop/README.md](../active-learning-loop/README.md) | Active Learning Loop: destilação automática no `feature:close`, busca BM25 em learnings, archive/restore com `evolution_log`, 3 checks de curadoria no doctor |
| [../deyvin-subtask-scout/README.md](../deyvin-subtask-scout/README.md) | Deyvin Sub-Task Scout: primitiva de diagnóstico estruturado, `scout:prep/validate/commit`, caps configuráveis, archivamento por feature |

---

## Referência de artefatos e fluxo

| Documento | Descrição |
|---|---|
| [fluxo-artefatos.md](./fluxo-artefatos.md) | Mapa de quem cria o quê: @product → @sheldon → @analyst → @dev → @qa |
| [feature-archive.md](./feature-archive.md) | Arquivamento automático de features concluídas via feature:close |
| [feature-export.md](./feature-export.md) | Exportar (copiar) todos os artefatos de uma feature para um local limpo — entregável portátil |
| [memoria-e-contexto.md](./memoria-e-contexto.md) | Memória persistente, context cache, context search, context monitor — guia consolidado |
| [runtime-observability.md](./runtime-observability.md) | Telemetria SQLite, dashboard, runtime:emit, agent:done |
| [hooks-session-guard.md](./hooks-session-guard.md) | Hooks automáticos de visibilidade no dashboard para Claude Code, Antigravity e Codex |

---

## CLI e configuração

| Documento | Descrição |
|---|---|
| [comandos-cli.md](./comandos-cli.md) | Referência completa de todos os comandos do `aioson` |
| [clientes-ai.md](./clientes-ai.md) | Como usar com Claude Code, Codex e OpenCode |
| [sandbox.md](./sandbox.md) | Execução segura com timeout, redação de secrets e output summarizado |
| [compress-agents.md](./compress-agents.md) | Reduzir consumo de tokens comprimindo instruções de agentes |
| [agent-sharding.md](./agent-sharding.md) | Carregar somente as seções relevantes de um agente para uma tarefa |

---

## Agentes, squads e processo

| Documento | Descrição |
|---|---|
| [sdd-planos-e-estrutura.md](./sdd-planos-e-estrutura.md) | Mapa completo de artefatos: plans/, .aioson/plans/, .aioson/context/, lanes paralelas, tasks.md |
| [sdd-automation-scripts.md](./sdd-automation-scripts.md) | Regra dos 80%: scripts determinísticos de gate, classificação e estado |
| [motor-hardening.md](./motor-hardening.md) | Hardening do motor: gates técnicos, auto-cura, test briefing |
| [design-docs-governance.md](./design-docs-governance.md) | Regras hard de código que agentes aplicam automaticamente |
| [runner-system.md](./runner-system.md) | Execução persistente em background: filas, daemon, planos por fase |
| [automacao-squads.md](./automacao-squads.md) | Transformar processos de squad em scripts executáveis sem LLM |
| [squad-dashboard.md](./squad-dashboard.md) | Painel web local para monitorar squads em tempo real |
| [inteligencia-adaptativa.md](./inteligencia-adaptativa.md) | Camada de aprendizado adaptativo entre sessões |
| [output-strategy-delivery.md](./output-strategy-delivery.md) | Webhooks, delivery automático de conteúdo, troubleshoot |

---

## Skills e design

| Documento | Descrição |
|---|---|
| [skills.md](./skills.md) | Sistema de skills: tipos, instalação, mapeamento por framework |
| [genome-4.0-spec.md](./genome-4.0-spec.md) | Especificação técnica Genome 4.0 (DISC, Enneagram, Big Five, MBTI, HEXACO-H) |
| [genome-distribution.md](./genome-distribution.md) | Distribuição e publicação de genomes via aioson.com |

---

## Pipelines de dados

| Documento | Descrição |
|---|---|
| [spec-learnings-pipeline.md](./spec-learnings-pipeline.md) | Sincronizar specs com SQLite, exportar learnings para brains |
| [devlog-pipeline.md](./devlog-pipeline.md) | Processar devlogs manuais, sincronizar com SQLite e exportar para brains |

---

## Outros

| Documento | Descrição |
|---|---|
| [web3.md](./web3.md) | Suporte a projetos dApp (Ethereum, Solana, Cardano) |
