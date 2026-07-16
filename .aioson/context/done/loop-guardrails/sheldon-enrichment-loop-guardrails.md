---
target_prd: .aioson/context/prd-loop-guardrails.md
round: 1
date: 2026-06-09
sizing_score: 6
sizing_decision: "Path A — in-place + ## Delivery plan (2 fases)"
status: ready_for_analyst
---

# Sheldon Enrichment — loop-guardrails (round 1)

## Decisões do usuário

- Aplicar todas as melhorias como recomendado (11 aplicadas, 1 adiada).
- Sizing confirmado: Path A (score 6 — 4 entidades +1, 2 fases +2, git +1, 4 fluxos +1, ACs >10 +1).

## Melhorias aplicadas no PRD

| # | Tipo | Delta (seção do PRD) |
|---|------|----------------------|
| 1 | 🔴 mecanismo | Scope guard: detecção via `git status --porcelain` (diff puro não vê untracked) |
| 2 | 🔴 mecanismo | Scope guard: baseline git capturado no preflight; tree sujo ≠ falsa violação |
| 3 | 🔴 segurança | Novo must-have: validação de schema do contrato no preflight (hoje campos desconhecidos são ignorados silenciosamente — `src/commands/harness.js`) |
| 4 | 🔴 spec | Human gates: mapa tema→caminho com defaults + override `human_gate.themes[].paths`; `publish` é gate de comando, não de diff |
| 5 | 🔴 spec | Human gates: semântica de retomada — processo encerra em HUMAN_GATE, `harness:approve` persiste, re-rodar `self:loop` retoma idempotente |
| 6 | 🟡 open question | Orçamento: chars/4 → `execution_events.token_count` (coluna já existe, `runtime-store.js:741`); fecha OQ#1 |
| 7 | 🟡 open question | `harness:status` e `spec:status` mantêm escopos distintos; fecha OQ#3 (OQ#2 também fechada: caminho no MVP) |
| 8 | 🟡 constraint | Criteria: check-runner reusa `executeInSandbox` (`src/sandbox.js`) |
| 9 | 🟡 spec | git:guard: merge das `forbidden_files` do contrato na política do guard (hoje lê só `.aioson/git-guard.json`) |
| 10 | 🟡 should-have | Novos guards `max_changed_files`/`max_diff_lines` (plano fonte §18.1) |
| 11 | ⚪ gotcha | Globs normalizam separadores Windows |

## Adiada (registrada em Out of scope)

- 12: tema de gate `security_high_finding` — exige integração @pentester; evolução futura.

## Achados de código (file:line)

- `src/commands/self-implement-loop.js` ~224 — hook natural pós-verify para os guards; nenhum estado git é capturado por iteração hoje.
- `src/runtime-store.js:741` — coluna `token_count` em `execution_events` já existe (nullable, sem produtor).
- `src/sandbox.js` — `executeInSandbox(cmd, {timeout, policy})` com kill de process tree (commit 0f852f4).
- `src/commands/harness.js:33-49` — template do contrato sem validador de schema.
- `src/commands/git-guard.js` + `src/lib/git-commit-guard.js` — política própria em `.aioson/git-guard.json`, sem leitura de contrato.
- `src/commands/spec-status.js:57-71` — progresso de planos + learnings (sem overlap com harness:status).

## Fontes usadas

- plans/plano-relatorio-aioson-loop-engine.md (re-minerado)
- researchs/scope-guard-coding-agents-2026/summary.md (reuso)
- researchs/llm-token-estimation-2026/summary.md (nova, produzida nesta sessão)
- researchs/multi-agent-token-budget-2026/summary.md (reuso)
- researchs/auto-handoff-pipeline-2026/summary.md (reuso)
- .aioson/context/features/loop-guardrails/dossier.md
- Brain sheldon/architecture-decisions (sheldon-003 validator sandbox, sheldon-005 CLI-first)

## RF-05

Classification SMALL → `progress.json` criado em `.aioson/plans/loop-guardrails/`; harness-contract.json não gerado nesta etapa (regra SMALL).
