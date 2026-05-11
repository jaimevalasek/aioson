---
active_feature: living-memory
active_phase: 0
active_plan: architecture-living-memory.md
last_spec_version: 1
context_package:
  - .aioson/context/project.context.md
  - .aioson/context/architecture-living-memory.md
  - .aioson/context/spec-living-memory.md
next_step: "Fase 1 — Reflexão In-Harness: criar src/memory-reflect-engine.js (heurística determinística + buildPrompt + validate), depois sub-comandos memory:reflect-prepare e memory:reflect-commit em src/commands/memory.js, depois templates em template/.aioson/templates/reflect-prompts/*.md. Total estimado: ~6h (2 sessões /dev)."
status: ready_for_phase_1
updated_at: 2026-05-11
---

# Dev State — living-memory

## Foco atual
Feature `living-memory` em desenvolvimento. Fase 0 (correções urgentes do template) concluída. Próxima: Fase 1 (Reflexão In-Harness).

## Pacote de contexto — carregar SOMENTE estes arquivos
1. `.aioson/context/project.context.md` — sempre
2. `.aioson/context/architecture-living-memory.md` — fonte canônica da arquitetura
3. `.aioson/context/spec-living-memory.md` — decisões fechadas + estado por fase

## Não carregar
- `.aioson/context/architecture.md` (39.7KB, é da feature secure-by-default, não desta)
- Outros `prd-*.md`, `spec-*.md` de features done
- `dev-state.md` antigo de `harness-driven-aioson` (substituído por este)

## O que foi feito (últimas 3 sessões)
- 2026-05-11 @architect: arquitetura `architecture-living-memory.md` entregue, Gate B approved
- 2026-05-11 @dev: Fase 0 completa — slash `/discover` consertado em todos harnesses, constants.js estendido, validado no atendimento
- 2026-05-08 @qa: harness-driven-aioson Gate D approved (feature anterior, fechada)

## Próximo passo
**Fase 1 — Reflexão In-Harness** (ordem):
1. `src/memory-reflect-engine.js` — função `evaluate(targetDir, agent)` retorna `{ verdict, reasons }`; função `buildPrompt(snapshot, diff, devlog)` retorna texto JSON; função `validate(commitOutput)` retorna `{ ok, errors }`
2. `src/commands/memory-reflect-prepare.js` — sub-comando: lê estado, roteia para engine, escreve `.aioson/runtime/reflect-prompt.json`
3. `src/commands/memory-reflect-commit.js` — sub-comando: lê output do agente, valida via engine, atualiza `bootstrap/*.md`, registra runtime event
4. `template/.aioson/templates/reflect-prompts/{current-state,how-it-works,what-it-does}.md` — templates de prompt para reflexão
5. Adicionar sub-comandos ao roteador em `src/commands/memory.js`
6. Testes: 6 cenários (verdict relevant/skip, validation pass/fail, concurrency, missing bootstrap)

## Critério de aceite da Fase 1
`aioson memory:reflect-prepare . --agent=dev` gera `reflect-prompt.json` válido contra fixture de teste.
