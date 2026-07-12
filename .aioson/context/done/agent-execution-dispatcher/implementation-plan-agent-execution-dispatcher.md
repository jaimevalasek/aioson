---
slug: agent-execution-dispatcher
status: approved
gate: C
---

# Implementation Plan — Agent Execution Dispatcher

## Phase 1 — Contracts and compatibility

Criar schema, resolver, defaults, digest, reports e migration behavior. Não integrar ao workflow ainda.

Done: manifesto válido/ inválido/legado cobertos; merge preserva escolhas; report schema rejeita stubs.

Verify: `node --test tests/agent-execution-manifest.test.js tests/agent-execution-reports.test.js` e `npm run lint`.

## Phase 2 — Host capability adapters

Implementar interface comum e adapters Claude/Codex/OpenCode com processes estruturados e doubles de teste.

Done: capabilities são declaradas, unsupported pausa, argv não usa shell e erros normalizam capacidade/modelo/auth/timeout/crash.

Verify: `node --test tests/agent-execution-adapters.test.js tests/agent-execution-security.test.js`.

## Phase 3 — CLI configuration UX

Adicionar `agent:execution:init|validate|show`, saída humana e `--json`, resumo e caminho pós-PRD.

Done: defaults do host, JSON paths acionáveis, aliases inválidos bloqueados e setup/update aditivo.

Verify: `node --test tests/agent-execution-cli.test.js tests/setup.test.js tests/update.test.js`.

## Phase 4 — Deterministic plan integration

Combinar `verification:plan` com resolução do manifesto sem alterar triggers; integrar Product e workflow seed.

Done: autoridade/origem explícita, projetos legados invariantes, manifesto inválido bloqueia antes do dev.

Verify: `node --test tests/verification-plan.test.js tests/verification-policy.test.js tests/workflow-execute.test.js`.

## Phase 5 — Dispatcher, await and resume

Implementar state machine, lock, attempts, dispatch/await/cancel/reconcile e loops limitados.

Done: dev fresh session, verificadores requeridos, reports aguardados, correção seletiva, capacidade explícita e retomada idempotente.

Verify: `node --test tests/agent-execution-dispatcher.test.js tests/agent-execution-resume.test.js tests/agent-execution-capacity.test.js`.

## Phase 6 — Agent contracts and end-to-end

Atualizar source/template prompts e docs; provar pipeline com adapters fake de três hosts e sincronizar artefatos gerenciados.

Done: `dev → qa/tester/pentester/validator → dev` passa; capacity/fallback/cycle limit/interruption passam; nenhum prompt assume dispatch inexistente.

Verify: `npm run sync:agents`, `npm run lint`, `npm test`, `aioson spec:analyze . --feature=agent-execution-dispatcher --json`, `aioson harness:check . --slug=agent-execution-dispatcher --json`.

## Required Context Package

Inicial: `project.context.md`, `dev-state.md`, `spec-agent-execution-dispatcher.md`, `design-doc-agent-execution-dispatcher.md`, `readiness-agent-execution-dispatcher.md`.

Phase-triggered: requirements para regras/schema; PRD somente para dúvida de escopo; docs verification/autopilot nas fases 4–6.

## Final decisions

Manifesto separado; host atual como default; `configured-default` quando não há catálogo; dev fresh-session; verificadores subagents quando capability existir; ausência de capability pausa; reports estruturados; ciclos/capacidade/fallback explícitos; compatibilidade legada obrigatória.

