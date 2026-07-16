---
feature: loop-guardrails
readiness: ready_with_warnings
next_agent: dev
created_at: 2026-06-09
created_by: discovery-design-doc
---

# Readiness — Loop Guardrails

## Status: `ready_with_warnings`

Gate A (requirements) e Gate B (architecture) aprovados; todas as open questions do PRD resolvidas; EC-2 fechada (D2). Todos os anchors de código citados pelos artefatos foram verificados contra o source em 2026-06-09. Warnings abaixo são operacionais, nenhum bloqueia implementação.

## Next agent: `@dev`

Iniciar pela Fase 1, sequência do `architecture.md` §7 (passos 1–6). Recomendado `/clear` antes da sessão do @dev e ativação via `aioson agent:prompt dev . --tool=claude` (ou `aioson workflow:next . --tool=claude` após sincronizar o estado — ver warning 1).

## Artifacts consumed

- `.aioson/context/prd-loop-guardrails.md`
- `.aioson/context/requirements-loop-guardrails.md` (Gate A approved — 20 REQs, 13 ECs)
- `.aioson/context/scope-check-loop-guardrails.md` (pre-dev: patched/alinhado)
- `.aioson/context/sheldon-enrichment-loop-guardrails.md`
- `.aioson/context/architecture.md` § "Feature Architecture — Loop Guardrails" (Gate B approved — D1–D7)
- `.aioson/context/spec-loop-guardrails.md` (skeleton, gates requirements+design approved)
- `.aioson/context/features/loop-guardrails/dossier.md`
- Código verificado: `src/commands/self-implement-loop.js:187/224`, `src/sandbox.js:126`, `src/runtime-store.js:741/823`, `src/harness/circuit-breaker.js`, `src/commands/{harness,feature-close,git-guard}.js`, `src/cli.js:396-401`

## Implementation paths proposed

Detalhe completo em `design-doc-loop-guardrails.md` § Implementation Paths.

- **Fase 1 (criar):** `src/harness/{glob-match,contract-schema,git-baseline,scope-guard,budget-guard,attempt-artifacts}.js` + 5 arquivos de teste
- **Fase 2 (criar):** `src/harness/{human-gate,criteria-runner}.js`, `src/commands/{harness-gate,harness-status}.js` + 2 arquivos de teste
- **Alterar:** `self-implement-loop.js` (preflight + hook D5), `harness.js` (template do init), `circuit-breaker.js` (HUMAN_GATE), `feature-close.js` (gate publish), `cli.js` (registro), `git-guard.js` (should-have)

## Reuse & componentization

- Reuso obrigatório: `executeInSandbox` (criteria), `insertExecutionEvent` (eventos best-effort), `circuit-breaker.js` (estender), `progress.json` (acumuladores).
- Sem dependência nova; glob matcher próprio com subset estrito (D1).
- Wiring fino nos commands (≤ +80 linhas em `self-implement-loop.js`); lógica de guard só em módulos puros `src/harness/`.
- `attempt-artifacts.js` é o único writer de `attempts/{n}/`.
- Nenhuma mudança em `template/` nesta feature.

## Warnings (não-bloqueantes)

1. **`workflow.state.json` dessincronizado** — `next: architect`, mas Gate B já está aprovado (pulse, dossier, architecture.md). A sessão do @architect não avançou o estado via CLI. Sincronizar antes de usar `aioson workflow:next` para a sessão do @dev.
2. **Dossier com `classification: MEDIUM`** — herança do projeto; feature confirmada SMALL (requirements §9). Sem conformance YAML.
3. **Fonte do chars/4** — confirmar no wiring que `executeAgent` expõe o output bruto do agente; se truncado, estimar sobre o disponível e registrar no spec.
4. **Naming** — `harness:validate` existente valida implementação (verdict), não schema do contrato; manter mensagens de erro distintas.

## Blockers

Nenhum.
