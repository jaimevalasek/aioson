---
target_prd: ".aioson/context/prd-feature-dossier.md"
sheldon_version: "1.0"
created_at: "2026-04-27"
status: "approved"
classification: "MEDIUM"
sizing_score: 9
sizing_decision: "Path B — external phased plan"
schema_version: "1.0"
---

# Manifest — Feature Dossier & Reverse Invocation

## Overview

Introduzir camada de **Feature Dossier** — documento vivo, único por feature, lido e enriquecido por cada agente da cadeia AIOSON (`@product → @sheldon → @analyst → @architect → @ux-ui → @pm → @orchestrator → @dev`). O dossier sintetiza:

- A feature (porquê, o quê, regras `.aioson/rules` aplicáveis, design-docs aplicáveis)
- O código atual do projeto (onde encaixa, quais módulos toca, padrões locais)
- A trilha de análises (cada agente registra descobertas, mudanças de compreensão, implicações para os próximos)
- Pedidos de revisão reversa (`revision_requests`): downstream pode pedir re-execução de upstream, com aprovação humana

**Dossier NÃO substitui** os artefatos canônicos (PRD, spec, requirements, conformance) — é a camada de síntese que os indexa e mantém o "porquê" vivo entre handoffs.

## Phase table

| Phase | Slug | Goal | Estimate |
|-------|------|------|----------|
| 1 | `mvp-read-only` | Read path ponta-a-ponta sem mexer em handoff/workflow state | 1-2 dias |
| 2 | `write-revisions` | Invocação reversa sugerida funcional ponta-a-ponta | 3-5 dias |
| 3 | `codemap-bootstrap` | Adoção incremental + manutenibilidade (code-map estruturado, bootstrap de features em curso) | 2-3 dias |

## Pre-made decisions (final, não revisitar)

1. **Localização:** `.aioson/context/features/{slug}/dossier.md` (NÃO `aioson-tmp/`).
2. **Dossier sintetiza, não substitui** PRD/spec/requirements/conformance — referencia os canônicos por link.
3. **Modo da invocação reversa: SUGERIDO.** LLMs fracos podem gerar falso-positivo; usuário aprova com `aioson revision:resolve {rev-id} --approve|--reject`.
4. **Anti-loop:** máximo 3 ciclos de revisão por gate; após isso exige `--force-revision`.
5. **Severity:** `blocking` trava handoff; `advisory` apenas registra.
6. **Integrações já mapeadas:** `handoff-contract` ganha `dossier_uri` + `pending_revisions_count` (backwards-compatible); `feature:archive` move `features/{slug}/` → `done/{slug}/dossier/`; `memory active retrieval` (commit 5cc7074) ranqueia dossier ativo no context-pack.
7. **`revisions.json` é fonte de verdade** (versionável, diff-friendly); SQLite (`aios.sqlite`) é mirror para dashboard. Justificativa: respeita `disk-first-artifacts.md`.
8. **Gates já aprovados permanecem aprovados** durante revisão reversa; re-execução append `revision_round` em `workflow.state.json` (não rewind).
9. **Dossier é fonte VIVA por-feature; context-pack faz SNAPSHOT** dela no início da sessão (resolve duas-fontes-de-verdade vs. active retrieval layer).
10. **`code-map` é YAML embutido em `dossier.md`**, não arquivo separado — reduz file count, mantém atomicidade.
11. **Schema versioning obrigatório** em `dossier.md` e `revisions.json` (`schema_version: 1.0`).
12. **Budget do dossier ativo:** 15KB; seções de gates encerrados auto-migram para `dossier-history.md`.
13. **Bootstrap de features em curso INCLUÍDO** (`dossier:init --from-existing`) — Fase 3.

## Deferred decisions

| Decisão | Quem decide | Quando |
|---------|-------------|--------|
| UI no dashboard para visualizar dossier/revisions | Product owner | Após Fase 2 entregue |
| Modo automático (LLM detecta gap → abre revision sem aprovação) | Product owner + dados de uso | Após 3 meses de uso em produção |
| Migração retroativa de features `done/` legadas | User | Decisão one-shot, fora deste escopo |

## Reference sources

- `plans/feature-dossier-and-reverse-invocation.md` — plano-semente (consumido como source pré-produção)
- `.aioson/context/prd.md` — PRD do projeto AIOSON (contexto-pai)
- `.aioson/context/handoff-protocol.json` — schema atual do handoff (a ser estendido)
- Memory: `project_feature_dossier_design.md` (decisões fechadas, registradas em 2026-04-27)
- Commits relevantes: `981a8fd` (handoff-contract + canonical-path rules), `e943782` (feature-archive), `5cc7074` (memory active retrieval)
