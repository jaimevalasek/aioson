---
phase: 1
slug: f2-agent-done-auto-emit
parent_manifest: .aioson/plans/workflow-handoff-integrity/manifest.md
severity: high
estimated_sessions: 2
suggested_release: v1.9.5
---

# Phase 1 — F2: `agent:done` auto-emite `workflow:next --complete`

## Scope

Modificar `src/commands/runtime.js:1173-1250` (função `runAgentDone`) para, após registrar telemetry SQLite, detectar artefato canônico em disco do agente correspondente e chamar `workflow:next --complete=<agent>` internamente quando aplicável.

Centraliza lógica em um único ponto. Remove dependência de cada agent prompt incluir literal `workflow:next --complete=<self>` no rodapé.

**Causa-raiz observada:** apenas `dev.md:259` + `qa.md:394, 401` no template instruem `workflow:next --complete`. Outros 18+ agentes só chamam `agent:done` → pointer trava no primeiro agente sem a instrução literal.

## New or modified entities

Nenhuma entidade de domínio. Mudanças em código:

- `src/commands/runtime.js` — função `runAgentDone` (modificação)
- `src/commands/workflow-next.js` (provável) — função `runWorkflowNext` chamada internamente (sem mudança de assinatura)
- Possivelmente `.aioson/runtime/workflow.state.json` schema: novo campo `last_workflow_event_at` para idempotência

## User flows covered

- **PRD Flow 1** — Cadeia MEDIUM ponta-a-ponta funciona sem auditoria (cada `agent:done` avança pointer automaticamente)

## Acceptance criteria

- **AC-F2-01:** `aioson agent:done . --agent=<X>` em projeto com `.aioson/runtime/workflow.state.json` ativo detecta artefato canônico do agente em disco (per `agent-runtime-alignment.test.js` token map) e chama `runWorkflowNext({complete: X})` internamente.
- **AC-F2-02 (backward-compat — PMD-08 via DD-01):** quando `.aioson/runtime/workflow.state.json` NÃO existe (projeto sem workflow ativo), `agent:done` produz output stdout idêntico ao comportamento pré-mudança. Scripts existentes não quebram.
- **AC-F2-03 (escape hatch):** flag `--no-auto-advance` em `agent:done` desabilita o auto-emit mesmo com workflow.state ativo. Útil para casos de exceção e debugging.
- **AC-F2-04 (telemetry order):** evento SQLite `agent_events` é gravado ANTES de chamar `runWorkflowNext`. Verificável via assertion que `agent_events.timestamp < workflow_events.timestamp` quando ambos existem para mesmo `(agent, feature)`.
- **AC-F2-05 (idempotency):** re-execução de `agent:done` para mesmo `(agent, feature, artifact_hash)` NÃO duplica workflow event. Gated por `last_workflow_event_at` no state ou hash do último artefato.
- **AC-F2-06 (artifact detection):** agentes que NÃO produzem artefato canônico (`@committer`, `@copywriter`, `@neo` em modo router) NÃO auto-emitem. Map de canonical artifacts → agents fica em `src/handoff-contract.js` (novo arquivo se não existir, ou estender `handoff-contract.js`).
- **AC-F2-07 (test coverage):** test em `tests/agent-done-auto-emit.test.js` cobrindo: (a) caminho happy (workflow ativo + artefato existe → auto-emite); (b) caminho legacy (workflow ausente → não emite); (c) flag `--no-auto-advance`; (d) idempotency.
- **AC-F2-08 (wiring audit per PMD-07):** documento `wiring-audit-workflow-handoff-integrity.md` lista os call sites de `runAgentDone` no codebase (grep) e confirma cobertura por test acima.
- **AC-F2-09 (graceful degradation on workflow.state corruption):** `workflow.state.json` com JSON parse fail → log warning estruturado em stderr ("workflow state corrupt, fallback to backward-compat mode") + comportamento backward-compat (sem auto-emit), NÃO crash. Test: fixture com `workflow.state.json` contendo JSON inválido → `agent:done` exit 0, output stdout = baseline backward-compat. (Adicionado por @architect Gate B per Q11 analyst.)
- **AC-F2-10 (missing artifact map entry skips gracefully):** agente sem entrada em `src/handoff-contract.js` (typo, novo agente não registrado, etc.) → log warning ("agent '<X>' not in artifact map, skipping auto-emit") + sem auto-emit, sem crash. Test: chamar `agent:done --agent=nonexistent-agent` → exit 0, warning em stderr, sem workflow event emitido. (Adicionado por @architect Gate B per Q11 analyst.)

## Implementation sequence

1. Definir `src/handoff-contract.js` (ou estender handoff-contract.js) com mapping agent → canonical artifact path pattern.
2. Estender `runAgentDone` em `runtime.js:1173-1250`:
   - Após existing telemetry write
   - Verificar `.aioson/runtime/workflow.state.json` exists + active
   - Resolver artifact path via mapping
   - Se artifact exists + `--no-auto-advance` not passed: chamar `runWorkflowNext({complete: agent})`
3. Adicionar idempotency guard (last_workflow_event_at no state).
4. Criar `tests/agent-done-auto-emit.test.js` com 4 cenários AC-F2-07.
5. Rodar `npm test` — toda suite existente passa.
6. Audit wiring: grep `runAgentDone` em codebase → todos os call sites identificados e cobertos.
7. Documentar AC-F2-* em wiring-audit doc.

## External dependencies

- Nenhuma. Mudança puramente interna ao CLI.

## Notes for @dev

- F2 é a base do plan inteiro. Tenta NÃO mexer em arquivos não-relacionados nesta phase — quanto menor o blast radius, mais confiável o release v1.9.5 isolado.
- `runWorkflowNext` é função existente (`workflow.js`). Importar e chamar, não duplicar lógica.
- Quando em dúvida sobre artifact detection (agente produz artifact A OU B?), errar para o lado de NÃO emitir e logar warning — false negatives são preferíveis a false positives nesta camada.
- Backward-compat AC-F2-02 é literal: spawn shell, executar `agent:done`, comparar stdout byte-a-byte com baseline. Não relaxe.

## Notes for @qa

- Smoke test em fixture greenfield NÃO é T6 ainda (T6 vem depois). Para F2, smoke test inline: criar fixture mock em `tests/fixtures/auto-emit-fixture/`, rodar cadeia mínima `/briefing → /product` simulada com mocks de artefato, verificar pointer avança.
- Test de regressão: garantir que `dev.md:259` + `qa.md:394, 401` existing instruções não causam double-emit. Cenário: prompt diz `workflow:next --complete=dev` explícito + `agent:done` também tenta auto-emit → idempotency previne segundo evento.

## Phase-specific reference sources

- Briefing Theme 2 (workflow pointer não avança)
- PRD F2 + Sheldon I1 + I2 enrichment
- `src/commands/runtime.js:1173-1250` (código atual)
- `tests/agent-runtime-alignment.test.js` (canonical tokens map — referência para artifact detection)
