---
last_updated: 2026-06-09
active_feature: loop-guardrails
active_phase: 2
next_step: "Feature fechada — QA PASS 2026-06-09. Workflow avançou para @scope-check post-fix (modo projeto)."
status: done
---

# Dev State

**Feature:** loop-guardrails
**Status:** done (QA re-verificação PASS em 2026-06-09; Gate D aprovado via `workflow:next --complete=qa`; feature `done` em features.md)
**Next step:** @scope-check post-fix (decisão do motor) — residuais O-01..O-04 documentados no QA Sign-off do spec

## Context package

1. project.context.md
2. .aioson/plans/loop-guardrails/corrections-2026-06-09.md (resolved — para re-verificação)
3. spec-loop-guardrails.md (decisões @dev, incl. seção "Decisões do ciclo de correções QA")
4. requirements-loop-guardrails.md

## History

- 2026-06-09: Fase 1 — glob-match, contract-schema, git-baseline, scope-guard, budget-guard, attempt-artifacts, guard-events; preflight + hook D5 no self:loop; template harness:init. Integração com violação proposital (success metric nº 1). Suíte completa: 3074 testes, 2 falhas pré-existentes CRLF (CI verde).
- 2026-06-09: Fase 2 — human-gate + HUMAN_GATE (D4), criteria-runner (D7), harness:approve/reject/status, publish gate no feature:close, git:guard merge (REQ-20). Integração e2e: gate→approve→retomada, failure signature repeat, publish, REQ-20.

## History (cont.)

- 2026-06-09: @qa Gate D FAIL — corrections plan criado em `.aioson/plans/loop-guardrails/corrections-2026-06-09.md` (C-01 High: guards silenciosamente inativos sem `--spec`/`--contract`; C-02: presets de `contract_mode` não chegam ao circuit-breaker; C-03: git:guard layer-2 bloqueia commits humanos legítimos de lockfiles). Teste `QA-H-01` falhando de propósito até C-01 ser corrigido.
- 2026-06-09: @dev aplicou C-01..C-03 — helper compartilhado `src/harness/active-contract.js` (self:loop auto-descobre contrato ativo sem flags + log explícito "guardrails inactive"); governor efetivo (`resolveContract`) injetado no circuit-breaker e no teto de iterações; `applyActiveContractPolicy` do git:guard usa só `forbidden_files` declarados. QA-H-01 verde + QA-C-02/QA-C-03 novos. Suíte completa: 3105 testes, 3102 pass, 2 fail (AC-CTPK-06 CRLF pré-existentes, passam em CI), 1 skipped. Plano marcado `resolved`.

## Residuals para @qa

- i18n dos comandos novos (strings inglesas diretas, sem `t()`)
- `aioson help` não lista harness:approve/reject/status
- 2 falhas AC-CTPK-06 pré-existentes (artefato CRLF Windows, passam em CI)
