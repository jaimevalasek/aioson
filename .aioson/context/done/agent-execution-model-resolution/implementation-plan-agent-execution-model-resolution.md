---
slug: agent-execution-model-resolution
classification: SMALL
gate_plan: approved
status: approved
phases: 4
---

# Plano de implementação — Agent Execution Model Resolution

## Fase 1 — Contrato, catálogo e resolver puro
Adicionar `reasoning_effort` aos schemas; criar loader Codex bounded e resolver por tiers, com fixtures temporárias para exact/normalized/alias/fuzzy/ambiguity/numeric invariant/cache failure.

Contexto ao entrar: requirements, design-doc e schema/manifest atuais.

Verificação: `node --test tests/agent-execution-manifest.test.js tests/agent-execution-model-catalog.test.js tests/agent-execution-model-resolver.test.js`

## Fase 2 — Adapter, dispatcher e fallback
Integrar resolução pré-spawn e por fallback; transportar esforço ao Codex; congelar requested/resolved/strategy na attempt e no contrato de report; manter `shell:false`, stdin, digest e capacity policy.

Contexto ao entrar: arquivos concluídos na Fase 1 + dispatcher/adapters/reports.

Verificação: `node --test tests/agent-execution-adapters.test.js tests/agent-execution-dispatcher.test.js tests/agent-execution-capacity.test.js tests/agent-execution-security.test.js tests/agent-execution-resume.test.js`

## Fase 3 — CLI, telemetria e distribuição
Expor resolução/esforço em validate/show/verification plan, state/report e telemetria sanitizada; aplicar migração aditiva quando necessária; sincronizar schema e docs template/workspace.

Contexto ao entrar: interfaces das Fases 1–2 + runtime-store/telemetry/CLI/docs.

Verificação: `node --test tests/agent-execution-cli.test.js tests/agent-execution-telemetry-store.test.js tests/agent-execution-telemetry-bridge.test.js tests/agent-execution-telemetry-cli.test.js tests/verification-plan.test.js`

## Fase 4 — Hardening e gates
Cobrir catálogo hostil, argumentos, compatibilidade legado, fallback, resume e paridade; rodar lint, testes focados, harness, AC audit e suíte completa. Smoke real do Codex é opcional/manual e registra apenas status/modelo resolvido.

Contexto ao entrar: diff completo + harness contract + spec.

Verificação: `npm run lint`; `node --test tests/agent-execution-*.test.js`; `aioson harness:check . --slug=agent-execution-model-resolution --json`; `aioson ac:test-audit . --feature=agent-execution-model-resolution`; `npm test`

## Ordem e ownership
Fases sequenciais: contrato puro → execução → observabilidade/distribuição → hardening. Não alterar simultaneamente resolver e seus consumidores sem manter testes de contrato verdes. `@dev` implementa; `@qa` aprova Gate D; `@validator` executa o harness em contexto isolado.
