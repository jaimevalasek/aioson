---
phase: cli-security-scan-audit
slug: secure-by-default
status: qa_approved
owner: architect-dev
gate_b_approved_at: 2026-04-28
gate_b_architect: @architect
qa_first_review_at: 2026-04-28
qa_verdict: PASS
qa_corrections_plan: .aioson/plans/secure-by-default/corrections-2026-04-28.md
dev_corrections_applied_at: 2026-04-29
qa_reapproved_at: 2026-04-29
---

# Phase 2 — CLI Security Scan and Audit

## Scope
Definir e implementar comandos shell-only para reduzir custo de tokens e tornar segurança verificável: `aioson security:scan . [--stage=<stage>]` e `aioson security:audit . --slug=<slug>`.

## New or modified entities
- `src/commands/security*.js` ou módulo equivalente de comandos CLI.
- Registro no entrypoint `bin/aioson.js`.
- Relatórios machine-readable permitidos em `.aioson/context/security-findings-{slug}.json`.
- Possível relatório Markdown complementar em `.aioson/context/security-report-{slug}.md` se @architect aprovar.

## User flows covered
- Após `@analyst`, scan detecta secrets/configs/deps antes de arquitetura.
- Após `@dev`, scan detecta secrets recentes e dependências vulneráveis antes de QA.
- No início de `@qa`, audit avalia artefatos da feature e gera findings estruturados.

## Acceptance criteria
- AC-SBD-2.1: `aioson security:scan . --stage=analyst` executa sem LLM e retorna status determinístico.
- AC-SBD-2.2: `aioson security:scan . --stage=dev` verifica pelo menos secrets, `.env` em locais proibidos, dependências Node/npm e configs públicas óbvias.
- AC-SBD-2.3: `aioson security:audit . --slug=secure-by-default` lê artefatos do slug e produz saída estruturada.
- AC-SBD-2.4: Findings High/Critical geram exit code bloqueante para MEDIUM.
- AC-SBD-2.5: MICRO e SMALL respeitam política definida na Phase 1.
- AC-SBD-2.6: Falha por CLI ausente tem fallback documentado em agente, sem falsificar runtime.
- AC-SBD-2.7: O comando não remove secrets nem altera histórico git automaticamente.

## Implementation sequence
1. @architect define schema de resultado, códigos de saída e localização final dos arquivos.
2. @dev cria scanners mínimos para Node.js/npm e filesystem.
3. @dev adiciona audit de artefatos: PRD, requirements, architecture, implementation plan e spec do slug.
4. @dev adiciona testes unitários para exit codes e geração de relatório.
5. @qa valida casos pass/fail e comportamento por classificação.

## External dependencies
- `npm audit` quando `package-lock.json` existir.
- Regex local de secrets com allowlist de exemplos/dummies.

## Notes for @dev
Começar pequeno: deterministic scanner, sem rede obrigatória além do que o gerenciador já fizer. Se `npm audit` falhar por rede, registrar inconclusivo, não mascarar como pass.

## Notes for @qa
Testar com fixtures contendo dummy secret, `.env.local`, package vulnerável simulado e feature sem superfície sensível.

## Phase-specific reference sources
- `researchs/tool-first-agent-workflows-2026/summary.md`
- `researchs/owasp-appsec-baseline-2026/summary.md`
