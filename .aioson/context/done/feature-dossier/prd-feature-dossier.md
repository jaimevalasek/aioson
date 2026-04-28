---
feature_slug: feature-dossier
status: draft
created_by: sheldon-bootstrapped
created_at: 2026-04-27
classification: MEDIUM
briefing_source: null
---

# PRD — Feature Dossier & Reverse Invocation

> _(sheldon-bootstrapped — pode refinar via `/product` se quiser ajustar Vision/Problem/Users)_

## Vision

Cada feature do AIOSON ganha um **dossier vivo** — único arquivo lido e enriquecido por toda a cadeia de agentes (`@product → @sheldon → @analyst → @architect → @ux-ui → @pm → @orchestrator → @dev`) — que sintetiza o "porquê" da feature, mapeia onde ela encaixa no código real, e permite que agentes downstream solicitem refinamentos a agentes upstream com aprovação humana.

## Problem

Hoje cada agente produz seu artefato em `.aioson/context/` (PRD, spec, requirements, conformance) mas eles ficam **separados**. Sintomas observados:

- `@dev` chega sem mapeamento explícito feature ↔ código atual e descobre constraints durante a implementação.
- Agentes intermediários perdem o "porquê" original entre handoffs — viram telefone-sem-fio.
- Quando `@analyst` ou `@architect` descobre algo que invalida decisão upstream (ex.: PRD assume integração síncrona mas módulo X é event-driven), **não há mecanismo formal** para puxar o agente upstream de volta. Usuário tem que perceber e re-rodar manualmente.
- A `memory active retrieval layer` (commit 5cc7074) é global, não por-feature.

Resultado prático: `@dev` implementa às cegas; refinamentos viram churn manual; a ideia inicial e a implementação final divergem sem trilha auditável.

## Users

- **Desenvolvedor (usuário principal AIOSON):** quer que o `@dev` chegue cirúrgico, com contexto vivo da feature + mapeamento de código atualizado pelos agentes anteriores.
- **Agentes do framework:** precisam de fonte única para ler "o que sabemos até agora" e contribuir com novas descobertas sem perder contexto.

## Escopo do MVP

### Obrigatório 🔴

- **`.aioson/context/features/{slug}/dossier.md`** — documento vivo lido por todos os agentes da cadeia, com seções: Why, What, Code Map (YAML), Rules & Design-Docs aplicáveis, Agent Trail, Revision Requests.
- **CLI `dossier:init` + `dossier:show`** — criação e visualização.
- **CLI `dossier:add-finding` + `dossier:add-codemap` + `dossier:link-rule`** — escrita controlada append-only.
- **CLI `revision:open` + `revision:list` + `revision:resolve --approve|--reject`** — invocação reversa em modo sugerido com aprovação humana.
- **`handoff-contract` estendido** com `dossier_uri` + `pending_revisions_count` + `blocking_revisions` (backwards-compatible).
- **`workflow:execute` bloqueia handoff** quando há `severity: blocking` não-resolvidas.
- **Anti-loop:** máximo 3 ciclos de revisão por gate; `--force-revision` exige confirmação.
- **`feature:archive` migra** `.aioson/context/features/{slug}/` → `.aioson/context/done/{slug}/dossier/`.
- **Bootstrap retroativo** — `dossier:init --from-existing` sintetiza dossier a partir de artefatos canônicos existentes.
- **Auto-compaction** — dossier ativo limitado a 15KB; seções de gates encerrados migram para `dossier-history.md`.

### Desejável 🟡

- **Dossier ativo como source ranqueada** no `context-pack.md` (active retrieval layer).
- **Templates concretos por agente** em `.aioson/docs/dossier/agent-templates.md` (define o que cada agente escreve em qual seção).
- **Telemetria via `runtime:emit`** — eventos `revision_opened`, `revision_resolved`, `handoff_blocked_by_revision` para o dashboard.

## Fora do escopo

- **Modo automático** de invocação reversa (LLM detecta gap → abre revision sem aprovação humana). Decisão deferida para após 3 meses de uso em produção.
- **UI no dashboard** para visualizar dossier/revisions. Decisão deferida para após Fase 2.
- **Migração retroativa de features `done/`** legadas. Bootstrap incremental existe (Fase 3); migração em massa é one-shot do user, fora deste escopo.
- **Mirror do `revisions.json` em SQLite como fonte de verdade.** SQLite é mirror para dashboard, JSON é canônico (`disk-first-artifacts.md`).

## Reference sources (sheldon)

- `plans/feature-dossier-and-reverse-invocation.md` — plano-semente
- `.aioson/plans/feature-dossier/manifest.md` — plano faseado completo
- `.aioson/context/sheldon-enrichment-feature-dossier.md` — gap analysis e justificativas técnicas
- Memory: `project_feature_dossier_design.md` (decisões de design fechadas em 2026-04-27)
