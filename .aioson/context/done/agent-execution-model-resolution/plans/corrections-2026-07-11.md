---
created: 2026-07-11
status: resolved
---

# Corrections Plan — agent-execution-model-resolution — 2026-07-11

## Context

QA Gate D encontrou 1 High e 1 Medium que deixam AC-AEMR-14 parcial.

## Mandatory corrections

### C-01 — Vincular metadados de resolução no report

File: `src/agent-execution/reports.js`

Problem: `model_requested` é obrigatório, mas não é comparado à attempt; `model_resolution_strategy` não é obrigatório nem vinculado. Um report externo incorreto pode passar como evidência válida.

Expected fix: exigir e comparar ambos os campos quando houver expected, preservando compatibilidade apenas para reports realmente legados sem contrato de resolução.

Affected AC: AC-AEMR-14.

### C-02 — Resolver modelos no verification plan

File: `src/commands/verification-plan.js`

Problem: o plano expõe o nome humano bruto em `model` e não fornece `model_resolved`/`model_resolution_strategy`, embora o requisito inclua verification plan na trilha requested/resolved.

Expected fix: usar `resolveAgentExecution` com loader injetável, falhar de modo acionável em resolução inválida e expor requested/resolved/strategy/effort.

Affected AC: AC-AEMR-14.

## Tests written by QA

- `tests/agent-execution-reports.test.js`
- `tests/verification-plan.test.js`

Current result: 2 failing assertions reproduce C-01/C-02.
