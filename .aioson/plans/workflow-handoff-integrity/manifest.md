---
target_prd: .aioson/context/prd-workflow-handoff-integrity.md
sheldon_version: 1.9.4
created_at: 2026-05-20
status: ready
classification: MEDIUM
sizing_score: 10
sizing_decision: phased-plan
contract_path: .aioson/plans/workflow-handoff-integrity/harness-contract.json
---

# Manifest — Workflow Handoff Integrity (phased plan)

## Overview

Cinco fases independentemente implementáveis cobrem os 5 must-haves do PRD. Sequência recomendada `F2 → F3 → F1 → T5 → T6` minimiza inception risk (F2 estabiliza auto-routing antes de usar a cadeia para implementar as outras), permite bisect trivial em caso de regressão, e cada fase entra como release próprio (Q10 do PRD).

**Inception note:** este plan será executado pela própria cadeia AIOSON em modo inception. F2 deve sair primeiro porque sua ausência é exatamente o que torna a cadeia frágil para implementar as demais.

## Phase table

| Phase | Slug | Targets | Severity | Dependencies | Suggested release |
|-------|------|---------|----------|--------------|-------------------|
| 1 | `plan-f2-agent-done-auto-emit.md` | F2 — `agent:done` auto-emite `workflow:next` | Alta (bloqueia auto-routing) | — | v1.9.5 |
| 2 | `plan-f3-cli-gate-pending-decisions.md` | F3 — CLI guard recusa avançar com manifest pending | Alta | F2 estável | v1.9.6 |
| 3 | `plan-f1-stale-devstate-interactive.md` | F1 — Stale `dev-state.md` oferece comando interativo | Média | F2 | v1.9.7 |
| 4 | `plan-t5-semantic-sync-preflight.md` | T5 — `sync-agents-preflight` estende check semântico | Média | — (paralelo possível) | v1.9.8 |
| 5 | `plan-t6-ci-smoke-pre-publish.md` | T6 — Smoke test ponta-a-ponta no CI pre-publish | Alta (proteção estrutural) | F2, F3 estáveis (smoke test precisa dele para passar) | v1.10.0 |

**Ordem alternativa para `@architect` considerar:** Q10 do PRD decide isso oficialmente. Recomendação acima é a default.

## Pre-made decisions (final)

| ID | Decisão | Source |
|----|---------|--------|
| PMD-01 | F2 segue modelo **imperativo** (centralizado em `agent:done`), não declarativo (instrução em cada agent file). | Briefing Theme 2 + PRD F2 must-have. |
| PMD-02 | F3 CLI guard é **hard error**, não soft warning. | Briefing recommendation + PRD O2. |
| PMD-03 | F1 é **warning acionável com comando direto**, NÃO cleanup automático silencioso. | PRD Out of scope explícito. |
| PMD-04 | T5 é **warning local + hard fail em pre-publish**, não bloqueante para development. | PRD O3 recommendation. |
| PMD-05 | T6 fixture é **gerada fresh** a cada run (não pinada no repo). | Sheldon R2 enrichment. |
| PMD-06 | `@pm` é owner do `implementation-plan-workflow-handoff-integrity.md` (MEDIUM). | AC-SDLC-15 (migração 981a8fd, completada via v1.9.3). |
| PMD-07 | Wiring audit pré-closure obrigatório (`.aioson/context/wiring-audit-workflow-handoff-integrity.md`). | Brain sheldon-006 ★5 + Sheldon C1. |

## Deferred decisions (require @architect)

| ID | Decisão | Decisor | When |
|----|---------|---------|------|
| DD-01 | Backward-compat semantic exato de `agent:done`: gating por workflow.state.json existence VS flag `--auto-advance` (PRD I1 propõe ambos). Decidir qual é primary. | `@architect` | Antes do Gate B |
| DD-02 | F3 CLI guard: regex `pending-.*-decisions` é suficiente ou precisa listar estados explícitos numa whitelist? | `@architect` | Antes do Gate B |
| DD-03 | T5 sync-agents-preflight semantic check: token-by-token diff vs section-level diff vs hash de seção? Trade-off ruído vs sensibilidade. | `@architect` | Antes do Gate B |
| DD-04 | T6 smoke test em qual harness rodar (Claude Code? Codex? ambos?)? Hoje a cadeia foi documentada principalmente em Claude Code. | `@architect` | Antes do Gate B |
| DD-05 | Estratégia de release Q10 do PRD: progressivo (recomendado) ou single MEDIUM release. Impacta sequência de phase delivery. | `@architect` | Antes do Gate C |

## Wiring audit gate (PMD-07)

Antes de marcar `done` em `features.md`, produzir `.aioson/context/wiring-audit-workflow-handoff-integrity.md` com:

- Para cada phase: lista de call sites onde código novo é invocado (output de `grep`)
- Para cada phase: testes que cobrem o caminho real, não unit isolado
- Smoke test em fixture greenfield: passa ponta-a-ponta sem drift

Sem este documento, `@qa` Gate D não pode passar.

## Reference sources

- `.aioson/context/prd-workflow-handoff-integrity.md` — PRD enriched (v2026-05-20)
- `.aioson/briefings/workflow-handoff-integrity-1-9-2/briefings.md` — briefing fonte (270 lines, 5 themes, 14 gaps)
- `plans/workflow-handoff-integrity.md` — pre-production delivery roadmap (sheldon consumed 2026-05-20)
- `.aioson/brains/sheldon/architecture-decisions.brain.json` — sheldon-006 ★5 (wiring audit), sheldon-002 ★5 (classification gates)
- `.aioson/plans/sdlc-process-upgrade/plan-implementation-plan-ownership.md` — migração 981a8fd ground truth (referência histórica; já completada via v1.9.3)
- `.aioson/context/sheldon-enrichment-workflow-handoff-integrity.md` — enrichment log da sessão 2026-05-20
- **Web research:** skip — feature framework-internal, sem external market/vendor/compliance surface, padrões maduros (state machines, CI gates, prompt directives). Briefing já fez investigação exaustiva. Budget de queries preservado.

## Handoff

Próximo agente: `@analyst` — produzir `requirements-workflow-handoff-integrity.md` com RFs/ACs/ECs/BRs por phase, classification confirm MEDIUM, populate spec skeleton. Gate A pending → approved após.

Após `@analyst`: `@architect` resolve DD-01/02/03/04/05 + Gate B → `@pm` writes implementation-plan (per PMD-06, AC-SDLC-15) → Gate C → `@dev` per phase → `@qa` Gate D (com wiring audit obrigatório).
