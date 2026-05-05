---
phase: qa-gates-runtime
slug: secure-by-default
status: ready
owner: architect-dev-qa
---

# Phase 5 — QA Gates and Runtime Events

## Scope
Integrar a camada Secure by Default ao Gate D e ao runtime: quando scans/audits rodam, quando bloqueiam, quais eventos são emitidos e como operar sem CLI.

## New or modified entities
- `@qa` prompt/template e locale correspondente.
- Workflow/runtime commands que disparam scan/audit ou registram eventos.
- Runtime events: `security_scan_completed`, `security_audit_completed`, `pentester_app_target_invoked`, `security_gate_blocked`.
- `project-pulse.md` e `spec-{slug}.md` updates de Gate D.

## User flows covered
- MEDIUM não fecha Gate D sem `security:audit`.
- High/Critical em aberto bloqueiam Gate D.
- Sem CLI, QA registra fallback checklist e limitação em artifact, sem falsificar evento runtime.

## Acceptance criteria
- AC-SBD-5.1: @qa invoca `security:audit` no início da verificação de feature MEDIUM.
- AC-SBD-5.2: @qa invoca `@pentester app_target` quando audit detectar auth/dinheiro/ownership suspeito ou quando heurística manual indicar risco.
- AC-SBD-5.3: Gate D bloqueia se houver Critical/High aberto.
- AC-SBD-5.4: Gate D pode passar quando findings foram corrigidos e reconfirmados com evidência.
- AC-SBD-5.5: Runtime registra eventos de scan, audit, invocation e bloqueio quando CLI estiver disponível.
- AC-SBD-5.6: Direct LLM mode sem CLI gera fallback explícito em QA report e `project-pulse.md`.
- AC-SBD-5.7: Métrica de adoção pode ser computada do runtime SQLite sem depender de leitura manual do chat.

## Implementation sequence
1. @architect define pontos de integração com workflow CLI versus prompts.
2. @dev implementa emissão runtime e updates nos agentes/templates.
3. @dev adiciona testes para eventos e Gate D blocking.
4. @qa roda feature simulada com finding High e valida bloqueio/correção.

## External dependencies
- `.aioson/runtime/aios.sqlite` quando CLI/runtime estiver disponível.

## Notes for @dev
Não criar runtime paralelo via snippets ad-hoc. Usar comandos/runtime existentes do AIOSON ou extensão explícita deles.

## Notes for @qa
O relatório de QA precisa distinguir "não rodou por CLI ausente" de "rodou e passou". Isso é essencial para confiança do Gate D.

## Phase-specific reference sources
- `.aioson/config.md`
- `.aioson/agents/qa.md`
- `researchs/tool-first-agent-workflows-2026/summary.md`
